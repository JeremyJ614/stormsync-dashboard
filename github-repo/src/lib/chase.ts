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
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

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
 * The row for the chase day the reader is in — never a future one.
 *
 * THE BUG THIS FIXES. This took the newest `outlook_date` with no ceiling. The
 * engine writes the COMING day's row at 00:30 UTC, which is half past eight in
 * the evening Eastern — so from 8:30pm the newest row was tomorrow's, and the
 * module swapped to tomorrow's target while the reader was still in tonight's
 * chase. Reported from the field at nine in the evening Eastern, which is
 * exactly when it would first be noticed.
 *
 * Capping the query at `chaseDayLocal()` keeps the early-written row in the
 * table, where it is useful, without letting it take over the page.
 *
 * Falling back to the most recent row rather than showing nothing is deliberate
 * and is kept: if this morning's run failed, yesterday's answer with an honest
 * date stamp on it is more useful than an empty page. The page shows the date
 * either way, so nobody can mistake a stale outlook for a fresh one.
 */
export async function fetchChaseOutlook(): Promise<ChaseOutlook | null> {
  const today = chaseDayLocal();
  const { data, error } = await supabase
    .from("chase_outlook")
    .select("*")
    .lte("outlook_date", today)
    .order("outlook_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as ChaseOutlook;

  // Nothing at or before today at all — a brand-new install, or the table only
  // holds the row that was written ahead. Showing that is still better than an
  // empty page, and it carries its own date.
  const { data: any_, error: e2 } = await supabase
    .from("chase_outlook")
    .select("*")
    .order("outlook_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e2) throw e2;
  return (any_ as ChaseOutlook | null) ?? null;
}

/**
 * The year's ledger, read live.
 *
 * THE BUG THIS FIXES
 * The ledger under the Yearly tab is stamped into the row when the engine runs,
 * and the panel read it from there. That is a snapshot, and it goes stale the
 * moment anything else writes a day — which is exactly what the historical
 * backfill does. With seventy days in the table the page was still reporting
 * "16 days recorded, since Aug 26", directly underneath a line promising it was
 * "read straight off the rows the engine has written this year, not from
 * memory". It was from memory.
 *
 * `chase_year_context` is granted to members, so the page can simply ask. The
 * stored copy stays as the fallback for an offline load, and because it is what
 * the narrative on the same screen was written against.
 */
export async function fetchChaseYearContext(): Promise<ChaseYearContext | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc("chase_year_context");
  if (error) {
    logger.warn("year context unavailable", { scope: "chase", error });
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as ChaseYearContext | null) ?? null;
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
 * The reader's day rolls at 8 in the morning, local time. It used to roll at 3
 * am, which covered a chase running past midnight but still handed the reader a
 * new day before they had woken up to it — and a 3 am roll cannot help with the
 * real complaint anyway, because the page was flipping at half past eight in
 * the EVENING (see `fetchChaseOutlook`). Eight in the morning is the boundary
 * asked for: a chase that runs to 2 am is still on its own day when you get
 * home, and the new day arrives with breakfast rather than in your sleep.
 */
export const CHASE_DAY_ROLL_HOUR = 8;

export function chaseDayLocal(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < CHASE_DAY_ROLL_HOUR) d.setDate(d.getDate() - 1);
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

// ─── the Parameters tab ──────────────────────────────────────────────────────
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
  /** Two or three words naming where this value sits. */
  read: (v: number) => string;
  /**
   * What this value does to the storm, in a sentence.
   *
   * `read` says where a number sits on its own scale; it does not say what
   * happens because of it, and "Loaded" means nothing to anyone who does not
   * already know what loaded does. This is the consequence — for a good value
   * AND for a bad one, because the reason a day busts is usually one row on
   * this page reading badly and nothing telling you why that matters.
   */
  effect: (v: number) => string;
}

export interface ParamGroup { title: string; blurb: string; rows: ParamRow[] }

export const PARAM_GROUPS: ParamGroup[] = [
  {
    title: "Fuel",
    blurb: "How much energy the atmosphere has to give a storm.",
    rows: [
      { key: "cape", label: "CAPE", unit: "J/kg", sense: "up", full: 4000,
        read: (v) => v >= 3500 ? "Loaded" : v >= 2000 ? "Plenty" : v >= 1000 ? "Workable" : v >= 400 ? "Thin" : "Not much",
        effect: (v) => v >= 3500 ? "Updrafts go up hard and fast. Hail gets time to grow, and anything rotating will do it violently." : v >= 2000 ? "Enough energy for strong updrafts and severe hail once storms get going." : v >= 1000 ? "Storms will go up, but they will need help to get severe." : v >= 400 ? "Weak updrafts. Expect showers and the odd rumble rather than a chase." : "Not enough to lift a parcel anywhere. Nothing will get off the ground." },
      { key: "lifted_index", label: "Lifted index", unit: "", sense: "down", full: -10,
        read: (v) => v <= -8 ? "Very unstable" : v <= -5 ? "Unstable" : v <= -2 ? "Mildly unstable" : "Stable",
        effect: (v) => v <= -8 ? "A parcel released at the surface accelerates the whole way up. Explosive development once the cap breaks." : v <= -5 ? "Parcels rise freely. Storms build quickly through the afternoon." : v <= -2 ? "Storms are possible but will be slow to build and easy to kill." : "A parcel is heavier than its surroundings. It will not rise on its own at all." },
      { key: "dew_f", label: "Surface dewpoint", unit: "°F", sense: "up", full: 78,
        read: (v) => v >= 72 ? "Tropical" : v >= 65 ? "Good moisture" : v >= 58 ? "Adequate" : "Dry",
        effect: (v) => v >= 72 ? "Gulf-quality moisture. Bases sit low, inflow is dense, and rain-wrapping becomes the problem." : v >= 65 ? "Enough moisture for real bases and a real tornado threat under a rotating storm." : v >= 58 ? "Workable. Bases will be higher and the storm will have to work for its moisture." : "Too dry. Cloud bases end up thousands of feet up and any circulation stays off the ground." },
      { key: "mixing_ratio", label: "Mixing ratio", unit: "g/kg", sense: "up", full: 18,
        read: (v) => v >= 15 ? "Very moist" : v >= 12 ? "Moist" : v >= 9 ? "Modest" : "Dry",
        effect: (v) => v >= 15 ? "A very wet boundary layer. Heavy precipitation loading, and HP structure is likely." : v >= 12 ? "Good low-level moisture feeding the updraft." : v >= 9 ? "Enough to work with, but the storm will not be efficient with it." : "A dry inflow layer. Downdrafts will be cold and will undercut the updraft." },
      { key: "temp_f", label: "Surface temp", unit: "°F", sense: "flat", full: 100, read: () => "",
        effect: () => "" },
      { key: "cin", label: "Convective inhibition", unit: "J/kg", sense: "down", full: 300,
        read: (v) => v >= 250 ? "Hard cap" : v >= 150 ? "Strong cap" : v >= 60 ? "Cap in place" : v >= 20 ? "Weak cap" : "Uncapped",
        effect: (v) => v >= 250 ? "The cap holds. Nothing breaks this without serious forcing, and the day most likely stays blue." : v >= 150 ? "A strong cap. It keeps storms few and discrete IF something breaks it, and kills the day if nothing does." : v >= 60 ? "A useful cap. It stops early junk and lets one or two storms get the whole airmass." : v >= 20 ? "Barely holding. Expect early initiation and more storms than you want." : "Nothing is holding anything back. Storms go up everywhere at once and fight each other for inflow." },
    ],
  },
  {
    title: "Lift and lapse",
    blurb: "Whether the air gets moving, and how fast it cools with height.",
    rows: [
      { key: "lapse_75", label: "700-500 mb lapse rate", unit: "°C/km", sense: "up", full: 9,
        read: (v) => v >= 8 ? "Steep" : v >= 7 ? "Good" : v >= 6 ? "Modest" : "Poor",
        effect: (v) => v >= 8 ? "Steep mid-level lapse rates. Strong updrafts and large hail; this is the profile that makes Plains storms hit hard." : v >= 7 ? "Good lapse rates. The updraft keeps accelerating through the hail growth zone." : v >= 6 ? "Modest. Updrafts will be adequate rather than impressive." : "Too shallow. Updrafts stay weak no matter how much CAPE is on the sounding." },
      { key: "lapse_03", label: "Low-level lapse rate", unit: "°C/km", sense: "up", full: 9.8,
        read: (v) => v >= 8.5 ? "Well mixed" : v >= 7 ? "Mixing" : "Shallow",
        effect: (v) => v >= 8.5 ? "The boundary layer is well mixed, which supports strong outflow and damaging wind gusts." : v >= 7 ? "Mixing is happening. Reasonable surface-based potential." : "A shallow, stable low level. Storms will struggle to stay surface-based." },
      { key: "omega_700", label: "700 mb vertical motion", unit: "m/s", sense: "down", full: -0.6,
        read: (v) => v <= -0.3 ? "Strong ascent" : v <= -0.1 ? "Ascent" : v <= 0 ? "Weak ascent" : "Sinking",
        effect: (v) => v <= -0.3 ? "Strong large-scale ascent. The cap gets broken for you and storms fire on time." : v <= -0.1 ? "Enough ascent to get initiation going along a boundary." : v <= 0 ? "Only weak lift. Initiation will depend on a local boundary rather than the synoptic pattern." : "The air is sinking. Anything that tries to go up gets pushed back down." },
      { key: "pbl_m", label: "Boundary layer depth", unit: "m", sense: "up", full: 3000,
        read: (v) => v >= 2000 ? "Deep" : v >= 1000 ? "Decent" : "Shallow",
        effect: (v) => v >= 2000 ? "A deep mixed layer. Bases will be high and outflow strong — good for wind, harder for tornadoes." : v >= 1000 ? "A normal afternoon boundary layer. Nothing working against you." : "Shallow mixing. Bases stay low, which helps rotation reach the ground." },
      { key: "temp_500", label: "500 mb temp", unit: "°C", sense: "down", full: -20,
        read: (v) => v <= -16 ? "Cold aloft" : v <= -10 ? "Cool aloft" : "Warm aloft",
        effect: (v) => v <= -16 ? "Cold aloft over a warm surface. That contrast is where the instability comes from." : v <= -10 ? "Cool enough aloft to support decent updrafts." : "Too warm aloft. The atmosphere cannot generate much instability whatever the surface does." },
      { key: "temp_850", label: "850 mb temp", unit: "°C", sense: "flat", full: 30,
        read: (v) => v >= 16 ? "Capping warmth" : v >= 12 ? "Some warmth" : "Cool",
        effect: (v) => v >= 16 ? "Warm air at 850 mb is the cap. It holds storms off until late, then lets one or two go." : v >= 12 ? "Some warmth aloft. A soft cap that will break by mid-afternoon." : "No warm layer to hold anything back. Expect early, numerous, messy storms." },
    ],
  },
  {
    title: "Rotation",
    blurb: "Whether a storm can turn, and how low the base will sit.",
    rows: [
      { key: "shear_06_kt", label: "0-6 km bulk shear", unit: "kt", sense: "up", full: 70,
        read: (v) => v >= 50 ? "Supercell shear" : v >= 35 ? "Organised" : v >= 25 ? "Marginal" : "Weak",
        effect: (v) => v >= 50 ? "The updraft and the downdraft separate cleanly, so a storm can hold together for hours instead of raining itself out." : v >= 35 ? "Enough to organise storms into supercells and keep them alive." : v >= 25 ? "Marginal. Storms will organise briefly and then collapse into a cluster." : "The storm rains straight into its own inflow and dies within the hour." },
      { key: "shear_01_kt", label: "0-1 km shear", unit: "kt", sense: "up", full: 35,
        read: (v) => v >= 25 ? "Strong" : v >= 15 ? "Useful" : "Weak",
        effect: (v) => v >= 25 ? "Strong low-level shear. Rotation reaches close to the ground, which is where tornadoes come from." : v >= 15 ? "Useful. A rotating storm has something to work with near the surface." : "Rotation stays up in the cloud and never tightens near the ground." },
      { key: "srh_03", label: "0-3 km helicity", unit: "m²/s²", sense: "up", full: 500,
        read: (v) => v >= 300 ? "Very high" : v >= 150 ? "Supportive" : v >= 75 ? "Modest" : "Low",
        effect: (v) => v >= 300 ? "Plenty of streamwise vorticity for the updraft to tilt. Mesocyclones form early and hold." : v >= 150 ? "Enough helicity to support a rotating updraft." : v >= 75 ? "Modest. Rotation will be broad and slow to organise." : "Not enough turning in the inflow for a storm to develop a mesocyclone." },
      { key: "srh_01", label: "0-1 km helicity", unit: "m²/s²", sense: "up", full: 350,
        read: (v) => v >= 200 ? "Tornadic range" : v >= 100 ? "Supportive" : "Low",
        effect: (v) => v >= 200 ? "The lowest kilometre is doing the work. This is the range associated with strong tornadoes." : v >= 100 ? "Supportive of low-level rotation once a storm matures." : "Rotation will stay aloft. Wall clouds without much underneath them." },
      { key: "lcl_agl_ft", label: "Cloud base (LCL)", unit: "ft AGL", sense: "down", full: 5000,
        read: (v) => v <= 1200 ? "Very low" : v <= 2500 ? "Low" : v <= 4000 ? "Moderate" : "High",
        effect: (v) => v <= 1200 ? "A very low cloud base. Rear-flank air stays warm, which is what lets a circulation reach the ground." : v <= 2500 ? "Low enough to support tornadoes if everything else lines up." : v <= 4000 ? "Bases are getting high. Outflow will be cold and will undercut the updraft." : "Bases far too high. Expect a pretty storm and very little at ground level." },
      { key: "rh_700", label: "700 mb humidity", unit: "%", sense: "flat", full: 100,
        read: (v) => v >= 72 ? "Moist mid-levels, HP look" : v <= 42 ? "Dry mid-levels, LP look" : "Classic range",
        effect: (v) => v >= 72 ? "Moist mid-levels wrap the mesocyclone in rain. Structure is hidden and a tornado can be invisible until it is close." : v <= 42 ? "Dry mid-levels keep precipitation off the updraft. Sculpted structure, big hail, less tornado potential." : "Enough mid-level dryness to keep the rain off the business end without starving the storm." },
    ],
  },
  {
    title: "Composites and hail",
    blurb: "The indices forecasters quote, plus what they mean for hail.",
    rows: [
      { key: "stp", label: "Significant tornado", unit: "", sense: "up", full: 6,
        read: (v) => v >= 3 ? "Strongly supportive" : v >= 1 ? "Supportive" : v > 0 ? "Marginal" : "Not supportive",
        effect: (v) => v >= 3 ? "In the range where significant tornadoes actually happen when a storm goes up." : v >= 1 ? "Supportive of tornadoes. Most tornado days sit here." : v > 0 ? "Marginal. A tornado would be brief and lucky." : "The ingredients do not line up for a tornado, whatever else the storm does." },
      { key: "scp", label: "Supercell composite", unit: "", sense: "up", full: 12,
        read: (v) => v >= 6 ? "Strongly supportive" : v >= 2 ? "Supportive" : v >= 1 ? "Marginal" : "Low",
        effect: (v) => v >= 6 ? "Strongly supercellular. Any storm that goes up should rotate." : v >= 2 ? "Supportive of supercells." : v >= 1 ? "Marginal. Expect brief rotation at best." : "Not a supercell environment. Multicells and clusters." },
      { key: "ship", label: "Significant hail", unit: "", sense: "up", full: 4,
        read: (v) => v >= 2 ? "Big hail likely" : v >= 1 ? "Severe hail" : v >= 0.5 ? "Marginal hail" : "Small hail",
        effect: (v) => v >= 2 ? "Significant hail — two inches and up, the kind that breaks glass. Keep the car pointed away." : v >= 1 ? "Severe hail, an inch or larger." : v >= 0.5 ? "Marginal hail. Enough to be unpleasant, not enough to be dangerous." : "Small hail at most." },
      { key: "ehi", label: "Energy helicity index", unit: "", sense: "up", full: 4,
        read: (v) => v >= 2 ? "Strongly supportive" : v >= 1 ? "Supportive" : "Low",
        effect: (v) => v >= 2 ? "Instability and helicity are both in place and working together, which is the combination tornado days are made of." : v >= 1 ? "Supportive. The two ingredients are present without being remarkable." : "One of the two is missing. Rotation and energy are not lining up." },
      { key: "freezing_level_ft", label: "Freezing level", unit: "ft", sense: "down", full: 16000,
        read: (v) => v <= 10000 ? "Low, hail survives" : v <= 13000 ? "Moderate" : "High, hail melts",
        effect: (v) => v <= 10000 ? "A low freezing level means hail falls through less warm air and arrives at the ground still large." : v <= 13000 ? "Moderate. Hail will shrink on the way down but should still reach severe size." : "High. Anything but the biggest stones will melt before they land." },
      { key: "wbz_ft", label: "Wet bulb zero", unit: "ft", sense: "down", full: 16000,
        read: (v) => v <= 8000 ? "Ideal for hail" : v <= 10500 ? "Favourable" : "Too high for big hail",
        effect: (v) => v <= 8000 ? "Ideal for hail reaching the ground intact." : v <= 10500 ? "Favourable for severe hail." : "Too high. The melting layer is deep enough to take the edge off anything falling through it." },
    ],
  },
  {
    title: "Timing and sky",
    blurb: "The practical stuff that decides whether you actually see anything.",
    rows: [
      { key: "precip_probability", label: "Precipitation chance", unit: "%", sense: "up", full: 100,
        read: (v) => v >= 60 ? "Storms expected" : v >= 30 ? "Scattered" : "Isolated at best",
        effect: (v) => v >= 60 ? "Storms are expected here rather than merely possible." : v >= 30 ? "Scattered coverage. You may have to pick the right storm and commit early." : "Isolated at best. This is a day you can drive all afternoon and see nothing." },
      { key: "cloud_cover_low", label: "Low cloud", unit: "%", sense: "down", full: 100,
        read: (v) => v >= 80 ? "Overcast, poor structure viewing" : v >= 40 ? "Partly cloudy" : "Clear",
        effect: (v) => v >= 80 ? "Overcast. Heating is cut off, the airmass struggles to destabilise, and you will not see structure anyway." : v >= 40 ? "Broken cloud. Some heating gets through; structure will be partly visible." : "Clear skies. Full heating, and the storm will be visible from a long way off." },
      { key: "surface_pressure", label: "Surface pressure", unit: "mb", sense: "flat", full: 1040, read: () => "",
        effect: () => "" },
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
