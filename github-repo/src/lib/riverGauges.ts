/**
 * River & flood gauges — the National Water Prediction Service (NWPS).
 *
 * NWPS serves no CORS headers, so everything goes through the `weather` edge
 * function (`/water/gauges`, `/water/gauge`). That function also trims the
 * observed series, which arrives a month deep at 15-minute cadence.
 *
 * Two conventions in this data are worth knowing before reading anything else:
 * a missing number is `-9999` (thresholds) or `-999` (readings), never null;
 * and `floodCategory` carries non-flood states — `not_defined`, `no_flooding`,
 * `out_of_service`, `obs_not_current` — alongside the real ones.
 */
import { BASE_API } from "../config";

export type FloodCategory =
  | "major" | "moderate" | "minor" | "action"
  | "no_flooding" | "not_defined" | "out_of_service" | "obs_not_current" | "fcst_not_current";

/** The four real flood categories, worst first. */
export const FLOOD_ORDER: FloodCategory[] = ["major", "moderate", "minor", "action"];

/** `rank` orders the list and the map: real flood states first, then normal,
 *  then the states that carry no flood information at all. */
export const FLOOD_STYLE: Record<string, { label: string; color: string; ring: string; rank: number }> = {
  major:            { label: "Major flooding",    color: "#8b46d9", ring: "rgba(139,70,217,0.30)",  rank: 4 },
  moderate:         { label: "Moderate flooding", color: "#e2373c", ring: "rgba(226,55,60,0.30)",   rank: 3 },
  minor:            { label: "Minor flooding",    color: "#e8bb4d", ring: "rgba(232,187,77,0.30)",  rank: 2 },
  action:           { label: "Near flood stage",  color: "#5fd9a8", ring: "rgba(95,217,168,0.28)",  rank: 1 },
  no_flooding:      { label: "Normal",            color: "#7f9fd8", ring: "rgba(127,159,216,0.20)", rank: 0 },
  not_defined:      { label: "No flood stage set",color: "#8f8fb0", ring: "rgba(143,143,176,0.18)", rank: -0.5 },
  obs_not_current:  { label: "Stale reading",     color: "#6f6f95", ring: "rgba(111,111,149,0.16)", rank: -0.7 },
  fcst_not_current: { label: "No current forecast", color: "#6f6f95", ring: "rgba(111,111,149,0.16)", rank: -0.7 },
  out_of_service:   { label: "Out of service",    color: "#4f4f6a", ring: "rgba(79,79,106,0.14)",   rank: -1 },
};

export function floodStyle(c: string | undefined) {
  return FLOOD_STYLE[c ?? "not_defined"] ?? FLOOD_STYLE.not_defined;
}

/** NWPS uses sentinel numbers rather than nulls. */
export function real(n: number | null | undefined): number | null {
  if (n == null) return null;
  if (n <= -900) return null;
  return n;
}

export interface GaugeReading {
  primary: number | null;
  primaryUnit: string;
  secondary: number | null;
  secondaryUnit: string;
  floodCategory: FloodCategory;
  validTime: string | null;
}

export interface GaugeSummary {
  lid: string;
  name: string;
  state: string;
  wfo: string;
  latitude: number;
  longitude: number;
  observed: GaugeReading | null;
  forecast: GaugeReading | null;
  /** Worst of observed/forecast — what the map colours by. */
  worst: FloodCategory;
}

interface RawReading {
  primary?: number; primaryUnit?: string;
  secondary?: number; secondaryUnit?: string;
  floodCategory?: string; validTime?: string;
}

function toReading(r: RawReading | undefined): GaugeReading | null {
  if (!r) return null;
  const validTime = r.validTime && !r.validTime.startsWith("0001") ? r.validTime : null;
  return {
    primary: real(r.primary),
    primaryUnit: r.primaryUnit || "ft",
    secondary: real(r.secondary),
    secondaryUnit: r.secondaryUnit || "",
    floodCategory: (r.floodCategory ?? "not_defined") as FloodCategory,
    validTime,
  };
}

