/**
 * The period selector, floating over the map.
 *
 * Day 1 / Day 2 / Day 3 is not a navigation choice — it is a control on the
 * thing you are already looking at, so it belongs on the instrument rather than
 * above it. Glass over the map, the champagne slab travelling between periods
 * the same way the module's tab bar does, and it turns vertical past four
 * entries so the seven HeatRisk days do not run off a phone.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { ROYAL, SPRING } from "../../lib/royal";
import type { OutlookView } from "../../lib/outlooks";

interface Props {
  views: readonly OutlookView[];
  value: string;
  onChange: (id: string) => void;
  layoutId: string;
  still: boolean;
  label: string;
}

export const PeriodRail = memo(function PeriodRail({
  views, value, onChange, layoutId, still, label,
}: Props) {
  if (views.length < 2) return null;
  const column = views.length > 4;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`flex gap-1 rounded-xl p-1 ${column ? "flex-col" : "flex-row"}`}
      style={{
        background: "rgba(7,7,19,0.78)",
        border: `1px solid ${ROYAL.hairline}`,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {views.map((v) => {
        const on = v.id === value;
        return (
          <button
            key={v.id}
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v.id)}
            className="relative px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap outline-none focus-visible:ring-2 transition-colors"
            style={{
              color: on ? "#120f1e" : ROYAL.dim,
              // @ts-expect-error custom property for the focus ring colour
              "--tw-ring-color": ROYAL.goldSoft,
            }}
          >
            {on && (
              <motion.span
                aria-hidden
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg"
                transition={still ? { duration: 0 } : SPRING.silk}
                style={{
                  background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a25f)`,
                  boxShadow: `0 6px 16px -9px ${ROYAL.gold}`,
                }}
              />
            )}
            <span className="relative">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
});

export default PeriodRail;
