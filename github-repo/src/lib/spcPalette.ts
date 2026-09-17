/**
 * SPC Outlook color system — one palette per hazard "kind", matching the
 * exact colors/labels you specified. Shared by the live MapLibre map and the
 * static SVG map, so both always stay visually identical.
 *
 * The "Intensity" tabs draw SPC's Conditional Intensity Groups, which the
 * service began publishing in February 2026 as `CIG1`/`CIG2`/`CIG3` contours
 * alongside the probability bands. Every tier below is a contour SPC actually
 * draws; nothing here is modelled or inferred. The long note above the three
 * intensity palettes has the detail, including what "conditional" means and
 * why hail stops one tier short of the other two.
 *
 * The hex codes below are DEFAULTS. `levelsFor` applies any admin override on
 * top, so a colour can be corrected from the panel without a deploy.
 */
import { paletteColor } from "./mapPalette";

export type Kind =
  | "cat"
  | "tornadoLikelihood" | "tornadoIntensity"
  | "hailLikelihood" | "hailIntensity"
  | "windLikelihood" | "windIntensity";

export interface LevelDef { color: string; label: string }

// ── Overview / Categorical (your exact hex codes) ───────────────────────────
export const CAT_LEVELS: LevelDef[] = [
  { color: "#3a4a52", label: "General Thunder" },  // SPC "TSTM" -- not a numbered risk level, rendered faint
  { color: "#83EBF2", label: "Level 1 · Low" },
  { color: "#6395EE", label: "Level 2" },
  { color: "#191970", label: "Level 3" },
  { color: "#560591", label: "Level 4" },
  { color: "#CCCCFF", label: "Level 5 · Extreme" },
];

// ── Tornado Likelihood (very light pink -> blood red) ────────────────────────
export const TORNADO_LIKELIHOOD: LevelDef[] = [
  { color: "#FFE5EC", label: "Level 1" },
  { color: "#FFB3C6", label: "Level 2 · Possible" },
  { color: "#FF6B8A", label: "Level 3" },
  { color: "#E5383B", label: "Level 4 · Fairly Certain" },
  { color: "#7A0C0C", label: "Level 5 · Bet On It" },
];

/*
 * ── Intensity: SPC's Conditional Intensity Groups ───────────────────────────
 *
 * These three palettes were rewritten when the live service turned out to be
 * carrying something the code had never heard of.
 *
 * SPC added **Conditional Intensity** to the convective outlooks in February
 * 2026, and the day-1 hazard GeoJSON now ships extra contours labelled `CIG1`,
 * `CIG2` and `CIG3` alongside the probability bands. Checked against the
 * archive, they appear on any reasonably active day: 18 May 2026 carries CIG1
 * and CIG2 for both tornado and hail, 15 March 2026 carries CIG1 for wind.
 * `LABEL2` spells it out — "Tornado Conditional Intensity Group 1 Risk".
 *
 * The old palettes here were built for the previous world, where the only
 * higher-end contour was the single hatched "significant severe" area, and the
 * comment above them said so. That is out of date, and the labels that came
 * with it — `2"+ Significant (Golfball)`, `75+ mph Significant` — were the old
 * SIGN thresholds. They are not what a CIG contour means and are not printed
 * anywhere by SPC for these areas, so they are gone.
 *
 * WHAT CONDITIONAL INTENSITY ACTUALLY SAYS, in SPC's words: "Intensity will
 * now be conditional, meaning if a tornado/wind gust/hail report occurs, the
 * expected strength/intensity/size will be represented." It is a statement
 * about severity GIVEN an event, not about how likely an event is — that is
 * what the Likelihood tabs are for. SPC publishes no "CIG2 = two inches"
 * mapping, so none is invented here; the groups are named the way SPC names
 * them and the module explains what they mean.
 *
 * CIG3 exists for tornado and wind. Hail goes to CIG2 only, which is why the
 * hail palette below is one entry shorter.
 *
 * Ramps run from the hazard's own likelihood family so the two tabs read as
 * relatives, deepening rather than changing hue.
 */
export const TORNADO_INTENSITY: LevelDef[] = [
  { color: "#FFD6E8", label: "Tornado risk area" },
  { color: "#F06BB0", label: "Intensity 1" },
  { color: "#E0218A", label: "Intensity 2" },
  { color: "#8E0F53", label: "Intensity 3 · violent possible" },
];

