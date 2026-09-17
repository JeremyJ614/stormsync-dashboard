/**
 * The building blocks of the single-page join flow.
 *
 * Two rules hold everything here together, both learned from bugs:
 *
 *  1. NO `backdrop-filter` on these surfaces. The blurred-glass panels used
 *     elsewhere create their own stacking context, which is what let the
 *     fixed aurora paint over plain content (a selected tier card that lost
 *     its `.bg-card` class simply vanished). These panels paint their own
 *     opaque-enough ground instead, so nothing depends on paint order.
 *  2. Selected state is drawn with explicit colours, never by swapping which
 *     utility classes are present — the selected and unselected cards differ
 *     only in the values passed to the same style object.
 */
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { ROYAL, HEADING, EASE } from "../../lib/royal";

/** The default panel: a soft vertical wash of the card colour + a hairline. */
export const SURFACE: React.CSSProperties = {
  background: "linear-gradient(180deg, hsl(var(--card) / 0.95), hsl(var(--card) / 0.82))",
  border: "1px solid hsl(var(--border))",
  boxShadow: "0 1px 0 0 rgba(217,183,117,0.10) inset, 0 24px 50px -34px rgba(0,0,0,0.95)",
};

/** A numbered step panel. `step` is display-only; it never gates anything. */
export function Section({
  step, title, hint, aside, delay = 0, children,
}: {
  step: number; title: string; hint?: string; aside?: ReactNode;
  delay?: number; children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      className="relative rounded-2xl p-4 sm:p-5 overflow-hidden"
      style={SURFACE}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
      <header className="flex items-start justify-between gap-3 mb-3.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
                style={{ background: "rgba(217,183,117,0.14)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
            {step}
          </span>
          <div className="min-w-0">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em]"
                style={{ fontFamily: HEADING, color: ROYAL.gold }}>
              {title}
            </h2>
            {hint && <p className="text-[11px] mt-0.5 leading-snug" style={{ color: ROYAL.dim }}>{hint}</p>}
          </div>
        </div>
        {aside && <div className="shrink-0 text-[11px]" style={{ color: ROYAL.dim }}>{aside}</div>}
      </header>
      {children}
    </motion.section>
  );
}

/**
 * One tier. Both states share a single style object so a selected card can
 * never end up on a different painting path from an unselected one.
 */
export function TierOption({
  icon: Icon, label, blurb, price, cadence, badge, selected, onSelect,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string; blurb: string; price: string; cadence?: string;
  badge?: string; selected: boolean; onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 520, damping: 26 }}
      className="relative text-left rounded-xl p-3.5 overflow-hidden"
      style={{
        background: selected
          ? "linear-gradient(158deg, rgba(217,183,117,0.20), rgba(217,183,117,0.05) 62%, hsl(var(--card) / 0.9))"
          : "linear-gradient(180deg, hsl(var(--card) / 0.9), hsl(var(--card) / 0.72))",
        border: `1px solid ${selected ? "rgba(217,183,117,0.6)" : "hsl(var(--border))"}`,
        boxShadow: selected
          ? "0 0 0 1px rgba(217,183,117,0.2), 0 18px 38px -26px rgba(0,0,0,0.95)"
          : "0 14px 30px -28px rgba(0,0,0,0.9)",
        transition: "background 220ms ease, border-color 220ms ease, box-shadow 220ms ease",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-5 h-5" style={{ color: selected ? ROYAL.gold : ROYAL.dim }} />
        <div className="flex items-center gap-1.5">
          {badge && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
                  style={{ background: "rgba(217,183,117,0.18)", color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}` }}>
              {badge}
            </span>
          )}
          {selected && (
            <motion.span
              initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 540, damping: 24 }}
              className="w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: ROYAL.gold }}
            >
              <Check className="w-3 h-3" style={{ color: "#12121f" }} strokeWidth={3} />
            </motion.span>
          )}
        </div>
      </div>
      <div className="text-[15px] font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>{label}</div>
      <div className="text-[11px] mt-0.5 leading-snug" style={{ color: ROYAL.dim }}>{blurb}</div>
      <div className="mt-2 text-sm font-semibold" style={{ color: selected ? ROYAL.gold : ROYAL.text }}>
        {price}
        {cadence && <span className="text-[11px] font-normal" style={{ color: ROYAL.dim }}>{cadence}</span>}
      </div>
    </motion.button>
  );
}

/** Small pill used for the billing cadence row. */
export function Pill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-[0.12em]"
      style={{
        background: active ? "rgba(217,183,117,0.16)" : "hsl(var(--muted) / 0.35)",
        border: `1px solid ${active ? "rgba(217,183,117,0.55)" : "hsl(var(--border))"}`,
        color: active ? ROYAL.gold : ROYAL.dim,
        transition: "background 180ms ease, border-color 180ms ease, color 180ms ease",
      }}
    >
      {children}
    </button>
  );
}
