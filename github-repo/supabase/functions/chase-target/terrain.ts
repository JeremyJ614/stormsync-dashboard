/**
 * Chase terrain, scored from the ground rather than from the state line.
 *
 * WHAT WAS WRONG WITH THE OLD ONE
 * The previous scorer sampled five elevations fifteen kilometres apart and
 * turned their standard deviation into a number. Anything flatter than 35 m of
 * spread clamped to 100, and almost everywhere east of the Rockies is flatter
 * than that, so the Flint Hills, the Mississippi Delta and the Illinois corn
 * belt all came back 100/100. A score that every location wins is not a score,
 * and it was being blended into the ranking at 14%, where it did nothing.
 *
 * WHAT A CHASER ACTUALLY MEANS BY GOOD TERRAIN
 * Four separate things, and they are separately measurable:
 *
 *   trees   — can you see the base, or is there a wall of timber at 400 m?
 *   rugged  — is the ground flat enough that a storm is not behind a ridge?
 *   sight   — how high does the horizon sit from where you would park?
 *   roads   — is there a grid you can drive, or hollows that dead-end?
 *
 * Each comes from real, public, keyless data for the United States:
 *
 *   NLCD 2021 Land Cover + Tree Canopy (MRLC/USGS, WMS GetFeatureInfo)
 *     — the land-cover class and the percent canopy under each sample point.
 *   Open-Meteo Elevation (Copernicus DEM)
 *     — a 7x7 grid out to ±20 km, which is enough to measure ruggedness, the
 *       steepest ground, and the elevation angle of the skyline.
 *   Census TIGERweb "All Roads"
 *     — total road length in the box, and what fraction of it runs on the
 *       cardinal section-line grid. This one is the surprise: raw road *density*
 *       does not separate the Ozarks from Kansas at all (the Ozarks has more
 *       road per square kilometre), but alignment separates them completely.
 *       Kansas reads 0.98, the Ozarks 0.42, West Virginia 0.24.
 *
 * The blend is continuous everywhere — smoothstep ramps, a weighted mean and a
 * power curve, no buckets and no rounding into bands — and it is deliberately
 * hard to max out. Measured against twenty known locations it puts the High
 * Plains in the high 80s, Iowa in the high 70s, Dixie in the high 30s, the
 * Ozarks around 18 and the Appalachians under 10. Nothing reaches 100.
 *
 * MISSING DATA IS NOT A FREE PASS
 * If a source does not answer, its weight is redistributed over the ones that
 * did and `confidence` drops. If nothing answers at all the result is null and
 * the caller keeps its neutral prior, because inventing a terrain score is
 * worse than admitting there isn't one.
 */

const UA = "StormSyncVIP/1.0 (contact: admin@stormsync.media)";
const OM_ELEV = "https://api.open-meteo.com/v1/elevation";
const MRLC = "https://www.mrlc.gov/geoserver/mrlc_display/wms";
const TIGER =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer/8/query";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number, p = 1) => Math.round(v * 10 ** p) / 10 ** p;

/** Smoothstep: C1-continuous, so no location sits on a cliff edge in the score. */
function smooth(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}
/** 1 at `good`, 0 at `bad`, smooth in between. Works in either direction. */
function ramp(v: number, good: number, bad: number): number {
  if (bad === good) return 1;
  return smooth(1 - (v - good) / (bad - good));
}

async function getJSON(url: string, timeoutMs = 20000, tries = 3): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: ctl.signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Elevation — one request buys a 7x7 grid, which is all four relief measures
// ─────────────────────────────────────────────────────────────────────────────
const GRID = 7;
const SPAN_KM = 20;

interface Relief {
  tri: number;        // mean neighbour-to-neighbour step, metres
  relief: number;     // p95 − p5 over the box, metres
  slope: number;      // 90th-percentile grade, percent
  horizon: number;    // mean skyline angle of the three most blocking rays, degrees
  mean: number;       // mean elevation, metres
}

