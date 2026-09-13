/**
 * The Storm Chasing outlook, client side.
 *
 * Everything on this page comes from one row that the `chase-target` edge
 * function wrote this morning. The browser does no scanning, no scoring and no
 * AI work: it reads the row and draws it. That is why the module opens instantly
 * and costs nothing per view, and it is also why two people looking at it are
 * guaranteed to be looking at the same forecast.
 *
 * The types below mirror the JSON the engine writes. Where a field can be
 * missing, it is optional here rather than defaulted, so the page can say "not
 * available" instead of showing a confident zero.
 */
import { supabase } from "./supabase";

export interface ChaseParams {
  cape: number; cin: number; lifted_index: number;
  temp_f: number; dew_f: number; mixing_ratio: number;
  lcl_agl_m: number; lcl_agl_ft: number; pbl_m: number;
  shear_06_kt: number; shear_01_kt: number;
  srh_01: number; srh_03: number;
  stp: number; scp: number; ship: number; ehi: number;
  lapse_75: number; lapse_03: number;
  temp_500: number; temp_850: number;
  rh_700: number; rh_850: number;
  freezing_level_ft: number; wbz_ft: number;
  omega_700: number;
  precip_probability: number; cloud_cover_low: number;
  surface_pressure: number;
}

export interface ChaseStormMode {
  mode: string;
  flavour: "HP" | "Classic" | "LP" | "n/a";
  motion_mph: number;
  motion_toward_deg: number;
  hail_in: number;
  hail_word: string;
  note: string;
  hail_note: string | null;
  tornado_note: string | null;
  wind_note: string | null;
  extra_notes: string[];
}

export interface ChaseTarget {
  rank: number;
  lat: number; lon: number;
  place: string; name: string; state: string;
  score: number;
  spc_category: string | null;
  spc_category_name: string | null;
  spc_tornado_pct: number; spc_hail_pct: number; spc_wind_pct: number;
  why: string;
  peak_hour: string; sunset: string; hours_to_sunset: number;
  terrain_score: number; daylight_score: number;
  terrain_detail?: TerrainDetail | null;
  params: ChaseParams;
  storm_mode: ChaseStormMode;
  bust: { probability: number; word: string; summary: string };
}

export interface ChaseYearContext {
  days_scored: number | null;
  best_score: number | null;
  best_date: string | null;
  median_score: number | null;
  above_seven: number | null;
  percentile: number | null;
  /**
   * The earliest day in the ledger. Added with the historical backfill: "beats
   * 74% of this year" means one thing over seven days and quite another over a
   * whole season, and the page should be able to say which it is.
   */
  first_date?: string | null;
}

/**
 * What a terrain score is made of.
 *
 * Present on rows written after the terrain rewrite; absent on older ones,
 * which is why every field is optional rather than defaulted — a target scored
 * under the old flat-100 scheme should say nothing rather than claim a
 * breakdown it never had.
 */
export interface TerrainDetail {
  score: number;
  trees: number | null;
  rugged: number | null;
  sight: number | null;
  roads: number | null;
  confidence: number;
  detail: {
    canopy_pct: number | null;
    forest_frac: number | null;
    tri_m: number | null;
    relief_m: number | null;
    slope_pct: number | null;
    horizon_deg: number | null;
    road_km_per_100km2: number | null;
    road_grid_frac: number | null;
  };
}

export interface ChaseOutlook {
  outlook_date: string;
  status: "ok" | "skipped" | "error";
  model: string | null;
  day_score: number;
  day_label: string;
  headline: string | null;
  overview: string | null;
  targets: ChaseTarget[];
  yearly: { rank: number; label: string; summary: string; context: ChaseYearContext | null } | null;
  tips: string[];
  safety: string | null;
  source: {
    spc_max_category?: string | null;
    spc_category_name?: string | null;
    spc_probs?: { torn: number; hail: number; wind: number };
    grid_step_deg?: number;
    candidate_source?: string;
    candidates_generated?: number;
    candidates_scanned?: number;
    candidates_scored?: number;
    scanned_at?: string;
  };
  error: string | null;
  generated_at: string | null;
}

/**
 * Today's row, or the most recent one.
 *
 * Falling back to the most recent row rather than showing nothing is deliberate:
 * if this morning's run failed, yesterday's answer with an honest date stamp on
 * it is more useful than an empty page. The page shows the date either way, so
 * nobody can mistake a stale outlook for a fresh one.
 */
