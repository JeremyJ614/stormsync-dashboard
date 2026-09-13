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
 * the browser rather than an expectation — three years of United States
 * tornadoes is 4,326 tracks, which is three pages and about two seconds.
 *
 * `maxAllowableOffset` at 0.0005° is roughly 55 metres, which is narrower than
 * the tornadoes themselves and invisible at any zoom this map reaches. It is
 * worth 40% of the payload: a month of tracks goes from 285 kB to 165 kB.
 */
const DAT_PAGE = 2000;
const DAT_MAX_PAGES = 8;

export async function fetchTornadoTracks(
  startISO: string, endISO: string, signal?: AbortSignal,
): Promise<TornadoResult & TornadoResultMeta> {
  const d0 = startISO.slice(0, 10), d1 = endISO.slice(0, 10);
  const where = `stormdate >= DATE '${d0}' AND stormdate <= DATE '${d1}'`;

  const counts: Record<string, number> = {};
  let fatalities = 0, injuries = 0, highestIdx = -1;
  const features: TornadoFeature[] = [];
  let offset = 0, pages = 0, truncated = false;

  while (pages < DAT_MAX_PAGES) {
    const qs = new URLSearchParams({
      where,
      outFields: "stormdate,efscale,efnum,fatalities,injuries,length,width,maxwind",
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
 * A product decision, not a data limit — the Damage Assessment Toolkit holds a
 * great deal more than this (2022 alone is 991 surveyed tracks). Three years is
 * 4,326 tracks, three pages and about two seconds, which is the point where the
 * page still feels instant. Raising it is this one number; the picker, the
 * clamp and the labels all read from it.
 */
export const TOR_YEARS_BACK = 3;

/** What the reader is asking to see. */
export type TorPeriod =
  | { kind: "days"; days: number }
  | { kind: "year"; year: number }
  | { kind: "month"; year: number; month: number };   // month is 1-12

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
 * A period as an ISO range, clamped to the window at both ends.
 *
 * The clamp is what stops "2023" quietly asking for eight months the archive
 * window does not cover, and what stops any period running past today.
 */
export function periodRange(p: TorPeriod, now: Date = new Date()): { start: string; end: string } {
  const iso = (d: Date) => d.toISOString().slice(0, 19) + "Z";
  const floor = torFloor(now);
  if (p.kind === "days") {
    const start = new Date(now.getTime() - p.days * 86400_000);
    return { start: iso(start < floor ? floor : start), end: iso(now) };
  }
  const start = p.kind === "year"
    ? new Date(Date.UTC(p.year, 0, 1))
    : new Date(Date.UTC(p.year, p.month - 1, 1));
  const end = p.kind === "year"
    ? new Date(Date.UTC(p.year, 11, 31, 23, 59, 59))
    : new Date(Date.UTC(p.year, p.month, 0, 23, 59, 59));   // day 0 = last of the month
  return {
    start: iso(start < floor ? floor : start),
    end: iso(end > now ? now : end),
  };
}

/** What the period is called, for a heading. */
export function periodLabel(p: TorPeriod): string {
  if (p.kind === "days") {
    return p.days === 365 ? "past year"
      : p.days >= 1095 ? `past ${TOR_YEARS_BACK} years`
      : `past ${p.days} days`;
  }
  if (p.kind === "year") return String(p.year);
  return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
}

/** True when the window clips the period — the heading should say so. */
export function periodClipped(p: TorPeriod, now: Date = new Date()): boolean {
  if (p.kind === "days") return false;
  const floor = torFloor(now);
  const start = p.kind === "year"
    ? new Date(Date.UTC(p.year, 0, 1))
    : new Date(Date.UTC(p.year, p.month - 1, 1));
  return start < floor;
}

/** ISO range helper: N days back through now, both in UTC. */
export function daysBackRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 19) + "Z";
  return { start: iso(start), end: iso(end) };
}
