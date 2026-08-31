import { useMemo } from "react";
import type { BadgeDef } from "../hooks/useAuth";
import { prefersReducedMotion } from "../lib/royal";

/**
 * A badge, as a small piece of enamel.
 *
 * The old chip was a flat rectangle with a glow, which read as a status pill
 * rather than as something earned. This one is built like a physical badge: a
 * pill of the badge's own colour with a lit top edge, a darker floor beneath it,
 * and a specular sheen that catches across the face — three layers, no images,
 * so a badge invented in the admin panel five minutes ago looks the same as one
 * that shipped with the app.
 *
 * The sheen sweeps once on mount and then rests. Ornament that loops forever on
 * a page showing thirty badges is a page that never settles, so it plays and
 * stops; reduced motion skips it entirely and nothing else changes.
 *
 * Renders nothing for an unknown id, so a deleted badge def can never crash a
 * profile that still references it.
 */
export function BadgeChip({ id, defs, size = "sm" }: { id: string; defs: BadgeDef[]; size?: "sm" | "md" }) {
  const b = defs.find((x) => x.id === id);
  const still = prefersReducedMotion();

  // The sheen is offset per badge so a row of them does not flash in unison.
  const delay = useMemo(() => (hash(id) % 900) / 1000, [id]);

  if (!b) return null;
  const md = size === "md";

  return (
    <span
      className={`sswx-badge relative inline-flex items-center overflow-hidden rounded-full font-bold uppercase border ${
        md ? "px-2.5 py-1 text-[11px] tracking-[0.14em]" : "px-2 py-[3px] text-[9px] tracking-[0.12em]"
      }`}
      style={{
        color: b.color,
        borderColor: `${b.color}59`,
        background:
          `linear-gradient(180deg, ${b.color}30 0%, ${b.color}14 42%, rgba(0,0,0,0.28) 100%)`,
        boxShadow:
          `inset 0 1px 0 0 ${b.color}80,` +
          ` inset 0 -1px 0 0 rgba(0,0,0,0.45),` +
          ` 0 1px 2px rgba(0,0,0,0.5),` +
          ` 0 0 12px -2px ${b.color}55`,
        textShadow: `0 0 7px ${b.color}88, 0 1px 0 rgba(0,0,0,0.45)`,
      }}
      title={b.description}
    >
      {!still && (
        <span
          aria-hidden
          className="sswx-badge-sheen pointer-events-none absolute inset-y-0 w-1/2"
          style={{
            background: "linear-gradient(105deg, transparent, rgba(255,255,255,0.32), transparent)",
            animationDelay: `${delay}s`,
          }}
        />
      )}
      <span className="relative">{b.label}</span>
    </span>
  );
}

/** Stable small integer from a badge id, so its sheen always starts at the same offset. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default BadgeChip;