export async function fetchChaseOutlook(): Promise<ChaseOutlook | null> {
  const { data, error } = await supabase
    .from("chase_outlook")
    .select("*")
    .order("outlook_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ChaseOutlook | null) ?? null;
}

/**
 * Which chase day the reader is currently in.
 *
 * Not `toISOString().slice(0,10)`. That is the UTC date, and after 8 pm Eastern
 * it is already tomorrow — so a perfectly fresh outlook read at nine in the
 * evening was being stamped "Last run ...", which is the one thing a chaser
 * checking the forecast before bed should not be told.
 *
 * The engine now writes the coming day at 00:30 UTC — half an hour after the
 * 00Z balloons, so tomorrow's targets exist while it is still this evening. That
 * is deliberately NOT when the reader's day rolls over: swapping the page to
 * tomorrow at half past seven in the Plains would take today's target away
 * mid-chase, with the storms still going. The row is simply there early for
 * anyone who wants to look ahead.
 *
 * The reader's day therefore still rolls in the small hours, so
 * this is the local calendar date with the small hours still counted as the day
 * before — matching the module's own definition of a chase day, which runs from
 * the afternoon through to 2 am.
 */
export function chaseDayLocal(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < 3) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** True when the row is older than the day the reader is in. */
export function isStale(o: ChaseOutlook): boolean {
  return o.outlook_date < chaseDayLocal();
}

// ─── presentation ────────────────────────────────────────────────────────────

/** The score band drives colour everywhere on the page, so it lives in one place. */
export interface Band { color: string; glow: string; tier: string }

export function bandFor(score: number): Band {
  if (score >= 8.5) return { color: "#ff4d55", glow: "rgba(255,77,85,0.45)", tier: "extreme" };
  if (score >= 7) return { color: "#ff8a3d", glow: "rgba(255,138,61,0.42)", tier: "high" };
  if (score >= 5.5) return { color: "#e8bb4d", glow: "rgba(232,187,77,0.38)", tier: "moderate" };
  if (score >= 3.5) return { color: "#9ed94f", glow: "rgba(158,217,79,0.32)", tier: "low" };
  if (score >= 1.5) return { color: "#5fd9a8", glow: "rgba(95,217,168,0.28)", tier: "slim" };
  return { color: "#7f7fa8", glow: "rgba(127,127,168,0.22)", tier: "none" };
}

/** SPC categories keep their own colours, the ones chasers already read. */
export const SPC_COLOR: Record<string, string> = {
  TSTM: "#c1e9c1", MRGL: "#66a366", SLGT: "#ffe066",
  ENH: "#e6a04d", MDT: "#e06666", HIGH: "#ee66ee",
};

export function bustBand(pct: number): { color: string; label: string } {
  if (pct >= 70) return { color: "#ff4d55", label: "Likely bust" };
  if (pct >= 50) return { color: "#ff8a3d", label: "Coin flip" };
  if (pct >= 32) return { color: "#e8bb4d", label: "Real risk" };
  if (pct >= 18) return { color: "#9ed94f", label: "Low" };
  return { color: "#5fd9a8", label: "Very low" };
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export function compass(deg: number): string {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** "7 PM" from an ISO local timestamp, without pretending it is the reader's zone. */
export function hourLabel(iso: string): string {
  if (!iso || iso.length < 13) return "";
  const h = Number(iso.slice(11, 13));
  const m = iso.slice(14, 16);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m && m !== "00" ? `${h12}:${m} ${ampm}` : `${h12} ${ampm}`;
}

export function dateLabel(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric",
    });
  } catch { return iso; }
}

// ─── the Atmosphere tab ──────────────────────────────────────────────────────
/**
 * The parameter table.
 *
 * Grouped the way a chaser reads a sounding rather than the way the JSON is
 * shaped: what the air is made of, whether it will rise, whether it will turn,
 * and what the composites make of all that. Every row carries a plain-language
 * read so the page teaches as well as reports, which is the whole difference
 * between a dashboard and a forecast.
 */
export interface ParamRow {
  key: keyof ChaseParams;
  label: string;
  unit: string;
  /** Higher is better for chasing, lower is better, or neither. */
  sense: "up" | "down" | "flat";
  /** Value at which the bar reads full. */
  full: number;
  read: (v: number) => string;
}

