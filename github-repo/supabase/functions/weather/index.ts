// StormSync VIP — public weather data proxy (replaces the dead Render backend).
//
// Deployed to Supabase Edge Functions as `weather`. verify_jwt is intentionally
// DISABLED: this only proxies PUBLIC NOAA/NWS/SPC data and writes to a
// service-role-only cache. No user data is read or written.
//
// Routes (all under /functions/v1/weather):
//   GET /nws/points?lat=&lon=
//   GET /nws/alerts?point=lat,lon   | (no point => all active alerts)
//   GET /nws/forecast?url=<api.weather.gov url>
//   GET /spc/storm-reports
//   GET /spc/outlook-geojson?product=day1otlk_cat | day1probotlk_torn | ...
//   GET /news/weather?topic=<query>   (Google News RSS, parsed to JSON)
//
// Redeploy: via the Supabase MCP `deploy_edge_function`, or `supabase functions deploy weather`.
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = "StormSyncVIP/1.0 (contact: admin@stormsync.media)";
const NWS = "https://api.weather.gov";
const SPC = "https://www.spc.noaa.gov";
const SWPC = "https://services.swpc.noaa.gov";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200, maxAge = 300): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` },
  });
}

// Best-effort cache. Never throws — a cache miss/failure must not break the proxy.
async function cacheGet(key: string, ttlSec: number): Promise<unknown | null> {
  try {
    const { data } = await admin.from("weather_cache").select("data, fetched_at").eq("key", key).maybeSingle();
    if (!data) return null;
    if (Date.now() - new Date(data.fetched_at as string).getTime() > ttlSec * 1000) return null;
    return data.data;
  } catch { return null; }
}
async function cacheSet(key: string, value: unknown): Promise<void> {
  try { await admin.from("weather_cache").upsert({ key, data: value, fetched_at: new Date().toISOString() }); }
  catch { /* ignore */ }
}

async function fetchJSON(url: string): Promise<Response> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/geo+json, application/json" } });
  if (!r.ok) throw new Error(`upstream ${r.status} for ${url}`);
  return r;
}

async function countCsvRows(url: string): Promise<number> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return 0;
    const text = await r.text();
    const lines = text.trim().split(/\r?\n/).filter((l) => l.length > 0);
    // First line is the CSV header.
    return Math.max(0, lines.length - 1);
  } catch { return 0; }
}

// ---- RSS parsing (Google News) ------------------------------------------------
// Google News double-escapes its descriptions, so `&amp;nbsp;` survives one
// decode pass as a literal `&nbsp;` — which is exactly what was printing in the
// feed. Decoding is table-driven and runs again after tags are stripped.
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", middot: "\u00b7",
};
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[String(name).toLowerCase()] ?? m);
}
function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}
interface RssItem { title: string; link: string; description: string; source: string; pubDate: string }
function parseRssItems(xml: string): RssItem[] {
  const out: RssItem[] = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/item>/i)[0];
    const rawTitle = pick(block, "title");
    const link = pick(block, "link");
    if (!rawTitle || !link) continue;
    const source = pick(block, "source") || (rawTitle.includes(" - ") ? rawTitle.split(" - ").pop()! : "Google News");
    // Google News prefixes the title with the headline and " - Source"; trim the source suffix.
    const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
    const description = decodeEntities(pick(block, "description").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ").trim().slice(0, 200);
    const pubDate = pick(block, "pubDate");
    out.push({ title, link, description, source, pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString() });
  }
  return out;
}


// ---- KMZ / KML ---------------------------------------------------------------
/**
 * Pull the single KML out of a KMZ. A KMZ is an ordinary ZIP; entries are
 * either stored (method 0) or deflated (method 8), and `DecompressionStream`
 * handles the latter with no dependency.
 */
async function kmlFromKmz(buf: Uint8Array): Promise<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Walk local file headers rather than the central directory — a KMZ holds one
  // meaningful entry and this avoids parsing the whole index.
  let off = 0;
  while (off + 30 <= buf.length) {
    if (dv.getUint32(off, true) !== 0x04034b50) break;
    const method = dv.getUint16(off + 8, true);
    const compSize = dv.getUint32(off + 18, true);
    const nameLen = dv.getUint16(off + 26, true);
    const extraLen = dv.getUint16(off + 28, true);
    const name = new TextDecoder().decode(buf.subarray(off + 30, off + 30 + nameLen));
    const dataStart = off + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (/\.kml$/i.test(name)) {
      if (method === 0) return new TextDecoder().decode(data);
      const ds = new DecompressionStream("deflate-raw");
      const stream = new Blob([data]).stream().pipeThrough(ds);
      return await new Response(stream).text();
    }
    off = dataStart + compSize;
  }
  throw new Error("no KML inside KMZ");
}

/** KML placemarks to GeoJSON, keeping SPC's own labels and colours. */
function kmlToFeatures(kml: string): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const block of kml.split(/<Placemark[\s>]/i).slice(1)) {
    const body = block.split(/<\/Placemark>/i)[0];
    const props: Record<string, string> = {};
    for (const m of body.matchAll(/<SimpleData name="([^"]+)">([^<]*)<\/SimpleData>/g)) {
      props[m[1]] = m[2];
    }
    const rings: number[][][] = [];
    for (const m of body.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)) {
      const ring = m[1].trim().split(/\s+/).map((pair) => {
        const [lon, lat] = pair.split(",").map(Number);
        return [lon, lat];
      }).filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
      if (ring.length >= 4) rings.push(ring);
    }
    if (rings.length === 0) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: rings },
      properties: {
        label: props.LABEL ?? "",
        label2: props.LABEL2 ?? "",
        stroke: props.stroke ?? "#FF7F00",
        fill: props.fill ?? "#FFBF80",
        valid: props.VALID_ISO ?? null,
        expire: props.EXPIRE_ISO ?? null,
        issue: props.ISSUE_ISO ?? null,
        forecaster: props.FORECASTER ?? "",
      },
    });
  }
  return { type: "FeatureCollection", features };
}


// ─── traffic and hazard cameras ─────────────────────────────────────────────
/**
 * Public camera networks, normalised into one shape.
 *
 * Every network here was probed live and needs no API key. Most state 511
 * systems DO need one — Idaho, Alaska, Pennsylvania and the rest of the CARS
 * vendor family all answer "Invalid Key" — so they are absent rather than
 * half-built. Adding one later is a single entry in NETWORKS.
 *
 * The lists are cached for six hours because a camera roster changes rarely.
 * The pictures are not cached at all: the browser loads those straight from the
 * source so they are always current, which is the whole point of a camera.
 *
 * Requests are answered by bounding box. The full national list is roughly
 * 6,700 cameras and about 1.5 MB normalised, which is not a payload to send to
 * a phone during a storm.
 */
interface Cam {
  id: string;
  net: string;
  name: string;
  lat: number;
  lon: number;
  /** Still image, refreshed by the browser. */
  img: string;
  /** HLS stream, where the network publishes one. */
  stream?: string;
  road?: string;
  place?: string;
  dir?: string;
}

const CAM_UA = { "User-Agent": UA, Accept: "application/json" };

async function caltrans(): Promise<Cam[]> {
  const out: Cam[] = [];
  const districts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const pages = await Promise.all(districts.map(async (d) => {
    try {
      const r = await fetch(`https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${String(d).padStart(2, "0")}.json`, { headers: CAM_UA });
      if (!r.ok) return [];
      // deno-lint-ignore no-explicit-any
      return ((await r.json()) as any).data ?? [];
    } catch { return []; }
  }));
  for (const page of pages) {
    // deno-lint-ignore no-explicit-any
    for (const row of page as any[]) {
      const c = row?.cctv;
      const loc = c?.location, img = c?.imageData;
      const lat = Number(loc?.latitude), lon = Number(loc?.longitude);
      const still = img?.static?.currentImageURL;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !still) continue;
      if (lat === 0 && lon === 0) continue;
      if (String(c.inService) === "false") continue;
      out.push({
        id: `ct-${loc.district}-${c.index}`,
        net: "caltrans",
        name: String(loc.locationName ?? "").replace(/^\S+\s*--\s*/, "") || "Caltrans camera",
        lat, lon,
        img: still,
        stream: img?.streamingVideoURL || undefined,
        road: loc.route || undefined,
        place: loc.nearbyPlace || loc.county || undefined,
        dir: loc.direction || undefined,
      });
    }
  }
  return out;
}

async function alertCalifornia(): Promise<Cam[]> {
  try {
    const r = await fetch("https://cameras.alertcalifornia.org/public-camera-data/all_cameras-v3.json", { headers: CAM_UA });
    if (!r.ok) return [];
    // deno-lint-ignore no-explicit-any
    const d = (await r.json()) as any;
    const out: Cam[] = [];
    for (const f of d.features ?? []) {
      const [lon, lat] = f?.geometry?.coordinates ?? [];
      const p = f?.properties ?? {};
      // Roughly half the roster has null coordinates. A camera we cannot place
      // is a camera we cannot show on a map, so it is dropped rather than
      // pinned at zero.
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (!p.id) continue;
      out.push({
        id: `ac-${p.id}`,
        net: "alertca",
        name: String(p.name || p.id),
        lat, lon,
        img: `https://cameras.alertcalifornia.org/public-camera-data/${p.id}/latest-frame.jpg`,
        place: [p.county, p.state].filter(Boolean).join(", ") || undefined,
      });
    }
    return out;
  } catch { return []; }
}

