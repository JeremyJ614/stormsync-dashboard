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

export const MENU_STYLES = [
  "rail", "push", "strata", "mercury", "vault", "singularity",
  "aurora", "origami", "geometric", "neon",
  "tessellate", "kinetic", "elevator", "comic", "apex",
] as const;
export type MenuStyle = (typeof MENU_STYLES)[number];

export interface MenuStyleConfig { customer: MenuStyle; admin: MenuStyle }
const FALLBACK: MenuStyleConfig = { customer: "rail", admin: "rail" };

export const MENU_META: Record<MenuStyle, { label: string; blurb: string; hint: string }> = {
  rail: {
    label: "Classic Rail",
    blurb: "The original sidebar. Icons down the left, labels when it expands.",
    hint: "The only style that keeps a permanent 62px rail on screen.",
  },
  push: {
    label: "Canvas Push",
    blurb: "The app tilts away in 3D and the full menu stands behind it, lit along a champagne seam.",
    hint: "Shows every section at once. Tap the tilted app, or the close control, to put it back.",
  },
  strata: {
    label: "Strata",
    blurb: "A core sample. Layers decompress out of one pile in real depth, lit by a light that travels down the stack, and they parallax as you move.",
    hint: "The calmest of the set and the fastest to scan — theatre in the transition, a plain list at rest.",
  },
  mercury: {
    label: "Mercury",
    blurb: "A stream of liquid metal runs out of a reservoir and beads — the necks between the drops thin until each one pinches off on its own.",
    hint: "The break-up is real behaviour, not a fade: a falling stream does it because surface tension costs less in spheres than in a cylinder.",
  },
  vault: {
    label: "Vault",
    blurb: "A strongroom. Eight bolts withdraw from the rim, the wheel turns, and the door swings open in perspective onto a wall of deposit boxes; a section pulls out as a drawer.",
    hint: "The only style that opens rather than appears. Knurled rim, turned face, brass fronts — all gradients, nothing loops.",
  },
  singularity: {
    label: "Singularity",
    blurb: "A black hole with a real accretion disc — passing behind the shadow above and in front of it below, Doppler-beamed bright on one limb — orbited by worlds with genuine terminators and ring systems.",
    hint: "The most cinematic. Best on a good screen.",
  },
  aurora: {
    label: "Aurora",
    blurb: "The sky itself. Sections are curtains of aurora standing over a ridge, summed on a canvas so folds brighten where they cross; inside one, the modules are a named constellation.",
    hint: "The centrepiece. The only style whose subject is the same as the product's.",
  },
  origami: {
    label: "Origami",
    blurb: "A folded sheet. Panels hinge open on the creases they share, each face catching light from the direction it turned, and the trigger's outline morphs from square to kite to star.",
    hint: "Quiet and tactile; the fold does the work rather than a colour change.",
  },
  geometric: {
    label: "Geometric",
    blurb: "Every control is a polygon in the middle of becoming another one — triangle to pentagon to octagon and back — over a slowly turning construction lattice.",
    hint: "Shapes morph continuously because each is sampled at the same point count, so the outlines genuinely interpolate.",
  },
  neon: {
    label: "Neon",
    blurb: "A sign on a wet street. Tubes strike one after another, the light lands on the road below, and exactly one tube per opening has a fault it never shakes off.",
    hint: "The most atmospheric. Leaves the champagne palette on purpose.",
  },
  tessellate: {
    label: "Tessellate",
    blurb: "A honeycomb of bevelled cells that spin in from the middle outward, with a wave of light crossing the whole comb on a loop.",
    hint: "Dense and thumb-reachable; the comb grows from where the trigger was.",
  },
  kinetic: {
    label: "Kinetic",
    blurb: "Rows arrive from alternating sides fast enough to overshoot, each dragging a real motion trail. Choosing a section sends the others back out the way they came as its modules cascade in.",
    hint: "The most kinetic of the set — nothing on screen ever cross-fades.",
  },
  elevator: {
    label: "Elevator",
    blurb: "A lift shaft in section: guide rails, bolt plates, brushed doors that part from a seam, and a car that travels to the floor you pick.",
    hint: "Every edge is drawn, so it reads as machinery rather than as a list on black.",
  },
  comic: {
    label: "Comic",
    blurb: "A page of small panels on newsprint — black rules, white gutters, angled halftone, speed lines and hand-lettered caption boxes. Panels snap rather than ease.",
    hint: "The densest layout here: three across, so a whole section fits on one page.",
  },
  apex: {
    label: "Apex",
    blurb: "A thumb-anchored arc. Press and drag to sweep through it and release on one, or tap to open and tap to choose; whatever is nearest magnifies like a dock.",
    hint: "Operable without looking. The trigger's ring reads how far along the arc your thumb is.",
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
