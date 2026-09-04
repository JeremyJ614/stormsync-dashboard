/**
 * How the wall looks, as settings rather than as code.
 *
 * The wall is a slate board with names cut into it, and the two things that
 * decide whether it reads as carved stone or as glowing text on a rectangle —
 * how far the light bleeds out of the cut, and how bright the board itself
 * sits against the page — are exactly the things that cannot be judged from a
 * hex value. They have to be looked at, on a real board, with real names in
 * it, at night and in daylight. So they are dials the owner can turn rather
 * than constants a deploy has to change.
 *
 * Same shape as `mapPalette`: defaults in code, an override row in
 * `app_config`, nothing stored unless it has been deliberately changed. A
 * fresh install looks exactly as designed with an empty table, and improving a
 * default in code still reaches everyone who has not overridden it.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export interface WallStyle {
  /** Board colour. Near-black on purpose — it sits on a near-black page. */
  board: string;
  /** The single blessed name. */
  blessed: string;
  /** Everybody on the roll beneath the line. */
  roll: string;
  /** The carved divider. */
  rule: string;
  /**
   * How far light spills from a cut, 0–100.
   *
   * 0 is a groove with no light in it at all — legible, but dead. 100 is a
   * neon sign, which is the opposite of carved. The default sits low because
   * the brief was "glowing just a little".
   */
  glow: number;
  /** How far the board lifts off the page behind it, 0–100. */
  brightness: number;
}

export const WALL_DEFAULTS: WallStyle = {
  board: "#0b1210",
  blessed: "#e8c479",
  roll: "#e8ecf6",
  rule: "#c8a86a",
  glow: 34,
  brightness: 26,
};

export interface WallStyleState { style: WallStyle; loaded: boolean }

let snapshot: WallStyleState = { style: WALL_DEFAULTS, loaded: false };
const listeners = new Set<() => void>();
const emit = (next: WallStyleState) => { snapshot = next; listeners.forEach((l) => l()); };

export function getWallStyleSnapshot(): WallStyleState { return snapshot; }
const SERVER_SNAPSHOT: WallStyleState = { style: WALL_DEFAULTS, loaded: false };
export function getWallStyleServerSnapshot(): WallStyleState { return SERVER_SNAPSHOT; }

export function subscribeWallStyle(cb: () => void): () => void {
  listeners.add(cb);
  void loadWallStyle();
  return () => { listeners.delete(cb); };
}

let inflight: Promise<void> | null = null;

export function loadWallStyle(force = false): Promise<void> {
  if (!isSupabaseConfigured) return Promise.resolve();
  if (!force && (snapshot.loaded || inflight)) return inflight ?? Promise.resolve();
  inflight = (async () => {
    try {
      const { data } = await supabase
        .from("app_config").select("value").eq("key", "wall_style").maybeSingle();
      emit({ style: merge(data?.value as Partial<WallStyle> | null), loaded: true });
    } catch (error) {
      logger.error("loadWallStyle failed", { scope: "wall", error });
      emit({ style: WALL_DEFAULTS, loaded: true });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * A stored value laid over the defaults, field by field.
 *
 * Validated rather than trusted: this row is editable, and a board colour that
 * arrives as `null` or a glow that arrives as the string "34" would otherwise
 * reach a style attribute and take the whole component down with it.
 */
function merge(stored: Partial<WallStyle> | null | undefined): WallStyle {
  const out = { ...WALL_DEFAULTS };
  if (!stored || typeof stored !== "object") return out;
  for (const k of ["board", "blessed", "roll", "rule"] as const) {
    const v = stored[k];
    if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) out[k] = v;
  }
  for (const k of ["glow", "brightness"] as const) {
    const v = Number(stored[k]);
    if (Number.isFinite(v)) out[k] = Math.min(100, Math.max(0, Math.round(v)));
  }
  return out;
}

export async function saveWallStyle(style: WallStyle): Promise<{ ok: boolean; error?: string }> {
  const clean = merge(style);
  const { error } = await supabase
    .from("app_config")
    // `is_public` re-asserted on every write, exactly as the map palettes do:
    // `app_config` only lets members read public rows, so an upsert that
    // dropped the flag would leave the wall styled for admins alone.
    .upsert({ key: "wall_style", value: clean, is_public: true }, { onConflict: "key" });
  if (error) {
    logger.error("saveWallStyle failed", { scope: "wall", error });
    return { ok: false, error: error.message };
  }
  emit({ style: clean, loaded: true });
  return { ok: true };
}

/** Apply an edit locally so the wall on screen repaints before it is saved. */
export function previewWallStyle(style: WallStyle): void {
  emit({ style: merge(style), loaded: true });
}

// ── derived, so the component and the admin preview cannot disagree ─────────

/** `rgba()` from a `#rrggbb` and an alpha. */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Mix a hex toward white. `amount` 0 keeps it, 1 is white. */
function lighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * Math.max(0, Math.min(1, amount)));
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The colour at the centre of the stroke.
 *
 * Light in a groove is not the colour of the light — the hottest part of it
 * reads close to white and only the spill carries the hue. A gold letter drawn
 * in flat gold looks like gold text; the same letter with a pale core and a
 * gold bloom looks like something lit from inside the cut. More glow means a
 * hotter core, which is why this takes the dial too.
 */
export function carveCore(colour: string, glow: number): string {
  const g = Math.max(0, Math.min(100, glow)) / 100;
  return lighten(colour, 0.42 + g * 0.26);
}

/**
 * A letter cut into slate, with light living in the cut.
 *
 * Built from the reference rather than from a formula: an incised stroke on a
 * dark wall is a thin bright line, a tight halo where the light hits the walls
 * of the groove, a wider bloom washing the surface either side, and one dark
 * seat underneath where the surface is broken. Four glow radii rather than two
 * because a single blur reads as a sticker with a shadow — it is the falloff
 * across several distances that makes it look like light escaping a recess.
 *
 * There is deliberately NO dark outline around the glyph. That was the previous
 * version's mistake: ringing a bright letter in black pushes the bloom off the
 * surface and turns a lit groove back into text sitting on top of the board.
 * The only darkness is below, seating it.
 *
 * `scale` keeps a big name and a small one cut by the same blade; `glow` is the
 * owner's dial, and at 0 it is still a legible incision rather than nothing.
 */
export function carve(colour: string, glow: number, scale = 1): string {
  const g = Math.max(0, Math.min(100, glow)) / 100;
  const s = Math.max(0.6, scale);
  const r = (base: number) => (base * s * (0.45 + g * 0.9)).toFixed(1);
  return [
    // Seated in the surface: the shadow the broken edge throws.
    `0 ${(1.4 * s).toFixed(1)}px ${(2.2 * s).toFixed(1)}px rgba(0,0,0,0.95)`,
    // The stroke's own hard edge, then the light on the walls of the cut.
    `0 0 ${(1.1 * s).toFixed(1)}px ${tint(colour, 0.9)}`,
    `0 0 ${r(5)}px ${tint(colour, 0.5 + g * 0.4)}`,
    // The bloom washing the board on either side.
    `0 0 ${r(13)}px ${tint(colour, 0.24 + g * 0.34)}`,
    `0 0 ${r(30)}px ${tint(colour, 0.08 + g * 0.26)}`,
    `0 0 ${r(60)}px ${tint(colour, g * 0.18)}`,
  ].join(", ");
}
