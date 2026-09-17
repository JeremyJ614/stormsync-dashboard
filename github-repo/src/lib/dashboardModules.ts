/**
 * The dashboard's module wall: one tile per module, and what each one reads.
 *
 * WHAT THIS REPLACED
 * The dashboard was a second forecast page — a hero, a stat grid, seven-day
 * charts, a wind compass — sitting one tap from the Daily Brief, which is a
 * better forecast page. It also carried a handful of module widgets buried
 * among them, which was the only part that was actually a dashboard.
 *
 * Now it is only that part, for every module, and the point of it is the
 * question a dashboard is supposed to answer: WHERE SHOULD I LOOK TODAY.
 * Forty tiles that all say their own name answer nothing; a wall where two are
 * lit answers it immediately.
 *
 * THE RULE EVERY READING FOLLOWS
 * A tile may only read data the page has already fetched. Open-Meteo's current,
 * hourly and daily blocks for the member's location, plus the NWS alerts for
 * the same point — that is the whole budget, and it is one request each. Forty
 * tiles each fetching their own module's data would be forty requests to open a
 * page nobody has asked a question of yet.
 *
 * So a reading is a real number where the shared data contains one, and null
 * where it does not. `null` is not a failure and must not be papered over: the
 * tile simply shows its identity and stays a way in. Inventing a plausible
 * figure for a module whose data is not here would make the wall useless for
 * exactly the purpose it exists for.
 *
 * `tone` drives how loud the tile is. It is the whole design: a wall of forty
 * calm tiles with two burning is readable at a glance, and that is the only
 * thing this page has to be.
 */
import type { LucideIcon } from "lucide-react";
import { NAV_SECTIONS } from "./navModel";
import { moonIllumination } from "./astro";
import type { Visual } from "../components/dashboard/TileVisual";

/** How much a tile should shout. */
export type Tone = "quiet" | "notable" | "alert";

export interface Reading {
  /** The headline figure. Short — this is set at display size. */
  value: string;
  /** Unit or suffix, set small beside the value. */
  unit?: string;
  /** One clause of context underneath. */
  note?: string;
  tone?: Tone;
  /** 0-1, for tiles that draw a meter. Omitted means no meter. */
  fill?: number;
  /**
   * A small drawing, where the shared data holds a series or an angle.
   *
   * A number tells you the value and nothing about the SHAPE, which is most of
   * what a glance is for: 74°F says nothing about whether the afternoon falls
   * off a cliff, and 60% says nothing about whether the storm is at four
   * o'clock or spread across the evening. Where a visual is present it replaces
   * the meter, because two bars saying the same thing is one bar too many.
   */
  visual?: Visual;
}

/**
 * Everything a reading is allowed to look at.
 *
 * Three shared sources and a clock. `air` and `runs` were added when the wall
 * was cut down to live tiles only: with the "Open the module" plates gone,
 * one more request buying three more real readings is a better trade than a
 * thinner wall. Both are react-query cached, so the modules they belong to
 * reuse the same response rather than fetching it again.
 */
export interface TileContext {
  /** Open-Meteo response for the member's location, or null while loading. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wx: any;
  /** Active NWS alerts for the point. */
  alerts: { event?: string; severity?: string; headline?: string }[];
  /** Open-Meteo air quality for the same point — us_aqi and uv_index hourly. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  air: any;
  /** The most recent rendered model runs, newest first. */
  runs: { model: string; cycle: string; params: { key: string }[]; maxFhr: number }[];
  /** Index into `hourly` for the current hour, or -1. */
  hour: number;
  now: Date;
}

