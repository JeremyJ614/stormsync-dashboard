import { memo } from "react";
import { motion } from "framer-motion";
import { ROYAL, EASE } from "../../lib/royal";

/**
 * Seventy-four years of something, as one strip.
 *
 * Two of these stacked on the same span — counts above, deaths below — are the
 * whole argument of this module's record tab, and they only work stacked. The
 * count line rises steeply and the death line falls just as steeply, and the
 * reason is not that tornadoes became gentler: it is that Doppler, spotter
 * networks and warnings arrived, and the same period saw everything smaller
 * than an EF1 start being FOUND. One chart cannot say that. Two, on a shared
 * axis, say it without a word.
 *
 * Drawn as an SVG stretched to the container with `preserveAspectRatio="none"`,
 * so it is responsive without measuring anything; the bars distort
 * horizontally, which for seventy-four bars four pixels wide is invisible, and
 * nothing that has to be read is inside the SVG.
 */
export interface YearRow { year: number; value: number }

export const YearBars = memo(function YearBars({
  rows, color, label, unit, mean, still, height = 92, delay = 0,
}: {
  rows: YearRow[]; color: string; label: string; unit: string;
  /** Drawn as a dashed reference, when the series has a meaningful average. */
  mean?: number;
  still: boolean; height?: number; delay?: number;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const n = rows.length;
  const w = 100 / n;
  const peak = rows.reduce((a, b) => (b.value > a.value ? b : a), rows[0]);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: ROYAL.dim }}>{label}</span>
        <span className="text-[10px] tabular-nums" style={{ color }}>
          peak {peak.value.toLocaleString()} in {peak.year}
        </span>
      </div>

      <svg width="100%" height={height} viewBox="0 0 100 100" preserveAspectRatio="none"
           role="img" aria-label={`${label} by year, ${rows[0]?.year} to ${rows[n - 1]?.year}`}>
        {mean !== undefined && (
          <line x1="0" y1={100 - (mean / max) * 100} x2="100" y2={100 - (mean / max) * 100}
                stroke={ROYAL.gold} strokeWidth="1" strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke" opacity={0.75} />
        )}
        {rows.map((r, i) => {
          const h = (r.value / max) * 100;
          return (
            <motion.rect
              key={r.year}
              x={i * w + w * 0.12} width={w * 0.76}
              y={100 - h} height={h}
              fill={color}
              opacity={0.88}
              initial={still ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              style={{ transformOrigin: "50% 100%" }}
              transition={still ? { duration: 0 } : {
                duration: 0.4, delay: delay + Math.min(i * 0.004, 0.3), ease: EASE,
              }}
            >
              <title>{`${r.year}: ${r.value.toLocaleString()} ${unit}`}</title>
            </motion.rect>
          );
        })}
      </svg>

      <div className="flex justify-between text-[9px] tabular-nums pt-0.5" style={{ color: ROYAL.dim }}>
        <span>{rows[0]?.year}</span>
        {mean !== undefined && <span style={{ color: ROYAL.gold }}>average {Math.round(mean).toLocaleString()}</span>}
        <span>{rows[n - 1]?.year}</span>
      </div>
    </div>
  );
});