async function reliefAt(lat: number, lon: number): Promise<Relief | null> {
  const dLat = SPAN_KM / 111.32;
  const dLon = SPAN_KM / (111.32 * Math.cos((lat * Math.PI) / 180));
  const las: number[] = [], los: number[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      las.push(round(lat + dLat * ((2 * r) / (GRID - 1) - 1), 4));
      los.push(round(lon + dLon * ((2 * c) / (GRID - 1) - 1), 4));
    }
  }
  let vals: number[];
  try {
    const body = await getJSON(
      `${OM_ELEV}?latitude=${las.join(",")}&longitude=${los.join(",")}`,
    ) as { elevation?: number[] };
    vals = body.elevation ?? [];
  } catch {
    return null;
  }
  if (vals.filter((v) => Number.isFinite(v)).length < GRID * GRID * 0.8) return null;

  const g = (r: number, c: number) => vals[r * GRID + c];
  const stepM = ((2 * SPAN_KM) / (GRID - 1)) * 1000;

  const finite = vals.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const at = (q: number) => finite[Math.round(q * (finite.length - 1))];
  const relief = at(0.95) - at(0.05);
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;

  const steps: number[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (c + 1 < GRID) steps.push(Math.abs(g(r, c) - g(r, c + 1)));
      if (r + 1 < GRID) steps.push(Math.abs(g(r, c) - g(r + 1, c)));
    }
  }
  const usable = steps.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const tri = usable.reduce((a, b) => a + b, 0) / usable.length;
  const slope = (usable[Math.round(0.9 * (usable.length - 1))] / stepM) * 100;

  // Skyline: walk out along eight rays from the centre and keep the highest
  // upward angle each one reaches. Low everywhere means you can watch a storm
  // approach from twenty kilometres out; high on three sides means you cannot.
  const mid = (GRID - 1) >> 1;
  const z0 = g(mid, mid);
  const rays: number[] = [];
  for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    let worst = -90;
    for (let k = 1; k <= mid; k++) {
      const r = mid + dr * k, c = mid + dc * k;
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) break;
      const dist = stepM * k * Math.hypot(dr, dc);
      const z = g(r, c);
      if (Number.isFinite(z)) worst = Math.max(worst, (Math.atan2(z - z0, dist) * 180) / Math.PI);
    }
    rays.push(worst);
  }
  rays.sort((a, b) => a - b);
  const horizon = rays.slice(-3).reduce((a, b) => a + b, 0) / 3;

  return { tri, relief, slope, horizon, mean };
}

// ─────────────────────────────────────────────────────────────────────────────
// Land cover and canopy — five points, each one request answering both layers
// ─────────────────────────────────────────────────────────────────────────────
/** NLCD classes that put something solid between you and the storm. */
const FOREST = new Set([41, 42, 43, 90]);   // deciduous, evergreen, mixed, woody wetland
const WET = new Set([95, 11]);              // emergent wetland, open water
const DEV_HEAVY = new Set([23, 24]);        // medium and high intensity development

interface Cover { canopy: number; forest: number; blocked: number; samples: number }

async function coverPoint(lat: number, lon: number): Promise<[number | null, number | null]> {
  const h = 0.01;
  const q = new URLSearchParams({
    service: "WMS", version: "1.1.1", request: "GetFeatureInfo",
    layers: "NLCD_2021_Land_Cover_L48,CONUS_Canopy",
    query_layers: "NLCD_2021_Land_Cover_L48,CONUS_Canopy",
    srs: "EPSG:4326",
    bbox: `${lon - h},${lat - h},${lon + h},${lat + h}`,
    width: "101", height: "101", x: "50", y: "50",
    info_format: "application/json",
    // Two, because the two layers answer in order: land cover first, canopy
    // second. Asking for one silently drops the canopy and every location in
    // America comes back as treeless.
    feature_count: "2",
  });
  try {
    const b = await getJSON(`${MRLC}?${q}`, 20000, 2) as {
      features?: { properties?: { PALETTE_INDEX?: number } }[];
    };
    const f = b.features ?? [];
    const lc = typeof f[0]?.properties?.PALETTE_INDEX === "number" ? f[0].properties!.PALETTE_INDEX! : null;
    const cn = typeof f[1]?.properties?.PALETTE_INDEX === "number" ? f[1].properties!.PALETTE_INDEX! : null;
    return [lc, cn];
  } catch {
    return [null, null];
  }
}