export interface ModuleTile {
  path: string;
  label: string;
  icon: LucideIcon;
  section: string;
  /** A live figure, or null when the shared data cannot answer for this module. */
  read?: (c: TileContext) => Reading | null;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const hourly = (c: TileContext, key: string): number | null =>
  c.hour < 0 ? null : num(c.wx?.hourly?.[key]?.[c.hour]);

/**
 * The air-quality series at the current hour.
 *
 * It carries its own time axis and does not necessarily start where the
 * forecast does, so `c.hour` cannot be reused — the index is found by matching
 * the hour stamp. Getting this wrong is the bug that once had every air-quality
 * figure in the app reporting the atmosphere as it had been at midnight.
 */
function airNow(c: TileContext, key: string): number | null {
  const t = c.wx?.hourly?.time?.[c.hour];
  const times = c.air?.hourly?.time;
  if (typeof t !== "string" || !Array.isArray(times)) return null;
  const i = times.indexOf(t);
  return i < 0 ? null : num(c.air?.hourly?.[key]?.[i]);
}

const daily = (c: TileContext, key: string, day = 0): number | null =>
  num(c.wx?.daily?.[key]?.[day]);

const cToF = (v: number) => v * 9 / 5 + 32;
const msToMph = (v: number) => v * 2.236936;

/** Highest value over the next `n` hours from now. */
function peak(c: TileContext, key: string, n: number): { value: number; at: number } | null {
  const arr = c.wx?.hourly?.[key];
  if (!Array.isArray(arr) || c.hour < 0) return null;
  let best: { value: number; at: number } | null = null;
  for (let i = c.hour; i < Math.min(arr.length, c.hour + n); i++) {
    const v = num(arr[i]);
    if (v === null) continue;
    if (!best || v > best.value) best = { value: v, at: i };
  }
  return best;
}

/**
 * The next `n` hours of an hourly field, from now.
 *
 * Returns null rather than a short array when the block cannot supply the whole
 * window: a sparkline over four hours drawn in the same box as one over
 * twenty-four is a different chart wearing the same clothes, and nobody reading
 * a wall of them would notice the axis had changed under them.
 */
function series(c: TileContext, key: string, n: number): number[] | null {
  const arr = c.wx?.hourly?.[key];
  if (!Array.isArray(arr) || c.hour < 0 || c.hour + n > arr.length) return null;
  const out: number[] = [];
  for (let i = c.hour; i < c.hour + n; i++) {
    const v = num(arr[i]);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

/** "in 3h" / "now", from an hourly index. */
function whenFrom(c: TileContext, idx: number): string {
  const d = idx - c.hour;
  return d <= 0 ? "now" : d === 1 ? "next hour" : `in ${d}h`;
}

// ── the readings ─────────────────────────────────────────────────────────────
//
// Each is written against the shared blocks only, and each returns null rather
// than a guess. Thresholds are the ones the modules themselves use where the
// module has one, so a tile and the page it opens never disagree.

const READ: Record<string, (c: TileContext) => Reading | null> = {
  "/forecast": (c) => {
    const t = num(c.wx?.current?.temperature_2m);
    const hi = daily(c, "temperature_2m_max");
    const lo = daily(c, "temperature_2m_min");
    if (t === null) return null;
    const next = series(c, "temperature_2m", 24);
    return {
      value: String(Math.round(cToF(t))), unit: "°F",
      note: hi !== null && lo !== null
        ? `${Math.round(cToF(hi))}° / ${Math.round(cToF(lo))}° today` : undefined,
      visual: next ? { kind: "line", points: next.map(cToF) } : undefined,
    };
  },

  "/warnings": (c) => {
    const n = c.alerts.length;
    if (n === 0) return { value: "Clear", note: "no active alerts here", tone: "quiet" };
    const severe = c.alerts.filter(
      (a) => /tornado|severe thunderstorm|flash flood/i.test(a.event ?? "")).length;
    return {
      value: String(n), unit: n === 1 ? "alert" : "alerts",
      note: c.alerts[0]?.event,
      tone: severe > 0 ? "alert" : "notable",
    };
  },

  "/aqi": (c) => {
    const aqi = airNow(c, "us_aqi");
    if (aqi === null) return null;
    // The EPA's own bands, so the tile and the module agree on the word.
    const band = aqi <= 50 ? "good" : aqi <= 100 ? "moderate"
      : aqi <= 150 ? "unhealthy for sensitive groups" : aqi <= 200 ? "unhealthy"
      : aqi <= 300 ? "very unhealthy" : "hazardous";
    return {
      value: String(Math.round(aqi)), unit: "US AQI", note: band,
      tone: aqi > 150 ? "alert" : aqi > 100 ? "notable" : "quiet",
      // The EPA's own band edges, so the bar says which band rather than only
      // how far along an unlabelled scale the needle has travelled.
      visual: {
        kind: "gauge", value: aqi, max: 300,
        bands: [
          { at: 50, c: "#00e400" }, { at: 100, c: "#ffff00" }, { at: 150, c: "#ff7e00" },
          { at: 200, c: "#ff0000" }, { at: 300, c: "#8f3f97" },
        ],
      },
    };
  },

  "/summary": (c) => {
    const rise = c.wx?.daily?.sunrise?.[0];
    const set = c.wx?.daily?.sunset?.[0];
    if (typeof rise !== "string" || typeof set !== "string") return null;
    const mins = (Date.parse(set) - Date.parse(rise)) / 60000;
    if (!Number.isFinite(mins)) return null;
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    // Peak UV comes free with the air-quality request, and it is the thing
    // about daylight that actually changes what somebody does with the day.
    const uv = airNow(c, "uv_index");
    return {
      value: `${h}h ${m}m`,
      note: uv !== null && uv >= 1
        ? `sets ${set.slice(11, 16)} · UV ${uv.toFixed(0)} now`
        : `sets ${set.slice(11, 16)}`,
      tone: uv !== null && uv >= 8 ? "notable" : "quiet",
      // WHO's own UV bands. Length of day is the headline; what to do about the
      // sun in it is the part that changes anybody's afternoon.
      visual: uv === null ? undefined : {
        kind: "gauge", value: uv, max: 12,
        bands: [{ at: 3, c: "#2fa36b" }, { at: 6, c: "#f2e33c" }, { at: 8, c: "#f5a623" },
                { at: 11, c: "#c0392b" }, { at: 12, c: "#8e2de2" }],
      },
    };
  },

  "/sswxcon": (c) => {
    const cape = hourly(c, "cape");
    const li = hourly(c, "lifted_index");
    if (cape === null) return null;
    // The module's own bands: instability alone is not a score, so this is
    // labelled as what it is — the CAPE the score is partly built from.
    const tone: Tone = cape >= 2500 ? "alert" : cape >= 1000 ? "notable" : "quiet";
    const next = series(c, "cape", 24);
    return {
      value: String(Math.round(cape)), unit: "J/kg",
      note: li !== null ? `lifted index ${li.toFixed(1)}` : "surface CAPE",
      tone,
      visual: next ? { kind: "line", points: next } : undefined,
      fill: next ? undefined : Math.min(1, cape / 4000),
    };
  },

  "/ingredients": (c) => {
    const cape = hourly(c, "cape");
    const li = hourly(c, "lifted_index");
    if (cape === null && li === null) return null;
    if (li === null) return { value: String(Math.round(cape!)), unit: "J/kg", note: "CAPE" };
    return {
      value: li.toFixed(1), unit: "LI",
      note: li <= -6 ? "strongly unstable" : li <= -2 ? "unstable" : li <= 2 ? "marginal" : "stable",
      tone: li <= -6 ? "alert" : li <= -2 ? "notable" : "quiet",
    };
  },

  "/thunder": (c) => {
    const p = peak(c, "precipitation_probability", 12);
    if (!p) return null;
    const next = series(c, "precipitation_probability", 24);
    return {
      value: String(Math.round(p.value)), unit: "%",
      note: `peak ${whenFrom(c, p.at)}`,
      tone: p.value >= 60 ? "notable" : "quiet",
      visual: next ? { kind: "bars", points: next, max: 100 } : undefined,
      fill: next ? undefined : p.value / 100,
    };
  },

  "/timing": (c) => {
    const p = peak(c, "precipitation_probability", 24);
    const next = series(c, "precipitation_probability", 24);
    if (!p || p.value < 30) {
      return {
        value: "Nothing", note: "no storm to time today", tone: "quiet",
        visual: next ? { kind: "bars", points: next, max: 100 } : undefined,
      };
    }
    return {
      value: whenFrom(c, p.at), note: `${Math.round(p.value)}% chance at the peak`,
      tone: p.value >= 60 ? "notable" : "quiet",
      visual: next ? { kind: "bars", points: next, max: 100 } : undefined,
    };
  },

  "/swti": (c) => {
    const cape = hourly(c, "cape");
    const gust = hourly(c, "wind_gusts_10m");
    if (cape === null || gust === null) return null;
    // Deliberately not the module's index — that needs a wind profile this page
    // does not fetch. Two of its inputs, labelled as its inputs.
    const dir = hourly(c, "wind_direction_10m");
    return {
      value: `${Math.round(msToMph(gust))}`, unit: "mph gust",
      note: `with ${Math.round(cape)} J/kg`,
      tone: gust >= 22 && cape >= 1000 ? "notable" : "quiet",
      visual: dir === null ? undefined
        : { kind: "compass", deg: dir, label: `from ${Math.round(dir)}°` },
    };
  },

  "/rivers": (c) => {
    // Already inches: `fetchOpenMeteo` sets `precipitation_unit=inch`. Dividing
    // by 25.4 here turned a quarter-inch of rain into 0.01.
    const inches = daily(c, "precipitation_sum");
    if (inches === null) return null;
    return {
      value: inches.toFixed(2), unit: "in",
      note: inches > 0.005 ? "rain expected today" : "no rain expected today",
      tone: inches >= 1.5 ? "notable" : "quiet",
    };
  },

  "/fire": (c) => {
    const rh = hourly(c, "relative_humidity_2m");
    const gust = hourly(c, "wind_gusts_10m");
    if (rh === null || gust === null) return null;
    const mph = msToMph(gust);
    // The classic red-flag pairing: low humidity with wind behind it.
    const red = rh <= 25 && mph >= 20;
    return {
      value: `${Math.round(rh)}`, unit: "% RH",
      note: `${Math.round(mph)} mph gusts`,
      tone: red ? "alert" : rh <= 35 ? "notable" : "quiet",
    };
  },

  "/winter": (c) => {
    const t = num(c.wx?.current?.temperature_2m);
    if (t === null) return null;
    const f = cToF(t);
    return {
      value: String(Math.round(f)), unit: "°F",
      note: f <= 32 ? "at or below freezing" : `${Math.round(f - 32)}° above freezing`,
      tone: f <= 32 ? "notable" : "quiet",
    };
  },

  "/mosquito": (c) => {
    const t = num(c.wx?.current?.temperature_2m);
    const rh = hourly(c, "relative_humidity_2m");
    const w = hourly(c, "wind_speed_10m");
    if (t === null || rh === null) return null;
    const f = cToF(t);
    // Warm, damp and still is the combination; wind is what shuts them down.
    const warm = Math.max(0, Math.min(1, (f - 50) / 30));
    const damp = Math.max(0, Math.min(1, (rh - 40) / 45));
    const calm = w === null ? 0.7 : Math.max(0, 1 - msToMph(w) / 15);
    const score = Math.round(warm * damp * calm * 100);
    return {
      value: String(score), unit: "/100",
      note: score >= 66 ? "biting weather" : score >= 33 ? "some about" : "quiet tonight",
      tone: score >= 66 ? "notable" : "quiet",
      visual: {
        kind: "gauge", value: score, max: 100,
        bands: [{ at: 33, c: "#2fa36b" }, { at: 66, c: "#f2c14e" }, { at: 100, c: "#c0392b" }],
      },
    };
  },

  "/rotation": (c) => {
    const p = peak(c, "precipitation", 6);
    if (!p) return null;
    const next = series(c, "precipitation", 12);
    const vis: Reading["visual"] = next ? { kind: "bars", points: next } : undefined;
    // Inches already — see `/rivers`.
    return p.value >= 0.01
      ? { value: p.value.toFixed(2), unit: "in/h", note: `heaviest ${whenFrom(c, p.at)}`,
          tone: p.value >= 0.25 ? "notable" : "quiet", visual: vis }
      : { value: "Dry", note: "no rain in the next six hours", tone: "quiet", visual: vis };
  },

  "/hazards": (c) => {
    const sum = daily(c, "precipitation_sum");
    if (sum === null) return null;
    let dry = 0;
    for (let d = 0; d < 7; d++) { const v = daily(c, "precipitation_sum", d); if (v !== null && v < 0.5) dry++; }
    return { value: String(dry), unit: dry === 1 ? "dry day" : "dry days", note: "in the next week" };
  },

  "/moon": (c) => {
    // No request at all: phase is a function of the date. `moonIllumination`
    // is the same routine the astronomy module runs.
    const m = moonIllumination(c.now);
    return {
      value: `${Math.round(m.fraction * 100)}`, unit: "% lit",
      note: `${m.name}${m.fraction > 0.9 ? " — a bright night" : m.fraction < 0.1 ? " — dark skies" : ""}`,
      // A disc with a real terminator, rather than a bar measuring how lit it
      // is. A bar is the wrong instrument for a thing that has a picture.
      visual: { kind: "moon", illum: m.fraction, waxing: m.waxing },
    };
  },

  "/wpi": (c) => {
    // The week's temperature swing, from the daily block already in hand. A
    // pattern change is what this module is about, and a fifty-degree spread
    // across seven days is one.
    let hi = -Infinity, lo = Infinity;
    for (let d = 0; d < 7; d++) {
      const a = daily(c, "temperature_2m_max", d), b = daily(c, "temperature_2m_min", d);
      if (a !== null) hi = Math.max(hi, cToF(a));
      if (b !== null) lo = Math.min(lo, cToF(b));
    }
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
    const swing = Math.round(hi - lo);
    const highs: number[] = [];
    for (let d = 0; d < 7; d++) {
      const a = daily(c, "temperature_2m_max", d);
      if (a !== null) highs.push(cToF(a));
    }
    return {
      value: String(swing), unit: "°F swing",
      note: `${Math.round(lo)}° to ${Math.round(hi)}° this week`,
      tone: swing >= 45 ? "notable" : "quiet",
      // The seven highs, because a swing of forty says nothing about whether
      // the change is a front on Thursday or a slow slide all week.
      visual: highs.length === 7 ? { kind: "line", points: highs } : undefined,
    };
  },

  "/comparator": (c) => {
    const r = c.runs[0];
    if (!r) return null;
    const hh = r.cycle.slice(11, 13);
    return {
      value: `${r.model.toUpperCase()} ${hh}Z`,
      note: `${r.params.length} parameters · to F${r.maxFhr}`,
    };
  },

  "/chasing": (c) => {
    const cape = hourly(c, "cape");
    const gust = hourly(c, "wind_gusts_10m");
    if (cape === null) return null;
    const worth = cape >= 1500 && gust !== null && msToMph(gust) >= 18;
    return {
      value: worth ? "Worth a look" : cape >= 800 ? "Marginal" : "Quiet",
      note: `${Math.round(cape)} J/kg here`,
      tone: worth ? "notable" : "quiet",
    };
  },
};

// ── the wall ─────────────────────────────────────────────────────────────────
/**
 * Every module, in sidebar order, with its reading attached.
 *
 * Built from `NAV_SECTIONS` rather than a second list, so a module added to the
 * sidebar appears here automatically — with no reading until somebody writes
 * one, which is the right default. A dashboard that silently omits a module the
 * member pays for is worse than one with a quiet tile on it.
 */
export const MODULE_TILES: ModuleTile[] = NAV_SECTIONS.flatMap((s) =>
  s.items
    // Home and Dashboard are how you got here.
    .filter((i) => i.path !== "/" && i.path !== "/dashboard")
    // AND ONLY MODULES THAT CAN ACTUALLY SAY SOMETHING.
    //
    // The first version put every unlocked module on the wall and let the ones
    // with no reading show "Open the module". Two thirds of the tiles were that
    // plate, which is a navigation menu wearing a dashboard's clothes — and the
    // sidebar is already a better navigation menu. A tile earns its place by
    // carrying a number.
    //
    // The consequence is that adding a module does NOT add a tile until
    // somebody writes it a reading, which is the right way round: the wall
    // stays a set of instruments instead of filling up with placeholders.
    .filter((i) => READ[i.path])
    .map((i) => ({
      path: i.path,
      label: i.label,
      icon: i.icon as LucideIcon,
      section: s.label,
      read: READ[i.path],
    })),
);

export const TILE_SECTIONS: string[] = NAV_SECTIONS.map((s) => s.label);
