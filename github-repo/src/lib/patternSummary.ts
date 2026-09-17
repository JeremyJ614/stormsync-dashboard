/**
 * What is happening today, and what has happened lately — as prose you can act on.
 *
 * The module opened with a gauge and a grid. Both are true and neither answers
 * the question a person actually arrives with, which is "so what, and where".
 * This produces the two things that answer it: a set of KEY CONCERNS naming the
 * hazard and the ground it covers, and a recap of the periods behind us.
 *
 * NOTHING HERE IS WRITTEN BY A MODEL, and that is deliberate. Every line is
 * assembled from the issuing centre's own polygons and the report ledger, so a
 * concern cannot name a state the risk does not cover, cannot invent a number,
 * and cannot go stale while a language model is down — which is exactly how the
 * yearly figures came to be stale in the first place. The daily brief's own
 * written summary still sits above all of this; what this adds is the part that
 * has to be right.
 *
 * Every source below was verified against the live service:
 *   SPC   day1otlk_cat / _torn / _wind / _hail, and day1fw_dryt
 *   WPC   hazards/wpc_precip_hazards — Excessive Rainfall Day 1
 *   CPC   hazards/cpc_weather_hazards — the 3-7 day hazard layers
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";
import {
  REGIONS, samplePoints, inPolygon, polygonsOf, CAT_RANK, CAT_LABEL,
  type GeoFeature,
} from "./patternData";
import { US_STATE_LABELS, unproject } from "./usAlbers";

const SPC = "https://www.spc.noaa.gov";
const NOAA_GIS = "https://mapservices.weather.noaa.gov/vector/rest/services";

/* ── concerns ────────────────────────────────────────────────────────────── */

export type ConcernKind =
  | "tornado" | "hail" | "wind" | "storm" | "rain" | "flood"
  | "fire" | "heat" | "cold" | "winter" | "quiet";

export interface Concern {
  id: string;
  kind: ConcernKind;
  /** 0 quiet · 1 note · 2 elevated · 3 serious. Drives colour and order. */
  weight: number;
  /**
   * Tiebreak within a weight, so the headline product leads.
   *
   * A Slight risk and the 15% wind probability inside it are the same fact
   * stated twice, and the categorical outlook is the one people know by name —
   * it should not sort below its own components.
   */
  rank: number;
  text: string;
  source: string;
}

export interface NationalSummary {
  concerns: Concern[];
  /** Macro regions under the day's highest convective risk, largest first. */
  regions: string[];
  issued?: string;
  /** True when every source answered. */
  complete: boolean;
}

/** State centroids in lon/lat, derived from the projected label positions. */
const STATE_POINTS: { abbr: string; lon: number; lat: number }[] = US_STATE_LABELS.map((l) => {
  const { lon, lat } = unproject(l.x, l.y);
  return { abbr: l.abbr, lon, lat };
});

/** Which macro regions and states a set of polygons covers. */
function coverage(polys: number[][][][]): { regions: string[]; states: string[] } {
  if (!polys.length) return { regions: [], states: [] };

  const hits: { label: string; n: number }[] = [];
  for (const r of REGIONS) {
    const pts = samplePoints(r);
    const n = pts.filter((pt) => polys.some((poly) => inPolygon(pt, poly))).length;
    if (n > 0) hits.push({ label: r.label, n });
  }
  hits.sort((a, b) => b.n - a.n);

  const states = STATE_POINTS
    .filter((s) => polys.some((poly) => inPolygon([s.lon, s.lat], poly)))
    .map((s) => s.abbr);

  return { regions: hits.map((h) => h.label), states };
}

/**
 * Regions and states as one readable phrase.
 *
 * States when there are few enough to list — "Kansas, Oklahoma and Missouri"
 * is worth more than "the Southern Plains" — and the macro regions when the
 * area is too broad for a list to mean anything.
 */
