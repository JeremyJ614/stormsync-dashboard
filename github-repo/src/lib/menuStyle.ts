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

/**
 * The styles, in two groups.
 *
 * `Originals` are the four that survived the cull. `Portal Lab` are the set
 * built and chosen in the Portal Menu Lab, ported here in the app's own ROYAL
 * tokens rather than the lab's — a menu that does not match the page it opens
 * over reads as a different product, and ROYAL's iris is within a few points of
 * the lab's periwinkle anyway.
 *
 * A style removed from this list cannot strand anyone. `coerce` rejects any
 * value it does not recognise, so a member whose profile still names a deleted
 * style, or an `app_config` row that does, simply falls through to FALLBACK.
 */
export const MENU_STYLES = [
  // Originals
  "push", "tessellate", "comic", "apex",
  // Portal Lab — the twelve chosen from the lab, by kind
  "auroraSidebar", "stackedCards", "floatingGlass",
  "tabbedMega", "bentoMega",
  "dualPush", "twoStagePush",
  "railAccordion",
  "labelledStack", "morphSheet",
  "segmentedPill", "collapsingPill",
] as const;
export type MenuStyle = (typeof MENU_STYLES)[number];

/** Which block of the picker a style belongs to. */
export type MenuGroup = "Originals" | "Portal Lab";

export interface MenuStyleConfig { customer: MenuStyle; admin: MenuStyle }
// Canvas Push is the default now that the classic rail is gone: it is the only
// keeper that shows every section at once, which is what the rail did.
const FALLBACK: MenuStyleConfig = { customer: "push", admin: "push" };

export interface MenuInfo {
  label: string;
  blurb: string;
  hint: string;
  /** Which block of the picker this sits in. */
  group: MenuGroup;
  /** The kind of navigation it is, shown as a chip beside the name. */
  kind: string;
}

