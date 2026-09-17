/**
 * StormSync VIP — `tropical` edge function.
 *
 * One aggregator for every tropical data source the Hurricane Tracker needs.
 * verify_jwt is DISABLED: this proxies PUBLIC NOAA/NHC products only. NHC sends
 * no CORS header, several products are ZIPped shapefiles or gzipped ATCF decks,
 * and one (the a-deck) is ~2 MB compressed — all three reasons the browser
 * cannot go direct.
 *
 * Zero third-party dependencies: the ZIP reader, shapefile/DBF parsers and the
 * GOES geostationary projection are all implemented here against Deno natives
 * (DecompressionStream handles both `deflate-raw` and `gzip`).
 *
 * Routes
 *   /storms            active storms, normalized, with gusts + forecast labels
 *   /gtwo              NHC 7-day formation odds as GeoJSON polygons
 *   /cone/:id          forecast cone polygon + track line + forecast points
 *   /radii/:id         initial (current) and forecast wind field polygons
 *   /models/:id        ATCF a-deck spaghetti tracks
 *   /track/:id         ATCF b-deck past positions
 *   /recon             Hurricane Hunter missions from Vortex Data Messages
 *   /satellite/:id     GOES frame list + projection crop parameters
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = "StormSyncVIP/1.0 (contact: admin@stormsync.media)";
const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200, maxAge = 300) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` },
  });

// ── cache ────────────────────────────────────────────────────────────────────
async function cacheGet(key: string, ttlSec: number): Promise<unknown | null> {
  try {
    const { data } = await admin.from("weather_cache").select("data, fetched_at").eq("key", key).maybeSingle();
    if (!data) return null;
    if (Date.now() - new Date(data.fetched_at as string).getTime() > ttlSec * 1000) return null;
    return data.data;
  } catch { return null; }
}
async function cacheStale(key: string): Promise<unknown | null> {
  try {
    const { data } = await admin.from("weather_cache").select("data").eq("key", key).maybeSingle();
    return data?.data ?? null;
  } catch { return null; }
}
async function cacheSet(key: string, value: unknown) {
  try { await admin.from("weather_cache").upsert({ key, data: value, fetched_at: new Date().toISOString() }); }
  catch { /* cache is best-effort */ }
}
/** Fetch-through cache: serve fresh, else recompute, else fall back to stale. */
async function cached<T>(key: string, ttlSec: number, build: () => Promise<T>): Promise<T> {
  const hit = await cacheGet(key, ttlSec);
  if (hit) return hit as T;
  try {
    const fresh = await build();
    await cacheSet(key, fresh);
    return fresh;
  } catch (err) {
    const stale = await cacheStale(key);
    if (stale) return stale as T;
    throw err;
  }
}

const get = (url: string) => fetch(url, { headers: { "User-Agent": UA } });

