// StormSync VIP — NHC tropical proxy (Phase 10+ Hurricane Tracker).
// verify_jwt DISABLED: proxies PUBLIC NOAA/NHC data only. Adds CORS + caching
// (NHC sends no CORS header, so the browser can't fetch it directly).
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = "StormSyncVIP/1.0 (contact: admin@stormsync.media)";
const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200, maxAge = 300) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` } });

async function cacheGet(key: string, ttl: number): Promise<unknown | null> {
  try {
    const { data } = await admin.from("weather_cache").select("data, fetched_at").eq("key", key).maybeSingle();
    if (!data) return null;
    if (Date.now() - new Date(data.fetched_at as string).getTime() > ttl * 1000) return null;
    return data.data;
  } catch { return null; }
}
async function cacheStale(key: string): Promise<unknown | null> {
  try { const { data } = await admin.from("weather_cache").select("data").eq("key", key).maybeSingle(); return data?.data ?? null; } catch { return null; }
}
async function cacheSet(key: string, value: unknown) {
  try { await admin.from("weather_cache").upsert({ key, data: value, fetched_at: new Date().toISOString() }); } catch { /* ignore */ }
}

// ── ATCF best track parser ─────────────────────────────────────────────────
// Format: basin,cy,YYYYMMDDHH,,BEST,tau,latN,lonW,vmax_kt,mslp,type,...
interface TrackPoint {
  lat: number;
  lon: number;
  winds_kt: number;
  pressure?: number;
  timestamp: string;
  type?: string;
}
function parseAtcf(text: string): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (const line of text.split("\n")) {
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 11) continue;
    const tech = cols[4];
    if (tech !== "BEST") continue;
    const dtStr = cols[2]; // YYYYMMDDHH
    if (!dtStr || dtStr.length < 10) continue;
    const year = dtStr.slice(0, 4), mo = dtStr.slice(4, 6), dy = dtStr.slice(6, 8), hr = dtStr.slice(8, 10);
    const timestamp = `${year}-${mo}-${dy}T${hr}:00:00Z`;
    const latStr = cols[6];
    const lonStr = cols[7];
    if (!latStr || !lonStr) continue;
    const latNum = parseFloat(latStr) / 10;
    const lonNum = parseFloat(lonStr) / 10;
    const lat = /S/i.test(latStr) ? -latNum : latNum;
    const lon = /W/i.test(lonStr) ? -lonNum : lonNum;
    const winds_kt = parseInt(cols[8]) || 0;
    const pressure = parseInt(cols[9]) || undefined;
    const type = cols[10] || "BEST";
    if (isNaN(lat) || isNaN(lon)) continue;
    pts.push({ lat, lon, winds_kt, pressure, timestamp, type });
  }
  return pts;
}

// ── Areas to Watch (NHC ATF GeoJSON) ───────────────────────────────────────
interface Disturbance {
  id: string;
  basin: string;
  probability: number;
  description: string;
  location?: string;
}
async function fetchAreasToWatch(): Promise<Disturbance[]> {
  const results: Disturbance[] = [];
  const basins = [
    { id: "atl",  url: "https://www.nhc.noaa.gov/gis/json/al_5d_int.json", name: "Atlantic" },
    { id: "epac", url: "https://www.nhc.noaa.gov/gis/json/ep_5d_int.json", name: "East Pacific" },
  ];
  for (const basin of basins) {
    try {
      const r = await fetch(basin.url, { headers: { "User-Agent": UA } });
      if (!r.ok) continue;
      const geo = await r.json();
      if (!geo?.features) continue;
      for (const feat of geo.features) {
        const props = feat.properties ?? {};
        const prob2d = props.PROB2DAY ?? props.prob2day ?? 0;
        const prob5d = props.PROB5DAY ?? props.prob5day ?? 0;
        const maxProb = Math.max(Number(prob2d), Number(prob5d));
        const desc = props.AREA ?? props.area ?? props.GENTYPE ?? props.GENNAME ?? "Area of interest";
        const loc = props.LAT_LABEL && props.LON_LABEL ? `${props.LAT_LABEL}, ${props.LON_LABEL}` : undefined;
        results.push({
          id: `${basin.id}-${props.SYSID ?? results.length}`,
          basin: basin.name,
          probability: maxProb,
          description: String(desc),
          location: loc,
        });
      }
    } catch { /* ignore per-basin errors */ }
  }
  return results;
}

// ── Wind radii GeoJSON builder ─────────────────────────────────────────────
// Approximates the NHC wind radii circles as GeoJSON polygons from the
// forecast advisory text (which has NE/SE/SW/NW quadrant radii in nautical miles).
// For active storms we try the NHC GIS "fcst_radii" file first, then fall back
// to the current advisory text.
interface RadiiQuadrant { ne: number; se: number; sw: number; nw: number }
function windRadiiPolygon(
  lat: number, lon: number,
  quadrants: RadiiQuadrant,
  thresholdKt: number,
  color: string,
): GeoJSON.Feature {
  const NM_TO_DEG_LAT = 1 / 60;
  const NM_TO_DEG_LON = (lat: number) => 1 / (60 * Math.cos(lat * Math.PI / 180));
  const degsLon = NM_TO_DEG_LON(lat);

  // Build a 72-point polygon approximating the 4 quadrants
  const coords: number[][] = [];
  const steps = 18; // 18 points per quadrant
  const quads: Array<{ start: number; end: number; r: number }> = [
    { start: 0,   end: 90,  r: quadrants.ne },
    { start: 90,  end: 180, r: quadrants.se },
    { start: 180, end: 270, r: quadrants.sw },
    { start: 270, end: 360, r: quadrants.nw },
  ];

  for (const q of quads) {
    if (q.r <= 0) continue;
    for (let i = 0; i <= steps; i++) {
      const angle = (q.start + (i / steps) * (q.end - q.start)) * Math.PI / 180;
      // Meteorological convention: 0° = North, clockwise
      const dx = Math.sin(angle) * q.r * degsLon;
      const dy = Math.cos(angle) * q.r * NM_TO_DEG_LAT;
      coords.push([lon + dx, lat + dy]);
    }
  }
  if (coords.length) coords.push(coords[0]); // close ring

  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coords] },
    properties: { threshold_kt: thresholdKt, __color: color },
  };
}

async function fetchWindRadii(stormId: string): Promise<GeoJSON.FeatureCollection | null> {
  const sid = stormId.toUpperCase(); // e.g. AL012026
  const basin = sid.slice(0, 2).toLowerCase(); // al, ep, cp, wp
  const num   = sid.slice(2, 4); // 01
  const year  = sid.slice(4);    // 2026

  // Try NHC GIS forecast radii GeoJSON (most complete)
  const gisUrls = [
    `https://www.nhc.noaa.gov/gis/json/${sid}_5day_pgn.json`,
    `https://www.nhc.noaa.gov/gis/forecast/archive/${basin}${num}${year}_5day_pgn.json`,
  ];

  for (const url of gisUrls) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (r.ok) {
        const geo = await r.json();
        if (geo?.features?.length) {
          // Tag each feature with a color based on wind speed in properties
          const styled = geo.features.map((f: GeoJSON.Feature) => {
            const kt = Number(f.properties?.MAXWIND ?? f.properties?.VMAX ?? 0);
            const color = kt >= 96 ? "#ef4444" : kt >= 64 ? "#f97316" : kt >= 34 ? "#fbbf24" : "#94a3b8";
            return { ...f, properties: { ...f.properties, __color: color } };
          });
          return { type: "FeatureCollection", features: styled };
        }
      }
    } catch { /* try next */ }
  }

  // Fallback: try the current advisory RSS/XML for radii data (simplified version)
  try {
    const advUrl = `https://www.nhc.noaa.gov/nhc_${basin}.xml`;
    const r = await fetch(advUrl, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    // Parse simple XML to find current position + wind radii
    const text = await r.text();
    // Look for this storm's entry
    const pattern = new RegExp(
      `<nhc:Cyclone>.*?<nhc:atcfID>${sid}</nhc:atcfID>.*?</nhc:Cyclone>`, "s"
    );
    const match = text.match(pattern);
    if (!match) return null;

    const block = match[0];
    const get = (tag: string) => block.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`))?.[1] ?? "";
    const lat = parseFloat(get("nhc:lat")) || null;
    const lon = parseFloat(get("nhc:lon").replace(/W$/i, "")) || null;
    if (!lat || !lon) return null;
    const lonVal = /W/i.test(get("nhc:lon")) ? -Math.abs(lon) : lon;

    // Extract radius data (e.g. <nhc:WindRadii><nhc:RadiusQuadrant unit="nmile">...)
    const r34 = block.match(/<nhc:Wind34Radii[^>]*>([\s\S]*?)<\/nhc:Wind34Radii>/);
    const r50 = block.match(/<nhc:Wind50Radii[^>]*>([\s\S]*?)<\/nhc:Wind50Radii>/);
    const r64 = block.match(/<nhc:Wind64Radii[^>]*>([\s\S]*?)<\/nhc:Wind64Radii>/);

    function parseQuadrant(s: string | undefined): RadiiQuadrant | null {
      if (!s) return null;
      const ne = parseInt(s[1]?.match(/<nhc:NE[^>]*>(\d+)/)?.[1] ?? "0");
      const se = parseInt(s[1]?.match(/<nhc:SE[^>]*>(\d+)/)?.[1] ?? "0");
      const sw = parseInt(s[1]?.match(/<nhc:SW[^>]*>(\d+)/)?.[1] ?? "0");
      const nw = parseInt(s[1]?.match(/<nhc:NW[^>]*>(\d+)/)?.[1] ?? "0");
      return { ne, se, sw, nw };
    }

    const features: GeoJSON.Feature[] = [];
    const q34 = parseQuadrant(r34 as unknown as string | undefined);
    const q50 = parseQuadrant(r50 as unknown as string | undefined);
    const q64 = parseQuadrant(r64 as unknown as string | undefined);

    if (q34) features.push(windRadiiPolygon(lat, lonVal, q34, 34, "#fbbf24"));
    if (q50) features.push(windRadiiPolygon(lat, lonVal, q50, 50, "#f97316"));
    if (q64) features.push(windRadiiPolygon(lat, lonVal, q64, 64, "#ef4444"));

    if (features.length) return { type: "FeatureCollection", features };
  } catch { /* ignore */ }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/functions\/v1\/nhc/, "").replace(/^\/nhc/, "") || "/";

  // ── Active storms ───────────────────────────────────────────────────────
  if (route === "/active") {
    const key = "nhc:active";
    const cached = await cacheGet(key, 300);
    if (cached) return json(cached, 200, 300);
    try {
      const r = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.ok) { const data = await r.json(); await cacheSet(key, data); return json(data, 200, 300); }
    } catch { /* fall through */ }
    const stale = await cacheStale(key);
    return json(stale ?? { activeStorms: [] }, 200, 120);
  }

  // ── Areas to Watch ──────────────────────────────────────────────────────
  if (route === "/areas-to-watch") {
    const key = "nhc:areas-to-watch";
    const cached = await cacheGet(key, 1800);
    if (cached) return json(cached, 200, 1800);
    try {
      const disturbances = await fetchAreasToWatch();
      const data = { disturbances, updated: new Date().toISOString() };
      await cacheSet(key, data);
      return json(data, 200, 1800);
    } catch {
      const stale = await cacheStale(key);
      return json(stale ?? { disturbances: [] }, 200, 300);
    }
  }

  // ── Historical storms list ──────────────────────────────────────────────
  if (route === "/historical") {
    try {
      const { data, error } = await admin
        .from("tropical_storms")
        .select("id, name, year, basin, peak_intensity, peak_winds, last_advisory_num, final_status, track_points, graphics_urls, final_advisory_text, archived_at")
        .order("year", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return json({ storms: data ?? [] }, 200, 300);
    } catch (err) {
      return json({ storms: [], error: String(err) }, 200, 60);
    }
  }

  // ── Best track for a specific storm ────────────────────────────────────
  // /track/AL012026  or  /track/EP022025
  const trackMatch = route.match(/^\/track\/([A-Za-z]{2})(\d{2})(\d{4})$/i);
  if (trackMatch) {
    const [, basinRaw, numStr, yearStr] = trackMatch;
    const basin = basinRaw.toLowerCase();
    const num   = numStr.padStart(2, "0");
    const year  = yearStr;
    const stormId   = `${basin.toUpperCase()}${num}${year}`;
    const cacheKey  = `nhc:track:${stormId}`;

    // Check DB first
    try {
      const { data: dbStorm } = await admin
        .from("tropical_storms")
        .select("track_points, archived_at")
        .eq("id", stormId)
        .maybeSingle();
      if (dbStorm?.track_points) return json({ track: dbStorm.track_points }, 200, 600);
    } catch { /* fall through to live fetch */ }

    const cached = await cacheGet(cacheKey, 3600);
    if (cached) return json(cached, 200, 3600);

    // Fetch ATCF best track
    try {
      const atcfUrl = `https://ftp.nhc.noaa.gov/atcf/btk/b${basin}${num}${year}.dat`;
      const r = await fetch(atcfUrl, { headers: { "User-Agent": UA } });
      if (r.ok) {
        const text  = await r.text();
        const track = parseAtcf(text);
        const result = { track, source: "nhc_atcf", stormId };
        await cacheSet(cacheKey, result);
        return json(result, 200, 3600);
      }
    } catch { /* fall through */ }

    const stale = await cacheStale(cacheKey);
    return json(stale ?? { track: [], stormId }, 200, 120);
  }

  // ── Wind radii for a specific storm ────────────────────────────────────
  // /windrad/AL012026
  const windradMatch = route.match(/^\/windrad\/([A-Za-z]{2}\d{2}\d{4})$/i);
  if (windradMatch) {
    const stormId  = windradMatch[1].toUpperCase();
    const cacheKey = `nhc:windrad:${stormId}`;

    const cached = await cacheGet(cacheKey, 1800); // 30-min cache
    if (cached) return json(cached, 200, 1800);

    try {
      const radii = await fetchWindRadii(stormId);
      if (radii) {
        const result = { radii, stormId };
        await cacheSet(cacheKey, result);
        return json(result, 200, 1800);
      }
    } catch { /* fall through */ }

    const stale = await cacheStale(cacheKey);
    return json(stale ?? { radii: { type: "FeatureCollection", features: [] }, stormId }, 200, 300);
  }

  return json({ error: "not found", route }, 404);
});
