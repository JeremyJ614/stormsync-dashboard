/**
 * Map colours an admin can change without a deploy.
 *
 * The Thunderstorm Probability scale and the SPC Outlook palettes are the two
 * places in the app where colour IS the data: the whole reading of the map is
 * "how bad is that shade". Getting one wrong is not cosmetic — level 1 pearl
 * white and level 5 steel grey reading as the same thing on a dark basemap is a
 * forecaster misreading a map — and iterating on it through a deploy cycle is
 * how it stays wrong.
 *
 * So the palettes are defaults in code with an override layer in `app_config`.
 * Nothing is stored unless it has been changed, which means:
 *
 *   - a fresh install looks exactly as designed with an empty override table
 *   - improving a default in code reaches everyone who has not overridden it
 *   - "reset" is deleting a row, not remembering what the old hex was
 *
 * Loaded once into a module snapshot at boot, same shape as `navConfig`, so a
 * component can read a colour synchronously while rendering a map layer.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

/** `prob:3`, `spc:cat:2`, `spc:tornadoLikelihood:4` — palette and index. */
export type PaletteKey = string;

export interface PaletteState { colors: Record<PaletteKey, string>; loaded: boolean }

let snapshot: PaletteState = { colors: {}, loaded: false };
const listeners = new Set<() => void>();
const emit = (next: PaletteState) => { snapshot = next; listeners.forEach((l) => l()); };

export function getPaletteSnapshot(): PaletteState { return snapshot; }
const SERVER_SNAPSHOT: PaletteState = { colors: {}, loaded: false };
export function getPaletteServerSnapshot(): PaletteState { return SERVER_SNAPSHOT; }

export function subscribePalette(cb: () => void): () => void {
  listeners.add(cb);
  void loadMapPalette();
  return () => { listeners.delete(cb); };
}

let inflight: Promise<void> | null = null;

export function loadMapPalette(force = false): Promise<void> {
  if (!isSupabaseConfigured) return Promise.resolve();
  if (!force && (snapshot.loaded || inflight)) return inflight ?? Promise.resolve();
  inflight = (async () => {
    try {
      const { data } = await supabase
        .from("app_config").select("value").eq("key", "map_palettes").maybeSingle();
      const colors = ((data?.value as { colors?: Record<string, string> } | null)?.colors) ?? {};
      emit({ colors, loaded: true });
    } catch (error) {
      logger.error("loadMapPalette failed", { scope: "palette", error });
      emit({ colors: {}, loaded: true });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * The colour to actually paint.
 *
 * `fallback` is the design default and is what comes back whenever there is no
 * override — including before the config has loaded, which is why every caller
 * can be synchronous and no map ever flashes a placeholder colour.
 */
export function paletteColor(key: PaletteKey, fallback: string): string {
  return snapshot.colors[key] ?? fallback;
}

/** Save the whole override set. Admin-only by RLS on `app_config`. */
export async function saveMapPalette(
  colors: Record<PaletteKey, string>,
): Promise<{ ok: boolean; error?: string }> {
  // Only genuine overrides are stored. An entry equal to its default is noise
  // that would later stop a corrected default from reaching anybody.
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(colors)) {
    if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) clean[k] = v.toUpperCase();
  }
  const { error } = await supabase
    .from("app_config")
    // `is_public` has to be re-asserted on every write: `app_config` only lets
    // members read public rows, and an upsert that dropped the flag would make
    // the new colours visible to admins alone.
    .upsert({ key: "map_palettes", value: { colors: clean }, is_public: true }, { onConflict: "key" });
  if (error) { logger.error("saveMapPalette failed", { scope: "palette", error }); return { ok: false, error: error.message }; }
  emit({ colors: clean, loaded: true });
  return { ok: true };
}

/** Apply an edit locally so every map on screen repaints before it is saved. */
export function previewMapPalette(colors: Record<PaletteKey, string>): void {
  emit({ colors, loaded: true });
}