function where(cov: { regions: string[]; states: string[] }): string {
  if (cov.states.length > 0 && cov.states.length <= 6) return list(cov.states.map(stateName));
  if (cov.regions.length > 0) return list(cov.regions.slice(0, 3).map((r) => `the ${r}`));
  if (cov.states.length > 0) return list(cov.states.slice(0, 4).map(stateName)) + " and neighbouring states";
  // Nothing to name. An area too small or too far offshore to land on any of
  // the sampled points is better left unsaid than described as "parts of the
  // country", which is a sentence that survives being wrong.
  return "";
}

/** " over Kansas and Oklahoma", or nothing at all. */
function overWhere(cov: { regions: string[]; states: string[] }, prep = "over"): string {
  const w = where(cov);
  return w ? ` ${prep} ${w}` : "";
}

function list(xs: string[]): string {
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "Washington DC", FL: "Florida", GA: "Georgia", HI: "Hawaii",
  ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};
const stateName = (a: string) => STATE_NAMES[a] ?? a;

async function geo(url: string): Promise<GeoFeature[]> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  const d = await r.json() as { features?: GeoFeature[] };
  return d.features ?? [];
}

const gisUrl = (layer: string) =>
  `${NOAA_GIS}/${layer}/query?where=1%3D1&outFields=*&outSR=4326&returnGeometry=true`
  + `&maxAllowableOffset=0.1&geometryPrecision=2&f=geojson`;

interface Props { [k: string]: unknown }
const prop = (f: GeoFeature, k: string): string => {
  const v = (f.properties as Props | undefined)?.[k];
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
};

/**
 * The peak probability in a probabilistic outlook.
 *
 * SPC labels these bands as FRACTIONS — "0.02", "0.05", "0.15", "0.30" — with
 * "SIGN" for the hatched significant-severe area. Reading them as percentages
 * is how a 15% wind probability comes out as "0.15%", which is both wrong and
 * wrong by two orders of magnitude, so anything at or below 1 is scaled.
 */
function maxProb(features: GeoFeature[]): { pct: number; sig: boolean; polys: number[][][][] } {
  let pct = 0, sig = false;
  const polys: number[][][][] = [];
  for (const f of features) {
    const label = prop(f, "LABEL").trim();
    if (label.toUpperCase().includes("SIGN")) { sig = true; polys.push(...polygonsOf(f)); continue; }
    let n = Number(label.replace("%", "").trim());
    if (!Number.isFinite(n) || n <= 0) continue;
    if (n <= 1) n *= 100;
    polys.push(...polygonsOf(f));
    if (n > pct) pct = n;
  }
  return { pct: Math.round(pct), sig, polys };
}

/** Only the polygons of features whose LABEL is at or above a category. */
function catPolys(features: GeoFeature[], label: string): number[][][][] {
  return features.filter((f) => prop(f, "LABEL") === label).flatMap(polygonsOf);
}

