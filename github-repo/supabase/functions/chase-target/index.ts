// StormSync VIP — the Chase Target engine.
//
// Deployed to Supabase Edge Functions as `chase-target`. Runs each morning on
// pg_cron, and on demand by an admin, to write ONE `chase_outlook` row: the
// day's two best chase targets, the parameters behind them, and the reasoning.
//
// WHY IT LOOKS LIKE THIS
// The previous module ranked 59 hard-coded cities in the browser. If the best
// target in America was forty miles from all fifty-nine, it could not see it.
// Scanning the whole country evenly instead is the obvious fix and the wrong
// one — it is thousands of points a day, almost all of them over places where
// nothing will happen.
//
// So: let SPC say where to look. Their Day 1 categorical and probabilistic
// outlooks are polygons that move every morning. Fill THOSE with a fine grid and
// any point in the United States can win on the day it deserves to, while a
// quiet day costs a few dozen points instead of a few thousand. If SPC has no
// risk area at all, a coarse national grid still runs so the module can answer
// honestly rather than going blank.
//
// The AI never finds a target. It receives the top candidates, already scored,
// and chooses two and explains them. That division is deliberate: the numbers
// are reproducible and the prose is not, and it should always be obvious which
// is which.
//
// AUTH (verify_jwt is false; checked inside): `x-engine-secret` matching
// `app_config.storm_engine_secret` (the cron path) OR a Bearer JWT belonging to
// an admin (the manual path). Same contract as `storm-engine`.
//
// AI KEY, in order: GEMINI_API_KEY (free tier), then ANTHROPIC_API_KEY. With
// neither, every field falls back to a deterministic write so the page is never
// dead — it just says less.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const ANTHROPIC_MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
/**
 * Which Gemini models to try, in order.
 *
 * Validated rather than trusted. `GEMINI_MODELS` is a secret, and a secret that
 * is meant to hold a comma-separated list of model names is one paste away from
 * holding an API key instead — which is exactly what happened: the whole
 * narrative came back as
 * `GenerateContentRequest.model: unexpected model name format`, because the
 * key was going into the URL where the model belongs. A model name is lower
 * case letters, digits, dots and hyphens, so anything else is discarded and the
 * built-in list is used. Silently degrading to a working default beats an AI
 * write that fails every day until somebody reads the error field.
 */
