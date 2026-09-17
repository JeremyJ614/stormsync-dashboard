/**
 * Fire weather — SPC outlooks, red flag alerts, live incidents, and a locally
 * computed Hot-Dry-Windy index.
 *
 * SPC publishes no GeoJSON for fire weather (unlike the convective outlooks),
 * only KMZ, so `/spc/fire-outlook` unzips and converts it in the edge function.
 * InciWeb writes incident positions into prose rather than geo tags; those are
 * parsed there too.
 */
import { BASE_API } from "../config";

/** SPC's own risk ladder, weakest first. */
export const FIRE_RISK: Record<string, { label: string; color: string; rank: number }> = {
  ELEV: { label: "Elevated", color: "#e8a33d", rank: 1 },
  SCT:  { label: "Scattered dry thunderstorms", color: "#b08968", rank: 1 },
  IDRT: { label: "Isolated dry thunderstorms", color: "#c5a393", rank: 1 },
  CRIT: { label: "Critical", color: "#e2373c", rank: 2 },
  SDRT: { label: "Scattered dry thunderstorms", color: "#a2705a", rank: 2 },
  EXTM: { label: "Extremely critical", color: "#c026d3", rank: 3 },
};

export function riskOf(label: string) {
  return FIRE_RISK[label] ?? { label: label || "Risk area", color: "#e8a33d", rank: 1 };
}

export interface FireOutlook {
  features: GeoJSON.Feature[];
  valid: string | null;
  expire: string | null;
  forecaster: string;
  /** Highest-ranked label present, or null on a quiet day. */
  worst: string | null;
}

export async function getFireOutlook(day: 1 | 2 | 3): Promise<FireOutlook> {
  const r = await fetch(`${BASE_API}/spc/fire-outlook?day=${day}`);
  if (!r.ok) throw new Error(`fire outlook ${r.status}`);
  const d = await r.json();
  const features: GeoJSON.Feature[] = d.features ?? [];
  const worst = features.reduce<string | null>((best, f) => {
    const lab = String(f.properties?.label ?? "");
    if (!lab) return best;
    return !best || riskOf(lab).rank > riskOf(best).rank ? lab : best;
  }, null);
  const p = features[0]?.properties as Record<string, string> | undefined;
  return {
    features,
    valid: p?.valid ?? null,
    expire: p?.expire ?? null,
    forecaster: p?.forecaster ?? "",
    worst,
  };
}

export interface Incident {
  title: string; link: string; description: string;
  published: string | null; state: string; acres: number | null;
  latitude: number | null; longitude: number | null;
}

export async function listIncidents(): Promise<Incident[]> {
  const r = await fetch(`${BASE_API}/fire/incidents`);
  if (!r.ok) return [];
  const d = await r.json();
  return (d.incidents ?? []) as Incident[];
}

// ── Hot-Dry-Windy ────────────────────────────────────────────────────────────
/**
 * The Hot-Dry-Windy index (Srock et al., 2018) — the operational fire-weather
 * index that best tracks days on which fires actually run. It is the product of
 * vapour pressure deficit and wind speed, taken at the worst hour of the day,
 * so it captures the combination rather than any single ingredient.
 *
 * Computed here from Open-Meteo fields the app already fetches, in SI (hPa·m/s)
 * exactly as the paper defines it.
 */
export function vpdHpa(tempC: number, rhPct: number): number {
  // Tetens saturation vapour pressure, hPa.
  const es = 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
  return Math.max(0, es * (1 - Math.min(100, Math.max(0, rhPct)) / 100));
}

export function hdw(tempC: number, rhPct: number, windMs: number): number {
  return vpdHpa(tempC, rhPct) * Math.max(0, windMs);
}

/** Plain-language bands. Thresholds follow the climatological percentiles the
 *  index is normally read against. */
export function hdwBand(v: number): { label: string; color: string; note: string } {
  if (v >= 500) return { label: "Extreme", color: "#c026d3", note: "Conditions on the order of the worst fire days on record." };
  if (v >= 300) return { label: "Very high", color: "#e2373c", note: "Fires that start will be difficult to contain." };
  if (v >= 150) return { label: "High", color: "#e8a33d", note: "Rapid spread likely in receptive fuels." };
  if (v >= 60)  return { label: "Moderate", color: "#e8bb4d", note: "Fire will carry, but conditions are manageable." };
  return { label: "Low", color: "#5fd9a8", note: "Little support for rapid fire spread." };
}

export interface FireHour {
  t: number; tempC: number; rh: number; windMs: number; gustMs: number; hdw: number;
}

/** Hourly fire-weather ingredients for one point, two days out. */
export async function getFireHours(lat: number, lon: number): Promise<FireHour[]> {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4),
    hourly: "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m",
    forecast_days: "3", timezone: "auto", wind_speed_unit: "ms",
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!r.ok) throw new Error(`open-meteo ${r.status}`);
  const d = await r.json();
  const h = d.hourly ?? {};
  const times: string[] = h.time ?? [];
  return times.map((t, i) => {
    const tempC = h.temperature_2m?.[i] ?? 0;
    const rh = h.relative_humidity_2m?.[i] ?? 100;
    const windMs = h.wind_speed_10m?.[i] ?? 0;
    return {
      t: Date.parse(t),
      tempC, rh, windMs,
      gustMs: h.wind_gusts_10m?.[i] ?? windMs,
      hdw: hdw(tempC, rh, windMs),
    };
  }).filter((x) => Number.isFinite(x.t));
}