// ── Hail Likelihood (off-white -> dark navy) ─────────────────────────────────
export const HAIL_LIKELIHOOD: LevelDef[] = [
  { color: "#F5F5F0", label: "Level 1" },
  { color: "#D6EFFF", label: "Level 2 · Possible" },
  { color: "#2A9DF4", label: "Level 3" },
  { color: "#2647D6", label: "Level 4" },
  { color: "#0A1F5C", label: "Level 5 · Hail Certainty" },
];

// Hail stops at Intensity 2 — SPC does not draw a CIG3 for hail.
export const HAIL_INTENSITY: LevelDef[] = [
  { color: "#CCCCFF", label: "Hail risk area" },
  { color: "#9B7FD4", label: "Intensity 1" },
  { color: "#5B3A8C", label: "Intensity 2" },
];

// ── Wind Likelihood (lightest green -> darkest green) ────────────────────────
export const WIND_LIKELIHOOD: LevelDef[] = [
  { color: "#E8FFE0", label: "Level 1" },
  { color: "#A8E6A1", label: "Level 2 · High Winds Possible" },
  { color: "#5CB85C", label: "Level 3" },
  { color: "#2E8B2E", label: "Level 4" },
  { color: "#0B4D0B", label: "Level 5 · Severe Wind Certain" },
];

export const WIND_INTENSITY: LevelDef[] = [
  { color: "#FDFBD4", label: "Wind risk area" },
  { color: "#E8C14A", label: "Intensity 1" },
  { color: "#DAA520", label: "Intensity 2" },
  { color: "#8A5F0A", label: "Intensity 3 · extreme gusts possible" },
];

export const PALETTES: Record<Kind, LevelDef[]> = {
  cat: CAT_LEVELS,
  tornadoLikelihood: TORNADO_LIKELIHOOD,
  tornadoIntensity: TORNADO_INTENSITY,
  hailLikelihood: HAIL_LIKELIHOOD,
  hailIntensity: HAIL_INTENSITY,
  windLikelihood: WIND_LIKELIHOOD,
  windIntensity: WIND_INTENSITY,
};

/**
 * A palette with any admin overrides applied.
 *
 * The exported constants stay the design defaults so a corrected default still
 * reaches everybody who has not deliberately changed that swatch. Callers that
 * paint a map read through here instead of indexing `PALETTES` directly.
 */
export function levelsFor(kind: Kind): LevelDef[] {
  const base = PALETTES[kind];
  let touched = false;
  const out = base.map((d, i) => {
    const c = paletteColor(`spc:${kind}:${i}`, d.color);
    if (c !== d.color) touched = true;
    return c === d.color ? d : { ...d, color: c };
  });
  return touched ? out : base;
}

export const KIND_TITLE: Record<Kind, string> = {
  cat: "Threat Level",
  tornadoLikelihood: "Tornado Likelihood",
  tornadoIntensity: "Tornado Intensity",
  hailLikelihood: "Hail Likelihood",
  hailIntensity: "Hail Intensity",
  windLikelihood: "Wind Likelihood",
  windIntensity: "Wind Intensity",
};

const CAT_LEVEL_MAP: Record<string, number> = { TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5 };

/** SPC probability labels are fractions ("0.05" = 5%); normalize to whole percent. */
function labelToPct(label: string): number | null {
  const f = parseFloat(label);
  if (Number.isNaN(f)) return null;
  return f <= 1 ? Math.round(f * 100) : Math.round(f);
}

/** Probability band -> 1-5 level (tornado bands differ from wind/hail). */
function probToLevel(hazard: "torn" | "wind" | "hail", pct: number): number {
  if (hazard === "torn") {
    if (pct >= 30) return 5; if (pct >= 15) return 4; if (pct >= 10) return 3; if (pct >= 5) return 2; return 1;
  }
  if (pct >= 60) return 5; if (pct >= 45) return 4; if (pct >= 30) return 3; if (pct >= 15) return 2; return 1;
}

export type Hazard = "cat" | "torn" | "hail" | "wind";
export function hazardFromProduct(product: string): Hazard {
  const m = product.match(/_(cat|torn|wind|hail)$/);
  return (m?.[1] as Hazard) ?? "cat";
}

/** A conditional-intensity contour, 1-3, as SPC groups them. */
export type Cig = 1 | 2 | 3;