async function coverAt(lat: number, lon: number): Promise<Cover | null> {
  const RING_KM = 12;
  const dLat = RING_KM / 111.32;
  const dLon = RING_KM / (111.32 * Math.cos((lat * Math.PI) / 180));
  const pts: [number, number][] = [
    [lat, lon], [lat + dLat, lon], [lat - dLat, lon], [lat, lon + dLon], [lat, lon - dLon],
  ];
  const res = await Promise.all(pts.map(([a, o]) => coverPoint(a, o)));
  const lcs = res.map((r) => r[0]).filter((v): v is number => v !== null);
  const cans = res.map((r) => r[1]).filter((v): v is number => v !== null);
  if (!lcs.length) return null;
  const frac = (set: Set<number>) => lcs.filter((c) => set.has(c)).length / lcs.length;
  return {
    canopy: cans.length ? cans.reduce((a, b) => a + b, 0) / cans.length : 0,
    forest: frac(FOREST),
    // Water, marsh and dense development are not trees, but they are all
    // "you cannot pull over and you cannot see through it" in the same way.
    blocked: frac(FOREST) + 0.6 * frac(WET) + 0.4 * frac(DEV_HEAVY),
    samples: lcs.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Roads — length, and how much of it runs on the section grid
// ─────────────────────────────────────────────────────────────────────────────
interface Roads { kmPer100 : number; cardinal: number }

async function roadsAt(lat: number, lon: number): Promise<Roads | null> {
  const half = 0.12;
  const q = new URLSearchParams({
    f: "json",
    geometry: `${lon - half},${lat - half * 0.8},${lon + half},${lat + half * 0.8}`,
    geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326",
    spatialRel: "esriSpatialRelIntersects", returnGeometry: "true",
    outFields: "", resultRecordCount: "4000",
  });
  let d: { features?: { geometry?: { paths?: number[][][] } }[] };
  try {
    d = await getJSON(`${TIGER}?${q}`, 30000, 2) as typeof d;
  } catch {
    return null;
  }
  const kmPerDegLon = 111.32 * Math.cos((lat * Math.PI) / 180);
  let total = 0, cardinal = 0;
  for (const f of d.features ?? []) {
    for (const path of f.geometry?.paths ?? []) {
      for (let i = 0; i + 1 < path.length; i++) {
        const dx = (path[i + 1][0] - path[i][0]) * kmPerDegLon;
        const dy = (path[i + 1][1] - path[i][1]) * 111.32;
        const len = Math.hypot(dx, dy);
        if (!(len > 0)) continue;
        total += len;
        // Fold the bearing into a quarter turn: a grid road is within a few
        // degrees of 0 or 90 whichever way it happens to be drawn.
        const a = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 90;
        if (Math.min(a, 90 - a) <= 12) cardinal += len;
      }
    }
  }
  if (total <= 0) return null;
  const areaKm2 = 2 * half * kmPerDegLon * 2 * half * 0.8 * 111.32;
  return { kmPer100: (total / areaKm2) * 100, cardinal: cardinal / total };
}

// ─────────────────────────────────────────────────────────────────────────────
// The blend
// ─────────────────────────────────────────────────────────────────────────────
export interface TerrainResult {
  score: number;
  trees: number | null;
  rugged: number | null;
  sight: number | null;
  roads: number | null;
  confidence: number;
  detail: {
    canopy_pct: number | null;
    forest_frac: number | null;
    tri_m: number | null;
    relief_m: number | null;
    slope_pct: number | null;
    horizon_deg: number | null;
    road_km_per_100km2: number | null;
    road_grid_frac: number | null;
  };
}

/** Weights, and the gamma that stops the top of the range from saturating. */
const W = { trees: 0.34, rugged: 0.24, sight: 0.19, roads: 0.23 };
const GAMMA = 1.45;

export function blend(
  cover: Cover | null, relief: Relief | null, roads: Roads | null,
): TerrainResult | null {
  const trees = cover
    ? 0.62 * ramp(cover.canopy, 0, 50) + 0.38 * ramp(cover.blocked, 0, 0.62)
    : null;
  const rugged = relief
    ? 0.58 * ramp(relief.tri, 4, 100) + 0.42 * ramp(relief.slope, 0.1, 3.4)
    : null;
  const sight = relief
    ? 0.68 * ramp(relief.horizon, 0.02, 0.78) + 0.32 * ramp(relief.relief, 12, 600)
    : null;
  const road = roads
    ? 0.62 * ramp(roads.cardinal, 0.97, 0.22) + 0.38 * ramp(roads.kmPer100, 430, 70)
    : null;

  const parts: [number, number][] = [];
  if (trees !== null) parts.push([W.trees, trees]);
  if (rugged !== null) parts.push([W.rugged, rugged]);
  if (sight !== null) parts.push([W.sight, sight]);
  if (road !== null) parts.push([W.roads, road]);
  if (!parts.length) return null;

  // Redistribute over whatever answered rather than scoring a missing signal
  // as zero (which would libel good country) or as one (which is the bug this
  // whole file replaces).
  const weight = parts.reduce((a, [w]) => a + w, 0);
  const raw = parts.reduce((a, [w, v]) => a + w * v, 0) / weight;

  return {
    score: round(100 * (0.02 + 0.93 * raw ** GAMMA), 1),
    trees: trees === null ? null : round(trees * 100),
    rugged: rugged === null ? null : round(rugged * 100),
    sight: sight === null ? null : round(sight * 100),
    roads: road === null ? null : round(road * 100),
    confidence: round(weight, 2),
    detail: {
      canopy_pct: cover ? round(cover.canopy) : null,
      forest_frac: cover ? round(cover.forest, 2) : null,
      tri_m: relief ? round(relief.tri) : null,
      relief_m: relief ? Math.round(relief.relief) : null,
      slope_pct: relief ? round(relief.slope, 2) : null,
      horizon_deg: relief ? round(relief.horizon, 2) : null,
      road_km_per_100km2: roads ? round(roads.kmPer100) : null,
      road_grid_frac: roads ? round(roads.cardinal, 2) : null,
    },
  };
}

/** Measure one location from scratch. Three requests' worth of work, roughly. */
export async function measure(lat: number, lon: number): Promise<TerrainResult | null> {
  const [cover, relief, roads] = await Promise.all([
    coverAt(lat, lon).catch(() => null),
    reliefAt(lat, lon).catch(() => null),
    roadsAt(lat, lon).catch(() => null),
  ]);
  return blend(cover, relief, roads);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Terrain does not change between Tuesday and Wednesday, so measuring it twice
 * is pure waste — and the historical backfill would otherwise make tens of
 * thousands of requests to three public services to re-learn that Kansas is
 * flat. Results are kept on a 0.05° grid, about 5.5 km, which is finer than the
 * 20 km box each measurement already averages over.
 */
export const CELL = 0.05;
export function cellKey(lat: number, lon: number): string {
  return `${Math.round(lat / CELL)}:${Math.round(lon / CELL)}`;
}

export interface TerrainCache {
  get(keys: string[]): Promise<Map<string, TerrainResult>>;
  put(rows: { key: string; lat: number; lon: number; result: TerrainResult }[]): Promise<void>;
}

/**
 * Score a batch, reading the cache first and writing back whatever it had to
 * measure. `fallback` is what a location gets when every source refused — the
 * caller's neutral prior, never a flattering number.
 */
export async function terrainFor(
  points: { lat: number; lon: number }[],
  cache: TerrainCache | null,
  fallback: number,
  concurrency = 3,
): Promise<{ score: number; result: TerrainResult | null }[]> {
  const keys = points.map((p) => cellKey(p.lat, p.lon));
  let hits = new Map<string, TerrainResult>();
  if (cache) {
    try { hits = await cache.get([...new Set(keys)]); } catch { /* cache is an optimisation */ }
  }

  const out: { score: number; result: TerrainResult | null }[] = new Array(points.length);
  const fresh: { key: string; lat: number; lon: number; result: TerrainResult }[] = [];
  const todo: number[] = [];

  points.forEach((_, i) => {
    const hit = hits.get(keys[i]);
    if (hit) out[i] = { score: hit.score, result: hit };
    else todo.push(i);
  });

  // One cell may appear twice in a batch; measure it once.
  const measured = new Map<string, TerrainResult | null>();
  for (let i = 0; i < todo.length; i += concurrency) {
    const slice = todo.slice(i, i + concurrency);
    await Promise.all(slice.map(async (idx) => {
      const key = keys[idx];
      if (!measured.has(key)) {
        const r = await measure(points[idx].lat, points[idx].lon).catch(() => null);
        measured.set(key, r);
        if (r) fresh.push({ key, lat: points[idx].lat, lon: points[idx].lon, result: r });
      }
      const r = measured.get(key) ?? null;
      out[idx] = { score: r ? r.score : fallback, result: r };
    }));
  }

  if (cache && fresh.length) {
    try { await cache.put(fresh); } catch { /* never fail a run over a cache write */ }
  }
  return out;
}
