import { useMemo } from "react";
import type { BadgeDef } from "../hooks/useAuth";
import { iconFor, type BadgeRarity } from "../lib/badgeIcons";
import { prefersReducedMotion } from "../lib/royal";

/**
 * A badge, as a medallion.
 *
 * The previous version was a text pill. One is fine; thirty is a wall of
 * shouting capitals, which is exactly the wrong thing on the page that is meant
 * to show off what someone has earned. This is a struck coin instead: a
 * metallic rim in the badge's own colour, a dark face, and the badge's icon in
 * the middle. Thirty of these read as a trophy case at a glance and take a
 * third of the width.
 *
 * Rarity changes how ornate the rim is and nothing else — a legendary badge
 * should look expensive without needing a label that says so.
 *
 * Tuned down from the first cut, which was too bright and too busy: every coin
 * fired a white sheen on mount, three of the four grades glowed, and the metal
 * highlight was light enough to flatten the icon against it. Thirty badges
 * should read as a quiet case of struck coins, not a lit display cabinet — so
 * the sheen is legendary-only, the glow is epic-and-up, and the highlight sits
 * closer to the badge's own colour.
 *
 * Everything is drawn with gradients, so a badge invented in the admin panel
 * five minutes ago looks exactly as struck as one that shipped with the app,
 * and no image is ever fetched.
 */
const SIZES = {
  sm: { d: 30, icon: 13, rim: 2, ring: 1 },
  md: { d: 42, icon: 18, rim: 2.5, ring: 1.2 },
  lg: { d: 64, icon: 27, rim: 3.5, ring: 1.6 },
} as const;

export type MedalSize = keyof typeof SIZES;

/** Channels of a #rrggbb colour, or null if it is not one. */
function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Pull a colour toward the pewter the coins are struck from.
 *
 * Badge colours are picked to be legible as labels — saturated cyans, ambers,
 * magentas. Wrapped straight around a rim, forty of them are a wall of neon.
 * Blending toward a cool grey keeps each badge's hue recognisable while letting
 * the set read as metal, which is the point of a struck coin.
 */
const PEWTER: [number, number, number] = [0x3a, 0x40, 0x52];