async function michigan(): Promise<Cam[]> {
  try {
    const r = await fetch("https://mdotjboss.state.mi.us/MiDrive/camera/list", { headers: CAM_UA });
    if (!r.ok) return [];
    // deno-lint-ignore no-explicit-any
    const rows = (await r.json()) as any[];
    const out: Cam[] = [];
    for (const row of rows) {
      // MiDrive returns HTML fragments inside its JSON fields. The coordinates
      // live in a link and the picture in an <img> tag, so both are pulled out
      // by pattern. All 806 rows parsed when this was written; if the shape
      // changes the network simply returns nothing rather than bad pins.
      const at = /lat=([-\d.]+)&lon=([-\d.]+)/.exec(String(row?.county ?? ""));
      const img = /src="([^"]+)"/.exec(String(row?.image ?? ""));
      if (!at || !img) continue;
      const lat = Number(at[1]), lon = Number(at[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const county = String(row.county ?? "").replace(/<[^>]*>/g, "").trim();
      // MiDrive links a thumbnail path that 301s to the real file on every
      // request. On a grid of forty cameras that is forty wasted round trips,
      // so the redirect is resolved here once instead.
      const src = img[1].replace("/thumbs/", "/").replace(".flv.jpg", ".jpg");
      out.push({
        id: `mi-${lat.toFixed(5)},${lon.toFixed(5)}`,
        net: "midrive",
        name: `${String(row.route ?? "").trim()} ${String(row.location ?? "").trim()}`.trim() || "MDOT camera",
        lat, lon,
        img: src,
        road: String(row.route ?? "").trim() || undefined,
        place: county || undefined,
        dir: String(row.direction ?? "").replace(/^Traffic closest to camera is traveling /, "").replace(/\.$/, "") || undefined,
      });
    }
    return out;
  } catch { return []; }
}

