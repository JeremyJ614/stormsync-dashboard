/**
 * SPC Outlook color system — one palette per hazard "kind", matching the
 * exact colors/labels you specified. Shared by the live MapLibre map and the
 * static SVG map, so both always stay visually identical.
 *
 * IMPORTANT about "Intensity" tabs: SPC's real public GeoJSON only carries
 * ONE higher-end threshold per hazard (the hatched "Significant Severe" area
 * -- EF2+ tornado potential / 2"+ hail / 65kt+(75mph) wind). It does NOT
 * publish EF3+/EF4+ or 85mph/Derecho as separate contours. So Intensity tabs
 * here show 2 REAL tiers (general risk area, and SPC's actual significant-
 * severe threshold) rather than inventing 4 tiers with no data behind them.
 * The 4-tier version you spec'd is possible, but only via the full
 * experimental CAPE/SRH/STP composite model -- a separate, much bigger build.
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

// ── Tornado Intensity -- 2 real tiers (see note above) ───────────────────────
export const TORNADO_INTENSITY: LevelDef[] = [
  { color: "#FFD6E8", label: "Tornadoes Possible" },
  { color: "#E0218A", label: "EF2+ Possible (Significant)" },
];

// ── Hail Likelihood (off-white -> dark navy) ─────────────────────────────────
export const HAIL_LIKELIHOOD: LevelDef[] = [
  { color: "#F5F5F0", label: "Level 1" },
  { color: "#D6EFFF", label: "Level 2 · Possible" },
  { color: "#2A9DF4", label: "Level 3" },
  { color: "#2647D6", label: "Level 4" },
  { color: "#0A1F5C", label: "Level 5 · Hail Certainty" },
];

// ── Hail Intensity -- 2 real tiers (1"+ your exact periwinkle; 2"+ = SPC's ──
//     actual significant-hail threshold, which IS 2") ───────────────────────
export const HAIL_INTENSITY: LevelDef[] = [
  { color: "#CCCCFF", label: "1\"+ Possible (Quarter)" },
  { color: "#7851A9", label: "2\"+ Significant (Golfball)" },
];

// ── Wind Likelihood (lightest green -> darkest green) ────────────────────────
export const WIND_LIKELIHOOD: LevelDef[] = [
  { color: "#E8FFE0", label: "Level 1" },
  { color: "#A8E6A1", label: "Level 2 · High Winds Possible" },
  { color: "#5CB85C", label: "Level 3" },
  { color: "#2E8B2E", label: "Level 4" },
  { color: "#0B4D0B", label: "Level 5 · Severe Wind Certain" },
];

// ── Wind Intensity -- 2 real tiers (60mph general area; 75mph = SPC's actual ─
//     significant-wind threshold, 65kt). Your exact hex for both. ───────────
export const WIND_INTENSITY: LevelDef[] = [
  { color: "#FDFBD4", label: "60+ mph Possible" },
  { color: "#DAA520", label: "75+ mph Significant" },
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

/** A feature's level index into its palette, or null (skip -- e.g. "Predictability Too Low"). */
export function classify(hazard: Hazard, feature: GeoJSON.Feature): number | "sig" | null {
  const label = String(feature.properties?.LABEL ?? "");
  if (hazard === "cat") return CAT_LEVEL_MAP[label.toUpperCase()] ?? 0;
  const pct = labelToPct(label);
  if (pct === null) return "sig"; // hatched significant-severe features carry a non-numeric label
  return probToLevel(hazard, pct);
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
  if (mode === "intensity") {
    if (hazard === "cat") return null; // Intensity tabs only apply to torn/hail/wind
    return lvl === "sig" ? 1 : 0;
  }
  // likelihood mode
  if (lvl === "sig") return null; // the hatched sig-severe outline isn't part of the graduated likelihood scale
  if (hazard === "cat") return lvl; // CAT_LEVELS is 0-indexed 0-5, matching classify()'s 0-5 output directly
  return lvl - 1; // hazard likelihood palettes are 5 entries (Level 1-5) at index 0-4; classify() returns 1-5
}