export async function listGauges(bbox: { xmin: number; ymin: number; xmax: number; ymax: number }): Promise<GaugeSummary[]> {
  const q = new URLSearchParams({
    xmin: bbox.xmin.toFixed(3), ymin: bbox.ymin.toFixed(3),
    xmax: bbox.xmax.toFixed(3), ymax: bbox.ymax.toFixed(3),
  });
  const r = await fetch(`${BASE_API}/water/gauges?${q}`);
  if (!r.ok) throw new Error(`gauges ${r.status}`);
  const d = await r.json();
  const rows = Array.isArray(d?.gauges) ? d.gauges : [];
  return rows.map((g: Record<string, never>) => {
    const raw = g as unknown as {
      lid: string; name: string; latitude: number; longitude: number;
      state?: { abbreviation?: string }; wfo?: { abbreviation?: string };
      status?: { observed?: RawReading; forecast?: RawReading };
    };
    const observed = toReading(raw.status?.observed);
    const forecast = toReading(raw.status?.forecast);
    const ro = floodStyle(observed?.floodCategory).rank;
    const rf = floodStyle(forecast?.floodCategory).rank;
    const worst = (rf > ro ? forecast?.floodCategory : observed?.floodCategory) ?? "not_defined";
    return {
      lid: raw.lid, name: raw.name,
      state: raw.state?.abbreviation ?? "", wfo: raw.wfo?.abbreviation ?? "",
      latitude: raw.latitude, longitude: raw.longitude,
      observed, forecast, worst: worst as FloodCategory,
    };
  }).filter((g: GaugeSummary) => Number.isFinite(g.latitude) && Number.isFinite(g.longitude));
}

export interface SeriesPoint { t: number; stage: number; flow: number | null }

export interface GaugeDetail {
  lid: string;
  name: string;
  description: string;
  usgsId: string | null;
  state: string;
  county: string;
  wfo: string;
  latitude: number;
  longitude: number;
  stageUnit: string;
  flowUnit: string;
  /** Threshold stages, sentinel values already stripped. */
  thresholds: { action: number | null; minor: number | null; moderate: number | null; major: number | null };
  /** Record crest, when one is published. */
  recordCrest: { stage: number; when: string } | null;
  /** Impact statements keyed by the stage they begin at, ascending. */
  impacts: { stage: number; text: string }[];
  observed: SeriesPoint[];
  forecast: SeriesPoint[];
  observedIssued: string | null;
  forecastIssued: string | null;
  category: FloodCategory;
  inundationUrl: string | null;
}

export async function getGauge(lid: string): Promise<GaugeDetail> {
  const r = await fetch(`${BASE_API}/water/gauge?lid=${encodeURIComponent(lid)}`);
  if (!r.ok) throw new Error(`gauge ${r.status}`);
  const d = await r.json();
  const g = d.detail ?? {};
  const cats = g.flood?.categories ?? {};
  const th = (k: string) => real(cats?.[k]?.stage);

  const series = (s: { data?: { validTime: string; primary: number; secondary?: number }[] } | null): SeriesPoint[] =>
    (s?.data ?? [])
      .map((p) => ({ t: Date.parse(p.validTime), stage: p.primary, flow: real(p.secondary) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.stage) && p.stage > -900)
      .sort((a, b) => a.t - b.t);

  const historic: { stage?: number; occurredTime?: string }[] = g.flood?.crests?.historic ?? [];
  const record = historic.reduce<{ stage: number; when: string } | null>((best, c) => {
    const s = real(c.stage);
    if (s == null || !c.occurredTime) return best;
    return !best || s > best.stage ? { stage: s, when: c.occurredTime } : best;
  }, null);

  const impacts = (g.impactsLowWaters ?? [])
    .map((i: { stage?: number; statement?: string }) => ({ stage: real(i.stage) ?? NaN, text: (i.statement ?? "").trim() }))
    .filter((i: { stage: number; text: string }) => Number.isFinite(i.stage) && i.text.length > 0)
    .sort((a: { stage: number }, b: { stage: number }) => a.stage - b.stage);

  return {
    lid: g.lid ?? lid,
    name: g.name ?? lid,
    description: (g.description ?? "").trim(),
    usgsId: g.usgsId || null,
    state: g.state?.abbreviation ?? "",
    county: g.county ?? "",
    wfo: g.wfo?.abbreviation ?? "",
    latitude: g.latitude, longitude: g.longitude,
    stageUnit: g.flood?.stageUnits ?? "ft",
    flowUnit: g.flood?.flowUnits ?? "cfs",
    thresholds: { action: th("action"), minor: th("minor"), moderate: th("moderate"), major: th("major") },
    recordCrest: record,
    impacts,
    observed: series(d.observed),
    forecast: series(d.forecast),
    observedIssued: d.observed?.issuedTime ?? null,
    forecastIssued: d.forecast?.issuedTime ?? null,
    category: (g.status?.observed?.floodCategory ?? "not_defined") as FloodCategory,
    inundationUrl: g.inundation?.url ?? null,
  };
}
