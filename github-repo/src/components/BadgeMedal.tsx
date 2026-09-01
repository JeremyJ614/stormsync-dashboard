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

/** Mix a hex colour toward white or black. `t` < 0 darkens, > 0 lightens. */
function shade(hex: string, t: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const to = t >= 0 ? 255 : 0;
  const a = Math.abs(t);
  const ch = (s: number) => Math.round(((n >> s) & 255) * (1 - a) + to * a);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
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
  const lit = shade(c, 0.45);
  const dark = shade(c, -0.45);
  const deep = shade(c, -0.72);

  const glow =
    rarity === "legendary" ? `0 0 18px -2px ${c}, 0 0 44px -12px ${c}` :
    rarity === "epic" ? `0 0 14px -3px ${c}` :
    rarity === "rare" ? `0 0 10px -4px ${c}` : "none";

  const coin = (
    <span
      className="sswx-medal relative inline-grid place-items-center rounded-full shrink-0 align-middle"
      style={{
        width: S.d,
        height: S.d,
        // The rim: a conic sweep reads as turned metal in a way a linear one
        // never does, because the highlight travels around the edge.
        background:
          `conic-gradient(from 210deg, ${dark}, ${lit} 18%, ${c} 34%, ${deep} 52%, ${c} 70%, ${lit} 84%, ${dark})`,
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
          style={{ background: `conic-gradient(from 0deg, transparent 0deg, ${lit}cc 26deg, transparent 60deg)` }}
        />
      )}

      {/* An inner ring, for the two ornate grades. */}
      {(rarity === "epic" || rarity === "legendary") && (
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{ inset: S.rim, border: `${S.ring}px solid ${lit}`, opacity: 0.55 }}
        />
      )}

      {/* The face. Off-centre highlight so it reads as struck, not printed. */}
      <span
        className="absolute rounded-full grid place-items-center overflow-hidden"
        style={{
          inset: S.rim + (rarity === "epic" || rarity === "legendary" ? S.ring + 1 : 0),
          background:
            `radial-gradient(120% 120% at 30% 22%, ${shade(c, -0.55)} 0%, #0a0a14 62%),` +
            `linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.35))`,
          boxShadow: `inset 0 1px 0 ${lit}66, inset 0 -1px 2px rgba(0,0,0,0.7)`,
        }}
      >
        <Icon style={{ width: S.icon, height: S.icon, color: lit }} strokeWidth={2.1} />
        {!still && (
          <span
            aria-hidden
            className="sswx-badge-sheen pointer-events-none absolute inset-y-0 w-1/2"
            style={{
              background: "linear-gradient(105deg, transparent, rgba(255,255,255,0.30), transparent)",
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