export interface ParamGroup { title: string; blurb: string; rows: ParamRow[] }

export const PARAM_GROUPS: ParamGroup[] = [
  {
    title: "Fuel",
    blurb: "How much energy the atmosphere has to give a storm.",
    rows: [
      { key: "cape", label: "CAPE", unit: "J/kg", sense: "up", full: 4000,
        read: (v) => v >= 3500 ? "Loaded" : v >= 2000 ? "Plenty" : v >= 1000 ? "Workable" : v >= 400 ? "Thin" : "Not much" },
      { key: "lifted_index", label: "Lifted index", unit: "", sense: "down", full: -10,
        read: (v) => v <= -8 ? "Very unstable" : v <= -5 ? "Unstable" : v <= -2 ? "Mildly unstable" : "Stable" },
      { key: "dew_f", label: "Surface dewpoint", unit: "°F", sense: "up", full: 78,
        read: (v) => v >= 72 ? "Tropical" : v >= 65 ? "Good moisture" : v >= 58 ? "Adequate" : "Dry" },
      { key: "mixing_ratio", label: "Mixing ratio", unit: "g/kg", sense: "up", full: 18,
        read: (v) => v >= 15 ? "Very moist" : v >= 12 ? "Moist" : v >= 9 ? "Modest" : "Dry" },
      { key: "temp_f", label: "Surface temp", unit: "°F", sense: "flat", full: 100, read: () => "" },
      { key: "cin", label: "Convective inhibition", unit: "J/kg", sense: "down", full: 300,
        read: (v) => v >= 250 ? "Hard cap" : v >= 150 ? "Strong cap" : v >= 60 ? "Cap in place" : v >= 20 ? "Weak cap" : "Uncapped" },
    ],
  },
  {
    title: "Lift and lapse",
    blurb: "Whether the air gets moving, and how fast it cools with height.",
    rows: [
      { key: "lapse_75", label: "700-500 mb lapse rate", unit: "°C/km", sense: "up", full: 9,
        read: (v) => v >= 8 ? "Steep" : v >= 7 ? "Good" : v >= 6 ? "Modest" : "Poor" },
      { key: "lapse_03", label: "Low-level lapse rate", unit: "°C/km", sense: "up", full: 9.8,
        read: (v) => v >= 8.5 ? "Well mixed" : v >= 7 ? "Mixing" : "Shallow" },
      { key: "omega_700", label: "700 mb vertical motion", unit: "m/s", sense: "down", full: -0.6,
        read: (v) => v <= -0.3 ? "Strong ascent" : v <= -0.1 ? "Ascent" : v <= 0 ? "Weak ascent" : "Sinking" },
      { key: "pbl_m", label: "Boundary layer depth", unit: "m", sense: "up", full: 3000,
        read: (v) => v >= 2000 ? "Deep" : v >= 1000 ? "Decent" : "Shallow" },
      { key: "temp_500", label: "500 mb temp", unit: "°C", sense: "down", full: -20,
        read: (v) => v <= -16 ? "Cold aloft" : v <= -10 ? "Cool aloft" : "Warm aloft" },
      { key: "temp_850", label: "850 mb temp", unit: "°C", sense: "flat", full: 30,
        read: (v) => v >= 16 ? "Capping warmth" : v >= 12 ? "Some warmth" : "Cool" },
    ],
  },
  {
    title: "Rotation",
    blurb: "Whether a storm can turn, and how low the base will sit.",
    rows: [
      { key: "shear_06_kt", label: "0-6 km bulk shear", unit: "kt", sense: "up", full: 70,
        read: (v) => v >= 50 ? "Supercell shear" : v >= 35 ? "Organised" : v >= 25 ? "Marginal" : "Weak" },
      { key: "shear_01_kt", label: "0-1 km shear", unit: "kt", sense: "up", full: 35,
        read: (v) => v >= 25 ? "Strong" : v >= 15 ? "Useful" : "Weak" },
      { key: "srh_03", label: "0-3 km helicity", unit: "m²/s²", sense: "up", full: 500,
        read: (v) => v >= 300 ? "Very high" : v >= 150 ? "Supportive" : v >= 75 ? "Modest" : "Low" },
      { key: "srh_01", label: "0-1 km helicity", unit: "m²/s²", sense: "up", full: 350,
        read: (v) => v >= 200 ? "Tornadic range" : v >= 100 ? "Supportive" : "Low" },
      { key: "lcl_agl_ft", label: "Cloud base (LCL)", unit: "ft AGL", sense: "down", full: 5000,
        read: (v) => v <= 1200 ? "Very low" : v <= 2500 ? "Low" : v <= 4000 ? "Moderate" : "High" },
      { key: "rh_700", label: "700 mb humidity", unit: "%", sense: "flat", full: 100,
        read: (v) => v >= 72 ? "Moist mid-levels, HP look" : v <= 42 ? "Dry mid-levels, LP look" : "Classic range" },
    ],
  },
  {
    title: "Composites and hail",
    blurb: "The indices forecasters quote, plus what they mean for hail.",
    rows: [
      { key: "stp", label: "Significant tornado", unit: "", sense: "up", full: 6,
        read: (v) => v >= 3 ? "Strongly supportive" : v >= 1 ? "Supportive" : v > 0 ? "Marginal" : "Not supportive" },
      { key: "scp", label: "Supercell composite", unit: "", sense: "up", full: 12,
        read: (v) => v >= 6 ? "Strongly supportive" : v >= 2 ? "Supportive" : v >= 1 ? "Marginal" : "Low" },
      { key: "ship", label: "Significant hail", unit: "", sense: "up", full: 4,
        read: (v) => v >= 2 ? "Big hail likely" : v >= 1 ? "Severe hail" : v >= 0.5 ? "Marginal hail" : "Small hail" },
      { key: "ehi", label: "Energy helicity index", unit: "", sense: "up", full: 4,
        read: (v) => v >= 2 ? "Strongly supportive" : v >= 1 ? "Supportive" : "Low" },
      { key: "freezing_level_ft", label: "Freezing level", unit: "ft", sense: "down", full: 16000,
        read: (v) => v <= 10000 ? "Low, hail survives" : v <= 13000 ? "Moderate" : "High, hail melts" },
      { key: "wbz_ft", label: "Wet bulb zero", unit: "ft", sense: "down", full: 16000,
        read: (v) => v <= 8000 ? "Ideal for hail" : v <= 10500 ? "Favourable" : "Too high for big hail" },
    ],
  },
  {
    title: "Timing and sky",
    blurb: "The practical stuff that decides whether you actually see anything.",
    rows: [
      { key: "precip_probability", label: "Precipitation chance", unit: "%", sense: "up", full: 100,
        read: (v) => v >= 60 ? "Storms expected" : v >= 30 ? "Scattered" : "Isolated at best" },
      { key: "cloud_cover_low", label: "Low cloud", unit: "%", sense: "down", full: 100,
        read: (v) => v >= 80 ? "Overcast, poor structure viewing" : v >= 40 ? "Partly cloudy" : "Clear" },
      { key: "surface_pressure", label: "Surface pressure", unit: "mb", sense: "flat", full: 1040, read: () => "" },
    ],
  },
];