// ── ZIP reader ───────────────────────────────────────────────────────────────
// Minimal central-directory reader. NHC ships stored (0) and deflated (8)
// entries; `deflate-raw` is exactly the bare DEFLATE stream a ZIP holds.
export async function inflateRaw(buf: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const out = new Response(new Blob([buf as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
export async function gunzip(buf: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const out = new Response(new Blob([buf as BlobPart]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

export async function unzip(buf: Uint8Array): Promise<Record<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Locate the End Of Central Directory record by scanning backwards.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip: no EOCD record");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);

  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method   = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen  = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen   = dv.getUint16(p + 32, true);
    const lho      = dv.getUint32(p + 42, true);
    const name     = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + cmtLen;

    // The local header repeats name/extra lengths, which may differ from the
    // central directory's — always read the data offset from the local header.
    const lNameLen  = dv.getUint16(lho + 26, true);
    const lExtraLen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    files[name] = method === 0 ? raw : await inflateRaw(raw);
  }
  return files;
}

// ── Shapefile + DBF ──────────────────────────────────────────────────────────
type Ring = [number, number][];
interface Shape { type: "Point" | "LineString" | "Polygon"; parts: Ring[] }

export function parseShp(buf: Uint8Array): Shape[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: Shape[] = [];
  let off = 100; // fixed-size header
  while (off + 8 <= buf.length) {
    const contentLen = dv.getInt32(off + 4, false) * 2; // stored in 16-bit words
    const rec = off + 8;
    off = rec + contentLen;
    const shapeType = dv.getInt32(rec, true);
    if (shapeType === 0) continue; // null shape
    if (shapeType === 1 || shapeType === 11 || shapeType === 21) {
      out.push({ type: "Point", parts: [[[dv.getFloat64(rec + 4, true), dv.getFloat64(rec + 12, true)]]] });
      continue;
    }
    // PolyLine (3/13/23) and Polygon (5/15/25) share a layout.
    const isPoly = shapeType === 5 || shapeType === 15 || shapeType === 25;
    const numParts  = dv.getInt32(rec + 36, true);
    const numPoints = dv.getInt32(rec + 40, true);
    const partsIdx: number[] = [];
    for (let i = 0; i < numParts; i++) partsIdx.push(dv.getInt32(rec + 44 + i * 4, true));
    const ptBase = rec + 44 + numParts * 4;
    const rings: Ring[] = [];
    for (let i = 0; i < numParts; i++) {
      const from = partsIdx[i];
      const to = i + 1 < numParts ? partsIdx[i + 1] : numPoints;
      const ring: Ring = [];
      for (let j = from; j < to; j++) {
        ring.push([dv.getFloat64(ptBase + j * 16, true), dv.getFloat64(ptBase + j * 16 + 8, true)]);
      }
      rings.push(ring);
    }
    out.push({ type: isPoly ? "Polygon" : "LineString", parts: rings });
  }
  return out;
}

export function parseDbf(buf: Uint8Array): Record<string, string>[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const numRecs   = dv.getUint32(4, true);
  const headerLen = dv.getUint16(8, true);
  const recLen    = dv.getUint16(10, true);
  const dec = new TextDecoder("latin1");

  const fields: { name: string; len: number }[] = [];
  for (let off = 32; off < headerLen - 1 && buf[off] !== 0x0d; off += 32) {
    const raw = buf.subarray(off, off + 11);
    const end = raw.indexOf(0);
    fields.push({ name: dec.decode(raw.subarray(0, end < 0 ? 11 : end)), len: buf[off + 16] });
  }
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < numRecs; i++) {
    const base = headerLen + i * recLen;
    if (base + recLen > buf.length) break;
    let p = base + 1; // skip the deletion flag
    const row: Record<string, string> = {};
    for (const f of fields) { row[f.name] = dec.decode(buf.subarray(p, p + f.len)).trim(); p += f.len; }
    rows.push(row);
  }
  return rows;
}

/** Read one shapefile layer out of an unzipped NHC archive into GeoJSON. */
export function layerToGeoJSON(
  files: Record<string, Uint8Array>,
  match: (base: string) => boolean,
  props?: (row: Record<string, string>, i: number) => Record<string, unknown>,
): GeoJSON.Feature[] {
  const base = Object.keys(files)
    .filter((n) => n.toLowerCase().endsWith(".shp"))
    .map((n) => n.slice(0, -4))
    .find((b) => match(b.toLowerCase()));
  if (!base) return [];
  const shapes = parseShp(files[`${base}.shp`]);
  const rows = files[`${base}.dbf`] ? parseDbf(files[`${base}.dbf`]) : [];
  return shapes.map((s, i) => {
    const row = rows[i] ?? {};
    const geometry: GeoJSON.Geometry =
      s.type === "Point"   ? { type: "Point", coordinates: s.parts[0][0] }
    : s.type === "Polygon" ? { type: "Polygon", coordinates: s.parts }
    :                        { type: "LineString", coordinates: s.parts[0] ?? [] };
    return { type: "Feature", geometry, properties: { ...row, ...(props?.(row, i) ?? {}) } } as GeoJSON.Feature;
  });
}

// ── shared helpers ───────────────────────────────────────────────────────────
const KT_TO_MPH = 1.15078;
const mph = (kt: number) => Math.round(kt * KT_TO_MPH);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Saffir-Simpson bucket for a wind speed in knots. */
export function categoryOf(kt: number) {
  if (kt >= 137) return { cat: 5, short: "CAT 5", label: "Category 5 Hurricane" };
  if (kt >= 113) return { cat: 4, short: "CAT 4", label: "Category 4 Hurricane" };
  if (kt >= 96)  return { cat: 3, short: "CAT 3", label: "Category 3 Hurricane" };
  if (kt >= 83)  return { cat: 2, short: "CAT 2", label: "Category 2 Hurricane" };
  if (kt >= 64)  return { cat: 1, short: "CAT 1", label: "Category 1 Hurricane" };
  if (kt >= 34)  return { cat: 0, short: "TS",    label: "Tropical Storm" };
  return { cat: -1, short: "TD", label: "Tropical Depression" };
}

/** ATCF packs coordinates as tenths with a hemisphere suffix, e.g. "1722W". */
export function atcfCoord(s: string): number | null {
  const m = s.trim().match(/^(\d+)([NSEW])$/i);
  if (!m) return null;
  const v = parseInt(m[1], 10) / 10;
  return /[SW]/i.test(m[2]) ? -v : v;
}

/**
 * Keep a track continuous across the antimeridian. MapLibre renders a jump from
 * +179 to -179 as a line all the way around the globe, so unwrap each point to
 * stay within 180° of the previous one.
 */
export function unwrap(coords: [number, number][]): [number, number][] {
  if (!coords.length) return coords;
  const out: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    let [lon, lat] = coords[i];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (prev - lon > 180) lon += 360;
    out.push([lon, lat]);
  }
  return out;
}

interface CurrentStorm {
  id: string; name: string; classification: string; intensity: string; pressure: string;
  latitudeNumeric: number; longitudeNumeric: number;
  movementDir: number | null; movementSpeed: number | null; lastUpdate: string;
  binNumber?: string;
  publicAdvisory?: { advNum: string; issuance: string; url: string };
  forecastAdvisory?: { advNum: string; issuance: string; url: string };
  forecastDiscussion?: { advNum: string; issuance: string; url: string };
  windSpeedProbabilities?: { url: string };
  forecastGraphics?: { url: string };
  trackCone?: { advNum: string; zipFile: string; kmzFile: string };
  forecastWindRadiiGIS?: { advNum: string; zipFile: string };
  initialWindExtent?: { advNum: string; zipFile: string };
  bestTrackGIS?: { zipFile: string };
}

export async function currentStorms(): Promise<CurrentStorm[]> {
  const data = await cached<{ activeStorms: CurrentStorm[] }>("tropical:current", 300, async () => {
    const r = await get("https://www.nhc.noaa.gov/CurrentStorms.json");
    if (!r.ok) throw new Error(`CurrentStorms ${r.status}`);
    return await r.json();
  });
  return data?.activeStorms ?? [];
}
const findStorm = (storms: CurrentStorm[], id: string) =>
  storms.find((s) => s.id.toLowerCase() === id.toLowerCase()) ?? null;

// ── cone / track line / forecast points ──────────────────────────────────────
/**
 * The 5-day archive holds three layers: `_pgn` (cone polygon), `_lin` (forecast
 * track line) and `_pts` (forecast positions). The points layer carries GUST,
 * MAXWIND, MSLP and the human date labels, so it doubles as the source for the
 * storm's gust reading — no advisory-text scraping required.
 */
export async function buildCone(storm: CurrentStorm) {
  const zipUrl = storm.trackCone?.zipFile;
  if (!zipUrl) return null;
  const r = await get(zipUrl);
  if (!r.ok) throw new Error(`cone zip ${r.status}`);
  const files = await unzip(new Uint8Array(await r.arrayBuffer()));

  const cone = layerToGeoJSON(files, (b) => b.includes("_5day_pgn"));
  const line = layerToGeoJSON(files, (b) => b.includes("_5day_lin"));
  const pts  = layerToGeoJSON(files, (b) => b.includes("_5day_pts"));

  // Unwrap the line so a dateline-crossing forecast draws as one path.
  for (const f of line) {
    if (f.geometry.type === "LineString") {
      f.geometry.coordinates = unwrap(f.geometry.coordinates as [number, number][]);
    }
  }

  const points = pts.map((f) => {
    const p = f.properties as Record<string, string>;
    const kt = num(p.MAXWIND);
    return {
      lat: num(p.LAT),
      lon: num(p.LON),
      tau: num(p.TAU),
      maxwind_kt: kt,
      maxwind_mph: mph(kt),
      gust_kt: num(p.GUST),
      gust_mph: mph(num(p.GUST)),
      mslp: num(p.MSLP) || null,
      dateLabel: p.DATELBL ?? "",
      fullDateLabel: p.FLDATELBL ?? "",
      validTime: p.VALIDTIME ?? "",
      stormType: p.DVLBL ?? p.TCDVLP ?? "",
      dir: num(p.TCDIR) || null,
      speed_kt: num(p.TCSPD) || null,
      ...categoryOf(kt),
    };
  }).sort((a, b) => a.tau - b.tau);

  return {
    advisory: (cone[0]?.properties as Record<string, string>)?.ADVISNUM ?? storm.trackCone?.advNum ?? null,
    advisoryDate: (cone[0]?.properties as Record<string, string>)?.ADVDATE ?? null,
    cone: { type: "FeatureCollection", features: cone } as GeoJSON.FeatureCollection,
    line: { type: "FeatureCollection", features: line } as GeoJSON.FeatureCollection,
    points,
    source: zipUrl,
  };
}

// ── wind radii ───────────────────────────────────────────────────────────────
const RADII_COLOR: Record<number, string> = { 34: "#f5c451", 50: "#e8833a", 64: "#d64545" };

/**
 * The forecast archive holds `initialradii` (the wind field right now) and
 * `forecastradii` (one set per forecast hour). Both are true NHC polygons —
 * this replaces the old quadrant approximation, which drew from three endpoints
 * that all 404 today.
 */
export async function buildRadii(storm: CurrentStorm) {
  const zipUrl = storm.forecastWindRadiiGIS?.zipFile ?? storm.initialWindExtent?.zipFile;
  if (!zipUrl) return null;
  const r = await get(zipUrl);
  if (!r.ok) throw new Error(`radii zip ${r.status}`);
  const files = await unzip(new Uint8Array(await r.arrayBuffer()));

  const style = (row: Record<string, string>) => {
    const kt = num(row.RADII);
    return {
      threshold_kt: kt,
      threshold_mph: mph(kt),
      __color: RADII_COLOR[kt] ?? "#8fa3bf",
      tau: num(row.TAU),
    };
  };
  const initial  = layerToGeoJSON(files, (b) => b.includes("initialradii"), style);
  const forecast = layerToGeoJSON(files, (b) => b.includes("forecastradii"), style);

  // Largest threshold first so the 64 kt core paints on top of the 34 kt field.
  const byThreshold = (a: GeoJSON.Feature, b: GeoJSON.Feature) =>
    num((a.properties as Record<string, string>).RADII) - num((b.properties as Record<string, string>).RADII);

  return {
    advisory: storm.forecastWindRadiiGIS?.advNum ?? null,
    initial:  { type: "FeatureCollection", features: initial.sort(byThreshold) } as GeoJSON.FeatureCollection,
    forecast: { type: "FeatureCollection", features: forecast.sort(byThreshold) } as GeoJSON.FeatureCollection,
    source: zipUrl,
  };
}

// ── 7-day formation odds (GTWO) ──────────────────────────────────────────────
const RISK_COLOR = (p: number) => (p >= 60 ? "#d64545" : p >= 40 ? "#e8833a" : "#f5c451");

/**
 * NHC publishes the Tropical Weather Outlook areas only as a shapefile bundle —
 * there is no official GeoJSON — so it gets parsed here and handed to the map
 * as dashed polygons with their probability labels.
 */
export async function buildGtwo() {
  const r = await get("https://www.nhc.noaa.gov/xgtwo/gtwo_shapefiles.zip");
  if (!r.ok) throw new Error(`gtwo ${r.status}`);
  const files = await unzip(new Uint8Array(await r.arrayBuffer()));

  const pct = (v: string) => num(String(v).replace("%", ""));
  const decorate = (row: Record<string, string>) => {
    const p7 = pct(row.PROB7DAY), p2 = pct(row.PROB2DAY);
    return {
      basin: row.BASIN, area: row.AREA,
      prob2day: p2, prob7day: p7,
      risk2day: row.RISK2DAY, risk7day: row.RISK7DAY,
      label: `${p7}%`,
      __color: RISK_COLOR(p7),
    };
  };
  const areas  = layerToGeoJSON(files, (b) => b.includes("gtwo_areas"),  decorate);
  const points = layerToGeoJSON(files, (b) => b.includes("gtwo_points"), decorate);

  // The bundle's timestamp lives in the filenames (…_YYYYMMDDHHMM).
  const stamp = Object.keys(files).map((n) => n.match(/_(\d{12})\./)?.[1]).find(Boolean) ?? null;

  // The outlook discussion text ships alongside as RTF; strip the control words
  // so the narrative can be shown next to the map.
  const text: Record<string, string> = {};
  for (const [name, buf] of Object.entries(files)) {
    if (!name.endsWith(".rtf")) continue;
    const basin = name.includes("_atl_") ? "Atlantic" : name.includes("_pac_") ? "Pacific" : name;
    text[basin] = new TextDecoder("latin1").decode(buf)
      .replace(/\{\\\*[\s\S]*?\}/g, "")
      .replace(/\\'([0-9a-f]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\par[d]?\s?/g, "\n")
      .replace(/\\[a-z]+-?\d*\s?/gi, "")
      .replace(/[{}]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return {
    updated: stamp,
    areas:  { type: "FeatureCollection", features: areas }  as GeoJSON.FeatureCollection,
    points: { type: "FeatureCollection", features: points } as GeoJSON.FeatureCollection,
    outlookText: text,
  };
}

// ── ATCF decks ───────────────────────────────────────────────────────────────
/** Human-facing names for the models that actually matter on a spaghetti plot. */
const MODEL_NAMES: Record<string, string> = {
  OFCL: "NHC Official", OFCI: "NHC Official (interp)",
  AVNO: "GFS", AVNI: "GFS", GFSO: "GFS",
  AEMN: "GFS Ensemble Mean", AEMI: "GFS Ensemble Mean", AEM2: "GFS Ensemble Mean",
  CMC: "Canadian", CMC2: "Canadian", CMCI: "Canadian",
  CEMN: "Canadian Ensemble", CEM2: "Canadian Ensemble", CEMI: "Canadian Ensemble",
  UKX: "UKMET", UKX2: "UKMET", UKXI: "UKMET",
  NGX: "Navy NAVGEM", NGX2: "Navy NAVGEM", NGXI: "Navy NAVGEM",
  NVGM: "Navy NAVGEM", NVGI: "Navy NAVGEM", NVG2: "Navy NAVGEM",
  HWRF: "HWRF", HWFI: "HWRF", HWF2: "HWRF",
  HMON: "HMON", HMNI: "HMON", HMN2: "HMON",
  HFSA: "HAFS-A", HFAI: "HAFS-A", HFA2: "HAFS-A",
  HFSB: "HAFS-B", HFBI: "HAFS-B", HFB2: "HAFS-B",
  CTCX: "COAMPS-TC", CTCI: "COAMPS-TC", CTC2: "COAMPS-TC",
  HCCA: "HCCA Consensus", TVCN: "Track Consensus", IVCN: "Intensity Consensus",
  RVCN: "Radii Consensus", NNIB: "NNIB", NNIC: "NNIC",
  SHIP: "SHIPS", DSHP: "Decay SHIPS", LGEM: "LGEM",
  CLP5: "CLIPER5", SHF5: "SHIFOR5", OCD5: "OCD5", TCLP: "TC CLIPER",
  XTRP: "Extrapolation", CARQ: "CARQ Analysis", TABS: "Beta+Advection (S)",
  TABM: "Beta+Advection (M)", TABD: "Beta+Advection (D)", DRCL: "Decay CLIPER",
};
/** Statistical intensity-only aids carry no useful track — hide them by default. */
const INTENSITY_ONLY = new Set(["SHIP", "DSHP", "LGEM", "OCD5", "SHF5", "DRCL", "RI25", "IVCN", "RVCN", "CARQ", "TCLP", "CLP5"]);

const PALETTE = [
  "#5b8cff", "#ff6b9d", "#4ade80", "#fbbf24", "#a78bfa", "#22d3ee",
  "#fb923c", "#f472b6", "#34d399", "#e879f9", "#60a5fa", "#facc15",
  "#2dd4bf", "#f87171", "#c084fc", "#38bdf8", "#a3e635", "#fda4af",
];

interface DeckRow { tech: string; tau: number; lat: number; lon: number; vmax: number; mslp: number | null }

/**
 * The a-deck repeats each (model, hour) once per wind-radii threshold, so rows
 * are de-duplicated on that pair. `wantEnsemble` swaps the operational models
 * for the 30 GEFS members (AP01–AP30).
 */
export function parseDeck(text: string, opts: { best?: boolean } = {}): Map<string, DeckRow[]> {
  const byTech = new Map<string, Map<number, DeckRow>>();
  for (const line of text.split("\n")) {
    const c = line.split(",").map((s) => s.trim());
    if (c.length < 9) continue;
    const tech = c[4];
    if (opts.best && tech !== "BEST") continue;
    const tau = parseInt(c[5], 10);
    const lat = atcfCoord(c[6]);
    const lon = atcfCoord(c[7]);
    if (lat === null || lon === null || !Number.isFinite(tau)) continue;
    const key = opts.best ? c[2] : String(tau);
    let m = byTech.get(tech);
    if (!m) { m = new Map(); byTech.set(tech, m); }
    const k = opts.best ? Number(key) : tau;
    if (m.has(k)) continue; // first row for this hour wins
    m.set(k, { tech, tau, lat, lon, vmax: parseInt(c[8], 10) || 0, mslp: parseInt(c[9], 10) || null });
  }
  const out = new Map<string, DeckRow[]>();
  for (const [tech, m] of byTech) out.set(tech, [...m.values()].sort((a, b) => a.tau - b.tau));
  return out;
}

export async function buildModels(stormId: string, ensemble: boolean) {
  const id = stormId.toLowerCase();               // cp012026
  const basin = id.slice(0, 2), n2 = id.slice(2, 4), yr = id.slice(4);
  const r = await get(`https://ftp.nhc.noaa.gov/atcf/aid_public/a${basin}${n2}${yr}.dat.gz`);
  if (!r.ok) throw new Error(`a-deck ${r.status}`);
  const text = new TextDecoder().decode(await gunzip(new Uint8Array(await r.arrayBuffer())));

  // Only the newest cycle that actually carries the requested family of models.
  const wanted = (t: string) => (ensemble ? /^AP\d\d$/.test(t) || t === "AC00" : !/^AP\d\d$/.test(t) && t !== "AC00");
  const cycles = [...new Set(text.split("\n").map((l) => l.split(",")[2]?.trim()).filter(Boolean))].sort();
  let chosen = "", rows = new Map<string, DeckRow[]>();
  for (let i = cycles.length - 1; i >= 0; i--) {
    const slice = text.split("\n").filter((l) => l.split(",")[2]?.trim() === cycles[i]).join("\n");
    const parsed = parseDeck(slice);
    const keep = new Map([...parsed].filter(([t, pts]) => wanted(t) && pts.length > 1 && !INTENSITY_ONLY.has(t)));
    if (keep.size) { chosen = cycles[i]; rows = keep; break; }
  }
  if (!chosen) return { initialized: null, models: [], count: 0, ensemble };

  // A cycle carries either OFCL or its interpolated twin OFCI — whichever is
  // present is the official NHC track and must read as such.
  const isOfficial = (t: string) => t === "OFCL" || t === "OFCI";
  const models = [...rows.entries()]
    .sort((a, b) => (isOfficial(a[0]) ? -1 : isOfficial(b[0]) ? 1 : a[0].localeCompare(b[0])))
    .map(([tech, pts], i) => ({
      id: tech,
      name: MODEL_NAMES[tech] ?? (/^AP\d\d$/.test(tech) ? `GEFS ${tech.slice(2)}` : tech),
      color: isOfficial(tech) ? "#ffffff" : PALETTE[i % PALETTE.length],
      official: isOfficial(tech),
      peak_kt: Math.max(...pts.map((p) => p.vmax)),
      peak_mph: mph(Math.max(...pts.map((p) => p.vmax))),
      points: unwrap(pts.map((p) => [p.lon, p.lat] as [number, number])).map(([lon, lat], j) => ({
        lon, lat, tau: pts[j].tau, vmax_kt: pts[j].vmax, vmax_mph: mph(pts[j].vmax), mslp: pts[j].mslp,
      })),
    }));

  const dtg = chosen; // YYYYMMDDHH
  return {
    initialized: `${dtg.slice(0, 4)}-${dtg.slice(4, 6)}-${dtg.slice(6, 8)}T${dtg.slice(8, 10)}:00:00Z`,
    cycle: dtg, models, count: models.length, ensemble,
  };
}

export async function buildTrack(stormId: string) {
  const id = stormId.toLowerCase();
  const basin = id.slice(0, 2), n2 = id.slice(2, 4), yr = id.slice(4);
  const r = await get(`https://ftp.nhc.noaa.gov/atcf/btk/b${basin}${n2}${yr}.dat`);
  if (!r.ok) throw new Error(`b-deck ${r.status}`);
  const text = await r.text();

  // b-deck rows are keyed by synoptic time rather than forecast hour.
  const seen = new Map<string, { lat: number; lon: number; vmax: number; mslp: number | null; type: string }>();
  for (const line of text.split("\n")) {
    const c = line.split(",").map((s) => s.trim());
    if (c.length < 11 || c[4] !== "BEST") continue;
    const dtg = c[2];
    if (seen.has(dtg)) continue;
    const lat = atcfCoord(c[6]), lon = atcfCoord(c[7]);
    if (lat === null || lon === null) continue;
    seen.set(dtg, { lat, lon, vmax: parseInt(c[8], 10) || 0, mslp: parseInt(c[9], 10) || null, type: c[10] || "" });
  }
  const dtgs = [...seen.keys()].sort();
  const unwrapped = unwrap(dtgs.map((d) => [seen.get(d)!.lon, seen.get(d)!.lat] as [number, number]));
  const track = dtgs.map((d, i) => {
    const p = seen.get(d)!;
    return {
      timestamp: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(8, 10)}:00:00Z`,
      lat: p.lat, lon: unwrapped[i][0], winds_kt: p.vmax, winds_mph: mph(p.vmax),
      pressure: p.mslp, type: p.type, ...categoryOf(p.vmax),
    };
  });
  return { stormId: stormId.toUpperCase(), track, count: track.length };
}

// ── Hurricane Hunter recon ───────────────────────────────────────────────────
interface ReconMission {
  key: string; mission: string; aircraft: string; missionNum: string;
  stormName: string; stormId: string | null;
  fixTime: string | null; lastObTime?: string | null; lat: number | null; lon: number | null;
  mslp: number | null; maxFlWind_kt: number | null; maxFlWind_mph: number | null;
  maxSfcWind_kt: number | null; maxSfcWind_mph: number | null;
  obNumber: string | null; status: "active" | "completed"; remarks: string | null;
}

/**
 * Parse one Vortex Data Message. The VDM is the authoritative recon fix: field
 * D is the actual minimum sea-level pressure at the centre, which is why this
 * is used instead of the HDOB stream — HDOB's sixth field is a D-value (a
 * height departure) whenever the aircraft is above the 550 mb level, and
 * reading it as a pressure yields impossible numbers like 1042 mb in a
 * tropical storm.
 */
export function parseVdm(text: string): ReconMission | null {
  const stormId = text.match(/VORTEX DATA MESSAGE\s+([A-Z]{2}\d{6})/i)?.[1] ?? null;
  const field = (letter: string) =>
    text.match(new RegExp(`^\\s*${letter}\\.\\s*(.+?)\\s*$`, "mi"))?.[1] ?? null;

  const u = field("U");
  if (!u) return null;
  // "AF308 0302C MOKE    OB 21"
  const m = u.match(/^(\S+)\s+(\S+)\s+(.+?)(?:\s+OB\s+(\d+))?\s*$/i);
  if (!m) return null;
  const [, aircraft, missionNum, stormNameRaw, obNumber] = m;
  const stormName = stormNameRaw.trim();

  // Filter the periodic comm-check / training transmissions.
  if (/TEST|TRAIN|WXWXA/i.test(u) || /TEST TEST TEST/i.test(text)) return null;
  if (stormId && /99$|9[0-9]\d{4}$/.test(stormId.slice(2, 4) + stormId.slice(4))) { /* keep — checked below */ }
  if (stormId && stormId.slice(2, 4) === "99") return null;

  const a = field("A");                                   // "22/10:44:50Z"
  let fixTime: string | null = null;
  const at = a?.match(/(\d{2})\/(\d{2}):(\d{2}):(\d{2})Z/);
  if (at) {
    const now = new Date();
    const [, dd, hh, mm, ss] = at;
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), +dd, +hh, +mm, +ss));
    // A day-of-month later than today means the fix belongs to the previous month.
    if (d.getTime() - now.getTime() > 3 * 86400e3) d.setUTCMonth(d.getUTCMonth() - 1);
    fixTime = d.toISOString();
  }

  const b = field("B")?.match(/([\d.]+)\s*deg\s*([NS])\s+([\d.]+)\s*deg\s*([EW])/i);
  const lat = b ? (b[2].toUpperCase() === "S" ? -1 : 1) * parseFloat(b[1]) : null;
  const lon = b ? (b[4].toUpperCase() === "W" ? -1 : 1) * parseFloat(b[3]) : null;

  const mslp = parseInt(field("D")?.match(/(\d+)\s*mb/i)?.[1] ?? "", 10) || null;

  // Peak flight-level wind: the summary remark is authoritative; fall back to
  // the larger of the inbound (J) and outbound (N) legs.
  const remarkFl = parseInt(text.match(/MAX\s+FL\s+WIND\s+(\d+)\s*KT/i)?.[1] ?? "", 10) || null;
  const legs = ["J", "N"]
    .map((l) => parseInt(field(l)?.match(/(\d+)\s*kt/i)?.[1] ?? "", 10))
    .filter((n) => Number.isFinite(n)) as number[];
  const maxFl = remarkFl ?? (legs.length ? Math.max(...legs) : null);

  const sfc = parseInt(text.match(/MAX\s+(?:SFC|SURFACE)\s+WIND\s+(\d+)\s*KT/i)?.[1] ?? "", 10) || null;

  const ageMin = fixTime ? (Date.now() - new Date(fixTime).getTime()) / 60000 : Infinity;
  return {
    key: `${aircraft}-${missionNum}-${stormName}`.toUpperCase(),
    mission: `${aircraft}-${missionNum}-${stormName}`.toUpperCase(),
    aircraft, missionNum, stormName, stormId,
    fixTime, lat, lon, mslp,
    maxFlWind_kt: maxFl, maxFlWind_mph: maxFl ? mph(maxFl) : null,
    maxSfcWind_kt: sfc, maxSfcWind_mph: sfc ? mph(sfc) : null,
    obNumber: obNumber ?? null,
    status: ageMin <= 150 ? "active" : "completed",
    remarks: text.split("\n").filter((l) => /^[A-Z][A-Z ,.'-]{15,}/.test(l.trim()) && !/^MAX FL/.test(l.trim()))
      .slice(0, 1)[0]?.trim() ?? null,
  };
}


/**
 * Live High-Density Observations. A mission transmits HDOB every ten minutes
 * throughout a flight, so this is what marks a mission as still airborne — a
 * VDM is only filed at each centre fix.
 *
 * Deliberately NOT read here: the sixth field. It holds an extrapolated surface
 * pressure only while the aircraft is at or below 550 mb; higher up it is a
 * D-value in metres. Treating it as a pressure is what produces the impossible
 * ~1042 mb readings seen on other trackers, so pressure is taken from the VDM.
 */
interface HdobSummary {
  key: string; aircraft: string; missionNum: string; stormName: string;
  lastOb: string | null; peakFl_kt: number | null; peakSfc_kt: number | null; obNumber: string | null;
}
export function parseHdob(text: string): HdobSummary | null {
  const head = text.match(/^(\S+)\s+(\S+)\s+(\S+)\s+HDOB\s+(\d+)\s+(\d{8})\s*$/m);
  if (!head) return null;
  const [, aircraft, missionNum, stormName, obNumber, yyyymmdd] = head;
  if (/TEST|TRAIN|WXWXA/i.test(missionNum) || /TEST|TRAIN|WXWXA/i.test(stormName)) return null;

  let peakFl: number | null = null, peakSfc: number | null = null, lastHHMMSS: string | null = null;
  for (const line of text.split("\n")) {
    const c = line.trim().split(/\s+/);
    if (c.length < 11 || !/^\d{6}$/.test(c[0])) continue;
    lastHHMMSS = c[0];
    const fl = /^\d+$/.test(c[9]) ? parseInt(c[9], 10) : null;      // peak 10-s flight-level wind
    const sfc = /^\d+$/.test(c[10]) ? parseInt(c[10], 10) : null;    // SFMR surface wind
    if (fl !== null && fl < 300) peakFl = Math.max(peakFl ?? 0, fl);
    if (sfc !== null && sfc < 300) peakSfc = Math.max(peakSfc ?? 0, sfc);
  }
  let lastOb: string | null = null;
  if (lastHHMMSS) {
    lastOb = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T` +
             `${lastHHMMSS.slice(0, 2)}:${lastHHMMSS.slice(2, 4)}:${lastHHMMSS.slice(4, 6)}Z`;
  }
  return {
    key: `${aircraft}-${missionNum}-${stormName}`.toUpperCase(),
    aircraft, missionNum, stormName, lastOb, peakFl_kt: peakFl, peakSfc_kt: peakSfc, obNumber,
  };
}

/** NHC wraps each live text product in HTML; the product sits inside <pre>. */
function preText(html: string): string {
  return (html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1] ?? "")
    .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Recon missions from the last 30 hours. NHC archives one VDM per file, so the
 * directory index is read first and only the recent files are fetched.
 */
export async function buildRecon() {
  const year = new Date().getUTCFullYear();
  const cutoff = Date.now() - 30 * 3600e3;
  const missions = new Map<string, ReconMission>();

  for (const dir of ["REPNT2", "REPPN2"]) {
    try {
      const idx = await get(`https://www.nhc.noaa.gov/archive/recon/${year}/${dir}/`);
      if (!idx.ok) continue;
      const html = await idx.text();
      const names = [...html.matchAll(/href="([A-Z0-9]+-[A-Z]+\.(\d{12})\.txt)"/g)]
        .map((m) => ({ name: m[1], stamp: m[2] }))
        .filter(({ stamp }) => {
          const t = Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8), +stamp.slice(8, 10), +stamp.slice(10, 12));
          return t >= cutoff;
        })
        .slice(-40);

      // Fetch in small batches so a busy basin cannot exhaust the function's time.
      for (let i = 0; i < names.length; i += 8) {
        const batch = await Promise.all(
          names.slice(i, i + 8).map(async ({ name }) => {
            try {
              const r = await get(`https://www.nhc.noaa.gov/archive/recon/${year}/${dir}/${name}`);
              return r.ok ? await r.text() : null;
            } catch { return null; }
          }),
        );
        for (const body of batch) {
          if (!body) continue;
          const parsed = parseVdm(body);
          if (!parsed) continue;
          const prev = missions.get(parsed.key);
          // Keep the most recent fix per mission, carrying forward peak values.
          if (!prev || (parsed.fixTime ?? "") > (prev.fixTime ?? "")) {
            missions.set(parsed.key, {
              ...parsed,
              maxFlWind_kt: Math.max(parsed.maxFlWind_kt ?? 0, prev?.maxFlWind_kt ?? 0) || null,
              maxFlWind_mph: mph(Math.max(parsed.maxFlWind_kt ?? 0, prev?.maxFlWind_kt ?? 0)) || null,
              mslp: Math.min(parsed.mslp ?? 9999, prev?.mslp ?? 9999) === 9999 ? null
                  : Math.min(parsed.mslp ?? 9999, prev?.mslp ?? 9999),
            });
          }
        }
      }
    } catch { /* one basin failing must not blank the table */ }
  }

  // Live HDOB: marks missions that are still airborne and supplies SFMR surface
  // winds, which the VDM does not carry.
  const HDOB_URLS = ["URNT15-USAF", "URNT15-NOAA", "URPN15-USAF", "URPN15-NOAA"];
  const hdobs = (await Promise.all(HDOB_URLS.map(async (p) => {
    try {
      const r = await get(`https://www.nhc.noaa.gov/text/${p}.shtml`);
      return r.ok ? parseHdob(preText(await r.text())) : null;
    } catch { return null; }
  }))).filter(Boolean) as HdobSummary[];

  for (const h of hdobs) {
    const existing = missions.get(h.key);
    const airborne = h.lastOb ? Date.now() - new Date(h.lastOb).getTime() < 90 * 60e3 : false;
    if (existing) {
      missions.set(h.key, {
        ...existing,
        status: airborne ? "active" : existing.status,
        lastObTime: h.lastOb,
        maxFlWind_kt: Math.max(existing.maxFlWind_kt ?? 0, h.peakFl_kt ?? 0) || null,
        maxFlWind_mph: mph(Math.max(existing.maxFlWind_kt ?? 0, h.peakFl_kt ?? 0)) || null,
        maxSfcWind_kt: Math.max(existing.maxSfcWind_kt ?? 0, h.peakSfc_kt ?? 0) || null,
        maxSfcWind_mph: mph(Math.max(existing.maxSfcWind_kt ?? 0, h.peakSfc_kt ?? 0)) || null,
      });
    } else if (airborne) {
      // Airborne but no centre fix filed yet — show it without inventing a pressure.
      missions.set(h.key, {
        key: h.key, mission: h.key, aircraft: h.aircraft, missionNum: h.missionNum,
        stormName: h.stormName, stormId: null,
        fixTime: null, lastObTime: h.lastOb, lat: null, lon: null, mslp: null,
        maxFlWind_kt: h.peakFl_kt, maxFlWind_mph: h.peakFl_kt ? mph(h.peakFl_kt) : null,
        maxSfcWind_kt: h.peakSfc_kt, maxSfcWind_mph: h.peakSfc_kt ? mph(h.peakSfc_kt) : null,
        obNumber: h.obNumber, status: "active", remarks: null,
      });
    }
  }

  // VDMs label an unnamed system "CYCLONE"; recover the real name from the
  // storm id where NHC has since named it.
  const active = await currentStorms().catch(() => []);
  for (const [k, m] of missions) {
    if (!/^(CYCLONE|INVEST|TROPICAL)$/i.test(m.stormName)) continue;
    const named = m.stormId ? active.find((s) => s.id.toLowerCase() === m.stormId!.toLowerCase()) : null;
    if (named) missions.set(k, { ...m, stormName: named.name.toUpperCase(), mission: `${m.aircraft}-${m.missionNum}-${named.name.toUpperCase()}` });
  }

  const list = [...missions.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return (b.lastObTime ?? b.fixTime ?? "").localeCompare(a.lastObTime ?? a.fixTime ?? "");
  });
  return { missions: list, count: list.length, updated: new Date().toISOString() };
}

// ── GOES satellite ───────────────────────────────────────────────────────────
// ABI fixed-grid geostationary projection (GRS80). Verified against the
// sub-satellite point, which lands exactly at the centre of the full disk.
const REQ = 6378137.0, RPOL = 6356752.31414, SAT_H = 42164160.0;
const E2 = 1 - (RPOL * RPOL) / (REQ * REQ);
const X_OFF = -0.151844, X_SCALE = 5.6e-5;   // radians, on the native 5424 grid
const NATIVE = 5424;

export function latLonToGrid(lat: number, lon: number, subLon: number, full: number) {
  const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180, l0 = subLon * Math.PI / 180;
  const phiC = Math.atan((RPOL * RPOL) / (REQ * REQ) * Math.tan(phi));
  const rc = RPOL / Math.sqrt(1 - E2 * Math.cos(phiC) ** 2);
  const sx = SAT_H - rc * Math.cos(phiC) * Math.cos(lam - l0);
  const sy = -rc * Math.cos(phiC) * Math.sin(lam - l0);
  const sz = rc * Math.sin(phiC);
  // Beyond the visible limb the point is behind the earth.
  if (SAT_H * (SAT_H - sx) < sy * sy + (REQ * REQ) / (RPOL * RPOL) * sz * sz) return null;
  const x = Math.asin(-sy / Math.sqrt(sx * sx + sy * sy + sz * sz));
  const y = Math.atan(sz / sx);
  const f = NATIVE / full;
  return { col: (x - X_OFF) / X_SCALE / f, row: (-y - X_OFF) / X_SCALE / f };
}

const SATS = [
  { id: "goes-18", label: "GOES-18 (West)", subLon: -137.0 },
  { id: "goes-19", label: "GOES-19 (East)", subLon: -75.2 },
];
const PRODUCTS: Record<string, string> = {
  band_13: "Clean IR (Band 13)",
  geocolor: "GeoColor",
  band_02: "Visible (Band 2)",
};

/**
 * Storm-centred satellite loop. Rather than shipping 1.8 MB full-disk frames,
 * this returns just the CIRA SLIDER tiles that intersect the crop box, with
 * their placement, so the client stitches a few 678 px tiles per frame.
 */
export async function buildSatellite(lat: number, lon: number, opts: { zoom: number; frames: number; product: string }) {
  const product = PRODUCTS[opts.product] ? opts.product : "band_13";
  const zoom = Math.min(3, Math.max(1, opts.zoom));
  const TILE = 678, grid = 2 ** zoom, full = TILE * grid;

  // Prefer the satellite whose sub-point is nearest; fall back if off-disk.
  //
  // This comparator was inverted, and the effect was not subtle. For a storm in
  // the Gulf at 93.8W, GOES-East sits 18.6 degrees away and GOES-West 43.2 —
  // and the loop was built from West, which sees the Gulf near its limb. The
  // frames came back showing the curve of the Earth rather than the hurricane.
  const ordered = [...SATS].sort((a, b) => {
    const d = (s: typeof a) => Math.abs(((lon - s.subLon + 540) % 360) - 180);
    return d(a) - d(b);
  });
  let sat = null, pos = null;
  for (const s of ordered) {
    const p = latLonToGrid(lat, lon, s.subLon, full);
    if (p && p.col > 0 && p.row > 0 && p.col < full && p.row < full) { sat = s; pos = p; break; }
  }
  if (!sat || !pos) {
    return { available: false, reason: "This storm is outside the GOES-East and GOES-West field of view.", lat, lon };
  }

  const times = await (await get(`https://slider.cira.colostate.edu/data/json/${sat.id}/full_disk/${product}/latest_times.json`)).json();
  const stamps: number[] = (times?.timestamps_int ?? []).slice(0, Math.min(72, Math.max(2, opts.frames)));
  if (!stamps.length) throw new Error("no frames");

  // A crop about 12° across reads well at every zoom level.
  const half = Math.round((full / NATIVE) * 500);
  const x0 = Math.round(pos.col - half), y0 = Math.round(pos.row - half);
  const size = half * 2;

  const tiles: { row: number; col: number; left: number; top: number }[] = [];
  for (let r = Math.floor(y0 / TILE); r <= Math.floor((y0 + size) / TILE); r++) {
    for (let c = Math.floor(x0 / TILE); c <= Math.floor((x0 + size) / TILE); c++) {
      if (r < 0 || c < 0 || r >= grid || c >= grid) continue;
      tiles.push({ row: r, col: c, left: c * TILE - x0, top: r * TILE - y0 });
    }
  }

  const frames = stamps.map((ts) => {
    const s = String(ts);
    return {
      ts: s,
      iso: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`,
      base: `https://slider.cira.colostate.edu/data/imagery/${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}/${sat.id}---full_disk/${product}/${s}/${String(zoom).padStart(2, "0")}`,
    };
  }).reverse(); // oldest → newest so the loop plays forward

  return {
    available: true,
    satellite: sat.id, satelliteLabel: sat.label, subLon: sat.subLon,
    product, productLabel: PRODUCTS[product],
    zoom, tileSize: TILE, grid, cropSize: size,
    center: { lat, lon, col: pos.col - x0, row: pos.row - y0 },
    tiles, frames, count: frames.length,
  };
}

// ── normalized storm payload ─────────────────────────────────────────────────
/**
 * `CurrentStorms.json` carries everything the Forecast tab shows except gusts,
 * which live in the cone archive's points layer at forecast hour 0.
 */
async function buildStorms() {
  const storms = await currentStorms();
  const out = await Promise.all(storms.map(async (s) => {
    const kt = num(s.intensity);
    let gust_kt: number | null = null;
    let forecastPoints: unknown[] = [];
    try {
      const cone = await cached(`tropical:cone:${s.id}:${s.trackCone?.advNum ?? "x"}`, 900, () => buildCone(s));
      const p0 = (cone as { points?: { tau: number; gust_kt: number }[] })?.points?.find((p) => p.tau === 0);
      gust_kt = p0?.gust_kt ?? null;
      forecastPoints = (cone as { points?: unknown[] })?.points ?? [];
    } catch { /* gusts are optional — never fail the whole storm list for them */ }

    return {
      id: s.id,
      atcfId: s.id.toUpperCase(),
      name: s.name,
      binNumber: s.binNumber ?? null,
      basin: s.id.slice(0, 2).toUpperCase(),
      classification: s.classification,
      intensity_kt: kt,
      intensity_mph: mph(kt),
      gust_kt, gust_mph: gust_kt ? mph(gust_kt) : null,
      pressure_mb: num(s.pressure) || null,
      lat: s.latitudeNumeric, lon: s.longitudeNumeric,
      movementDir: s.movementDir ?? null,
      // CurrentStorms.json is mixed-unit: `intensity` is knots but
      // `movementSpeed` is already mph — verified against the advisory text,
      // where speed 7 prints as "7 MPH" and speed 12 as "12 MPH". Converting it
      // a second time inflated every storm's forward speed.
      movementSpeed_mph: s.movementSpeed != null ? Math.round(num(s.movementSpeed)) : null,
      lastUpdate: s.lastUpdate,
      advisoryNum: s.publicAdvisory?.advNum ?? null,
      advisoryIssuance: s.publicAdvisory?.issuance ?? null,
      ...categoryOf(kt),
      links: {
        publicAdvisory: s.publicAdvisory?.url ?? null,
        forecastAdvisory: s.forecastAdvisory?.url ?? null,
        discussion: s.forecastDiscussion?.url ?? null,
        windProbabilities: s.windSpeedProbabilities?.url ?? null,
        graphics: s.forecastGraphics?.url ?? null,
        coneKmz: s.trackCone?.kmzFile ?? null,
      },
      forecastPoints,
    };
  }));
  return { storms: out, count: out.length, updated: new Date().toISOString() };
}

// ── advisory text ────────────────────────────────────────────────────────────
/** NHC text products are HTML-wrapped; the product itself sits inside <pre>. */
export async function buildAdvisory(url: string) {
  if (!/^https:\/\/www\.nhc\.noaa\.gov\//.test(url)) throw new Error("refused: not an nhc.noaa.gov URL");
  const r = await get(url);
  if (!r.ok) throw new Error(`advisory ${r.status}`);
  const html = await r.text();
  const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1] ?? "";
  const text = pre
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .trim();
  return { url, text, fetched: new Date().toISOString() };
}

// ── router ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/functions\/v1\/tropical/, "").replace(/^\/tropical/, "") || "/";
  const q = url.searchParams;
  const STORM = /^[A-Za-z]{2}\d{6}$/;

  try {
    if (route === "/" || route === "/storms") {
      return json(await cached("tropical:storms", 300, buildStorms), 200, 300);
    }

    if (route === "/gtwo") {
      return json(await cached("tropical:gtwo", 1800, buildGtwo), 200, 1800);
    }

    if (route === "/recon") {
      return json(await cached("tropical:recon", 900, buildRecon), 200, 900);
    }

    const m = route.match(/^\/(cone|radii|models|track|satellite)\/([A-Za-z]{2}\d{6})$/);
    if (m) {
      const [, kind, rawId] = m;
      const id = rawId.toLowerCase();

      if (kind === "track") {
        return json(await cached(`tropical:track:${id}`, 1800, () => buildTrack(id)), 200, 1800);
      }
      if (kind === "models") {
        const ens = q.get("ensemble") === "1";
        return json(await cached(`tropical:models:${id}:${ens}`, 1800, () => buildModels(id, ens)), 200, 1800);
      }

      const storms = await currentStorms();
      const storm = findStorm(storms, id);
      if (!storm) return json({ error: "storm not active", stormId: rawId.toUpperCase() }, 404, 60);

      if (kind === "cone") {
        const data = await cached(`tropical:cone:${id}:${storm.trackCone?.advNum ?? "x"}`, 900, () => buildCone(storm));
        return data ? json(data, 200, 900) : json({ error: "no cone published for this advisory" }, 404, 60);
      }
      if (kind === "radii") {
        const data = await cached(`tropical:radii:${id}:${storm.forecastWindRadiiGIS?.advNum ?? "x"}`, 900, () => buildRadii(storm));
        return data ? json(data, 200, 900) : json({ error: "no wind radii published for this advisory" }, 404, 60);
      }
      if (kind === "satellite") {
        const zoom    = parseInt(q.get("zoom") ?? "2", 10) || 2;
        const frames  = parseInt(q.get("frames") ?? "24", 10) || 24;
        const product = q.get("product") ?? "band_13";
        // Frame lists go stale in 10 minutes, so this cache stays short.
        const key = `tropical:sat:${id}:${zoom}:${frames}:${product}`;
        return json(await cached(key, 300, () => buildSatellite(storm.latitudeNumeric, storm.longitudeNumeric, { zoom, frames, product })), 200, 300);
      }
    }

    // Free-position satellite (used by the basin map and archived storms).
    if (route === "/satellite") {
      const lat = parseFloat(q.get("lat") ?? ""), lon = parseFloat(q.get("lon") ?? "");
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return json({ error: "lat and lon are required" }, 400, 60);
      const zoom = parseInt(q.get("zoom") ?? "2", 10) || 2;
      const frames = parseInt(q.get("frames") ?? "24", 10) || 24;
      const product = q.get("product") ?? "band_13";
      const key = `tropical:sat:${lat.toFixed(1)},${lon.toFixed(1)}:${zoom}:${frames}:${product}`;
      return json(await cached(key, 300, () => buildSatellite(lat, lon, { zoom, frames, product })), 200, 300);
    }

    if (route === "/advisory") {
      const target = q.get("url");
      if (!target) return json({ error: "url is required" }, 400, 60);
      return json(await cached(`tropical:adv:${target}`, 900, () => buildAdvisory(target)), 200, 900);
    }

    // Everything the archive page needs for a storm that is no longer active.
    if (route === "/archive") {
      const { data, error } = await admin
        .from("tropical_storms")
        .select("id, name, year, basin, peak_intensity, peak_winds, last_advisory_num, final_status, track_points, graphics_urls, archived_at")
        .order("year", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return json({ storms: data ?? [] }, 200, 600);
    }

    return json({ error: "not found", route }, 404, 60);
  } catch (err) {
    return json({ error: String(err instanceof Error ? err.message : err), route }, 502, 30);
  }
});