/**
 * A feature's level, or null when it is not a risk area at all.
 *
 * THE BUG THIS FIXES, and it was painting the wrong thing on quiet days.
 *
 * This used to read: anything whose LABEL does not parse as a number is the
 * hatched significant-severe area. That was true when the only non-numeric
 * label was `SIGN`. It is not true now, and it was never safe — on a day with
 * no tornado threat SPC publishes a single placeholder polygon labelled
 * "Less Than 2% All Areas", covering the whole country and meaning *nothing is
 * expected*. `parseFloat` gives NaN, so the old rule promoted it to the top of
 * the intensity scale. Today's Day 1 tornado outlook is exactly that polygon.
 *
 * Now the conditional-intensity contours are matched by name — `CIG1`, `CIG2`,
 * `CIG3` — and anything else that fails to parse is null, which the callers
 * already know how to skip.
 */
export function classify(hazard: Hazard, feature: GeoJSON.Feature): number | null {
  const label = String(feature.properties?.LABEL ?? "").trim();
  if (hazard === "cat") return CAT_LEVEL_MAP[label.toUpperCase()] ?? 0;
  const cig = /^CIG([123])$/i.exec(label);
  if (cig) return Number(cig[1]) as Cig;
  const pct = labelToPct(label);
  if (pct === null) return null;
  return probToLevel(hazard, pct);
}

/**
 * The level a feature should count as when picking Target Areas.
 *
 * `classify` returns 1-3 for a conditional-intensity contour and 1-5 for a
 * probability band, and the bare number cannot tell those apart — a CIG1 is a
 * far stronger signal than a 5% probability band, and the old code knew that,
 * promoting any "significant" area straight to the threshold.
 *
 * SPC only draws conditional intensity inside ground that already warrants it,
 * so any CIG contour counts as level 3 and each group above adds one. That
 * keeps an intensity area in the running for a target without letting it
 * outrank a genuine high-probability band.
 */
export function targetLevel(hazard: Hazard, feature: GeoJSON.Feature): number | null {
  const lvl = classify(hazard, feature);
  if (lvl === null) return null;
  return isCig(feature) ? 2 + lvl : lvl;
}

/** True for a conditional-intensity contour, whichever group it is. */
export function isCig(feature: GeoJSON.Feature): boolean {
  return /^CIG[123]$/i.test(String(feature.properties?.LABEL ?? "").trim());
}

/** Likelihood-mode kind for a given hazard. */
export function likelihoodKind(hazard: Hazard): Kind {
  if (hazard === "torn") return "tornadoLikelihood";
  if (hazard === "hail") return "hailLikelihood";
  if (hazard === "wind") return "windLikelihood";
  return "cat";
}
export function intensityKind(hazard: "torn" | "hail" | "wind"): Kind {
  return hazard === "torn" ? "tornadoIntensity" : hazard === "hail" ? "hailIntensity" : "windIntensity";
}

/**
 * Resolves a feature to a palette index for a given display mode.
 *  - Likelihood mode: cat -> 0-5 (6 entries incl. General Thunder); hazard probs -> 1-5.
 *  - Intensity mode: only 2 entries -- 0 = general risk area, 1 = SPC's real "sig" threshold.
 */
export function levelIndexFor(mode: "likelihood" | "intensity", hazard: Hazard, feature: GeoJSON.Feature): number | null {
  const lvl = classify(hazard, feature);
  if (lvl === null) return null;
  const cig = isCig(feature);
  if (mode === "intensity") {
    if (hazard === "cat") return null; // Intensity tabs only apply to torn/hail/wind
    // A CIG contour indexes straight into the palette: 1, 2, 3 sit above the
    // risk area at 0. Clamped because hail's palette stops at Intensity 2 and
    // a group SPC has not drawn for that hazard must not fall off the end.
    if (cig) return Math.min(Number(lvl), intensityLevels(hazard).length - 1);
    return 0;
  }
  // likelihood mode
  if (cig) return null; // conditional intensity is not a point on the likelihood scale
  if (hazard === "cat") return lvl as number; // CAT_LEVELS is 0-indexed 0-5, matching classify()'s 0-5 output
  return (lvl as number) - 1; // likelihood palettes are 5 entries at index 0-4; classify() returns 1-5
}

/** The intensity palette for a hazard, defaults only — used for its length. */
function intensityLevels(hazard: Hazard): LevelDef[] {
  if (hazard === "torn") return TORNADO_INTENSITY;
  if (hazard === "hail") return HAIL_INTENSITY;
  if (hazard === "wind") return WIND_INTENSITY;
  return CAT_LEVELS;
}
