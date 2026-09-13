/**
 * Severe Weather History data layer (P-3.2).
 *
 * Two live sources, both free and public:
 *  • Warnings  — Iowa Environmental Mesonet storm-based warnings (sbw.geojson)
 *  • Tornadoes — NOAA Damage Assessment Toolkit (survey-driven, appears as the
 *                NWS publishes each survey)
 *
 * Warning severity uses the NWS impact-based-warning tags exactly the way
 * ryanhallyall.com/history does, so the legend and the map finally agree:
 *   Tornado Emergency > PDS Tornado > Tornado > Destructive > Considerable > Severe
 * (Previously the page advertised seven categories and painted two.)
 */
import { paletteColor } from "./mapPalette";

export type WarnTier =
  | "tornado-emergency" | "pds-tornado" | "tornado"
  | "destructive" | "considerable" | "severe" | "other";

export interface TierDef { id: WarnTier; label: string; color: string; order: number }

export const WARN_TIERS: TierDef[] = [
  { id: "tornado-emergency", label: "Tornado Emergency", color: "#ff00ff", order: 0 },
  { id: "pds-tornado",       label: "PDS Tornado",       color: "#d946ef", order: 1 },
  { id: "tornado",           label: "Tornado",           color: "#ef4444", order: 2 },
  { id: "destructive",       label: "Destructive",       color: "#f97316", order: 3 },
  { id: "considerable",      label: "Considerable",      color: "#f59e0b", order: 4 },
  { id: "severe",            label: "Severe",            color: "#c3d117", order: 5 },
  { id: "other",             label: "Other",             color: "#64748b", order: 6 },
];
export const TIER_COLOR: Record<WarnTier, string> =
  Object.fromEntries(WARN_TIERS.map(t => [t.id, t.color])) as Record<WarnTier, string>;

interface SbwProps {
  phenomena?: string; significance?: string;
  damagetag?: string | null; is_pds?: boolean | string; is_emergency?: boolean | string;
  windtag?: string | null; hailtag?: string | null; tornadotag?: string | null;
  issue?: string; expire?: string; wfo?: string; eventid?: number | string;
}

const truthy = (v: unknown) => v === true || v === "true" || v === "t";

/** Classify one storm-based warning into a Ryan-Hall-style severity tier. */
export function classifyWarning(p: SbwProps): WarnTier {
  const ph = (p.phenomena ?? "").toUpperCase();
  const sig = (p.significance ?? "").toUpperCase();
  if (sig !== "W") return "other";
  if (ph === "TO") {
    if (truthy(p.is_emergency)) return "tornado-emergency";
    if (truthy(p.is_pds)) return "pds-tornado";
    return "tornado";
  }
  if (ph === "SV") {
    const dmg = (p.damagetag ?? "").toUpperCase();
    if (dmg === "DESTRUCTIVE") return "destructive";
    if (dmg === "CONSIDERABLE") return "considerable";
    return "severe";
  }
  return "other";
}

export interface WarningFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: {
    tier: WarnTier; color: string; label: string;
    phenomena: string; wfo: string; issue: string; expire: string;
    windtag: string | null; hailtag: string | null; tornadotag: string | null;
  };
}

export interface WarningResult {
  features: WarningFeature[];
  counts: Record<WarnTier, number>;
  total: number;
}

const IEM_SBW = "https://mesonet.agron.iastate.edu/geojson/sbw.geojson";

