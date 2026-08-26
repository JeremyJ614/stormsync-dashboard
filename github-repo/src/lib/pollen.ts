/**
 * Pollen & allergy.
 *
 * A note on sources, because this module makes a claim about someone's health
 * and the claim has to be defensible.
 *
 * There is no free, official, unauthenticated pollen-count feed for the United
 * States. Three things were checked before writing this:
 *
 *  - Open-Meteo does carry pollen fields, but only over the CAMS European
 *    domain. Requested for Oklahoma City every field returns null for every
 *    hour — including via `domains=cams_global`. Verified against Berlin, which
 *    returns real values, so it is coverage and not a malformed request.
 *  - pollen.com serves a JSON endpoint that does cover US ZIPs, and it answers
 *    405 unless a `Referer` from its own site is forged. That is an internal
 *    endpoint of a commercial product, not a public API, and this app is about
 *    to be sold — so it is deliberately not used.
 *  - Google's Pollen API is official, documented, US-wide, and gives exactly
 *    the per-species depth this module wants. It needs an API key. When
 *    `GOOGLE_POLLEN_KEY` is set on the weather function, `fetchPollenForecast`
 *    returns real counts and species; until then it reports that plainly and
 *    the module shows no pollen numbers at all rather than inventing any.
 *
 * What *does* work today, with no key and no scraping, is the meteorology that
 * governs whether pollen actually gets into the air and into someone's face.
 * That is real science and real data, and it is labelled as what it is — a
 * dispersal reading, never a pollen count.
 */
import { BASE_API } from "../config";

// ─── the part that needs a key ───────────────────────────────────────────────
export type PollenBand = "none" | "very_low" | "low" | "moderate" | "high" | "very_high";

export interface PollenType {
  code: string;
  label: string;
  index: number;          // Google Universal Pollen Index, 0–5
  band: PollenBand;
  inSeason: boolean;
  advice: string | null;
}

export interface PollenSpecies {
  code: string;
  label: string;
  family: string | null;
  index: number;
  band: PollenBand;
  inSeason: boolean;
}

export interface PollenDay {
  date: string;
  types: PollenType[];
  species: PollenSpecies[];
}

export interface PollenForecast {
  available: true;
  days: PollenDay[];
}

export interface PollenUnavailable {
  available: false;
  /** Why, in words a member should see rather than a status code. */
  reason: string;
}

export const POLLEN_BAND: Record<PollenBand, { label: string; color: string }> = {
  none:      { label: "None",      color: "#5f6b8a" },
  very_low:  { label: "Very low",  color: "#5fd9a8" },
  low:       { label: "Low",       color: "#9ed94f" },
  moderate:  { label: "Moderate",  color: "#e8bb4d" },
  high:      { label: "High",      color: "#f97316" },
  very_high: { label: "Very high", color: "#e2373c" },
};