async function convective(out: Concern[]): Promise<{ regions: string[]; issued?: string }> {
  const [cat, torn, wind, hail] = await Promise.all([
    geo(`${SPC}/products/outlook/day1otlk_cat.nolyr.geojson`),
    geo(`${SPC}/products/outlook/day1otlk_torn.nolyr.geojson`),
    geo(`${SPC}/products/outlook/day1otlk_wind.nolyr.geojson`),
    geo(`${SPC}/products/outlook/day1otlk_hail.nolyr.geojson`),
  ]);

  const issued = cat.length ? prop(cat[0], "ISSUE_ISO") : undefined;

  // The day's top category, and the ground that category alone covers.
  let top = "", rank = 0;
  for (const f of cat) {
    const l = prop(f, "LABEL");
    if ((CAT_RANK[l] ?? 0) > rank) { rank = CAT_RANK[l] ?? 0; top = l; }
  }

  let regions: string[] = [];
  if (top && rank >= 2) {
    const cov = coverage(catPolys(cat, top));
    regions = cov.regions;
    out.push({
      id: "spc-cat",
      kind: "storm",
      rank: 0,
      weight: rank >= 3 ? 3 : 2,
      text: `${CAT_LABEL[top]} risk of severe thunderstorms${overWhere(cov, "across")}.`,
      source: "SPC Day 1 convective outlook",
    });
  } else if (top === "TSTM") {
    const cov = coverage(catPolys(cat, "TSTM"));
    regions = cov.regions;
    out.push({
      id: "spc-cat", kind: "storm", rank: 0, weight: 1,
      text: `Non-severe thunderstorms possible${overWhere(cov, "across")}; no organised severe risk is posted.`,
      source: "SPC Day 1 convective outlook",
    });
  }

  const probs: [string, ConcernKind, GeoFeature[], string, string, number][] = [
    ["spc-torn", "tornado", torn, "Tornado", "within 25 miles of a point", 1],
    ["spc-wind", "wind", wind, "Damaging wind", "of 58 mph or more within 25 miles of a point", 2],
    ["spc-hail", "hail", hail, "Large hail", "of an inch or more within 25 miles of a point", 3],
  ];
  for (const [id, kind, features, noun, qualifier, rankIn] of probs) {
    const m = maxProb(features);
    if (m.pct <= 0 && !m.sig) continue;
    const cov = coverage(m.polys);
    out.push({
      id, kind, rank: rankIn,
      weight: m.sig ? 3 : m.pct >= 15 ? 3 : m.pct >= 5 ? 2 : 1,
      text: `${noun} probability peaks at ${m.pct}% ${qualifier}${overWhere(cov)}`
        + (m.sig ? ", with a hatched area for significant severe." : "."),
      source: `SPC Day 1 probabilistic ${kind} outlook`,
    });
  }

  return { regions, issued };
}

async function rainfall(out: Concern[]): Promise<void> {
  const fs = await geo(gisUrl("hazards/wpc_precip_hazards/MapServer/0"));
  if (!fs.length) return;
  // "Marginal (At Least 5%)" … "High (At Least 50%)" — rank by the percentage.
  let best = "", pct = -1;
  for (const f of fs) {
    const l = prop(f, "outlook");
    const n = Number((l.match(/(\d+)\s*%/) ?? [])[1] ?? -1);
    if (n > pct) { pct = n; best = l; }
  }
  if (!best) return;
  const cov = coverage(fs.filter((f) => prop(f, "outlook") === best).flatMap(polygonsOf));
  const word = best.split(" ")[0];
  out.push({
    id: "wpc-ero", kind: "flood", rank: 4,
    weight: pct >= 30 ? 3 : pct >= 15 ? 2 : 1,
    text: `${word} risk of excessive rainfall and flash flooding${overWhere(cov)}.`,
    source: "WPC Excessive Rainfall Outlook, Day 1",
  });
}

async function fireWeather(out: Concern[]): Promise<void> {
  const fs = await geo(`${SPC}/products/fire_wx/day1fw_dryt.nolyr.geojson`);
  const areas = fs.filter((f) => prop(f, "LABEL") && prop(f, "LABEL").toLowerCase() !== "no areas");
  if (!areas.length) return;
  const cov = coverage(areas.flatMap(polygonsOf));
  out.push({
    id: "spc-dryt", kind: "fire", rank: 5, weight: 2,
    text: `Dry thunderstorms possible${overWhere(cov)} — lightning with little or no wetting rain.`,
    source: "SPC Day 1 fire weather outlook",
  });
}

const HAZARD_KIND: [RegExp, ConcernKind][] = [
  [/heat/i, "heat"], [/cold|freeze|frost/i, "cold"], [/snow|ice|winter|freezing/i, "winter"],
  [/flood/i, "flood"], [/rain|precip/i, "rain"], [/wind/i, "wind"],
  [/fire|drought/i, "fire"], [/severe|storm/i, "storm"],
];
const kindOf = (label: string): ConcernKind =>
  HAZARD_KIND.find(([re]) => re.test(label))?.[1] ?? "storm";

