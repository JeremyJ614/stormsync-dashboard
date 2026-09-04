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

export async function fetchTornadoTracks(startISO: string, endISO: string, signal?: AbortSignal): Promise<TornadoResult> {
  const d0 = startISO.slice(0, 10), d1 = endISO.slice(0, 10);
  const where = `stormdate >= DATE '${d0}' AND stormdate <= DATE '${d1}'`;
  const qs = new URLSearchParams({
    where,
    outFields: "stormdate,efscale,efnum,fatalities,injuries,length,width,maxwind",
    f: "geojson",
    resultRecordCount: "2000",
  });
  const r = await fetch(`${DAT_LINES}?${qs}`, { signal });
  if (!r.ok) throw new Error(`DAT ${r.status}`);
  const j = await r.json() as {
    error?: unknown;
    features?: { geometry: GeoJSON.Geometry; properties: Record<string, unknown> }[];
  };
  if (j.error) throw new Error("DAT query rejected");

  const counts: Record<string, number> = {};
  let fatalities = 0, injuries = 0, highestIdx = -1;
  const features: TornadoFeature[] = [];
  for (const f of j.features ?? []) {
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
  return {
    features, counts, total: features.length, fatalities, injuries,
    highestEf: highestIdx >= 0 ? EF_ORDER[highestIdx] : "—",
  };
}

/** ISO range helper: N days back through now, both in UTC. */
export function daysBackRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 19) + "Z";
  return { start: iso(start), end: iso(end) };
}