async function driveBC(): Promise<Cam[]> {
  try {
    const r = await fetch("https://www.drivebc.ca/api/webcams", { headers: CAM_UA, redirect: "follow" });
    if (!r.ok) return [];
    // deno-lint-ignore no-explicit-any
    const rows = (await r.json()) as any[];
    const out: Cam[] = [];
    for (const c of rows) {
      // `location` is GeoJSON Point, so the coordinates are [lon, lat] in that
      // order. Reading it as {latitude, longitude} returned zero cameras.
      const [lon, lat] = c?.location?.coordinates ?? [];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const path = c?.links?.imageDisplay;
      if (!path) continue;
      // The feed marks cameras that are switched off or known stale. A picture
      // from three days ago on a road-conditions map is worse than no picture.
      if (c.is_on === false || c.should_appear === false || c.marked_stale === true) continue;
      out.push({
        id: `bc-${c.id}`,
        net: "drivebc",
        name: String(c.name_override || c.name || `Camera ${c.id}`),
        lat, lon,
        img: path.startsWith("http") ? path : `https://www.drivebc.ca${path}`,
        road: c.highway_display ? `Hwy ${c.highway_display}` : undefined,
        place: c.region_name || undefined,
        dir: c.orientation || undefined,
      });
    }
    return out;
  } catch { return []; }
}

