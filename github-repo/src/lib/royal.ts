/**
 * StormSync VIP — the shared "royal" design language.
 *
 * Deep indigo ground, champagne hairlines, pale periwinkle for interactive
 * state. Everything visual that more than one module needs lives here so the
 * app reads as one system rather than a set of separately-styled pages.
 */

// ─── palette ─────────────────────────────────────────────────────────────────
export const ROYAL = {
  /** Champagne — the signature accent. Hairlines, eyebrows, active state. */
  gold: "#d9b775",
  goldSoft: "rgba(217,183,117,0.28)",
  goldFaint: "rgba(217,183,117,0.10)",
  /** Pale periwinkle — the app's existing primary. */
  iris: "#ccccff",
  irisSoft: "rgba(204,204,255,0.22)",
  /** Ground tones, darkest first. */
  ink: "#070713",
  ink2: "#0b0b1a",
  panel: "rgba(18,18,34,0.62)",
  hairline: "rgba(204,204,255,0.09)",
  /** Text. */
  text: "#f1f4ff",
  dim: "#a3a3cc",
} as const;

/** Heading face used across every royal surface. */
export const HEADING = "'Raleway', 'DM Sans', sans-serif";

// ─── motion ──────────────────────────────────────────────────────────────────
/**
 * One spring vocabulary for the whole app. `silk` carries layout and width,
 * `pop` carries press feedback, `drift` carries slow ambient movement.
 */
export const SPRING = {
  silk: { type: "spring", stiffness: 260, damping: 30, mass: 0.9 },
  pop: { type: "spring", stiffness: 520, damping: 22, mass: 0.6 },
  drift: { type: "spring", stiffness: 90, damping: 24 },
} as const;

/** Standard easing for non-spring transitions. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * True when the viewer has asked for reduced motion. Every animated surface
 * checks this and falls back to a cross-fade — the effects are decoration, and
 * decoration must never be the reason someone can't use the app.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ─── surface recipes ─────────────────────────────────────────────────────────
/** Glass panel with a champagne top-rule — the app's default container. */
export const panelStyle: React.CSSProperties = {
  background: ROYAL.panel,
  backdropFilter: "blur(14px) saturate(1.15)",
  WebkitBackdropFilter: "blur(14px) saturate(1.15)",
  border: `1px solid ${ROYAL.hairline}`,
  boxShadow: `0 1px 0 0 ${ROYAL.goldSoft} inset, 0 20px 44px -30px rgba(0,0,0,0.95)`,
};

/** The thin champagne gradient rule drawn across the top of a panel. */
export const topRule: React.CSSProperties = {
  background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)`,
};

/** Ambient aurora wash for hero surfaces. */
export const auroraStyle: React.CSSProperties = {
  background:
    `radial-gradient(60% 130% at 8% 0%, rgba(217,183,117,0.15), transparent 58%),` +
    `radial-gradient(70% 130% at 92% 4%, rgba(120,110,255,0.16), transparent 60%),` +
    `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
};