const DEFAULT_GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.0-flash", "gemini-2.5-flash"];
const IS_MODEL_NAME = /^[a-z0-9][a-z0-9.-]{2,60}$/;
function geminiModels(): string[] {
  const raw = (Deno.env.get("GEMINI_MODELS") ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  const good = raw.filter((m) => IS_MODEL_NAME.test(m));
  if (raw.length && !good.length) {
    console.warn("GEMINI_MODELS holds no usable model name; falling back to the built-in list");
  }
  return good.length ? good : DEFAULT_GEMINI_MODELS;
}
const GEMINI_MODELS = geminiModels();
const GEMINI_URL = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const SPC = "https://www.spc.noaa.gov";
const UA = "StormSyncVIP/1.0 (contact: admin@stormsync.media)";
const OM = "https://api.open-meteo.com/v1";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-engine-secret",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number, p = 1) => Math.round(v * 10 ** p) / 10 ** p;
const chunk = <T>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────
// 1. SPC polygons
// ─────────────────────────────────────────────────────────────────────────────
type Ring = [number, number][];
interface Poly { rings: Ring[] }            // ring[0] outer, rest are holes
interface RiskArea { label: string; kind: "cat" | "torn" | "hail" | "wind"; weight: number; polys: Poly[] }

const CAT_RANK: Record<string, number> = { TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5 };
const CAT_NAME: Record<string, string> = {
  TSTM: "General Thunder", MRGL: "Marginal", SLGT: "Slight",
  ENH: "Enhanced", MDT: "Moderate", HIGH: "High",
};

/** Flatten Polygon / MultiPolygon / GeometryCollection into a list of rings-with-holes. */
// deno-lint-ignore no-explicit-any
function toPolys(geom: any): Poly[] {
  if (!geom) return [];
  if (geom.type === "Polygon") return [{ rings: geom.coordinates as Ring[] }];
  if (geom.type === "MultiPolygon") return (geom.coordinates as Ring[][]).map((rings) => ({ rings }));
  // deno-lint-ignore no-explicit-any
  if (geom.type === "GeometryCollection") return (geom.geometries ?? []).flatMap((g: any) => toPolys(g));
  return [];
}

async function fetchOutlook(product: string): Promise<{ label: string; polys: Poly[] }[]> {
  for (const suffix of [".lyr.geojson", ".nolyr.geojson"]) {
    try {
      const r = await fetch(`${SPC}/products/outlook/${product}${suffix}`, {
        headers: { "User-Agent": UA, Accept: "application/geo+json, application/json" },
      });
      if (!r.ok) continue;
      // deno-lint-ignore no-explicit-any
      const geo = await r.json() as { features?: any[] };
      const out = (geo.features ?? [])
        .map((f) => ({ label: String(f?.properties?.LABEL ?? ""), polys: toPolys(f?.geometry) }))
        .filter((f) => f.polys.length > 0);
      if (out.length) return out;
    } catch { /* try the other suffix */ }
  }
  return [];
}

/** Ray casting, with holes: inside an outer ring and inside no hole. */
function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPoly(lon: number, lat: number, p: Poly): boolean {
  if (!p.rings.length || !inRing(lon, lat, p.rings[0])) return false;
  for (let k = 1; k < p.rings.length; k++) if (inRing(lon, lat, p.rings[k])) return false;
  return true;
}
function inAny(lon: number, lat: number, polys: Poly[]): boolean {
  for (const p of polys) if (inPoly(lon, lat, p)) return true;
  return false;
}
function bboxOf(polys: Poly[]): [number, number, number, number] {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const p of polys) for (const [x, y] of p.rings[0] ?? []) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Probability labels come through as "0.15", "0.30", "SIGN", "CIG1". */
function probPct(label: string): number {
  const f = parseFloat(label);
  if (Number.isNaN(f)) return label === "SIGN" ? 100 : 0;
  return f <= 1 ? Math.round(f * 100) : Math.round(f);
}

async function ingestRisk(): Promise<{ areas: RiskArea[]; catMax: string | null; probs: Record<string, number> }> {
  const [cat, torn, hail, wind] = await Promise.all([
    fetchOutlook("day1otlk_cat"), fetchOutlook("day1otlk_torn"),
    fetchOutlook("day1otlk_hail"), fetchOutlook("day1otlk_wind"),
  ]);

  const areas: RiskArea[] = [];
  let catMax: string | null = null, catMaxRank = -1;
  for (const f of cat) {
    const rank = CAT_RANK[f.label];
    if (rank === undefined) continue;
    if (rank > catMaxRank) { catMaxRank = rank; catMax = f.label; }
    areas.push({ label: f.label, kind: "cat", weight: rank * 12, polys: f.polys });
  }
  const probs: Record<string, number> = { torn: 0, hail: 0, wind: 0 };
  const addProb = (kind: "torn" | "hail" | "wind", list: { label: string; polys: Poly[] }[], scale: number) => {
    for (const f of list) {
      const pct = probPct(f.label);
      if (pct <= 0) continue;
      if (pct > (probs[kind] ?? 0) && pct < 100) probs[kind] = pct;
      areas.push({ label: f.label, kind, weight: pct * scale, polys: f.polys });
    }
  };
  addProb("torn", torn, 2.4);   // tornado probability is the strongest chase signal
  addProb("hail", hail, 0.7);
  addProb("wind", wind, 0.45);

  return { areas, catMax, probs };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Candidate generation
// ─────────────────────────────────────────────────────────────────────────────
interface Candidate {
  lat: number; lon: number;
  spcWeight: number;
  spcCat: string | null;
  tornProb: number; hailProb: number; windProb: number;
}

// CONUS box, used for the no-risk fallback and to keep grid points on land-ish.
const CONUS = { x0: -124.5, y0: 25.2, x1: -67.0, y1: 49.2 };

function snap(v: number, step: number): number { return Math.round(v / step) * step; }

/**
 * Fill the risk polygons with a grid.
 *
 * Step scales with how big the day is: a HIGH risk covering six states does not
 * need the same spacing as a marginal blob over one. The cap on total points is
 * what keeps the Open-Meteo bill (in requests, not dollars) bounded.
 */
function generateCandidates(areas: RiskArea[]): { list: Candidate[]; step: number; source: string } {
  const meaningful = areas.filter((a) => !(a.kind === "cat" && a.label === "TSTM"));
  const usable = meaningful.length ? meaningful : areas;

  if (!usable.length) {
    // Nothing anywhere. Answer honestly with a coarse national sweep.
    const step = 1.5;
    const list: Candidate[] = [];
    for (let lat = CONUS.y0; lat <= CONUS.y1; lat += step) {
      for (let lon = CONUS.x0; lon <= CONUS.x1; lon += step) {
        list.push({ lat: round(lat, 2), lon: round(lon, 2), spcWeight: 0, spcCat: null, tornProb: 0, hailProb: 0, windProb: 0 });
      }
    }
    return { list, step, source: "national-fallback" };
  }

  const [bx0, by0, bx1, by1] = bboxOf(usable.flatMap((a) => a.polys));
  const span = Math.max(bx1 - bx0, by1 - by0);
  const step = span > 16 ? 0.6 : span > 9 ? 0.45 : 0.3;

  const byKey = new Map<string, Candidate>();
  for (let lat = snap(by0, step); lat <= by1 + 1e-9; lat += step) {
    for (let lon = snap(bx0, step); lon <= bx1 + 1e-9; lon += step) {
      if (lat < CONUS.y0 || lat > CONUS.y1 || lon < CONUS.x0 || lon > CONUS.x1) continue;
      let weight = 0, cat: string | null = null, catRank = -1;
      let torn = 0, hail = 0, wind = 0;
      for (const a of areas) {
        if (!inAny(lon, lat, a.polys)) continue;
        weight += a.weight;
        if (a.kind === "cat") {
          const r = CAT_RANK[a.label] ?? -1;
          if (r > catRank) { catRank = r; cat = a.label; }
        } else {
          const pct = probPct(a.label);
          if (a.kind === "torn" && pct > torn && pct < 100) torn = pct;
          if (a.kind === "hail" && pct > hail && pct < 100) hail = pct;
          if (a.kind === "wind" && pct > wind && pct < 100) wind = pct;
        }
      }
      if (weight <= 0) continue;
      const key = `${round(lat, 2)},${round(lon, 2)}`;
      byKey.set(key, {
        lat: round(lat, 2), lon: round(lon, 2),
        spcWeight: weight, spcCat: cat, tornProb: torn, hailProb: hail, windProb: wind,
      });
    }
  }

  const list = [...byKey.values()].sort((a, b) => b.spcWeight - a.spcWeight);
  return { list, step, source: "spc-polygons" };
}

/** Keep the strongest points but never two within `minDeg` of each other. */
function thin(list: Candidate[], max: number, minDeg: number): Candidate[] {
  const kept: Candidate[] = [];
  for (const c of list) {
    if (kept.length >= max) break;
    let ok = true;
    for (const k of kept) {
      if (Math.abs(k.lat - c.lat) < minDeg && Math.abs(k.lon - c.lon) < minDeg) { ok = false; break; }
    }
    if (ok) kept.push(c);
  }
  return kept;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Open-Meteo
// ─────────────────────────────────────────────────────────────────────────────
const HOURLY = [
  "cape", "convective_inhibition", "lifted_index", "boundary_layer_height",
  "temperature_2m", "dew_point_2m", "surface_pressure",
  "precipitation_probability", "precipitation", "cloud_cover_low",
  "freezing_level_height",
  "wind_speed_10m", "wind_direction_10m",
  "wind_speed_925hPa", "wind_direction_925hPa", "geopotential_height_925hPa",
  "temperature_850hPa", "relative_humidity_850hPa", "wind_speed_850hPa", "wind_direction_850hPa", "geopotential_height_850hPa",
  "temperature_700hPa", "relative_humidity_700hPa", "wind_speed_700hPa", "wind_direction_700hPa", "geopotential_height_700hPa",
  "vertical_velocity_700hPa",
  "temperature_500hPa", "wind_speed_500hPa", "wind_direction_500hPa", "geopotential_height_500hPa",
].join(",");

type Series = Record<string, (number | null)[]> & { time: string[] };
interface OMLoc { hourly: Series; daily: { time: string[]; sunset: string[]; sunrise: string[] }; utc_offset_seconds: number }

async function fetchWeather(points: Candidate[]): Promise<(OMLoc | null)[]> {
  const out: (OMLoc | null)[] = new Array(points.length).fill(null);
  const groups = chunk(points.map((p, i) => ({ p, i })), 25);
  for (const g of groups) {
    const url = `${OM}/forecast?latitude=${g.map((x) => x.p.lat).join(",")}` +
      `&longitude=${g.map((x) => x.p.lon).join(",")}` +
      `&hourly=${HOURLY}&daily=sunrise,sunset&forecast_days=2&timezone=auto&wind_speed_unit=ms`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) continue;
      const body = await r.json();
      const arr = Array.isArray(body) ? body : [body];
      g.forEach((x, k) => { if (arr[k]?.hourly) out[x.i] = arr[k] as OMLoc; });
    } catch { /* a dropped chunk costs candidates, not the run */ }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. The meteorology
// ─────────────────────────────────────────────────────────────────────────────
/** Met convention: direction is where the wind comes FROM. */
function uv(speed: number, dirDeg: number): [number, number] {
  const r = (dirDeg * Math.PI) / 180;
  return [-speed * Math.sin(r), -speed * Math.cos(r)];
}
const mag = (u: number, v: number) => Math.hypot(u, v);
const MS_TO_KT = 1.94384;
const MS_TO_MPH = 2.23694;
const M_TO_FT = 3.28084;

/** Storm-relative helicity over a layer, given the wind profile and a storm motion. */
function srh(levels: [number, number, number][], stormU: number, stormV: number, topM: number): number {
  let total = 0;
  for (let i = 0; i < levels.length - 1; i++) {
    const [z0, u0, v0] = levels[i], [z1, u1, v1] = levels[i + 1];
    if (z0 >= topM) break;
    const f = z1 > topM ? (topM - z0) / (z1 - z0) : 1;
    const uu1 = u0 + (u1 - u0) * f, vv1 = v0 + (v1 - v0) * f;
    total += (uu1 - stormU) * (v0 - stormV) - (u0 - stormU) * (vv1 - stormV);
  }
  // No sign flip here. The discrete form above already comes out positive for a
  // veering profile, which is the whole point of the number. An extra negation
  // made every Plains target read as negative helicity and silently zeroed STP
  // and SCP, because both clamp at zero.
  return total;
}

/** Bunkers right-mover: 0-6 km mean wind, deviated 7.5 m/s to the right of shear. */
function bunkersRight(levels: [number, number, number][]): [number, number] {
  if (levels.length < 2) return [0, 0];
  let su = 0, sv = 0, n = 0;
  for (const [, u, v] of levels) { su += u; sv += v; n++; }
  const mu = su / n, mv = sv / n;
  const [, u0, v0] = levels[0];
  const [, uT, vT] = levels[levels.length - 1];
  const shu = uT - u0, shv = vT - v0;
  const s = mag(shu, shv) || 1;
  return [mu + 7.5 * (shv / s), mv - 7.5 * (shu / s)];
}

interface Params {
  hour: string; hourIdx: number; localHour: number;
  cape: number; cin: number; li: number; pbl: number;
  tempC: number; dewC: number; dewF: number; sfcP: number;
  lclM: number; lclAglM: number;
  shear06: number; shear01: number; shear06Kt: number; shear01Kt: number;
  srh01: number; srh03: number;
  stp: number; scp: number; ship: number; ehi: number;
  lr75: number; lr03: number; t500: number; t850: number;
  rh700: number; rh850: number; mixr: number;
  fzlM: number; wbz: number;
  motionU: number; motionV: number; motionMph: number; motionDir: number;
  omega700: number; pop: number; cloudLow: number;
  hailIn: number; sunsetLocal: string; hoursToSunset: number;
}

function pick(s: Series, key: string, i: number, dflt = 0): number {
  const v = s[key]?.[i];
  return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}

function computeAt(loc: OMLoc, i: number): Params {
  const h = loc.hourly;
  const cape = pick(h, "cape", i);
  const cin = Math.abs(pick(h, "convective_inhibition", i));
  const li = pick(h, "lifted_index", i);
  const tempC = pick(h, "temperature_2m", i, 20);
  const dewC = pick(h, "dew_point_2m", i, 10);
  const sfcP = pick(h, "surface_pressure", i, 1000);
  const z850 = pick(h, "geopotential_height_850hPa", i, 1500);
  const z700 = pick(h, "geopotential_height_700hPa", i, 3100);
  const z500 = pick(h, "geopotential_height_500hPa", i, 5700);
  const t850 = pick(h, "temperature_850hPa", i, 15);
  const t700 = pick(h, "temperature_700hPa", i, 5);
  const t500 = pick(h, "temperature_500hPa", i, -12);

  // Wind profile as [height AGL, u, v]. Heights are geopotential minus a nominal
  // 300 m station elevation; the layers we use are deep enough that the error is
  // small compared with the shear itself.
  const zBase = 300;
  const [u10, v10] = uv(pick(h, "wind_speed_10m", i), pick(h, "wind_direction_10m", i));
  const [u925, v925] = uv(pick(h, "wind_speed_925hPa", i), pick(h, "wind_direction_925hPa", i));
  const [u850, v850] = uv(pick(h, "wind_speed_850hPa", i), pick(h, "wind_direction_850hPa", i));
  const [u700, v700] = uv(pick(h, "wind_speed_700hPa", i), pick(h, "wind_direction_700hPa", i));
  const [u500, v500] = uv(pick(h, "wind_speed_500hPa", i), pick(h, "wind_direction_500hPa", i));
  const levels: [number, number, number][] = [
    [10, u10, v10],
    [Math.max(200, pick(h, "geopotential_height_925hPa", i, 780) - zBase), u925, v925],
    [Math.max(600, z850 - zBase), u850, v850],
    [Math.max(2000, z700 - zBase), u700, v700],
    [Math.max(4500, z500 - zBase), u500, v500],
  ].sort((a, b) => a[0] - b[0]);

  const shear06 = mag(u500 - u10, v500 - v10);
  const shear01 = mag(u925 - u10, v925 - v10);
  const [mu, mv] = bunkersRight(levels);
  const srh01 = srh(levels, mu, mv, 1000);
  const srh03 = srh(levels, mu, mv, 3000);

  const lclAgl = Math.max(0, 125 * (tempC - dewC));
  const lr75 = (t700 - t500) / Math.max(0.5, (z500 - z700) / 1000);
  const lr03 = (tempC - t700) / Math.max(0.5, (z700 - zBase) / 1000);

  // Mixing ratio at the surface, g/kg (Bolton).
  const e = 6.112 * Math.exp((17.67 * dewC) / (dewC + 243.5));
  const mixr = (622 * e) / Math.max(1, sfcP - e);

  // SPC fixed-layer significant tornado parameter.
  const stpCape = cape / 1500;
  const stpLcl = lclAgl < 1000 ? 1 : lclAgl > 2000 ? 0 : (2000 - lclAgl) / 1000;
  const stpSrh = srh01 / 150;
  const stpShr = shear06 < 12.5 ? 0 : shear06 > 30 ? 1.5 : shear06 / 20;
  const stpCin = cin < 50 ? 1 : cin > 200 ? 0 : (200 - cin) / 150;
  const stp = Math.max(0, stpCape * stpLcl * stpSrh * stpShr * stpCin);

  // Supercell composite.
  const scpShr = shear06 < 10 ? 0 : shear06 > 20 ? 1 : shear06 / 20;
  const scp = Math.max(0, (cape / 1000) * (srh03 / 50) * scpShr);

  // Significant hail parameter, SPC form, with the documented clamps.
  const shipShr = clamp(shear06, 7, 27);
  const shipT500 = Math.min(t500, -5.5);
  const shipLr = clamp(lr75, 5, 9.2);
  let ship = (cape * mixr * shipLr * -shipT500 * shipShr) / 42_000_000;
  if (cape < 1300) ship *= cape / 1300;
  if (lr75 < 5.8) ship *= lr75 / 5.8;
  ship = Math.max(0, ship);

  const ehi = (cape * srh03) / 160_000;

  const fzlM = pick(h, "freezing_level_height", i, 3500);
  // Wet-bulb zero, approximated from the freezing level and low-level dryness.
  // Chasers use WBZ height as the hail-survival check; a rough one beats none.
  const wbz = Math.max(500, fzlM - 40 * Math.max(0, tempC - dewC));

  const motionMph = mag(mu, mv) * MS_TO_MPH;
  const motionDir = (Math.atan2(mu, mv) * 180) / Math.PI;   // compass bearing of travel

  const time = h.time[i] ?? "";
  const localHour = Number(time.slice(11, 13));
  const dayKey = time.slice(0, 10);
  const dIdx = Math.max(0, loc.daily.time.indexOf(dayKey));
  const sunsetLocal = loc.daily.sunset?.[dIdx] ?? "";
  const sunsetHour = sunsetLocal ? Number(sunsetLocal.slice(11, 13)) + Number(sunsetLocal.slice(14, 16)) / 60 : 20;

  return {
    hour: time, hourIdx: i, localHour,
    cape, cin, li, pbl: pick(h, "boundary_layer_height", i, 1000),
    tempC, dewC, dewF: (dewC * 9) / 5 + 32, sfcP,
    lclM: lclAgl + zBase, lclAglM: lclAgl,
    shear06, shear01, shear06Kt: shear06 * MS_TO_KT, shear01Kt: shear01 * MS_TO_KT,
    srh01, srh03, stp, scp, ship, ehi,
    lr75, lr03, t500, t850,
    rh700: pick(h, "relative_humidity_700hPa", i, 50),
    rh850: pick(h, "relative_humidity_850hPa", i, 50),
    mixr,
    fzlM, wbz,
    motionU: mu, motionV: mv, motionMph, motionDir: (motionDir + 360) % 360,
    omega700: pick(h, "vertical_velocity_700hPa", i, 0),
    pop: pick(h, "precipitation_probability", i, 0),
    cloudLow: pick(h, "cloud_cover_low", i, 0),
    hailIn: shipToInches(ship),
    sunsetLocal, hoursToSunset: sunsetHour - localHour,
  };
}

/** SHIP maps onto the hail sizes chasers actually talk about. */
function shipToInches(ship: number): number {
  if (ship < 0.35) return 0.5;
  if (ship < 0.7) return 0.85;
  if (ship < 1) return 1;
  if (ship < 1.5) return 1.5;
  if (ship < 2.5) return 2;
  if (ship < 4) return 2.75;
  return 3.5;
}
function hailWord(inches: number): string {
  if (inches < 0.75) return "pea to dime";
  if (inches < 1) return "nickel";
  if (inches < 1.25) return "quarter";
  if (inches < 1.75) return "golf ball";
  if (inches < 2.5) return "tennis ball";
  if (inches < 3) return "baseball";
  return "softball";
}

// ── the score ────────────────────────────────────────────────────────────────
interface Scored {
  cand: Candidate;
  best: Params;
  /** 0-100 before chaseability. */
  meteo: number;
  /** 0-100 after terrain and daylight. */
  total: number;
  mode: StormMode;
  bustPct: number;
  terrain: number;     // 0-100, higher is easier country to chase
  daylight: number;    // 0-100
  name?: string;
  state?: string;
}

type StormMode =
  | "Discrete supercells" | "Supercells then a line" | "Broken line / bowing segments"
  | "Messy multicell clusters" | "Elevated storms" | "Little or nothing";

/**
 * The convective score, in the order a chaser reads a sounding: is there fuel,
 * can it rotate, will it get off the ground, and will it stay discrete.
 */
function scoreMeteo(p: Params): number {
  const fuel = clamp(p.cape / 3500, 0, 1) * 26;
  const lift = clamp((-p.li - 1) / 8, 0, 1) * 8;
  const shear = clamp((p.shear06 - 8) / 22, 0, 1) * 22;
  const helicity = clamp(p.srh03 / 400, 0, 1) * 14 + clamp(p.srh01 / 250, 0, 1) * 8;
  const moisture = clamp((p.dewF - 52) / 22, 0, 1) * 10;
  const lapse = clamp((p.lr75 - 5.5) / 3, 0, 1) * 6;
  const lcl = clamp((1400 - p.lclAglM) / 900, 0, 1) * 6;
  // A cap you cannot break is worth nothing; a cap that holds until 4 pm is worth
  // a great deal. So the penalty is not linear in CIN.
  const capPenalty = p.cin > 250 ? -16 : p.cin > 150 ? -8 : p.cin > 40 ? 0 : -3;
  return clamp(fuel + lift + shear + helicity + moisture + lapse + lcl + capPenalty, 0, 100);
}

function classifyMode(p: Params): StormMode {
  if (p.cape < 250 || p.shear06 < 8) return "Little or nothing";
  if (p.cin > 220 && p.omega700 > -0.05) return "Elevated storms";
  const supercellish = p.scp >= 2 || (p.shear06 >= 16 && p.srh03 >= 150 && p.cape >= 1000);
  const veryFast = p.motionMph > 45;
  const deepMoist = p.rh700 >= 70;
  if (supercellish && !deepMoist && !veryFast) return "Discrete supercells";
  if (supercellish && deepMoist) return "Supercells then a line";
  if (p.shear06 >= 14 && p.cape >= 800) return "Broken line / bowing segments";
  return "Messy multicell clusters";
}

/** HP / classic / LP, the way it is actually judged: mid-level moisture and shear. */
function supercellFlavour(p: Params): "HP" | "Classic" | "LP" | "n/a" {
  if (p.scp < 1 && p.shear06 < 15) return "n/a";
  if (p.rh700 >= 72 && p.mixr >= 13) return "HP";
  if (p.rh700 <= 42 && p.mixr <= 12) return "LP";
  return "Classic";
}

/**
 * Bust probability. Three ways a chase day dies: the cap never breaks, nothing
 * lifts the air, or the storms are junk when they do go. Each is measurable.
 */
function bustProbability(p: Params, mode: StormMode): number {
  let risk = 22;
  if (p.cin > 250) risk += 34; else if (p.cin > 150) risk += 20; else if (p.cin > 80) risk += 8;
  if (p.omega700 > -0.02) risk += 14; else if (p.omega700 < -0.15) risk -= 10;
  if (p.pop < 20) risk += 16; else if (p.pop < 40) risk += 6; else if (p.pop > 70) risk -= 8;
  if (p.cape < 750) risk += 12;
  if (p.shear06 < 12) risk += 10;
  if (p.hoursToSunset < 1) risk += 14; else if (p.hoursToSunset > 4) risk -= 6;
  if (mode === "Discrete supercells") risk -= 10;
  if (mode === "Little or nothing") risk += 25;
  if (p.cloudLow > 85 && p.cape < 1200) risk += 6;
  return clamp(Math.round(risk), 3, 96);
}

/** Daylight left after initiation is the difference between a chase and a drive. */
function daylightScore(p: Params): number {
  const h = p.hoursToSunset;
  if (h <= 0) return 12;
  if (h >= 2 && h <= 5) return 100;
  if (h < 2) return 45 + h * 27;
  return clamp(100 - (h - 5) * 12, 30, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Terrain — a perfect sounding over a forest is not a chase target
// ─────────────────────────────────────────────────────────────────────────────
async function terrainScores(points: { lat: number; lon: number }[]): Promise<number[]> {
  // Sample the point and four neighbours ~15 km out. The spread between them is
  // the honest, free proxy for "can you see anything and can you drive it".
  const OFF: [number, number][] = [[0, 0], [0.14, 0], [-0.14, 0], [0, 0.17], [0, -0.17]];
  const flatLat: number[] = [], flatLon: number[] = [];
  for (const p of points) for (const [dy, dx] of OFF) { flatLat.push(round(p.lat + dy, 3)); flatLon.push(round(p.lon + dx, 3)); }

  const elev: number[] = [];
  for (const g of chunk(flatLat.map((la, i) => [la, flatLon[i]] as [number, number]), 100)) {
    try {
      const r = await fetch(`${OM}/elevation?latitude=${g.map((x) => x[0]).join(",")}&longitude=${g.map((x) => x[1]).join(",")}`,
        { headers: { "User-Agent": UA } });
      if (!r.ok) { elev.push(...g.map(() => NaN)); continue; }
      const b = await r.json() as { elevation?: number[] };
      const e = b.elevation ?? [];
      for (let i = 0; i < g.length; i++) elev.push(typeof e[i] === "number" ? e[i] : NaN);
    } catch { elev.push(...g.map(() => NaN)); }
  }

  return points.map((_, i) => {
    const set = OFF.map((_, k) => elev[i * OFF.length + k]).filter((v) => Number.isFinite(v));
    if (set.length < 3) return 62;                        // unknown, not zero
    const mean = set.reduce((a, b) => a + b, 0) / set.length;
    const sd = Math.sqrt(set.reduce((a, b) => a + (b - mean) ** 2, 0) / set.length);
    // <40 m of relief over 15 km is Plains-flat; >250 m is not chaseable country.
    const relief = clamp(100 - ((sd - 35) / 215) * 100, 8, 100);
    // High plains are fine; genuinely high terrain is not.
    const altitude = mean > 2200 ? 55 : mean > 1600 ? 80 : 100;
    return Math.round(clamp((relief * 0.78 + altitude * 0.22), 5, 100));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Naming the target
// ─────────────────────────────────────────────────────────────────────────────
// State FIPS codes, because the Census geocoder answers with numbers.
const FIPS: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
  "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL",
  "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
  "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE",
  "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND",
  "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV",
  "55": "WI", "56": "WY",
};

/**
 * Name a target.
 *
 * The Census geocoder is the primary because this is a United States product:
 * it is official, keyless, fast, and has no per-second limit. Nominatim was the
 * first choice and it throttled the shared egress IP on the second run of the
 * day, which left every target unnamed. It stays as the backup rather than the
 * front door.
 *
 * A named place beats a county when there is one, because a chaser targets a
 * town. The county is still useful. Bare coordinates mean something broke, and
 * the page shows them rather than inventing a place name.
 */
async function reverseName(lat: number, lon: number): Promise<{ name: string; state: string }> {
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates` +
      `?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current` +
      `&layers=Counties,Incorporated%20Places,Census%20Designated%20Places&format=json`;
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (r.ok) {
      const b = await r.json() as { result?: { geographies?: Record<string, { NAME?: string; STATE?: string }[]> } };
      const g = b.result?.geographies ?? {};
      const hit = g["Incorporated Places"]?.[0] ?? g["Census Designated Places"]?.[0] ?? g["Counties"]?.[0];
      if (hit?.NAME) return { name: hit.NAME, state: FIPS[hit.STATE ?? ""] ?? "" };
    }
  } catch { /* fall through to Nominatim */ }

  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
    );
    if (!r.ok) return { name: "", state: "" };
    const b = await r.json() as { address?: Record<string, string>; name?: string };
    const a = b.address ?? {};
    const name = a.city || a.town || a.village || a.hamlet || a.county || b.name || "";
    return { name, state: a["ISO3166-2-lvl4"]?.replace("US-", "") ?? "" };
  } catch { return { name: "", state: "" }; }
}

/** Two targets closer than this are one chase, not two. */
const MIN_SEPARATION_KM = 200;

/**
 * Take the best `max` candidates that are all at least `minKm` from each other.
 * Ranking is preserved; near-duplicates of a stronger point are dropped.
 */
function spreadOut(list: Scored[], max: number, minKm: number): Scored[] {
  const kept: Scored[] = [];
  for (const s of list) {
    if (kept.length >= max) break;
    if (kept.every((k) => kmBetween(k.cand, s.cand) >= minKm)) kept.push(s);
  }
  // A day confined to one small area would otherwise return a single point.
  if (kept.length < 2) {
    for (const s of list) {
      if (kept.length >= 2) break;
      if (!kept.includes(s)) kept.push(s);
    }
  }
  return kept;
}

const KM_PER_DEG_LAT = 111.32;
function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dy = (a.lat - b.lat) * KM_PER_DEG_LAT;
  const dx = (a.lon - b.lon) * KM_PER_DEG_LAT * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. AI
// ─────────────────────────────────────────────────────────────────────────────
function parseJSON(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text) as Record<string, unknown>; } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { /* give up */ } }
  return null;
}

async function geminiOnce(model: string, system: string, user: string, schema: unknown) {
  try {
    const r = await fetch(GEMINI_URL(model, GEMINI_API_KEY), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.65, maxOutputTokens: 8192 },
      }),
    });
    if (!r.ok) {
      const tryNext = r.status === 404 || r.status === 429 || r.status >= 500;
      return { ok: false as const, error: `${r.status}: ${(await r.text()).slice(0, 180)}`, tryNext };
    }
    const data = await r.json() as {
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    };
    if (data.promptFeedback?.blockReason) return { ok: false as const, error: `blocked: ${data.promptFeedback.blockReason}`, tryNext: false };
    const cand = data.candidates?.[0];
    if (cand?.finishReason && cand.finishReason !== "STOP" && cand.finishReason !== "MAX_TOKENS") {
      return { ok: false as const, error: `finishReason ${cand.finishReason}`, tryNext: false };
    }
    const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = text ? parseJSON(text) : null;
    if (!parsed) return { ok: false as const, error: "returned invalid JSON", tryNext: false };
    return { ok: true as const, data: parsed, model };
  } catch (e) {
    return { ok: false as const, error: String(e instanceof Error ? e.message : e), tryNext: true };
  }
}

type AIRun =
  | { ok: true; data: Record<string, unknown>; model: string }
  | { ok: false; reason: "no_key" }
  | { ok: false; error: string };

async function aiJSON(system: string, user: string, gSchema: unknown, aSchema: unknown): Promise<AIRun> {
  if (GEMINI_API_KEY) {
    const tried: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(4000);
      let transient = false;
      for (const model of GEMINI_MODELS) {
        const res = await geminiOnce(model, system, user, gSchema);
        if (res.ok) return res;
        tried.push(`${model} -> ${res.error}`);
        if (!res.tryNext) { transient = false; break; }
        if (!/^404:/.test(res.error)) transient = true;
      }
      if (!transient) break;
    }
    return { ok: false, error: `gemini failed (${tried.length} attempts) — ${tried.join(" | ")}` };
  }
  if (ANTHROPIC_API_KEY) {
    try {
      const r = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL, max_tokens: 8000,
          output_config: { format: { type: "json_schema", schema: aSchema } },
          system, messages: [{ role: "user", content: user }],
        }),
      });
      if (!r.ok) return { ok: false, error: `anthropic ${r.status}: ${(await r.text()).slice(0, 180)}` };
      const b = await r.json() as { content?: { text?: string }[] };
      const text = b.content?.map((c) => c.text ?? "").join("") ?? "";
      const parsed = parseJSON(text);
      return parsed ? { ok: true, data: parsed, model: ANTHROPIC_MODEL } : { ok: false, error: "anthropic returned invalid JSON" };
    } catch (e) {
      return { ok: false, error: String(e instanceof Error ? e.message : e) };
    }
  }
  return { ok: false, reason: "no_key" };
}

const TARGET_PROPS_G = {
  index: { type: "INTEGER", description: "Index into the candidates array you were given." },
  why: { type: "STRING", description: "2-4 sentences on why this target, in a chaser's voice." },
  storm_mode_note: { type: "STRING", description: "3-5 sentences on expected storm mode, evolution and timing." },
  hail_note: { type: "STRING", description: "One or two sentences on hail, consistent with the computed size." },
  tornado_note: { type: "STRING", description: "One or two sentences on tornado potential." },
  wind_note: { type: "STRING", description: "One sentence on damaging wind potential." },
  extra_notes: { type: "ARRAY", items: { type: "STRING" }, description: "2-3 further specifics: storm motion, visibility, road network, terrain, timing traps." },
  bust_summary: { type: "STRING", description: "2-3 sentences on how this target fails, honestly." },
  bust_word: { type: "STRING", description: "One or two words for the bust risk, e.g. Low, Real, High." },
};

const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    day_score: { type: "NUMBER", description: "0-10 rating of the whole day nationally, one decimal." },
    day_label: { type: "STRING", description: "One or two words describing the score, e.g. 'Quiet', 'Worth Going', 'Big Day'." },
    headline: { type: "STRING", description: "A single line a chaser would read at a glance." },
    overview: { type: "STRING", description: "4-7 sentences explaining why these two areas were chosen over the rest." },
    targets: { type: "ARRAY", items: { type: "OBJECT", properties: TARGET_PROPS_G, required: ["index", "why", "storm_mode_note", "bust_summary", "bust_word"] } },
    yearly_rank: { type: "INTEGER", description: "1-5. 1 = no chance of being the best chase of the year, 5 = very high chance it is." },
    yearly_label: { type: "STRING", description: "At most four words naming the rank, e.g. 'One of many', 'Top ten day', 'Best so far'. No punctuation, no explanation." },
    yearly_summary: { type: "STRING", description: "2-4 sentences placing today against the rest of the year." },
    tips: { type: "ARRAY", items: { type: "STRING" }, description: "Three practical chaser tips for today." },
    safety: { type: "STRING", description: "One safety line. Say it plainly if this is a night, rain-wrapped or Southeast setup." },
  },
  required: ["day_score", "day_label", "headline", "overview", "targets", "yearly_rank", "yearly_summary", "tips", "safety"],
};

const ANTHROPIC_SCHEMA = {
  type: "object",
  properties: {
    day_score: { type: "number" }, day_label: { type: "string" },
    headline: { type: "string" }, overview: { type: "string" },
    targets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" }, why: { type: "string" }, storm_mode_note: { type: "string" },
          hail_note: { type: "string" }, tornado_note: { type: "string" }, wind_note: { type: "string" },
          extra_notes: { type: "array", items: { type: "string" } },
          bust_summary: { type: "string" }, bust_word: { type: "string" },
        },
        required: ["index", "why", "storm_mode_note", "bust_summary", "bust_word"],
      },
    },
    yearly_rank: { type: "integer" }, yearly_label: { type: "string" }, yearly_summary: { type: "string" },
    tips: { type: "array", items: { type: "string" } }, safety: { type: "string" },
  },
  required: ["day_score", "day_label", "headline", "overview", "targets", "yearly_rank", "yearly_label", "yearly_summary", "tips", "safety"],
};

const SYSTEM = `You are the forecaster behind StormSync VIP's chase desk. You are writing for storm chasers who read soundings themselves, so be specific and never pad.

You are given candidate target areas that have ALREADY been found and scored from SPC outlook polygons and model data. Your job is to CHOOSE TWO of them and explain them. You must not invent locations, coordinates or numbers. Every figure you quote must come from the candidate you were given.

Rules:
- Choose exactly two candidates, best first, and give their index from the array.
- The two must be meaningfully different areas, not two points in one county.
- Quote the computed parameters rather than rounding them into vagueness.
- If the day is poor, say so. A chaser who stays home on your advice and is right will trust you next time. Never oversell.
- Bust risk is a feature, not an admission. Explain exactly how each target fails.
- Plain language, short sentences, no marketing tone, no em dashes.`;

// ─────────────────────────────────────────────────────────────────────────────
// 8. Deterministic fallback — the page is never dead
// ─────────────────────────────────────────────────────────────────────────────
/**
 * A short label is a short label.
 *
 * The first live run returned a 200-character string for `yearly_label` that
 * was mostly the schema description read back at us. A field that is meant to
 * be two words gets checked like one; anything that fails falls back to the
 * deterministic label rather than being shown.
 */
function shortLabel(v: unknown, fallback: string, maxWords = 5): string {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t || t.length > 40 || t.split(/\s+/).length > maxWords) return fallback;
  return t;
}

const YEARLY_LABEL: Record<number, string> = {
  1: "Not the one", 2: "Unlikely", 3: "In the running", 4: "Strong contender", 5: "Could be the best",
};

function labelFor(score: number): string {
  if (score >= 9) return "Season Defining";
  if (score >= 7.5) return "Big Day";
  if (score >= 6) return "Worth Going";
  if (score >= 4.5) return "Conditional";
  if (score >= 3) return "Marginal";
  if (score >= 1.5) return "Slim Pickings";
  return "Stay Home";
}

function deterministicWhy(s: Scored): string {
  const p = s.best;
  const bits: string[] = [];
  bits.push(`${Math.round(p.cape).toLocaleString()} J/kg of CAPE with ${Math.round(p.shear06Kt)} kt of deep-layer shear.`);
  if (p.srh03 >= 150) bits.push(`0-3 km helicity near ${Math.round(p.srh03)} m²/s² supports rotating updrafts.`);
  if (p.lclAglM < 1200) bits.push(`Cloud bases around ${Math.round(p.lclAglM)} m keep the low levels working.`);
  if (p.cin > 150) bits.push(`A ${Math.round(p.cin)} J/kg cap is the question mark.`);
  bits.push(`Peak window near ${p.hour.slice(11, 16)} local.`);
  return bits.join(" ");
}

function deterministicBust(s: Scored): string {
  const p = s.best;
  if (p.cin > 200) return `The cap is the whole story. ${Math.round(p.cin)} J/kg of inhibition can easily hold through peak heating, and if it does nothing goes up at all.`;
  if (p.pop < 25) return `Model precipitation chances are only ${Math.round(p.pop)}%, which usually means the forcing is not there even though the thermodynamics are.`;
  if (p.shear06 < 12) return `Shear near ${Math.round(p.shear06Kt)} kt is not enough to organise anything. Expect short-lived pulse storms that are hard to stay with.`;
  return `The parameters are there. The usual failure mode is timing: storms fire late, go up in a cluster, and the best structure happens after dark.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Run
// ─────────────────────────────────────────────────────────────────────────────
async function authorize(req: Request): Promise<{ trigger: string } | Response> {
  const secret = req.headers.get("x-engine-secret");
  if (secret) {
    const { data } = await admin.from("app_config").select("value").eq("key", "storm_engine_secret").maybeSingle();
    const expected = (data?.value as { secret?: string } | null)?.secret;
    if (expected && secret === expected) return { trigger: "cron" };
    return json({ ok: false, error: "Invalid engine secret" }, 401);
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false }, global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (u?.user) {
      const { data: prof } = await admin.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
      if (prof?.is_admin) return { trigger: "manual" };
    }
  }
  return json({ ok: false, error: "Unauthorized" }, 401);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const dryRun = body.dryRun === true || body.action === "dry-run";
  const outlookDate = new Date().toISOString().slice(0, 10);
  const started = Date.now();

  try {
    // ── candidates ───────────────────────────────────────────────────────────
    const { areas, catMax, probs } = await ingestRisk();
    const gen = generateCandidates(areas);
    const candidates = thin(gen.list, 120, gen.source === "national-fallback" ? 1.4 : gen.step * 1.4);

    // ── score ────────────────────────────────────────────────────────────────
    const wx = await fetchWeather(candidates);
    const scored: Scored[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const loc = wx[i];
      if (!loc?.hourly?.time?.length) continue;
      const h = loc.hourly;

      // Only the convective window matters: 15:00 local today through 02:00 the
      // next morning. Overnight MCS potential is real, but it is not a chase.
      let best: Params | null = null, bestScore = -1;
      for (let j = 0; j < h.time.length; j++) {
        const hr = Number(h.time[j].slice(11, 13));
        const dayIdx = h.time[j].slice(0, 10) === loc.daily.time[0] ? 0 : 1;
        if (dayIdx === 1 && hr > 2) continue;
        if (dayIdx === 0 && (hr < 14 || hr > 23)) continue;
        const p = computeAt(loc, j);
        const s = scoreMeteo(p);
        if (s > bestScore) { bestScore = s; best = p; }
      }
      if (!best) continue;

      const mode = classifyMode(best);
      scored.push({
        cand: candidates[i], best, meteo: round(bestScore, 1), total: round(bestScore, 1),
        mode, bustPct: bustProbability(best, mode),
        terrain: 62, daylight: Math.round(daylightScore(best)),
      });
    }

    // SPC weight is a real prior: their meteorologists have seen mesoscale detail
    // the point model has not. It informs the ranking; it does not replace it.
    const maxSpc = Math.max(1, ...scored.map((s) => s.cand.spcWeight));
    for (const s of scored) {
      const spcTerm = (s.cand.spcWeight / maxSpc) * 18;
      s.total = round(clamp(s.meteo * 0.7 + spcTerm + s.daylight * 0.12, 0, 100), 1);
    }
    scored.sort((a, b) => b.total - a.total);

    // ── terrain and names, finalists only ────────────────────────────────────
    //
    // Separation is applied HERE, before the AI sees anything, rather than only
    // to the pair that ships. The first version enforced it afterwards and the
    // overview came back explaining Branch County, Michigan while the page drew
    // Tipton County, Tennessee, because the swap happened after the prose was
    // written. Thinning the candidate list first means every pair the model can
    // choose is already a legal pair, so the words and the pins cannot disagree.
    const finalists = spreadOut(scored, 10, MIN_SEPARATION_KM);
    const terr = await terrainScores(finalists.map((s) => ({ lat: s.cand.lat, lon: s.cand.lon })));
    finalists.forEach((s, i) => {
      s.terrain = terr[i];
      s.total = round(clamp(s.total * 0.86 + s.terrain * 0.14, 0, 100), 1);
    });
    finalists.sort((a, b) => b.total - a.total);

    // Two dots in one county is not two targets.
    const picks: Scored[] = [];
    for (const s of finalists) {
      if (picks.length >= 2) break;
      if (picks.every((p) => kmBetween(p.cand, s.cand) >= MIN_SEPARATION_KM)) picks.push(s);
    }
    while (picks.length < 2 && finalists.length > picks.length) {
      const next = finalists.find((f) => !picks.includes(f));
      if (!next) break;
      picks.push(next);
    }

    // Name the finalists so the AI has somewhere to point.
    const named = finalists.slice(0, 6);
    for (const s of named) {
      const n = await reverseName(s.cand.lat, s.cand.lon);
      s.name = n.name; s.state = n.state;
      await sleep(120);
    }

    const dayScoreRaw = picks.length
      ? clamp(picks[0].total / 10 + (CAT_RANK[catMax ?? "TSTM"] ?? 0) * 0.35, 0, 10)
      : 0;
    const dayScore = round(dayScoreRaw, 1);

    const source = {
      spc_max_category: catMax, spc_category_name: catMax ? CAT_NAME[catMax] : null,
      spc_probs: probs, grid_step_deg: gen.step, candidate_source: gen.source,
      candidates_generated: gen.list.length, candidates_scanned: candidates.length,
      candidates_scored: scored.length, scanned_at: new Date().toISOString(),
    };

    if (dryRun) {
      return json({
        ok: true, dryRun: true, source,
        picks: picks.map((p) => ({
          lat: p.cand.lat, lon: p.cand.lon, name: p.name, state: p.state,
          total: p.total, meteo: p.meteo, terrain: p.terrain, mode: p.mode, bust: p.bustPct,
          cape: Math.round(p.best.cape), shearKt: Math.round(p.best.shear06Kt),
          srh03: Math.round(p.best.srh03), stp: round(p.best.stp, 2), scp: round(p.best.scp, 2),
          ship: round(p.best.ship, 2), hailIn: p.best.hailIn, hour: p.best.hour,
        })),
        day_score: dayScore,
        ai_provider: GEMINI_API_KEY ? "gemini" : ANTHROPIC_API_KEY ? "anthropic" : null,
      });
    }

    // ── year context, for the Yearly tab ─────────────────────────────────────
    // The year's ledger BEFORE today is written. This is the right thing to
    // hand the model — it is being asked to place today against the rest of the
    // year, and the rest of the year does not include today.
    const { data: yearCtx } = await admin.rpc("chase_year_context");
    const year = Array.isArray(yearCtx) ? yearCtx[0] : yearCtx;

    // ── one AI call ──────────────────────────────────────────────────────────
    const aiCandidates = named.map((s, i) => ({
      index: i,
      place: s.name ? `${s.name}${s.state ? ", " + s.state : ""}` : `${s.cand.lat.toFixed(2)}, ${s.cand.lon.toFixed(2)}`,
      lat: s.cand.lat, lon: s.cand.lon,
      spc_category: s.cand.spcCat, spc_tornado_pct: s.cand.tornProb,
      spc_hail_pct: s.cand.hailProb, spc_wind_pct: s.cand.windProb,
      peak_hour_local: s.best.hour, sunset_local: s.best.sunsetLocal,
      hours_of_daylight_after_peak: round(s.best.hoursToSunset, 1),
      cape: Math.round(s.best.cape), cin: Math.round(s.best.cin), lifted_index: round(s.best.li, 1),
      dewpoint_f: Math.round(s.best.dewF), lcl_agl_m: Math.round(s.best.lclAglM),
      shear_0_6km_kt: Math.round(s.best.shear06Kt), shear_0_1km_kt: Math.round(s.best.shear01Kt),
      srh_0_1km: Math.round(s.best.srh01), srh_0_3km: Math.round(s.best.srh03),
      stp: round(s.best.stp, 2), scp: round(s.best.scp, 2), ship: round(s.best.ship, 2), ehi: round(s.best.ehi, 2),
      lapse_rate_700_500: round(s.best.lr75, 1), temp_500mb_c: round(s.best.t500, 1),
      rh_700mb: Math.round(s.best.rh700), freezing_level_ft: Math.round(s.best.fzlM * M_TO_FT),
      storm_motion_mph: Math.round(s.best.motionMph), storm_motion_toward_deg: Math.round(s.best.motionDir),
      omega_700mb: round(s.best.omega700, 3), precip_probability: Math.round(s.best.pop),
      expected_mode: s.mode, supercell_flavour: supercellFlavour(s.best),
      hail_size_in: s.best.hailIn, hail_word: hailWord(s.best.hailIn),
      computed_bust_pct: s.bustPct, terrain_score_0_100: s.terrain,
      chase_score_0_100: s.total,
    }));

    const user = [
      `Date: ${outlookDate}.`,
      `SPC Day 1: ${catMax ? CAT_NAME[catMax] : "no risk area"}. Highest probabilities: tornado ${probs.torn}%, hail ${probs.hail}%, wind ${probs.wind}%.`,
      `Candidates were generated inside the SPC risk polygons on a ${gen.step}° grid (${source.candidates_scored} points scored).`,
      `The computed national day score is ${dayScore} out of 10. Use it as an anchor; adjust by at most 1.5 either way and say why in the overview.`,
      year
        ? `This year so far: ${year.days_scored ?? 0} days recorded, best ${year.best_score ?? "n/a"} on ${year.best_date ?? "n/a"}, median ${year.median_score ?? "n/a"}, ${year.above_seven ?? 0} days at 7 or better.`
        : `No year history recorded yet, so judge the yearly rank on the parameters alone and say that the record is thin.`,
      ``,
      `Candidates (already found and scored — choose two, do not invent any):`,
      JSON.stringify(aiCandidates, null, 1),
    ].join("\n");

    const ai = await aiJSON(SYSTEM, user, GEMINI_SCHEMA, ANTHROPIC_SCHEMA);

    // ── assemble ─────────────────────────────────────────────────────────────
    // deno-lint-ignore no-explicit-any
    const aiData: any = ai.ok ? ai.data : {};
    // deno-lint-ignore no-explicit-any
    const aiTargets: any[] = Array.isArray(aiData.targets) ? aiData.targets : [];

    // The AI chooses among candidates; if it names an index we do not have, we
    // fall back to our own ranking rather than dropping a target.
    //
    // The separation rule applies to whatever pair actually ships, not only to
    // our own ranking. First run of this shipped Wells County IN and Branch
    // County MI: two good targets, 130 km apart, which is one chase, not two.
    const chosen: Scored[] = [];
    const farEnough = (s: Scored) => chosen.every((c) => kmBetween(c.cand, s.cand) >= MIN_SEPARATION_KM);
    for (const t of aiTargets) {
      if (chosen.length >= 2) break;
      const s = named[Number(t.index)];
      if (s && !chosen.includes(s) && farEnough(s)) chosen.push(s);
    }
    // Backfill from our own ranking, still respecting the distance.
    for (const p of finalists) {
      if (chosen.length >= 2) break;
      if (!chosen.includes(p) && farEnough(p)) chosen.push(p);
    }
    // Only if the country genuinely has nothing else do we relax it.
    for (const p of finalists) {
      if (chosen.length >= 2) break;
      if (!chosen.includes(p)) chosen.push(p);
    }
    const finalTargets = chosen.slice(0, 2);

    const targets = finalTargets.map((s, rank) => {
      const t = aiTargets.find((x) => named[Number(x.index)] === s) ?? {};
      const p = s.best;
      return {
        rank: rank + 1,
        lat: s.cand.lat, lon: s.cand.lon,
        place: s.name ? `${s.name}${s.state ? ", " + s.state : ""}` : `${s.cand.lat.toFixed(2)}°, ${s.cand.lon.toFixed(2)}°`,
        name: s.name ?? "", state: s.state ?? "",
        score: s.total,
        spc_category: s.cand.spcCat, spc_category_name: s.cand.spcCat ? CAT_NAME[s.cand.spcCat] : null,
        spc_tornado_pct: s.cand.tornProb, spc_hail_pct: s.cand.hailProb, spc_wind_pct: s.cand.windProb,
        why: String(t.why ?? deterministicWhy(s)),
        peak_hour: p.hour, sunset: p.sunsetLocal, hours_to_sunset: round(p.hoursToSunset, 1),
        terrain_score: s.terrain, daylight_score: s.daylight,
        params: {
          cape: Math.round(p.cape), cin: Math.round(p.cin), lifted_index: round(p.li, 1),
          temp_f: Math.round((p.tempC * 9) / 5 + 32), dew_f: Math.round(p.dewF),
          mixing_ratio: round(p.mixr, 1),
          lcl_agl_m: Math.round(p.lclAglM), lcl_agl_ft: Math.round(p.lclAglM * M_TO_FT),
          pbl_m: Math.round(p.pbl),
          shear_06_kt: Math.round(p.shear06Kt), shear_01_kt: Math.round(p.shear01Kt),
          srh_01: Math.round(p.srh01), srh_03: Math.round(p.srh03),
          stp: round(p.stp, 2), scp: round(p.scp, 2), ship: round(p.ship, 2), ehi: round(p.ehi, 2),
          lapse_75: round(p.lr75, 1), lapse_03: round(p.lr03, 1),
          temp_500: round(p.t500, 1), temp_850: round(p.t850, 1),
          rh_700: Math.round(p.rh700), rh_850: Math.round(p.rh850),
          freezing_level_ft: Math.round(p.fzlM * M_TO_FT), wbz_ft: Math.round(p.wbz * M_TO_FT),
          omega_700: round(p.omega700, 3),
          precip_probability: Math.round(p.pop), cloud_cover_low: Math.round(p.cloudLow),
          surface_pressure: Math.round(p.sfcP),
        },
        storm_mode: {
          mode: s.mode,
          flavour: supercellFlavour(p),
          motion_mph: Math.round(p.motionMph),
          motion_toward_deg: Math.round(p.motionDir),
          hail_in: p.hailIn,
          hail_word: hailWord(p.hailIn),
          note: String(t.storm_mode_note ?? `${s.mode}. Storm motion near ${Math.round(p.motionMph)} mph.`),
          hail_note: t.hail_note ? String(t.hail_note) : null,
          tornado_note: t.tornado_note ? String(t.tornado_note) : null,
          wind_note: t.wind_note ? String(t.wind_note) : null,
          extra_notes: Array.isArray(t.extra_notes) ? t.extra_notes.map(String).slice(0, 4) : [],
        },
        bust: {
          probability: s.bustPct,
          word: shortLabel(t.bust_word, s.bustPct >= 65 ? "High" : s.bustPct >= 40 ? "Real" : "Low", 3),
          summary: String(t.bust_summary ?? deterministicBust(s)),
        },
      };
    });

    const aiScore = typeof aiData.day_score === "number" ? aiData.day_score : null;
    const finalScore = aiScore !== null ? round(clamp(aiScore, Math.max(0, dayScore - 1.5), Math.min(10, dayScore + 1.5)), 1) : dayScore;

    const yearlyRank = clamp(Math.round(Number(
      aiData.yearly_rank ?? (finalScore >= 8.5 ? 5 : finalScore >= 7 ? 4 : finalScore >= 5.5 ? 3 : finalScore >= 3.5 ? 2 : 1),
    )), 1, 5);

    const row = {
      outlook_date: outlookDate,
      status: ai.ok ? "ok" : ("reason" in ai && ai.reason === "no_key" ? "skipped" : "error"),
      model: ai.ok ? ai.model : null,
      day_score: finalScore,
      day_label: shortLabel(aiData.day_label, labelFor(finalScore), 3),
      headline: String(aiData.headline ?? (catMax ? `${CAT_NAME[catMax]} risk today` : "No organised severe weather expected")),
      overview: String(aiData.overview ?? (targets.length
        ? `Two areas came out on top of ${source.candidates_scored} points scored inside today's SPC risk area. ${targets[0].why}`
        : "No candidate points scored today. Either SPC has no risk area out or the model data did not return.")),
      targets,
      yearly: {
        rank: yearlyRank,
        label: shortLabel(aiData.yearly_label, YEARLY_LABEL[yearlyRank] ?? ""),
        summary: String(aiData.yearly_summary ?? ""),
        // Filled in after the upsert — see below. Storing the pre-run ledger
        // here is what made the page contradict itself.
        context: null as unknown,
      },
      tips: Array.isArray(aiData.tips) ? aiData.tips.map(String).slice(0, 4) : [],
      safety: String(aiData.safety ?? "Chase with a partner, keep an escape route east or south, and never core-punch a rain-wrapped supercell."),
      source,
      error: ai.ok ? null : ("reason" in ai ? "no AI key set (GEMINI_API_KEY or ANTHROPIC_API_KEY)" : ai.error),
      generated_at: ai.ok ? new Date().toISOString() : null,
    };

    await admin.from("chase_outlook").upsert(row, { onConflict: "outlook_date" });

    /*
     * Re-read the ledger now that today is in it, and store THAT.
     *
     * The context used to be the same snapshot handed to the model, taken
     * before today's row existed. On a first run of the day that is merely
     * incomplete; on a RE-RUN it is wrong in a way anybody would notice,
     * because the snapshot then contains the previous run's own score for
     * today. That is exactly what happened here: a manual run scored 9.0, the
     * scheduled run an hour later scored 8.0, and the page ended up saying
     * "today: 8.0" directly above "best so far: 9.0 on today's date" — two
     * numbers for the same day, and a narrative reasoning about "the 9.0 day we
     * saw earlier", which was also today.
     *
     * Reading it back afterwards means the ledger always describes the rows as
     * they actually stand, and no ordering of runs can make it disagree with
     * the score printed above it.
     */
    const { data: freshCtx } = await admin.rpc("chase_year_context");
    const settled = Array.isArray(freshCtx) ? freshCtx[0] : freshCtx;
    if (settled) {
      await admin.from("chase_outlook")
        .update({ yearly: { ...row.yearly, context: settled } })
        .eq("outlook_date", outlookDate);
    }
    // The result is checked, not discarded. This insert failed silently for two
    // days — the sequence behind its serial key was not granted to
    // `service_role` after the project was rebuilt — and because nothing looked
    // at the error, a day the engine never ran was indistinguishable from a day
    // it ran fine. A run log that can fail quietly is worse than no run log:
    // it looks like evidence.
    const logged = await admin.from("chase_runs").insert({
      outlook_date: outlookDate, status: row.status, model: row.model, trigger: auth.trigger,
      duration_ms: Date.now() - started, candidates: candidates.length, scored: scored.length,
      detail: row.error,
    });
    if (logged.error) console.error("chase_runs insert failed:", logged.error.message);

    return json({ ok: true, status: row.status, outlook_date: outlookDate, day_score: finalScore, targets: targets.length, scored: scored.length });
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    try {
      await admin.from("chase_runs").insert({
        outlook_date: outlookDate, status: "error", trigger: auth.trigger,
        duration_ms: Date.now() - started, detail: msg,
      });
    } catch { /* best-effort */ }
    return json({ ok: false, error: msg }, 500);
  }
});