/** Bar fill 0-1 for a parameter, honouring which direction is "good". */
export function fillFor(row: ParamRow, v: number): number {
  if (row.sense === "flat") return 0.5;
  if (row.sense === "up") return Math.max(0, Math.min(1, v / row.full));
  // "down" rows have a target that may be negative (omega) or positive (LCL).
  if (row.full < 0) return Math.max(0, Math.min(1, v / row.full));
  return Math.max(0, Math.min(1, 1 - v / row.full));
}

/** Which of the two targets wins a given parameter, for the comparison column. */
export function betterOf(row: ParamRow, a: number, b: number): 0 | 1 | -1 {
  if (row.sense === "flat" || a === b) return -1;
  const aWins = row.sense === "up" ? a > b : a < b;
  return aWins ? 0 : 1;
}

// ─── Yearly ──────────────────────────────────────────────────────────────────
export const YEARLY_MEANING: Record<number, { title: string; body: string }> = {
  1: { title: "No chance of being the year's best", body: "A day you chase because you are already out, not one you drive for." },
  2: { title: "Very little chance", body: "A real setup with a real ceiling. Worth going if it is close to you." },
  3: { title: "Has a chance", body: "The kind of day that turns into the year's best about as often as it does not." },
  4: { title: "Good chance", body: "Clear your calendar. Days like this are why the season exists." },
  5: { title: "Very high chance this is the year's best", body: "Go. You will remember where you were on this one." },
};
