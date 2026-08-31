/**
 * How the member opens navigation.
 *
 * Six presentations of one model. The classic rail is the default because it is
 * the one that survives every screen size and every hurry; the other five are
 * chosen deliberately by someone who wants them. All six read the same sections
 * from navModel, so a module added to the sidebar appears in all of them at
 * once, and none of them can drift out of agreement about what a member may see.
 *
 * Persisted per device, like the dashboard layout: this is a preference about
 * the screen in front of you, not a property of the account.
 */
export const MENU_STYLES = ["rail", "spiral", "gooey", "push", "fan", "singularity"] as const;
export type MenuStyle = (typeof MENU_STYLES)[number];

export const MENU_META: Record<MenuStyle, { label: string; blurb: string; hint: string }> = {
  rail: {
    label: "Classic Rail",
    blurb: "The sidebar you know. Icons down the left, labels when you expand it.",
    hint: "Fastest to scan, and the safest on a small screen.",
  },
  spiral: {
    label: "Golden Spiral",
    blurb: "Sections unfurl as Fibonacci tiles, largest last. Tap one and the spiral re-forms around its modules.",
    hint: "The spiral is recursive — the same shape at both levels.",
  },
  gooey: {
    label: "Gooey Orb",
    blurb: "A single orb that stretches into an arc of sections like liquid, then re-flows into the modules inside one.",
    hint: "Thumb-reachable: everything arcs from the bottom-right.",
  },
  push: {
    label: "Canvas Push",
    blurb: "The whole app tilts back in 3D and the full menu stands behind it.",
    hint: "The only one that shows every section at once.",
  },
  fan: {
    label: "Holographic Fan",
    blurb: "Glass cards fan out from the bottom. Pick a section and its modules deal out as a second fan.",
    hint: "Swipe across the fan to riffle through it.",
  },
  singularity: {
    label: "Singularity",
    blurb: "The trigger collapses into a black hole and the sections orbit it. Tap a planet and its modules become moons.",
    hint: "The most theatrical, and the heaviest — best on a good screen.",
  },
};

const STORAGE = "stormsync_menu_style_v1";

export function getMenuStyle(): MenuStyle {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw && (MENU_STYLES as readonly string[]).includes(raw)) return raw as MenuStyle;
  } catch { /* private mode, or storage disabled */ }
  return "rail";
}

export function saveMenuStyle(style: MenuStyle): void {
  try { localStorage.setItem(STORAGE, style); } catch { /* nothing to do */ }
  listeners.forEach((l) => l());
}

// A tiny store so the layout re-renders the moment the picker changes, without
// threading the preference through every component in between.
const listeners = new Set<() => void>();
export function subscribeMenuStyle(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
let cached: MenuStyle | null = null;
export function getMenuStyleSnapshot(): MenuStyle {
  const v = getMenuStyle();
  if (v !== cached) cached = v;
  return cached;
}
export function getMenuStyleServerSnapshot(): MenuStyle { return "rail"; }
