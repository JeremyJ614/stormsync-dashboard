/**
 * How navigation opens — an admin decision, not a per-device preference.
 *
 * The menu is part of how the product presents itself, so the owner picks it
 * for everyone from the admin panel, and picks separately for the panel itself.
 * That lets a style be tried on the admin side while members stay on another.
 *
 * The value is read from `app_config.menu_styles` (public-readable, admin-
 * writable) and mirrored into localStorage purely so the first paint after a
 * reload draws the right menu instead of flashing the default and swapping.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export const MENU_STYLES = ["rail", "spiral", "push", "gooey", "singularity"] as const;
export type MenuStyle = (typeof MENU_STYLES)[number];

export interface MenuStyleConfig { customer: MenuStyle; admin: MenuStyle }
const FALLBACK: MenuStyleConfig = { customer: "rail", admin: "rail" };

export const MENU_META: Record<MenuStyle, { label: string; blurb: string; hint: string }> = {
  rail: {
    label: "Classic Rail",
    blurb: "The original sidebar. Icons down the left, labels when it expands.",
    hint: "The only style that keeps a permanent 62px rail on screen.",
  },
  spiral: {
    label: "Golden Spiral",
    blurb: "Sections unfurl as Fibonacci tiles, largest last, over a champagne bloom. Tap one and the spiral re-forms around its modules.",
    hint: "Recursive — the same shape at both levels.",
  },
  push: {
    label: "Canvas Push",
    blurb: "The app tilts away in 3D and the full menu stands behind it, lit along a champagne seam.",
    hint: "Shows every section at once; the trigger morphs as it opens.",
  },
  gooey: {
    label: "Gooey Orb",
    blurb: "An orb that stretches into arcs of liquid blobs at the thumb, paging when a section is large.",
    hint: "Everything stays inside thumb reach.",
  },
  singularity: {
    label: "Singularity",
    blurb: "A collapsing core with an accretion disc; sections orbit it and become moons when chosen.",
    hint: "The most theatrical. Best on a good screen.",
  },
};

// ── store ────────────────────────────────────────────────────────────────────
const CACHE = "stormsync_menu_styles_v2";
const listeners = new Set<() => void>();
let current: MenuStyleConfig = readCache();
let loaded = false;

function coerce(v: unknown): MenuStyle | null {
  return typeof v === "string" && (MENU_STYLES as readonly string[]).includes(v) ? (v as MenuStyle) : null;
}

function readCache(): MenuStyleConfig {
  try {
    const raw = localStorage.getItem(CACHE);
    if (raw) {
      const v = JSON.parse(raw) as Partial<MenuStyleConfig>;
      return { customer: coerce(v.customer) ?? FALLBACK.customer, admin: coerce(v.admin) ?? FALLBACK.admin };
    }
  } catch { /* private mode, or nothing stored yet */ }
  return FALLBACK;
}

function publish(next: MenuStyleConfig) {
  if (next.customer === current.customer && next.admin === current.admin) return;
  current = next;
  try { localStorage.setItem(CACHE, JSON.stringify(next)); } catch { /* nothing to do */ }
  listeners.forEach((l) => l());
}

/** Fetch the live configuration. Safe to call repeatedly; it is cheap and cached. */
export async function loadMenuStyles(): Promise<MenuStyleConfig> {
  if (!isSupabaseConfigured) return current;
  const { data, error } = await supabase.from("app_config").select("value").eq("key", "menu_styles").maybeSingle();
  if (error || !data?.value) {
    if (error) logger.error("loadMenuStyles failed", { scope: "menu", error });
    loaded = true;
    return current;
  }
  const v = data.value as Partial<MenuStyleConfig>;
  publish({ customer: coerce(v.customer) ?? FALLBACK.customer, admin: coerce(v.admin) ?? FALLBACK.admin });
  loaded = true;
  return current;
}

export async function saveMenuStyles(next: MenuStyleConfig): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("app_config").update({ value: next }).eq("key", "menu_styles");
  if (error) { logger.error("saveMenuStyles failed", { scope: "menu", error }); return { ok: false, error: error.message }; }
  publish(next);
  return { ok: true };
}

export function subscribeMenuStyles(fn: () => void): () => void {
  // The first subscriber triggers the fetch, so nothing loads it on a page that
  // never renders navigation.
  if (!loaded) void loadMenuStyles();
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getMenuStylesSnapshot(): MenuStyleConfig { return current; }
export function getMenuStylesServerSnapshot(): MenuStyleConfig { return FALLBACK; }

/** The style that applies to a given viewer. */
export function styleFor(cfg: MenuStyleConfig, isAdmin: boolean): MenuStyle {
  return isAdmin ? cfg.admin : cfg.customer;
}