export async function fetchPollenForecast(
  lat: number, lon: number,
): Promise<PollenForecast | PollenUnavailable> {
  const res = await fetch(`${BASE_API}/pollen?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
  if (res.status === 501) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    return { available: false, reason: body.error ?? "Pollen source not configured." };
  }
  if (!res.ok) return { available: false, reason: `Pollen source returned ${res.status}.` };
  const body = await res.json() as PollenForecast | PollenUnavailable;
  return body;
}

// ─── the part that works today ───────────────────────────────────────────────
/**
 * How readily pollen is being released and carried, hour by hour.
 *
 * This is not a count and never claims to be. It is the dispersal side of
 * exposure, which is the half that changes day to day and the half a forecast
 * can actually tell you:
 *
 *  - Wind moves grains. Still air keeps them local; a stiff breeze carries them
 *    for miles, and gusts lift settled pollen back off the ground.
 *  - Dry air keeps them airborne. Above roughly 70% humidity grains take on
 *    water, get heavy and fall out; below about 40% they stay up for hours.
 *  - Rain scrubs the air. An hour of steady rain clears it almost completely,
 *    and the effect lasts a few hours after it stops.
 *  - Warmth opens anthers. Most species release on warming mornings, which is
 *    why the curve peaks mid-morning rather than at the hottest hour.
 */
export interface DispersalHour {
  time: string;
  score: number;          // 0–100
  band: DispersalBand;
  temperature: number;
  humidity: number;
  wind: number;
  gust: number;
  precip: number;
}

export type DispersalBand = "minimal" | "low" | "moderate" | "high" | "extreme";

export const DISPERSAL_BAND: Record<DispersalBand, { label: string; color: string; blurb: string }> = {
  minimal:  { label: "Minimal",  color: "#5fd9a8", blurb: "Little is getting airborne." },
  low:      { label: "Low",      color: "#9ed94f", blurb: "Some release, not travelling far." },
  moderate: { label: "Moderate", color: "#e8bb4d", blurb: "Normal late-summer conditions." },
  high:     { label: "High",     color: "#f97316", blurb: "Dry and breezy — grains carrying well." },
  extreme:  { label: "Extreme",  color: "#e2373c", blurb: "About as bad as the air gets for this." },
};

export function bandOf(score: number): DispersalBand {
  if (score >= 78) return "extreme";
  if (score >= 58) return "high";
  if (score >= 36) return "moderate";
  if (score >= 18) return "low";
  return "minimal";
}

interface Hourly {
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  dew_point_2m: number[];
  precipitation: number[];
  wind_speed_10m: number[];
  wind_gusts_10m: number[];
}

export async function fetchDispersal(lat: number, lon: number): Promise<DispersalHour[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,wind_speed_10m,wind_gusts_10m` +
    `&forecast_days=5&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const { hourly } = await res.json() as { hourly: Hourly };

  const out: DispersalHour[] = [];
  for (let i = 0; i < hourly.time.length; i++) {
    const t = hourly.temperature_2m[i];
    const rh = hourly.relative_humidity_2m[i];
    const wind = hourly.wind_speed_10m[i];
    const gust = hourly.wind_gusts_10m[i];
    const precip = hourly.precipitation[i];

    // Rain in the preceding three hours, for the washout term.
    let recent = 0;
    for (let k = Math.max(0, i - 3); k <= i; k++) recent += hourly.precipitation[k] ?? 0;

    out.push({
      time: hourly.time[i],
      score: dispersalScore({ temp: t, humidity: rh, wind, gust, recentPrecip: recent, hour: new Date(hourly.time[i]).getHours() }),
      band: "minimal", // filled below
      temperature: t, humidity: rh, wind, gust, precip,
    });
  }
  for (const h of out) h.band = bandOf(h.score);
  return out;
}

/**
 * The terms are multiplicative rather than additive on purpose: rain does not
 * "subtract points" from a windy day, it shuts the whole thing down. An
 * additive model would still call a downpour moderate because the wind term
 * stayed high.
 */
export function dispersalScore(x: {
  temp: number; humidity: number; wind: number; gust: number; recentPrecip: number; hour: number;
}): number {
  // Release — anthers open as the morning warms; cold shuts it down.
  const warmth = clamp01((x.temp - 42) / 38);
  // Most species shed on a warming morning; a second, smaller afternoon term
  // covers ragweed, which peaks later.
  const diurnal =
    x.hour >= 5 && x.hour <= 11 ? 1
    : x.hour >= 12 && x.hour <= 17 ? 0.72
    : x.hour >= 18 && x.hour <= 21 ? 0.4
    : 0.18;

  // Suspension — dry air keeps grains up, humid air drops them.
  const dryness = clamp01((78 - x.humidity) / 42);

  // Transport — wind carries; gusts re-loft what has settled.
  const carry = clamp01(x.wind / 18) * 0.7 + clamp01(x.gust / 32) * 0.3;

  // Washout — rain clears the air, and the effect persists for a few hours.
  const washout = x.recentPrecip >= 0.2 ? 0.06 : x.recentPrecip >= 0.05 ? 0.35 : x.recentPrecip > 0 ? 0.7 : 1;

  const raw = warmth * diurnal * (0.35 + 0.65 * dryness) * (0.3 + 0.7 * carry) * washout;
  return Math.round(clamp01(raw) * 100);
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The next window worth avoiding, if there is one in the next two days. */
export function worstWindow(hours: DispersalHour[]): { start: string; score: number } | null {
  const soon = hours.slice(0, 48);
  if (!soon.length) return null;
  let best = soon[0];
  for (const h of soon) if (h.score > best.score) best = h;
  return best.score >= 36 ? { start: best.time, score: best.score } : null;
}

/** Today's hours, for the curve. */
export function todayHours(hours: DispersalHour[]): DispersalHour[] {
  if (!hours.length) return [];
  const day = hours[0].time.slice(0, 10);
  return hours.filter((h) => h.time.slice(0, 10) === day);
}

/** Daily peaks, for the multi-day strip. */
export function dailyPeaks(hours: DispersalHour[]): { date: string; peak: number; band: DispersalBand }[] {
  const byDay = new Map<string, number>();
  for (const h of hours) {
    const d = h.time.slice(0, 10);
    byDay.set(d, Math.max(byDay.get(d) ?? 0, h.score));
  }
  return [...byDay.entries()].map(([date, peak]) => ({ date, peak, band: bandOf(peak) }));
}