export const MENU_META: Record<MenuStyle, MenuInfo> = {
  // ── Originals ────────────────────────────────────────────────────────────
  push: {
    label: "Canvas Push",
    group: "Originals", kind: "Off-canvas push",
    blurb: "The app tilts away in 3D and the full menu stands behind it, lit along a champagne seam.",
    hint: "Shows every section at once. Tap the tilted app, or the close control, to put it back.",
  },
  tessellate: {
    label: "Tessellate",
    group: "Originals", kind: "Honeycomb",
    blurb: "A honeycomb of bevelled cells that spin in from the middle outward, with a wave of light crossing the whole comb on a loop.",
    hint: "Dense and thumb-reachable; the comb grows from where the trigger was.",
  },
  comic: {
    label: "Comic",
    group: "Originals", kind: "Panel grid",
    blurb: "A page of small panels on newsprint — black rules, white gutters, angled halftone, speed lines and hand-lettered caption boxes. Panels snap rather than ease.",
    hint: "The densest layout here: three across, so a whole section fits on one page.",
  },
  apex: {
    label: "Apex",
    group: "Originals", kind: "Thumb arc",
    blurb: "A thumb-anchored arc that opens on a press and stays open. Tap a node to choose it; whatever is nearest your thumb magnifies like a dock.",
    hint: "Operable without looking. The trigger's ring reads how far along the arc you are.",
  },

  // ── Portal Lab ───────────────────────────────────────────────────────────
  auroraSidebar: {
    label: "Aurora Sidebar",
    group: "Portal Lab", kind: "Sidebar",
    blurb: "The aurora curtain as a sidebar. Three bands of light sweep the inside of the panel on a loop.",
    hint: "The soft edge is a gradient rather than a blur, which is why it moves without costing a frame.",
  },
  stackedCards: {
    label: "Stacked Cards",
    group: "Portal Lab", kind: "Sidebar",
    blurb: "Bold title over a small subtitle, as cards. The one under your finger slides out of the rail and takes a periwinkle edge light.",
    hint: "The subtitle earns the width: \u201cSevere Weather \u00b7 9 modules\u201d says more than the name alone.",
  },
  floatingGlass: {
    label: "Floating Glass",
    group: "Portal Lab", kind: "Sidebar",
    blurb: "A detached rounded panel over the page with a scrubber rail beside the list that travels to whatever you are on.",
    hint: "Detached, so the page keeps its full width behind it.",
  },
  tabbedMega: {
    label: "Tabbed Mega",
    group: "Portal Lab", kind: "Mega menu",
    blurb: "Sections down the left swap the modules on the right without the panel closing. Cross-fade, so nothing jumps.",
    hint: "Both levels on screen at once \u2014 the only styles here that never make you drill in.",
  },
  bentoMega: {
    label: "Bento Mega",
    group: "Portal Lab", kind: "Mega menu",
    blurb: "Asymmetric tiles rather than columns, with one large tile carrying live figures. Reads as a dashboard you can navigate.",
    hint: "The widest tile is whichever section holds the most, so the asymmetry tracks what is actually inside.",
  },
  dualPush: {
    label: "Dual Pane Push",
    group: "Portal Lab", kind: "Off-canvas push",
    blurb: "A real off-canvas push: the app moves aside instead of being covered, and the panel carries oversized type with a numbered index.",
    hint: "No scrim \u2014 a push that dims the page it pushed aside is covering it after all.",
  },
  twoStagePush: {
    label: "Two-Stage Push",
    group: "Portal Lab", kind: "Off-canvas push",
    blurb: "An icon rail first, expanding to a labelled panel when you want it. Both stages push the app rather than covering it.",
    hint: "The rail is useful on its own, so most of the time stage two never comes up.",
  },
  railAccordion: {
    label: "Exclusive with Rail",
    group: "Portal Lab", kind: "Accordion",
    blurb: "One section open at a time, with a gradient marker on the rail that springs to it and stretches to its height.",
    hint: "Exclusive is what keeps the panel about a screen tall, which is what makes an accordion work on a phone.",
  },
  labelledStack: {
    label: "Labelled Stack",
    group: "Portal Lab", kind: "FAB",
    blurb: "Springs upward as a column, each label sliding in from the right just after its button lands.",
    hint: "Labels are always visible, never on hover \u2014 a phone has no hover, and unlabelled circles are mystery buttons.",
  },
  morphSheet: {
    label: "Morph to Sheet",
    group: "Portal Lab", kind: "FAB",
    blurb: "The button becomes the sheet. One element grows from a corner circle into a panel across the bottom.",
    hint: "One element rather than two, which is the difference between a morph and a cross-fade wearing its clothes.",
  },
  segmentedPill: {
    label: "Segmented Pill",
    group: "Portal Lab", kind: "Floating pill",
    blurb: "A pill floating above the content with a thumb that slides under whichever segment you are on.",
    hint: "Floats rather than docking, so the page keeps its full height.",
  },
  collapsingPill: {
    label: "Collapsing Pill",
    group: "Portal Lab", kind: "Floating pill",
    blurb: "Shrinks to the active label as you scroll down and comes back when you scroll up.",
    hint: "Navigation out of the way while reading and back when you want it, without a hamburger.",
  },
};

/** The picker's blocks, in order. */
export const MENU_GROUP_ORDER: readonly MenuGroup[] = ["Originals", "Portal Lab"] as const;

/**
 * Styles arranged into their blocks.
 *
 * Both pickers render the same shape, so the grouping is decided once here
 * rather than twice in the UI — and a style added to MENU_STYLES appears in
 * both automatically, under whatever group its meta names.
 */
export function groupedStyles(): { group: MenuGroup; styles: MenuStyle[] }[] {
  return MENU_GROUP_ORDER.map((group) => ({
    group,
    styles: MENU_STYLES.filter((s) => MENU_META[s].group === group),
  })).filter((g) => g.styles.length > 0);
}

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

/**
 * The style that applies to a given viewer.
 *
 * A member's own pick wins. The admin setting is the DEFAULT — what somebody
 * gets before they have an opinion, and what they keep following if they never
 * form one. That distinction is the whole point of storing `null` rather than
 * copying the default into every profile: change the default and everyone who
 * has not chosen moves with it, while everyone who has chosen is left alone.
 */
export function styleFor(
  cfg: MenuStyleConfig, isAdmin: boolean, own?: string | null,
): MenuStyle {
  return coerce(own) ?? (isAdmin ? cfg.admin : cfg.customer);
}

/** Record a member's choice. `null` puts them back on the default. */
export async function saveMyMenuStyle(
  userId: string, style: MenuStyle | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase
    .from("profiles").update({ menu_style: style }).eq("id", userId);
  if (error) { logger.error("saveMyMenuStyle failed", { scope: "menu", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}