const NETWORKS: { id: string; label: string; region: string; load: () => Promise<Cam[]> }[] = [
  { id: "caltrans", label: "Caltrans", region: "California highways", load: caltrans },
  { id: "alertca", label: "ALERTCalifornia", region: "California wildfire cameras", load: alertCalifornia },
  { id: "midrive", label: "MDOT MiDrive", region: "Michigan", load: michigan },
  { id: "drivebc", label: "DriveBC", region: "British Columbia", load: driveBC },
];

interface CamCache { cams: Cam[]; nets: { id: string; label: string; region: string; count: number }[]; at: string }

async function allCameras(): Promise<CamCache> {
  const hit = await cacheGet("cameras:all", 6 * 3600) as CamCache | null;
  if (hit) return hit;

  const results = await Promise.all(NETWORKS.map(async (n) => ({ n, cams: await n.load() })));
  const cams = results.flatMap((r) => r.cams);
  const nets = results.map((r) => ({ id: r.n.id, label: r.n.label, region: r.n.region, count: r.cams.length }));
  const out: CamCache = { cams, nets, at: new Date().toISOString() };
  // Only cache a run that actually got something; caching a total outage for
  // six hours would turn a blip into an afternoon.
  if (cams.length > 0) await cacheSet("cameras:all", out);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  // Strip the function mount prefix to get the logical route.
  const route = url.pathname.replace(/^\/functions\/v1\/weather/, "").replace(/^\/weather/, "") || "/";

  try {
    // ---- public cameras ---------------------------------------------------
    if (route === "/cameras") {
      const { cams, nets, at } = await allCameras();
      const bbox = url.searchParams.get("bbox");
      const netFilter = (url.searchParams.get("net") ?? "").split(",").filter(Boolean);
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 400) || 400, 1200);

      let list = cams;
      if (netFilter.length) list = list.filter((c) => netFilter.includes(c.net));

      let inBox = list.length;
      if (bbox) {
        const [w, s2, e, n] = bbox.split(",").map(Number);
        if ([w, s2, e, n].every(Number.isFinite)) {
          list = list.filter((c) => c.lon >= w && c.lon <= e && c.lat >= s2 && c.lat <= n);
          inBox = list.length;
          // Too many for one view: thin evenly across the box rather than
          // returning the first N, which would pile every pin in one corner.
          if (list.length > limit) {
            const step = list.length / limit;
            const thinned: typeof list = [];
            for (let i = 0; i < limit; i++) thinned.push(list[Math.floor(i * step)]);
            list = thinned;
          }
        }
      } else {
        list = list.slice(0, limit);
      }

      return json({ cameras: list, shown: list.length, matched: inBox, total: cams.length, networks: nets, fetched_at: at });
    }

    // ---- NWS points -------------------------------------------------------
    if (route === "/nws/points") {
      const lat = url.searchParams.get("lat");
      const lon = url.searchParams.get("lon");
      if (!lat || !lon) return json({ error: "lat and lon required" }, 400);
      const r = await fetchJSON(`${NWS}/points/${lat},${lon}`);
      return json(await r.json(), 200, 3600);
    }

    // ---- NWS alerts -------------------------------------------------------
    if (route === "/nws/alerts") {
      const point = url.searchParams.get("point");
      const q = point
        ? `${NWS}/alerts/active?status=actual&point=${encodeURIComponent(point)}`
        : `${NWS}/alerts/active?status=actual`;
      const r = await fetchJSON(q);
      return json(await r.json(), 200, 120);
    }

    // ---- NWS forecast / generic product passthrough (SSRF-guarded) --------
    if (route === "/nws/forecast") {
      const target = url.searchParams.get("url");
      if (!target || !target.startsWith(`${NWS}/`)) return json({ error: "invalid url" }, 400);
      const r = await fetchJSON(target);
      return json(await r.json(), 200, 300);
    }

    // ---- SWPC solar wind (aurora) ----------------------------------------
    // SWPC retired /products/solar-wind/*.json — every path under it now 404s,
    // which left the aurora Bz/Bt chart permanently empty. The replacement feed
    // is the real-time solar wind archive, but it ships a full day at 1-minute
    // cadence (~1.6 MB for mag alone), so it is trimmed here rather than in the
    // browser.
    if (route === "/swpc/solar-wind") {
      const cached = await cacheGet("swpc:solar-wind", 300);
      if (cached) return json(cached, 200, 300);

      const points = Math.min(240, Math.max(6, Number(url.searchParams.get("points") ?? 60)));
      const [magRes, windRes] = await Promise.all([
        fetchJSON(`${SWPC}/json/rtsw/rtsw_mag_1m.json`),
        fetchJSON(`${SWPC}/json/rtsw/rtsw_wind_1m.json`),
      ]);
      const mag = await magRes.json() as { time_tag: string; bt: number | null; bz_gsm: number | null }[];
      const wind = await windRes.json() as { time_tag: string; proton_speed: number | null; proton_density: number | null }[];

      // The RTSW feeds are ordered newest-first and can repeat a timestamp when
      // more than one spacecraft is reporting, so take from the head, de-dupe,
      // then flip to chronological order for charting.
      const speedAt = new Map(wind.map((w) => [w.time_tag, w]));
      const seen = new Set<string>();
      const series = mag
        .filter((m) => {
          if (m.bt == null || m.bz_gsm == null || seen.has(m.time_tag)) return false;
          seen.add(m.time_tag);
          return true;
        })
        .slice(0, points)
        .reverse()
        .map((m) => ({
          time: `${m.time_tag}Z`,
          bt: m.bt,
          bz: m.bz_gsm,
          speed: speedAt.get(m.time_tag)?.proton_speed ?? null,
          density: speedAt.get(m.time_tag)?.proton_density ?? null,
        }));

      const out = { series, latest: series.at(-1) ?? null, source: "NOAA SWPC RTSW (DSCOVR/ACE)" };
      await cacheSet("swpc:solar-wind", out);
      return json(out, 200, 300);
    }

    // ---- SPC storm reports (counts) --------------------------------------
    if (route === "/spc/storm-reports") {
      const cached = await cacheGet("spc:storm-reports", 600);
      if (cached) return json(cached, 200, 600);
      const [tT, tH, tW, yT, yH, yW] = await Promise.all([
        countCsvRows(`${SPC}/climo/reports/today_torn.csv`),
        countCsvRows(`${SPC}/climo/reports/today_hail.csv`),
        countCsvRows(`${SPC}/climo/reports/today_wind.csv`),
        countCsvRows(`${SPC}/climo/reports/yesterday_torn.csv`),
        countCsvRows(`${SPC}/climo/reports/yesterday_hail.csv`),
        countCsvRows(`${SPC}/climo/reports/yesterday_wind.csv`),
      ]);
      const out = {
        today: { tornado: tT, hail: tH, wind: tW },
        yesterday: { tornado: yT, hail: yH, wind: yW },
      };
      await cacheSet("spc:storm-reports", out);
      return json(out, 200, 600);
    }

    // ---- SPC outlook GeoJSON (Day 1-3 detailed + Day 4-8 any-severe) -----
    if (route === "/spc/outlook-geojson") {
      const product = url.searchParams.get("product") ?? "";
      const isExt = /^day[4-8]prob$/.test(product); // Day 4-8 combined "any severe" outlook
      if (!/^day[1-3](otlk|probotlk)_[a-z]+$/.test(product) && !isExt) return json({ error: "invalid product" }, 400);
      const key = `spc:geojson:${product}`;
      const cached = await cacheGet(key, 900);
      if (cached) return json(cached, 200, 900);
      // Day 4-8 outlooks live under exper/day4-8 (layered has the probability features);
      // Day 1-3 under products/outlook (non-layered preferred).
      const base = isExt ? `${SPC}/products/exper/day4-8/${product}` : `${SPC}/products/outlook/${product}`;
      const candidates = isExt
        ? [`${base}.lyr.geojson`, `${base}.nolyr.geojson`]
        : [`${base}.nolyr.geojson`, `${base}.lyr.geojson`];
      let geo: unknown | null = null;
      for (const c of candidates) {
        try { const r = await fetchJSON(c); geo = await r.json(); break; } catch { /* try next */ }
      }
      if (!geo) return json({ type: "FeatureCollection", features: [] }, 200, 300);
      await cacheSet(key, geo);
      return json(geo, 200, 900);
    }

    // ---- Weather news (Google News RSS, parsed server-side) ---------------
    if (route === "/news/weather") {
      const topic = url.searchParams.get("topic") ?? "severe weather OR tornado OR hurricane OR storm";
      const key = `news:${topic}`;
      const cached = await cacheGet(key, 600);
      if (cached) return json(cached, 200, 600);
      const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
      try {
        const r = await fetch(feed, { headers: { "User-Agent": UA } });
        if (!r.ok) return json({ items: [] }, 200, 120);
        const xml = await r.text();
        const items = parseRssItems(xml).slice(0, 12);
        const out = { items };
        if (items.length) await cacheSet(key, out);
        return json(out, 200, 600);
      } catch {
        return json({ items: [] }, 200, 120);
      }
    }

    // ---- NWPS river & flood gauges ---------------------------------------
    // The National Water Prediction Service serves no CORS headers, so every
    // gauge call is proxied here. `srid=EPSG_4326` is not optional — without it
    // the bbox filter is silently ignored and the API returns an empty list.
    if (route === "/water/gauges") {
      const b = ["xmin", "ymin", "xmax", "ymax"].map((k) => url.searchParams.get(k));
      if (b.some((v) => v === null)) return json({ error: "xmin,ymin,xmax,ymax required" }, 400);
      const [xmin, ymin, xmax, ymax] = b.map(Number);
      if (b.some((v) => !Number.isFinite(Number(v)))) return json({ error: "bbox must be numeric" }, 400);
      // A runaway box would pull thousands of gauges; clamp to a sane window.
      if (Math.abs(xmax - xmin) > 30 || Math.abs(ymax - ymin) > 20) {
        return json({ error: "bounding box too large" }, 400);
      }
      const key = `water:gauges:${xmin.toFixed(2)},${ymin.toFixed(2)},${xmax.toFixed(2)},${ymax.toFixed(2)}`;
      const cached = await cacheGet(key, 600);
      if (cached) return json(cached, 200, 600);
      const api = `https://api.water.noaa.gov/nwps/v1/gauges?srid=EPSG_4326` +
        `&bbox.xmin=${xmin}&bbox.ymin=${ymin}&bbox.xmax=${xmax}&bbox.ymax=${ymax}`;
      const r = await fetch(api, { headers: { "User-Agent": UA } });
      if (!r.ok) return json({ error: `NWPS ${r.status}`, gauges: [] }, r.status === 404 ? 200 : 502, 60);
      const d = await r.json();
      const out = { gauges: Array.isArray(d?.gauges) ? d.gauges : [] };
      await cacheSet(key, out);
      return json(out, 200, 600);
    }

    if (route === "/water/gauge") {
      const lid = (url.searchParams.get("lid") ?? "").toUpperCase();
      if (!/^[A-Z0-9]{3,8}$/.test(lid)) return json({ error: "valid lid required" }, 400);
      const key = `water:gauge:${lid}`;
      const cached = await cacheGet(key, 600);
      if (cached) return json(cached, 200, 600);
      // Detail and hydrograph together — the page needs both and one round trip
      // through this function is cheaper than two from the browser.
      const [dR, sR] = await Promise.all([
        fetch(`https://api.water.noaa.gov/nwps/v1/gauges/${lid}`, { headers: { "User-Agent": UA } }),
        fetch(`https://api.water.noaa.gov/nwps/v1/gauges/${lid}/stageflow`, { headers: { "User-Agent": UA } }),
      ]);
      if (!dR.ok) return json({ error: `NWPS ${dR.status}` }, 502, 60);
      const detail = await dR.json();
      const flow = sR.ok ? await sR.json() : null;
      // The observed series runs a month back at 15-minute cadence — far more
      // than a chart needs. Keep the last 7 days and thin to hourly.
      const trim = (series: { data?: { validTime: string; primary: number; secondary?: number }[] } | null | undefined, hours: number) => {
        const rows = Array.isArray(series?.data) ? series!.data : [];
        const cutoff = Date.now() - hours * 3600_000;
        const kept = rows.filter((p) => {
          const t = Date.parse(p.validTime);
          return Number.isFinite(t) && t >= cutoff;
        });
        const step = Math.max(1, Math.ceil(kept.length / 180));
        return kept.filter((_, i) => i % step === 0 || i === kept.length - 1);
      };
      const out = {
        detail,
        observed: flow?.observed ? { ...flow.observed, data: trim(flow.observed, 168) } : null,
        forecast: flow?.forecast ? { ...flow.forecast, data: (flow.forecast.data ?? []).slice(0, 200) } : null,
      };
      await cacheSet(key, out);
      return json(out, 200, 600);
    }

    // ---- SPC fire weather outlook ----------------------------------------
    // SPC publishes no GeoJSON for fire weather (unlike the convective
    // outlooks) — only KMZ. A KMZ is a plain ZIP holding one KML, so it is
    // unzipped and converted here. The IEM mirror returns empty for these
    // categories, so this reads SPC directly.
    if (route === "/spc/fire-outlook") {
      const day = url.searchParams.get("day") ?? "1";
      if (!/^[123]$/.test(day)) return json({ error: "day must be 1-3" }, 400);
      const key = `spc:firewx:${day}`;
      const cached = await cacheGet(key, 1800);
      if (cached) return json(cached, 200, 1800);
      try {
        const r = await fetch(`${SPC}/products/fire_wx/day${day}fireotlk.kmz`, { headers: { "User-Agent": UA } });
        if (!r.ok) throw new Error(String(r.status));
        const kml = await kmlFromKmz(new Uint8Array(await r.arrayBuffer()));
        const out = kmlToFeatures(kml);
        await cacheSet(key, out);
        return json(out, 200, 1800);
      } catch (e) {
        return json({ type: "FeatureCollection", features: [], error: String(e) }, 200, 300);
      }
    }

    // ---- Large active wildfire incidents (InciWeb) -------------------------
    if (route === "/fire/incidents") {
      const cached = await cacheGet("fire:incidents", 1800);
      if (cached) return json(cached, 200, 1800);
      try {
        const r = await fetch("https://inciweb.wildfire.gov/incidents/rss.xml", { headers: { "User-Agent": UA } });
        if (!r.ok) throw new Error(String(r.status));
        const xml = await r.text();
        const items = xml.split(/<item>/i).slice(1).map((raw) => {
          const b = raw.split(/<\/item>/i)[0];
          const title = pick(b, "title");
          const link = pick(b, "link");
          const desc = pick(b, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          const pub = pick(b, "pubDate");
          // InciWeb publishes no geo tags — the position is written into the
          // description as unsigned degrees/minutes/seconds, e.g.
          //   "Latitude: 48° 56 31  Longitude: 120° 36 34".
          // Longitude is negated because every InciWeb incident is in the
          // western hemisphere.
          const dms = (label: string): number | null => {
            const m = desc.match(new RegExp(`${label}:\\s*(\\d+)[^\\d]+(\\d+)(?:[^\\d]+(\\d+))?`, "i"));
            if (!m) return null;
            const v = Number(m[1]) + Number(m[2]) / 60 + (m[3] ? Number(m[3]) / 3600 : 0);
            return Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null;
          };
          const lat = dms("Latitude");
          const lon = dms("Longitude");
          const state = (desc.match(/State:\s*([A-Za-z .]+?)\s*-{2,}/) ?? [])[1]?.trim() ?? "";
          const acresM = desc.match(/([\d,]+)\s*acres/i);
          return {
            title, link,
            description: desc.replace(/-{2,}/g, "·").replace(/\s+/g, " ").slice(0, 320),
            published: pub ? new Date(pub).toISOString() : null,
            state,
            acres: acresM ? Number(acresM[1].replace(/,/g, "")) : null,
            latitude: lat,
            longitude: lon != null ? -lon : null,
          };
        }).filter((i) => i.title);
        const out = { incidents: items.slice(0, 60) };
        await cacheSet("fire:incidents", out);
        return json(out, 200, 1800);
      } catch {
        return json({ incidents: [] }, 200, 300);
      }
    }

    /**
     * Pollen forecast, via Google's Pollen API.
     *
     * There is no free unauthenticated pollen feed covering the United States —
     * Open-Meteo's pollen fields are CAMS-Europe only and return null for every
     * US hour, and pollen.com's endpoint is an internal one that refuses any
     * request without a forged Referer. Google's is official, documented and
     * US-wide, and it needs a key.
     *
     * When the key is absent this answers 501 with a plain reason rather than
     * an empty forecast, so the client can say what is missing instead of
     * rendering zeros that look like "no pollen today".
     */
    if (route === "/pollen") {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return json({ error: "lat and lon required" }, 400);
      }

      const key = Deno.env.get("GOOGLE_POLLEN_KEY");
      if (!key) {
        return json({
          available: false,
          error: "Pollen counts need a Google Pollen API key. Set GOOGLE_POLLEN_KEY on this function to turn them on.",
        }, 501);
      }

      const cacheKey = `pollen:${lat.toFixed(2)},${lon.toFixed(2)}`;
      const cached = await cacheGet(cacheKey, 3 * 3600);
      if (cached) return json(cached, 200, 3 * 3600);

      const api = `https://pollen.googleapis.com/v1/forecast:lookup` +
        `?key=${encodeURIComponent(key)}&location.latitude=${lat}&location.longitude=${lon}` +
        `&days=5&plantsDescription=true`;
      const r = await fetch(api, { headers: { "user-agent": UA } });
      if (!r.ok) {
        return json({ available: false, error: `Google Pollen returned ${r.status}.` }, 502);
      }
      const raw = await r.json();

      const band = (n: number): string =>
        n >= 5 ? "very_high" : n >= 4 ? "high" : n >= 3 ? "moderate" : n >= 2 ? "low" : n >= 1 ? "very_low" : "none";
      const title = (s: string) =>
        s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

      // deno-lint-ignore no-explicit-any
      const days = (raw?.dailyInfo ?? []).map((d: any) => {
        const date = d.date
          ? `${d.date.year}-${String(d.date.month).padStart(2, "0")}-${String(d.date.day).padStart(2, "0")}`
          : "";
        // deno-lint-ignore no-explicit-any
        const types = (d.pollenTypeInfo ?? []).map((t: any) => ({
          code: t.code ?? "",
          label: t.displayName ?? title(t.code ?? ""),
          index: t.indexInfo?.value ?? 0,
          band: band(t.indexInfo?.value ?? 0),
          inSeason: !!t.inSeason,
          advice: t.healthRecommendations?.[0] ?? null,
        }));
        // deno-lint-ignore no-explicit-any
        const species = (d.plantInfo ?? []).map((pl: any) => ({
          code: pl.code ?? "",
          label: pl.displayName ?? title(pl.code ?? ""),
          family: pl.plantDescription?.family ?? null,
          index: pl.indexInfo?.value ?? 0,
          band: band(pl.indexInfo?.value ?? 0),
          inSeason: !!pl.inSeason,
        // deno-lint-ignore no-explicit-any
        })).filter((pl: any) => pl.inSeason || pl.index > 0);
        return { date, types, species };
      });

      const payload = { available: true, days };
      await cacheSet(cacheKey, payload);
      return json(payload, 200, 3 * 3600);
    }

    return json({ error: "not found", route }, 404);
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 502);
  }
});