function mixTo(c: [number, number, number], to: [number, number, number], t: number): string {
  const ch = (i: number) => Math.round(c[i] * (1 - t) + to[i] * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

function alloy(hex: string, toward = 0.42): string {
  const c = rgb(hex);
  return c ? mixTo(c, PEWTER, toward) : hex;
}

/** Mix a colour toward white or black. `t` < 0 darkens, > 0 lightens. */
function shade(hex: string, t: number): string {
  const c = rgb(hex);
  if (!c) return hex;
  const to: [number, number, number] = t >= 0 ? [255, 255, 255] : [0, 0, 0];
  return mixTo(c, to, Math.abs(t));
}

/** shade() applied to an already-alloyed colour, for rim tones. */
function metal(hex: string, t: number): string {
  const c = rgb(hex);
  if (!c) return shade(hex, t);
  const alloyed: [number, number, number] = [
    Math.round(c[0] * 0.58 + PEWTER[0] * 0.42),
    Math.round(c[1] * 0.58 + PEWTER[1] * 0.42),
    Math.round(c[2] * 0.58 + PEWTER[2] * 0.42),
  ];
  const to: [number, number, number] = t >= 0 ? [255, 255, 255] : [0, 0, 0];
  return mixTo(alloyed, to, Math.abs(t));
}

export function BadgeMedal({
  id, defs, size = "md", showLabel = false,
}: {
  id: string;
  defs: BadgeDef[];
  size?: MedalSize;
  /** Render the name under the coin — for a grid, not for an inline row. */
  showLabel?: boolean;
}) {
  const b = defs.find((x) => x.id === id);
  const still = prefersReducedMotion();
  // Offset per badge so a row of them does not flash in unison.
  const delay = useMemo(() => (hash(id) % 900) / 1000, [id]);

  if (!b) return null;

  const S = SIZES[size];
  const rarity = (b.rarity ?? "common") as BadgeRarity;
  const Icon = iconFor(b.icon);
  const c = b.color;
  // Rim tones are alloyed toward pewter; the icon is not, so the badge's real
  // colour lands where the eye actually looks instead of around the edge.
  const base = alloy(c);
  const lit = metal(c, 0.3);
  const dark = metal(c, -0.45);
  const deep = metal(c, -0.72);
  const glyph = shade(c, 0.08);

  // Only the top two grades glow, and softly. A glow on `rare` meant most of a
  // member's case was lit, which is the same as none of it being lit.
  const glow =
    rarity === "legendary" ? `0 0 12px -5px ${c}, 0 0 26px -14px ${c}` :
    rarity === "epic" ? `0 0 9px -6px ${c}` : "none";

  const coin = (
    <span
      className="sswx-medal relative inline-grid place-items-center rounded-full shrink-0 align-middle"
      style={{
        width: S.d,
        height: S.d,
        // The rim: a conic sweep reads as turned metal in a way a linear one
        // never does, because the highlight travels around the edge.
        background:
          `conic-gradient(from 210deg, ${dark}, ${lit} 18%, ${base} 34%, ${deep} 52%, ${base} 70%, ${lit} 84%, ${dark})`,
        boxShadow: `${glow === "none" ? "" : glow + ", "}0 2px 5px rgba(0,0,0,0.55)`,
      }}
      title={`${b.label} — ${b.description}`}
      aria-label={b.label}
    >
      {/* Legendary coins have a light that keeps turning on the rim. */}
      {rarity === "legendary" && !still && (
        <span
          aria-hidden
          className="sswx-medal-turn absolute inset-0 rounded-full"
          style={{ background: `conic-gradient(from 0deg, transparent 0deg, ${lit}59 24deg, transparent 58deg)` }}
        />
      )}

      {/* An inner ring, for the two ornate grades. */}
      {(rarity === "epic" || rarity === "legendary") && (
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{ inset: S.rim, border: `${S.ring}px solid ${lit}`, opacity: 0.3 }}
        />
      )}

      {/* The face. Off-centre highlight so it reads as struck, not printed. */}
      <span
        className="absolute rounded-full grid place-items-center overflow-hidden"
        style={{
          inset: S.rim + (rarity === "epic" || rarity === "legendary" ? S.ring + 1 : 0),
          background:
            `radial-gradient(120% 120% at 30% 22%, ${shade(c, -0.62)} 0%, #0a0a14 64%),` +
            `linear-gradient(180deg, rgba(255,255,255,0.055), rgba(0,0,0,0.38))`,
          boxShadow: `inset 0 1px 0 ${lit}40, inset 0 -1px 2px rgba(0,0,0,0.7)`,
        }}
      >
        <Icon style={{ width: S.icon, height: S.icon, color: glyph }} strokeWidth={1.9} />
        {/* The sheen is the single loudest thing about a coin, so only the rarest
            grade gets one. A wall of badges all catching the light at once was
            the "too much going on". */}
        {!still && rarity === "legendary" && (
          <span
            aria-hidden
            className="sswx-badge-sheen pointer-events-none absolute inset-y-0 w-1/2"
            style={{
              background: "linear-gradient(105deg, transparent, rgba(255,255,255,0.16), transparent)",
              animationDelay: `${delay}s`,
            }}
          />
        )}
      </span>
    </span>
  );

  if (!showLabel) return coin;

  return (
    <span className="inline-flex flex-col items-center gap-1" style={{ width: Math.max(S.d, 64) }}>
      {coin}
      <span
        className="text-[9.5px] leading-tight text-center"
        style={{ color: "#a3a3cc", maxWidth: 72 }}
      >
        {b.label}
      </span>
    </span>
  );
}

/** Stable small integer from a badge id, so its sheen always starts the same. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default BadgeMedal;
