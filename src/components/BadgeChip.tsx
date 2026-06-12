import type { BadgeDef } from "../hooks/useAuth";

/**
 * Glowing text badge (U-27). Renders nothing for unknown ids, so a deleted
 * badge def can never crash a profile that still references it.
 */
export function BadgeChip({ id, defs, size = "sm" }: { id: string; defs: BadgeDef[]; size?: "sm" | "md" }) {
  const b = defs.find(x => x.id === id);
  if (!b) return null;
  return (
    <span
      className={`rounded font-bold uppercase tracking-widest border ${size === "md" ? "px-2 py-1 text-[11px]" : "px-1.5 py-0.5 text-[9px]"}`}
      style={{
        background: b.color + "1a",
        color: b.color,
        borderColor: b.color + "66",
        textShadow: `0 0 8px ${b.color}`,
        boxShadow: `0 0 10px ${b.color}40, inset 0 0 6px ${b.color}1a`,
      }}
      title={b.description}
    >
      {b.label}
    </span>
  );
}