async function cpcHazards(out: Concern[]): Promise<void> {
  // 1 = 3-7 day temperature hazards, 4 = 3-7 day precipitation hazards.
  const layers = ["hazards/cpc_weather_hazards/MapServer/1", "hazards/cpc_weather_hazards/MapServer/4"];
  const sets = await Promise.all(layers.map((l) => geo(gisUrl(l)).catch(() => [] as GeoFeature[])));
  const byLabel = new Map<string, GeoFeature[]>();
  for (const fs of sets) {
    for (const f of fs) {
      const l = prop(f, "label");
      if (!l) continue;
      const got = byLabel.get(l);
      if (got) got.push(f); else byLabel.set(l, [f]);
    }
  }
  for (const [label, fs] of byLabel) {
    const cov = coverage(fs.flatMap(polygonsOf));
    out.push({
      id: `cpc-${label}`, kind: kindOf(label), rank: 6, weight: 1,
      text: `${label} flagged for the 3–7 day period${overWhere(cov)}.`,
      source: "CPC hazards outlook",
    });
  }
}

export async function loadNationalSummary(): Promise<NationalSummary> {
  const concerns: Concern[] = [];
  let regions: string[] = [];
  let issued: string | undefined;
  let complete = true;

  // Each source is independent: one centre being down must not blank the rest.
  const runs = await Promise.allSettled([
    convective(concerns).then((r) => { regions = r.regions; issued = r.issued; }),
    rainfall(concerns),
    fireWeather(concerns),
    cpcHazards(concerns),
  ]);
  for (const r of runs) {
    if (r.status === "rejected") {
      complete = false;
      logger.warn("pattern summary source failed", { scope: "pattern", error: String(r.reason) });
    }
  }

  if (concerns.length === 0) {
    concerns.push({
      id: "quiet", kind: "quiet", rank: 9, weight: 0,
      text: "No severe, fire or flooding concerns are posted nationally today.",
      source: "SPC · WPC · CPC",
    });
  }
  concerns.sort((a, b) => b.weight - a.weight || a.rank - b.rank);
  return { concerns, regions, issued, complete };
}

/* ── the periods behind us ───────────────────────────────────────────────── */

export interface PeriodStats {
  id: string;
  label: string;
  start: string;
  end: string;
  days: number;
  tornado: number;
  hail: number;
  wind: number;
  /** States by tornado count, busiest first. */
  states: { abbr: string; n: number }[];
  highlights: string[];
  /** Prose from the Storm Engine, when it has written any for this period. */
  headline?: string;
  summary?: string;
}

interface CountRow {
  report_date: string;
  tornado: number; hail: number; wind: number;
  state_tornadoes: Record<string, number> | null;
  max_hail_in: string | number | null; max_hail_place: string | null;
  max_gust_kt: number | null; max_gust_place: string | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const back = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() - n); return x; };
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/** Period windows, in the order a reader walks backwards through them. */
function windows(today: Date) {
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  const lastMonthStart = new Date(Date.UTC(y, m - 1, 1));
  const lastMonthEnd = new Date(Date.UTC(y, m, 0));
  return [
    { id: "yesterday", label: "Yesterday", start: iso(back(today, 1)), end: iso(back(today, 1)) },
    { id: "week", label: "This week so far", start: iso(back(today, 6)), end: iso(today) },
    { id: "lastweek", label: "The week before", start: iso(back(today, 13)), end: iso(back(today, 7)) },
    { id: "thismonth", label: `${MONTHS[m]} so far`, start: iso(new Date(Date.UTC(y, m, 1))), end: iso(today) },
    { id: "lastmonth", label: `${MONTHS[lastMonthStart.getUTCMonth()]} ${lastMonthStart.getUTCFullYear()}`,
      start: iso(lastMonthStart), end: iso(lastMonthEnd) },
    { id: "thisyear", label: `${y} so far`, start: iso(new Date(Date.UTC(y, 0, 1))), end: iso(today) },
  ];
}

