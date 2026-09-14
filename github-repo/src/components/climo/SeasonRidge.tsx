import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { ROYAL, EASE } from "../../lib/royal";

/**
 * The season, as it moves.
 *
 * This replaces a six-line spaghetti chart with a legend. The question that
 * chart was asked — "when is the season where I am" — was the one thing it
 * could not answer, because six lines of wildly different magnitude crossing
 * one set of axes is six lines you have to trace with a finger, and the region
 * you care about is whichever colour you can find in the key.
 *
 * A ridgeline answers it in one look. Each region gets its own baseline and its
 * own row, the rows are ORDERED BY WHEN THEY PEAK, and so the march of the
 * season down the page IS the finding: the Southeast goes first in early
 * spring, the South and the Plains follow through April and May, the Midwest
 * and the Northeast run late into summer. That ordering is computed from the
 * data, not typed in, so it stays true if the dataset is rebuilt.
 *
 * WHAT IS NORMALISED AND WHAT IS NOT
 * Each row is scaled to its OWN peak, which is what makes the timing
 * comparable — the West would otherwise be a flat line and say nothing about
 * when its season is. Magnitude is not thrown away for that convenience: every
 * row prints its real peak-month average at the right, so the shape tells you
 * when and the number tells you how many. A ridgeline that normalises and then
 * hides the scale is a chart that has quietly stopped being about the data.
 *
 * HOW IT IS DRAWN
 * Each row is an HTML flex row with the curve as an SVG stretched to fill it
 * (`preserveAspectRatio="none"`). Distorting a curve is harmless; distorting
 * type is not, so every label and figure is HTML beside the SVG rather than
 * text inside it. That also means the whole thing is responsive with no
 * measurement, no resize listener and no re-render on rotate.
 */

const MONTH_LETTER = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Catmull-Rom through the twelve monthly values, as one cubic path. */
function ridgePath(vals: number[], max: number): string {
  const n = vals.length;
  const X = (i: number) => (i / (n - 1)) * 100;
  const Y = (v: number) => 100 - (v / max) * 92;
  const p = (i: number) => ({ x: X(i), y: Y(vals[Math.max(0, Math.min(n - 1, i))]) });

  let d = `M${X(0)},${Y(vals[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2);
    // Catmull-Rom → Bézier, tension 1/6. The season is a smooth function of the
    // year; twelve straight segments imply it steps on the first of the month.
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6}` +
         ` ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6}` +
         ` ${p2.x},${p2.y}`;
  }
  return d;
}

/** One decimal only where the figure would otherwise round to nothing. */
export const ridgeFigure = (v: number) =>
  v >= 10 ? Math.round(v).toLocaleString() : v.toFixed(1);

export interface RidgeRow {
  key: string;
  label: string;
  vals: number[];
  color: string;
  /** Printed at the right — the real figure the shape has been normalised out of. */
  peak: number;
  peakMonth: number;
}

export const RidgeStack = memo(function RidgeStack({
  rows, todayMonth, still, unit = "/ mo", axis = true,
}: {
  rows: RidgeRow[]; todayMonth: number; still: boolean; unit?: string;
  /** Off for a single summary row sitting above a stack that has its own. */
  axis?: boolean;
}) {
  // Earliest peak at the top, so reading down the stack is watching the season
  // travel. Ties break on size, which puts the busier region first.
  const ordered = useMemo(
    () => [...rows].sort((a, b) => a.peakMonth - b.peakMonth || b.peak - a.peak),
    [rows],
  );

  return (
    <div>
      {ordered.map((r, i) => {
        const max = Math.max(1, ...r.vals);
        return (
          <div key={r.key} className="grid items-center" style={{ gridTemplateColumns: "84px 1fr 58px" }}>
            <span className="text-[10.5px] truncate pr-2" style={{ color: ROYAL.text }}>{r.label}</span>

            <div className="relative" style={{ height: 42 }}>
              <svg width="100%" height="42" viewBox="0 0 100 100" preserveAspectRatio="none"
                   role="img" aria-label={`${r.label}: peak ${r.peak} in ${MONTH_LETTER[r.peakMonth]}`}>
                {/* Month rules, and today, inside the curve's own coordinates so
                    they cannot drift out of alignment with it at any width. */}
                {MONTH_LETTER.map((_, mi) => (
                  <line key={mi} x1={(mi / 11) * 100} y1="0" x2={(mi / 11) * 100} y2="100"
                        stroke={ROYAL.hairline} strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
                ))}
                <line x1={(todayMonth / 11) * 100} y1="0" x2={(todayMonth / 11) * 100} y2="100"
                      stroke={ROYAL.gold} strokeWidth="1" strokeDasharray="3 3"
                      vectorEffect="non-scaling-stroke" opacity={0.7} />
                {/* Fill and stroke are two paths on purpose. One closed path
                    with both would draw the stroke along the baseline as well,
                    which reads as a rule under every row and flattens the
                    bottom of the curve into it. */}
                <motion.g
                  initial={still ? false : { opacity: 0, scaleY: 0.2 }}
                  animate={{ opacity: 1, scaleY: 1 }}
                  style={{ transformOrigin: "50% 100%" }}
                  transition={still ? { duration: 0 } : { duration: 0.5, delay: i * 0.06, ease: EASE }}
                >
                  <path d={`M0,100 L${ridgePath(r.vals, max).slice(1)} L100,100 Z`} fill={`${r.color}2e`} />
                  <path d={ridgePath(r.vals, max)} fill="none" stroke={r.color}
                        strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </motion.g>
              </svg>
            </div>

            <span className="text-[11px] tabular-nums text-right" style={{ color: r.color }}>
              {ridgeFigure(r.peak)}
            </span>
          </div>
        );
      })}

      {/* One axis for the whole stack, on the same three-column grid. */}
      {axis && (
      <div className="grid items-center pt-1" style={{ gridTemplateColumns: "84px 1fr 58px" }}>
        <span />
        <div className="flex justify-between">
          {MONTH_LETTER.map((l, i) => (
            <span key={i} className="text-[9px]"
                  style={{ color: i === todayMonth ? ROYAL.gold : ROYAL.dim }}>{l}</span>
          ))}
        </div>
        <span className="text-[8.5px] text-right" style={{ color: ROYAL.dim }}>{unit}</span>
      </div>
      )}
    </div>
  );
});
