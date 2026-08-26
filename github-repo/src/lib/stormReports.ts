/**
 * Local Storm Reports — what people on the ground actually saw.
 *
 * Source is the Iowa Environmental Mesonet's LSR archive, which aggregates the
 * LSR products every NWS office issues. These are the ground truth behind a
 * warning: a spotter, a trained observer, a mesonet sensor or a damage survey,
 * with a time, a place and usually a magnitude.
 *
 * Note on the endpoint: `fmt` must be `geojson`. It used to accept `json`, and
 * the app's older reports page still asked for that — IEM now answers a 422 and
 * the page rendered permanently empty. Anything calling this should go through
 * here rather than rebuilding the URL.
 */
import { TTL } from "./queryClient";

export interface StormReport {
  id: string;
  type: ReportKind;
  typeText: string;
  magnitude: number | null;
  unit: string;
  city: string;
  county: string;
  state: string;
  source: string;
  remark: string;
  lat: number;
  lon: number;
  valid: string;
  wfo: string;
}

export type ReportKind =
  | "tornado" | "funnel" | "hail" | "wind" | "flood" | "snow" | "fire" | "lightning" | "other";

interface RawProps {
  typetext?: string; magnitude?: string | number; unit?: string;
  city?: string; county?: string; state?: string; st?: string;
  source?: string; remark?: string; lat?: number; lon?: number;
  valid?: string; wfo?: string; product_id?: string;
}

/**
 * LSR type text is free-ish, so this matches on substrings rather than an
 * enumeration — new phrasings then fall into "other" instead of vanishing.
 */
function classify(text: string): ReportKind {
  const t = text.toUpperCase();
  if (t.includes("TORNADO")) return "tornado";
  if (t.includes("FUNNEL")) return "funnel";
  if (t.includes("HAIL")) return "hail";
  if (t.includes("WND") || t.includes("WIND")) return "wind";
  if (t.includes("FLOOD")) return "flood";
  if (t.includes("SNOW") || t.includes("SLEET") || t.includes("ICE") || t.includes("BLIZZARD")) return "snow";
  if (t.includes("FIRE")) return "fire";
  if (t.includes("LIGHTNING")) return "lightning";
  return "other";
}

export const KIND_STYLE: Record<ReportKind, { label: string; color: string; rank: number }> = {
  tornado:   { label: "Tornado",       color: "#e2373c", rank: 0 },
  funnel:    { label: "Funnel cloud",  color: "#f97316", rank: 1 },
  hail:      { label: "Hail",          color: "#e8bb4d", rank: 2 },
  wind:      { label: "Wind",          color: "#c084fc", rank: 3 },
  flood:     { label: "Flooding",      color: "#5fa8d9", rank: 4 },
  snow:      { label: "Snow & ice",    color: "#ccccff", rank: 5 },
  fire:      { label: "Fire",          color: "#fb923c", rank: 6 },
  lightning: { label: "Lightning",     color: "#fde047", rank: 7 },
  other:     { label: "Other",         color: "#8f8fb0", rank: 8 },
};

const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}` +
  `${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;

export async function fetchLocalStormReports(hours = 24): Promise<StormReport[]> {
  const ets = new Date();
  const sts = new Date(ets.getTime() - hours * 3600_000);
  const url =
    `https://mesonet.agron.iastate.edu/geojson/lsr.php` +
    `?sts=${stamp(sts)}&ets=${stamp(ets)}&fmt=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`IEM LSR ${res.status}`);
  const data = await res.json() as {
    features?: { properties?: RawProps; geometry?: { coordinates?: [number, number] } }[];
  };

  const out: StormReport[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties ?? {};
    const typeText = (p.typetext ?? "").trim();
    if (!typeText) continue;
    const [lon, lat] = f.geometry?.coordinates ?? [p.lon ?? 0, p.lat ?? 0];
    const magRaw = p.magnitude;
    const mag = magRaw === undefined || magRaw === null || magRaw === ""
      ? null
      : Number(magRaw);
    out.push({
      id: `${p.product_id ?? ""}:${p.valid ?? ""}:${lat},${lon}:${typeText}`,
      type: classify(typeText),
      typeText,
      magnitude: mag !== null && Number.isFinite(mag) ? mag : null,
      unit: (p.unit ?? "").trim(),
      city: (p.city ?? "").trim(),
      county: (p.county ?? "").trim(),
      state: (p.st ?? p.state ?? "").trim(),
      source: (p.source ?? "").trim(),
      remark: (p.remark ?? "").trim(),
      lat, lon,
      valid: p.valid ?? "",
      wfo: (p.wfo ?? "").trim(),
    });
  }

  out.sort((a, b) => (b.valid > a.valid ? 1 : b.valid < a.valid ? -1 : 0));
  return out;
}

export const REPORTS_TTL = TTL.quick;

/** Great-circle distance in miles — for the "near me" filter. */
export function milesBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * How a magnitude should read for its kind.
 *
 * Hail is inches and wants two decimals dropped to a natural size ("1.75 in");
 * wind is whole mph. A bare number with no unit is worse than no number, so
 * anything unrecognised returns null and the caller omits it.
 */
export function magnitudeLabel(r: StormReport): string | null {
  if (r.magnitude === null || r.magnitude === 0) return null;
  if (r.type === "hail") return `${r.magnitude.toFixed(2).replace(/0$/, "")} in`;
  if (r.type === "wind") return `${Math.round(r.magnitude)} ${r.unit || "MPH"}`;
  if (r.unit) return `${r.magnitude} ${r.unit}`;
  return null;
}

/** Reports that would make a forecaster sit up, for the summary line. */
export function notable(reports: StormReport[]): StormReport[] {
  return reports.filter((r) =>
    r.type === "tornado" ||
    (r.type === "hail" && (r.magnitude ?? 0) >= 2) ||
    (r.type === "wind" && (r.magnitude ?? 0) >= 70));
}
