/**
 * Appearance system (Phase 9 / L4) — multiple dark themes + a custom accent.
 *
 * The design tokens are HSL CSS variables on :root. A theme re-hues the dark
 * background family and sets the accent (`--primary` and friends); the accent
 * picker overrides just the accent with any hex. Everything is applied by
 * writing inline custom properties on <html>, and persisted to localStorage so
 * it's set before first paint (see `initTheme` called from main.tsx).
 *
 * IMPORTANT: these inline properties beat every rule in index.css, so the
 * default preset below must reproduce the royal ground defined there exactly.
 * When the two drifted apart the whole app silently rendered in the old
 * blue-grey palette no matter what index.css said.
 */

export interface ThemePreset {
  id: string;
  label: string;
  /** Base hue (0-360) for the dark background family. */
  bgHue: number;
  /** Saturation multiplier for the background family (1 = same as Royal). */
  bgSat: number;
  /** Accent as an "H S% L%" triplet. */
  primary: string;
  /** Accent foreground as an "H S% L%" triplet. */
  primaryFg: string;
  /** Hex used for the preview swatch. */
  swatch: string;
}

export const THEMES: ThemePreset[] = [
  { id: "royal",        label: "Royal",        bgHue: 235, bgSat: 1,    primary: "40 57% 65%",   primaryFg: "236 40% 8%",  swatch: "#d9b775" },
  { id: "midnight",     label: "Midnight",     bgHue: 232, bgSat: 0.9,  primary: "240 100% 90%", primaryFg: "232 24% 8%",  swatch: "#c7ccff" },
  { id: "storm-purple", label: "Storm Purple", bgHue: 265, bgSat: 1.15, primary: "270 95% 78%",  primaryFg: "270 40% 12%", swatch: "#b388ff" },
  { id: "noaa-classic", label: "NOAA Classic", bgHue: 214, bgSat: 1.05, primary: "205 90% 62%",  primaryFg: "210 50% 8%",  swatch: "#3b9eff" },
  { id: "amber-chase",  label: "Amber Chase",  bgHue: 28,  bgSat: 0.55, primary: "38 96% 56%",   primaryFg: "30 60% 10%",  swatch: "#ffab2e" },
];

export const DEFAULT_THEME = "royal";

// Background-family tokens as [token, hueOffset, saturation%, lightness%],
// taken verbatim from the royal ground in index.css. A preset shifts the hue
// and scales the saturation; lightness never moves, so contrast is identical
// across every theme.
const BG_TOKENS: [string, number, number, number][] = [
  ["background",      1, 30,  6],
  ["card",            0, 26, 10],
  ["sidebar",         3, 32,  5],
  ["popover",         1, 26,  8],
  ["border",         -1, 20, 17],
  ["card-border",    -1, 20, 17],
  ["sidebar-border", -3, 18, 13],
  ["popover-border", -3, 18, 16],
  ["sidebar-accent", -3, 18, 12],
  ["secondary",      -3, 18, 16],
  ["muted",           0, 20, 13],
  ["accent",         -3, 18, 16],
  ["input",          -3, 18, 20],
];

// v2: v1 stored "midnight" as everyone's default, which pinned the app to the
// old blue-grey palette even after the royal ground landed. Bumping the key
// lands existing members on Royal; re-picking a preset is one tap.
const STORAGE = "stormsync_theme_v2";

interface Saved { theme: string; accent: string | null }
function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) { const v = JSON.parse(raw) as Saved; if (v && typeof v.theme === "string") return { theme: v.theme, accent: v.accent ?? null }; }
  } catch { /* ignore */ }
  return { theme: DEFAULT_THEME, accent: null };
}
function save(s: Saved) { try { localStorage.setItem(STORAGE, JSON.stringify(s)); } catch { /* ignore */ } }

export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0; const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function applyVars(preset: ThemePreset, accent: string | null) {
  const root = document.documentElement.style;
  for (const [token, hueOffset, sat, light] of BG_TOKENS) {
    const hue = ((preset.bgHue + hueOffset) % 360 + 360) % 360;
    root.setProperty(`--${token}`, `${hue} ${Math.round(sat * preset.bgSat)}% ${light}%`);
  }
  // Accent: explicit hex overrides the preset's primary.
  let primary = preset.primary, primaryFg = preset.primaryFg;
  if (accent) {
    const hsl = hexToHsl(accent);
    if (hsl) { primary = `${hsl.h} ${hsl.s}% ${hsl.l}%`; primaryFg = hsl.l > 60 ? "232 24% 8%" : "0 0% 100%"; }
  }
  for (const t of ["primary", "ring", "sidebar-primary", "sidebar-ring"]) root.setProperty(`--${t}`, primary);
  root.setProperty("--primary-foreground", primaryFg);
  root.setProperty("--sidebar-primary-foreground", primaryFg);
  // `--gold` stays the fixed champagne signature (rules, eyebrows, hairlines)
  // so the royal furniture reads the same under every preset.
}

export function getTheme(): { theme: string; accent: string | null } { return load(); }

/** Apply + persist. Pass accent `null` to clear the custom accent. */
export function setTheme(themeId: string, accent: string | null): void {
  const preset = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  applyVars(preset, accent);
  save({ theme: preset.id, accent });
  window.dispatchEvent(new Event("stormsync-theme"));
}

/** Call once at startup (before React renders) to apply the saved appearance. */
export function initTheme(): void {
  const { theme, accent } = load();
  const preset = THEMES.find((t) => t.id === theme) ?? THEMES[0];
  applyVars(preset, accent);
}
