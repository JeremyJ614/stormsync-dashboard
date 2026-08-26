/**
 * Nowcast — the next twelve hours at fifteen-minute resolution.
 *
 * The other two tabs in this module are model *maps*: national, pre-rendered,
 * four times a day. This one is the opposite and that is the point — one point,
 * your point, stepped every fifteen minutes, refreshed on demand. It answers
 * the questions a map cannot: when does it start, when does it stop, and is the
 * atmosphere loading or unloading while it happens.
 *
 * Fields were checked against the live API before being used here.
 * `lightning_potential` exists in the schema and returns null for every US step
 * — it is an ECMWF field over Europe — so it is deliberately absent rather than
 * rendered as a flat zero line that would read as "no lightning risk".
 */
export interface NowcastStep {
  time: string;
  precip: number;          // inches (precipitation_unit=inch on the request)
  precipChance: number;    // %
  cape: number;            // J/kg
  gust: number;            // mph
  visibility: number;      // metres
  freezingLevel: number;   // metres
}

export interface Nowcast {
  steps: NowcastStep[];
  timezone: string;
}

interface Raw {
  timezone: string;
  minutely_15_units?: Record<string, string>;
  minutely_15: {
    time: string[];
    precipitation: (number | null)[];
    precipitation_probability: (number | null)[];
    cape: (number | null)[];
    wind_gusts_10m: (number | null)[];
    visibility: (number | null)[];
    freezing_level_height: (number | null)[];
  };
}

const n = (v: number | null | undefined) => (typeof v === "number" ? v : 0);

/**
 * Normalise a length to metres using the unit the API actually reported.
 *
 * Read rather than assumed, for a reason worth recording: passing
 * `precipitation_unit=inch` silently switches `freezing_level_height` *and*
 * `visibility` to feet as well. Assuming metres turned a 16,000 ft freezing
 * level into "52.6 kft" — a number no atmosphere has ever produced, sitting on
 * screen looking like data. Reading the unit means a future parameter change
 * cannot quietly corrupt these again.
 */
function toMetres(value: number, unit: string | undefined): number {
  return unit === "ft" ? value * 0.3048 : value;
}

export async function fetchNowcast(lat: number, lon: number): Promise<Nowcast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&minutely_15=precipitation,precipitation_probability,cape,wind_gusts_10m,visibility,freezing_level_height` +
    `&forecast_minutely_15=48&timezone=auto&wind_speed_unit=mph&precipitation_unit=inch`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const raw = await res.json() as Raw;
  const m = raw.minutely_15;
  const units = raw.minutely_15_units ?? {};

  return {
    timezone: raw.timezone,
    steps: m.time.map((t, i) => ({
      time: t,
      precip: n(m.precipitation[i]),
      precipChance: n(m.precipitation_probability[i]),
      cape: n(m.cape[i]),
      gust: n(m.wind_gusts_10m[i]),
      visibility: toMetres(n(m.visibility[i]), units.visibility),
      freezingLevel: toMetres(n(m.freezing_level_height[i]), units.freezing_level_height),
    })),
  };
}

// ─── reading the sequence ────────────────────────────────────────────────────
export interface RainWindow {
  startIndex: number;
  endIndex: number;
  peak: number;
  total: number;
}

/** Contiguous runs where measurable precipitation is forecast. */
export function rainWindows(steps: NowcastStep[], threshold = 0.005): RainWindow[] {
  const out: RainWindow[] = [];
  let start = -1;
  for (let i = 0; i <= steps.length; i++) {
    const wet = i < steps.length && steps[i].precip >= threshold;
    if (wet && start < 0) start = i;
    if (!wet && start >= 0) {
      const slice = steps.slice(start, i);
      out.push({
        startIndex: start,
        endIndex: i - 1,
        peak: Math.max(...slice.map((s) => s.precip)),
        total: slice.reduce((a, s) => a + s.precip, 0),
      });
      start = -1;
    }
  }
  return out;
}

/**
 * The headline sentence.
 *
 * Written as a sentence rather than assembled from labels, because the whole
 * value of a nowcast is being told the thing directly: it starts at ten past,
 * it lasts about forty minutes.
 */
export function headline(steps: NowcastStep[]): { text: string; urgent: boolean } {
  if (!steps.length) return { text: "No short-range data for this location.", urgent: false };

  const windows = rainWindows(steps);
  const fmt = (i: number) =>
    new Date(steps[i].time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const minsFromNow = (i: number) =>
    Math.round((new Date(steps[i].time).getTime() - new Date(steps[0].time).getTime()) / 60000);

  if (windows.length === 0) {
    const peakCape = Math.max(...steps.map((s) => s.cape));
    if (peakCape >= 2000) {
      return {
        text: `Nothing falling in the next twelve hours here, but the atmosphere is loaded — CAPE peaks near ${Math.round(peakCape)} J/kg. Storms that do fire will not need much of a nudge.`,
        urgent: false,
      };
    }
    return { text: "Dry through the next twelve hours at this location.", urgent: false };
  }

  const first = windows[0];
  const mins = minsFromNow(first.startIndex);
  const durationMin = (first.endIndex - first.startIndex + 1) * 15;
  const dur = durationMin >= 60
    ? `${Math.round(durationMin / 60)} hour${durationMin >= 120 ? "s" : ""}`
    : `${durationMin} minutes`;

  if (mins <= 0) {
    return {
      text: `Precipitation is falling now and looks to run about ${dur} more, peaking near ${first.peak.toFixed(2)} in per quarter hour.`,
      urgent: first.peak >= 0.1,
    };
  }
  if (mins <= 60) {
    return {
      text: `Precipitation starts around ${fmt(first.startIndex)} — about ${mins} minutes out — and runs roughly ${dur}.`,
      urgent: first.peak >= 0.1,
    };
  }
  return {
    text: `Dry for the next ${Math.round(mins / 60)} hours. First precipitation around ${fmt(first.startIndex)}, lasting about ${dur}.`,
    urgent: false,
  };
}

/** CAPE is loading or unloading — the single most useful trend in this window. */
export function capeTrend(steps: NowcastStep[]): { dir: -1 | 0 | 1; from: number; to: number; peak: number } {
  if (steps.length < 8) return { dir: 0, from: 0, to: 0, peak: 0 };
  const from = steps[0].cape;
  const to = steps[Math.min(steps.length - 1, 15)].cape; // ~4 hours out
  const peak = Math.max(...steps.map((s) => s.cape));
  const delta = to - from;
  return { dir: delta > 150 ? 1 : delta < -150 ? -1 : 0, from, to, peak };
}

export const capeBand = (j: number): { label: string; color: string } =>
  j >= 3500 ? { label: "Extreme", color: "#e2373c" }
  : j >= 2500 ? { label: "Very high", color: "#f97316" }
  : j >= 1500 ? { label: "High", color: "#e8bb4d" }
  : j >= 750 ? { label: "Moderate", color: "#9ed94f" }
  : j >= 250 ? { label: "Marginal", color: "#5fd9a8" }
  : { label: "Minimal", color: "#5f6b8a" };

/** Visibility in miles, which is how it is read in the field. */
export const miles = (metres: number): number => metres / 1609.34;