function highlightsFor(rows: CountRow[]): string[] {
  const out: string[] = [];
  const busiest = [...rows].sort((a, b) => (b.tornado * 3 + b.hail + b.wind) - (a.tornado * 3 + a.hail + a.wind))[0];
  if (busiest && busiest.tornado + busiest.hail + busiest.wind > 0) {
    const d = new Date(`${busiest.report_date}T00:00:00Z`);
    out.push(`Busiest day was ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, with `
      + `${busiest.tornado} tornado, ${busiest.hail} hail and ${busiest.wind} wind reports.`);
  }
  const hail = rows
    .filter((r) => r.max_hail_in !== null && r.max_hail_place)
    .sort((a, b) => Number(b.max_hail_in) - Number(a.max_hail_in))[0];
  if (hail) out.push(`Largest hail was ${Number(hail.max_hail_in).toFixed(2)}″ at ${hail.max_hail_place}.`);

  const gust = rows
    .filter((r) => typeof r.max_gust_kt === "number" && r.max_gust_place)
    .sort((a, b) => (b.max_gust_kt ?? 0) - (a.max_gust_kt ?? 0))[0];
  if (gust) {
    out.push(`Strongest measured gust was ${Math.round((gust.max_gust_kt ?? 0) * 1.15078)} mph `
      + `at ${gust.max_gust_place}.`);
  }

  const active = rows.filter((r) => r.tornado + r.hail + r.wind > 0).length;
  if (rows.length > 1) out.push(`${active} of ${rows.length} days logged at least one severe report.`);
  return out;
}

export async function loadPeriods(): Promise<PeriodStats[]> {
  if (!isSupabaseConfigured) return [];
  const today = new Date();
  const defs = windows(today);
  const from = defs.reduce((a, d) => (d.start < a ? d.start : a), defs[0].start);

  const [counts, history] = await Promise.all([
    supabase
      .from("daily_report_counts")
      .select("report_date,tornado,hail,wind,state_tornadoes,max_hail_in,max_hail_place,max_gust_kt,max_gust_place")
      .gte("report_date", from).order("report_date"),
    supabase.from("severe_history").select("period,headline,summary"),
  ]);

  if (counts.error) {
    logger.error("period stats failed", { scope: "pattern", error: counts.error });
    return [];
  }
  const rows = (counts.data ?? []) as CountRow[];
  const prose = new Map<string, { headline: string | null; summary: string | null }>(
    ((history.data ?? []) as { period: string; headline: string | null; summary: string | null }[])
      .map((r) => [r.period, { headline: r.headline, summary: r.summary }]),
  );

  return defs.map((d) => {
    const inRange = rows.filter((r) => r.report_date >= d.start && r.report_date <= d.end);
    const byState = new Map<string, number>();
    for (const r of inRange) {
      for (const [st, n] of Object.entries(r.state_tornadoes ?? {})) {
        byState.set(st, (byState.get(st) ?? 0) + Number(n || 0));
      }
    }
    const p = prose.get(d.id);
    return {
      ...d,
      days: inRange.length,
      tornado: inRange.reduce((s, r) => s + (r.tornado ?? 0), 0),
      hail: inRange.reduce((s, r) => s + (r.hail ?? 0), 0),
      wind: inRange.reduce((s, r) => s + (r.wind ?? 0), 0),
      states: [...byState.entries()]
        .map(([abbr, n]) => ({ abbr, n }))
        .filter((s) => s.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 8),
      highlights: highlightsFor(inRange),
      headline: p?.headline ?? undefined,
      summary: p?.summary ?? undefined,
    };
  });
}

export { stateName };