/** Storm-based warnings between two dates, classified and counted per tier. */
export async function fetchWarnings(startISO: string, endISO: string, signal?: AbortSignal): Promise<WarningResult> {
  const url = `${IEM_SBW}?sts=${encodeURIComponent(startISO)}&ets=${encodeURIComponent(endISO)}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`IEM warnings ${r.status}`);
  const j = await r.json() as { features?: { geometry: GeoJSON.Geometry; properties: SbwProps }[] };
  const counts = Object.fromEntries(WARN_TIERS.map(t => [t.id, 0])) as Record<WarnTier, number>;
  const features: WarningFeature[] = [];
  for (const f of j.features ?? []) {
    const tier = classifyWarning(f.properties);
    if (tier === "other") continue;             // flood/marine live on their own layers
    counts[tier]++;
    const def = WARN_TIERS.find(t => t.id === tier)!;
    features.push({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        tier, color: def.color, label: def.label,
        phenomena: f.properties.phenomena ?? "",
        wfo: f.properties.wfo ?? "",
        issue: f.properties.issue ?? "",
        expire: f.properties.expire ?? "",
        windtag: f.properties.windtag ?? null,
        hailtag: f.properties.hailtag ?? null,
        tornadotag: f.properties.tornadotag ?? null,
      },
    });
  }
  return { features, counts, total: features.length };
}

// ─── Tornado tracks (NOAA Damage Assessment Toolkit) ─────────────────────────
// NOTE: DAT field names are lower-case (`stormdate`, `efscale`, …). The previous
// implementation queried `BEGIN_DATE` / `EF_RATING`, which do not exist on this
// service — every request errored, which is why the Tornado History tab was blank.
const DAT_LINES = "https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer/1/query";

// Ramp runs cool-to-hot across six clearly separated hues. The previous ramp put
// EF3 (#ef4444) next to EF4 (#dc2626) — two reds a shade apart that were
// effectively indistinguishable on a track map.
export const EF_COLORS: Record<string, string> = {
  EFU: "#8fa3bf", // unrated — neutral slate, deliberately outside the ramp
  EF0: "#f6f8fc", // white
  EF1: "#89cff0", // baby blue
  EF2: "#5fd9a8", // mint green
  EF3: "#e8bb4d", // gold
  EF4: "#e2373c", // scarlet
  EF5: "#8b46d9", // royal purple
};
export const EF_ORDER = ["EFU", "EF0", "EF1", "EF2", "EF3", "EF4", "EF5"];

/**
 * The EF colour actually in force, honouring any admin override.
 *
 * On a track map the rating IS the colour — a viewer reads severity off the
 * hue and nothing else — so this belongs in the same override layer as the
 * probability and SPC ramps rather than being a constant only a deploy can
 * change. `EF_COLORS` stays the default; nothing is stored unless it has been
 * deliberately changed.
 */
export const efHistoryColor = (ef: string): string =>
  paletteColor(`ef:${ef}`, EF_COLORS[ef] ?? "#8fa3bf");

export interface TornadoFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: {
    ef: string; color: string; date: string;
    fatalities: number; injuries: number;
    lengthMi: number; widthYd: number; maxWind: number;
    /** Postal code of the state the track STARTED in; null offshore or unknown. */
    state: string | null;
  };
}
export interface TornadoResult {
  features: TornadoFeature[];
  counts: Record<string, number>;
  total: number;
  fatalities: number;
  injuries: number;
  highestEf: string;
}

export interface TornadoResultMeta { truncated: boolean; pages: number }

/**
 * Every tornado track in a date range.
 *
 * THE BUG THIS FIXES
 * The previous version sent one request with `resultRecordCount: 2000` and read
 * whatever came back. That number is not a page size we chose — it is the
 * service's own `maxRecordCount`, and when a query exceeds it the service
 * returns exactly 2,000 features and sets `exceededTransferLimit`. The old code
 * never looked at that flag.
 *
 * At the ranges the page offered it had not bitten yet, but barely: 2024 alone
 * holds 1,692 tracks. One busy year and the map would have quietly shown the
 * first two thousand and a total to match, with nothing anywhere saying so —
 * which is the worst kind of wrong, because it looks exactly like the truth.
 *
 * So it pages. `orderByFields` is not decoration either: ArcGIS pagination
 * without a stable sort is undefined, and can repeat or skip rows between
 * pages. The page cap is a guard against a mistake in a `where` clause hanging
 * the browser rather than an expectation — the largest period the picker can
 * ask for, ten years of United States tornadoes, is about 9,500 tracks, which
 * is five pages and something under four seconds. Twelve leaves room for a
 * decade busier than any on record before the guard bites.
 *
 * `maxAllowableOffset` at 0.0005° is roughly 55 metres, which is narrower than
 * the tornadoes themselves and invisible at any zoom this map reaches. It is
 * worth 40% of the payload: a month of tracks goes from 285 kB to 165 kB.
 */
const DAT_PAGE = 2000;
const DAT_MAX_PAGES = 12;

export async function fetchTornadoTracks(
  ranges: { start: string; end: string }[], signal?: AbortSignal,
): Promise<TornadoResult & TornadoResultMeta> {
  if (!ranges.length) return EMPTY_TORNADOES;
  /*
   * One request for however many spans the period is made of.
   *
   * A single year is one span. "Every May" is one span per year in the window,
   * and asking the service ten separate times for them would be ten round trips
   * and ten chances to page inconsistently. ArcGIS takes an OR of date ranges
   * perfectly well, and ten spans is about 700 characters of `where` — nowhere
   * near any URL limit.
   */
  const where = ranges
    .map((r) => `(stormdate >= DATE '${r.start.slice(0, 10)}' AND stormdate <= DATE '${r.end.slice(0, 10)}')`)
    .join(" OR ");

  // Started in parallel with the first page rather than awaited before it: the
  // state of each track is worked out from its start point, and this chunk is
  // 22 kB that would otherwise be pure added latency.
  const shapes = import("./stateShapes");

  const counts: Record<string, number> = {};
  let fatalities = 0, injuries = 0, highestIdx = -1;
  const features: TornadoFeature[] = [];
  let offset = 0, pages = 0, truncated = false;

  while (pages < DAT_MAX_PAGES) {
    const qs = new URLSearchParams({
      where,
      outFields: "stormdate,efscale,efnum,fatalities,injuries,length,width,maxwind,startlat,startlon",
      f: "geojson",
      resultRecordCount: String(DAT_PAGE),
      resultOffset: String(offset),
      orderByFields: "stormdate",
      maxAllowableOffset: "0.0005",
      geometryPrecision: "5",
    });
    const r = await fetch(`${DAT_LINES}?${qs}`, { signal });
    if (!r.ok) throw new Error(`DAT ${r.status}`);
    const j = await r.json() as {
      error?: unknown;
      exceededTransferLimit?: boolean;
      properties?: { exceededTransferLimit?: boolean };
      features?: { geometry: GeoJSON.Geometry; properties: Record<string, unknown> }[];
    };
    if (j.error) throw new Error("DAT query rejected");

    const batch = j.features ?? [];
    // Resolved by now in every realistic case — the import was started before
    // the first request went out, and this is the far side of it.
    const { stateAt } = await shapes;
    for (const f of batch) {
      const raw = String(f.properties.efscale ?? "EFU").toUpperCase();
      const ef = EF_ORDER.includes(raw) ? raw : "EFU";      // e.g. "TSTM/Wind" -> EFU
      counts[ef] = (counts[ef] ?? 0) + 1;
      const fat = Number(f.properties.fatalities ?? 0) || 0;
      const inj = Number(f.properties.injuries ?? 0) || 0;
      fatalities += fat; injuries += inj;
      const idx = EF_ORDER.indexOf(ef);
      if (idx > highestIdx) highestIdx = idx;
      const ts = Number(f.properties.stormdate);
      // The reported start point, not the first vertex of the drawn line: the
      // geometry comes back generalised at `maxAllowableOffset`, and near a
      // state line that generalisation is the same size as the answer.
      const slat = Number(f.properties.startlat), slon = Number(f.properties.startlon);
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          ef, color: EF_COLORS[ef] ?? "#94a3b8",
          date: isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : "",
          fatalities: fat, injuries: inj,
          lengthMi: Number(f.properties.length ?? 0) || 0,
          widthYd: Number(f.properties.width ?? 0) || 0,
          maxWind: Number(f.properties.maxwind ?? 0) || 0,
          state: isFinite(slat) && isFinite(slon) ? stateAt(slon, slat) : null,
        },
      });
    }

    pages++;
    offset += batch.length;
    const more = (j.exceededTransferLimit ?? j.properties?.exceededTransferLimit) === true;
    if (!more || batch.length === 0) break;
    if (pages >= DAT_MAX_PAGES) truncated = true;
  }

  return {
    features, counts, total: features.length, fatalities, injuries,
    highestEf: highestIdx >= 0 ? EF_ORDER[highestIdx] : "—",
    truncated, pages,
  };
}

/**
 * How far back tornado history goes.
 *
 * TEN YEARS, and the reason it is not more is the survey, not the app.
 *
 * The volume was the obvious worry and it turned out not to be the problem.
 * Measured against the live service, the busiest year on record here — 2024,
 * 1,692 surveyed tracks — is 514 kB and 7,323 vertices in one request, because
 * a tornado track is a short line: about four points each. Ten years is roughly
 * 9,500 tracks, five pages, under three megabytes and something like four
 * seconds on a cold load. A map can draw that. Twenty years could probably be
 * drawn too.
 *
 * What stops it is that the Damage Assessment Toolkit did not always hold
 * everything. Surveyed tracks per year, straight from the service:
 *
 *     2010    62      2016   503      2022    991
 *     2012   128      2017   778      2023  1,141
 *     2014   438      2018   626      2024  1,692
 *     2015   540      2019 1,010      2025  1,312
 *
 * The United States did not have sixty tornadoes in 2010 and it did not have
 * four times as many in 2024. Those early numbers are the toolkit being adopted,
 * not the weather. A chart that put 2014 next to 2024 would read as a trend and
 * would be nonsense, which is the one thing this module is not allowed to be.
 *
 * So: ten years of window, and everything before `TOR_FULL_SURVEY_YEAR` is
 * labelled as a partial survey wherever it can be picked. Raising the window is
 * this one number — the picker, the clamp and the labels all read from it.
 */
export const TOR_YEARS_BACK = 10;

/**
 * The first year the toolkit's coverage is complete enough to compare.
 *
 * 2019 is where the count settles into the four figures it has held ever since.
 * Years before it are still shown — they are real tornadoes, surveyed and
 * mapped — but they are marked, because a smaller number there means a smaller
 * survey and not a quieter season.
 */
export const TOR_FULL_SURVEY_YEAR = 2019;

/** What the reader is asking to see. */
export type TorPeriod =
  | { kind: "days"; days: number }
  | { kind: "year"; year: number }
  | { kind: "month"; year: number; month: number }    // month is 1-12
  | { kind: "monthAll"; month: number };              // that month in every year

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const MONTH_ABBR = MONTH_NAMES.map((m) => m.slice(0, 3));

/** The oldest instant the archive window reaches. */
export function torFloor(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - TOR_YEARS_BACK);
  return d;
}

/** Calendar years the window touches, newest first. */
export function torYears(now: Date = new Date()): number[] {
  const first = torFloor(now).getFullYear();
  const last = now.getFullYear();
  const out: number[] = [];
  for (let y = last; y >= first; y--) out.push(y);
  return out;
}

/**
 * Months of a year that fall inside the window, as 1-12.
 *
 * Both ends are trimmed: nothing before the three-year floor, and nothing after
 * the current month, because an empty map for next March is not an answer.
 */
export function torMonths(year: number, now: Date = new Date()): number[] {
  const floor = torFloor(now);
  const lo = year === floor.getFullYear() ? floor.getMonth() + 1 : 1;
  const hi = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) out.push(m);
  return out;
}

/**
 * A period as one or more ISO spans, each clamped to the window at both ends.
 *
 * A list rather than a single range because of "every May": that period is one
 * span per year the window touches, and they are genuinely disjoint — there is
 * no single start and end that describes it. Everything else returns a list of
 * one, so the caller has only the one shape to handle.
 *
 * The clamp is what stops "2016" quietly asking for months the window does not
 * reach, and what stops any span running past today.
 */
export function periodRanges(p: TorPeriod, now: Date = new Date()): { start: string; end: string }[] {
  const iso = (d: Date) => d.toISOString().slice(0, 19) + "Z";
  const floor = torFloor(now);
  const span = (a: Date, b: Date) =>
    a > now || b < floor ? null : { start: iso(a < floor ? floor : a), end: iso(b > now ? now : b) };

  if (p.kind === "days") {
    const start = new Date(now.getTime() - p.days * 86400_000);
    return [{ start: iso(start < floor ? floor : start), end: iso(now) }];
  }
  if (p.kind === "year") {
    const s = span(new Date(Date.UTC(p.year, 0, 1)), new Date(Date.UTC(p.year, 11, 31, 23, 59, 59)));
    return s ? [s] : [];
  }
  // day 0 of the next month is the last day of this one, leap years included.
  const month = (y: number, m: number) =>
    span(new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 0, 23, 59, 59)));

  if (p.kind === "month") {
    const s = month(p.year, p.month);
    return s ? [s] : [];
  }
  return torYears(now)
    .map((y) => month(y, p.month))
    .filter((s): s is { start: string; end: string } => s !== null);
}

/** What the period is called, for a heading. */
export function periodLabel(p: TorPeriod): string {
  if (p.kind === "days") {
    return p.days === 365 ? "past year"
      : p.days >= 365 * TOR_YEARS_BACK ? `past ${TOR_YEARS_BACK} years`
      : p.days >= 1095 ? `past ${Math.round(p.days / 365)} years`
      : `past ${p.days} days`;
  }
  if (p.kind === "year") return String(p.year);
  if (p.kind === "month") return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
  return `every ${MONTH_NAMES[p.month - 1]}`;
}

/** True when the window clips the period — the heading should say so. */
export function periodClipped(p: TorPeriod, now: Date = new Date()): boolean {
  if (p.kind === "days") return false;
  const floor = torFloor(now);
  if (p.kind === "monthAll") {
    // Clipped when the oldest year in the window does not contain a whole one
    // of this month — either the floor lands mid-month or the month is still
    // ahead of us in the current year.
    const first = floor.getFullYear();
    return new Date(Date.UTC(first, p.month - 1, 1)) < floor;
  }
  const start = p.kind === "year"
    ? new Date(Date.UTC(p.year, 0, 1))
    : new Date(Date.UTC(p.year, p.month - 1, 1));
  return start < floor;
}

/**
 * True when a period actually reaches years the toolkit had not finished
 * adopting.
 *
 * Asked of the PERIOD, not of the window. The first version tested the window's
 * ten-year floor for every rolling span, so a thirty-day period — which starts
 * last month — carried a banner about 2016. A span only reaches back as far as
 * it reaches back.
 */
export function periodPartialSurvey(p: TorPeriod, now: Date = new Date()): boolean {
  const spans = periodRanges(p, now);
  if (!spans.length) return false;
  const earliest = spans.reduce((a, s) => (s.start < a ? s.start : a), spans[0].start);
  return Number(earliest.slice(0, 4)) < TOR_FULL_SURVEY_YEAR;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────
/** Nothing found, in the shape the page expects. */
export const EMPTY_TORNADOES: TornadoResult & TornadoResultMeta = {
  features: [], counts: {}, total: 0, fatalities: 0, injuries: 0,
  highestEf: "—", truncated: false, pages: 0,
};

export interface TornadoFilters {
  /** EF ratings to keep. Empty or absent means every rating. */
  ef?: string[];
  /** State postal codes to keep. Empty or absent means the whole country. */
  states?: string[];
}

/**
 * Narrow a fetched result, recomputing every number that goes with it.
 *
 * Deliberately a pure function over an already-fetched result rather than part
 * of the query. Ticking EF4 or unticking Kansas is then instant and costs the
 * service nothing, and — the part that actually matters — the totals, the
 * fatality count and the highest rating all describe what is on the map rather
 * than what was asked for. A filtered map beside an unfiltered headline is a
 * bug that looks like a feature.
 */
export function filterTornadoes(
  res: TornadoResult & TornadoResultMeta, f: TornadoFilters,
): TornadoResult & TornadoResultMeta {
  const ef = f.ef?.length ? new Set(f.ef) : null;
  const st = f.states?.length ? new Set(f.states) : null;
  if (!ef && !st) return res;

  const counts: Record<string, number> = {};
  let fatalities = 0, injuries = 0, highestIdx = -1;
  const features = res.features.filter((ft) => {
    const p = ft.properties;
    if (ef && !ef.has(p.ef)) return false;
    if (st && (p.state === null || !st.has(p.state))) return false;
    counts[p.ef] = (counts[p.ef] ?? 0) + 1;
    fatalities += p.fatalities; injuries += p.injuries;
    const i = EF_ORDER.indexOf(p.ef);
    if (i > highestIdx) highestIdx = i;
    return true;
  });

  return {
    ...res, features, counts, total: features.length, fatalities, injuries,
    highestEf: highestIdx >= 0 ? EF_ORDER[highestIdx] : "—",
  };
}

/**
 * Postal code to state name, for filter labels.
 *
 * Duplicated from `stateShapes.ts` on purpose: that module is 68 kB of polygon
 * and is imported dynamically, and a filter should be able to print "Kansas"
 * without pulling in the geometry of Kansas.
 */
export const US_STATE_NAMES: Record<string, string> = { AL: "Alabama", AR: "Arkansas", AZ: "Arizona", CA: "California", CO: "Colorado", CT: "Connecticut", DC: "District of Columbia", DE: "Delaware", FL: "Florida", GA: "Georgia", IA: "Iowa", ID: "Idaho", IL: "Illinois", IN: "Indiana", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", MA: "Massachusetts", MD: "Maryland", ME: "Maine", MI: "Michigan", MN: "Minnesota", MO: "Missouri", MS: "Mississippi", MT: "Montana", NC: "North Carolina", ND: "North Dakota", NE: "Nebraska", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NV: "Nevada", NY: "New York", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VA: "Virginia", VT: "Vermont", WA: "Washington", WI: "Wisconsin", WV: "West Virginia", WY: "Wyoming" };

/** How many tracks each state holds, for the filter's own labels. */
export function countByState(res: TornadoResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of res.features) {
    const s = f.properties.state;
    if (s) out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

/** ISO range helper: N days back through now, both in UTC. */
export function daysBackRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 19) + "Z";
  return { start: iso(start), end: iso(end) };
}
