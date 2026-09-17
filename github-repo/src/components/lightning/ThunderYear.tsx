/**
 * The thunder year, as a year.
 *
 * This replaces a twelve-bar column chart, and the reason is not decoration.
 * A season is CYCLICAL: December sits next to January, and the thing a chaser
 * or a homeowner actually wants off this panel is the shape and the edges of
 * the season — when it switches on, how long the shoulder is, when it stops.
 * A bar chart cuts that ring at an arbitrary point and puts the two ends of the
 * quiet season at opposite sides of the frame, which is precisely where the
 * information is.
 *
 * So the twelve months are placed at their own clock angles and each spoke runs
 * as long as that month's average thunder-day count. The season reads as the
 * lobe it is. The same idiom the Mosquito Index uses for the day, which is the
 * other module in the app whose subject is a shape rather than a number.
 *
 * Nothing here is smoothed or interpolated between months: the record is
 * monthly, so the drawing is monthly, and the spokes are separate marks rather
 * than a closed curve that would imply a continuous function through them.
 */
import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { ROYAL, HEADING, EASE } from "../../lib/royal";

export interface ThunderMonth { month: number; avgDays: number }

const SIZE = 260;
const CX = SIZE / 2, CY = SIZE / 2;
const R_IN = 34;
const R_OUT = 104;

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const FULL = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/** January at the top, the year running clockwise. */
const angleOf = (monthIdx: number) => (monthIdx / 12) * 360 - 90;
const pt = (deg: number, r: number) => ({
  x: CX + r * Math.cos((deg * Math.PI) / 180),
  y: CY + r * Math.sin((deg * Math.PI) / 180),
});

export const ThunderYear = memo(function ThunderYear({
  months, calm, peakMonth,
}: { months: ThunderMonth[]; calm: boolean; peakMonth?: number }) {
  const max = useMemo(
    () => Math.max(1, ...months.map((m) => m.avgDays)),
    [months],
  );

  // Rings at quarter steps of the peak, so the scale is readable without an
  // axis — a labelled axis around a circle is more furniture than it is worth.
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="grid place-items-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img"
           aria-label="Average thunder days by month, arranged around the year">
        <defs>
          <linearGradient id="ty-spoke" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#7b2ff7" />
            <stop offset="55%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fde68a" />
          </linearGradient>
        </defs>

        {rings.map((f) => (
          <circle key={f} cx={CX} cy={CY} r={R_IN + (R_OUT - R_IN) * f}
                  fill="none" stroke={ROYAL.hairline} strokeWidth={1} />
        ))}

        {months.map((m) => {
          const i = m.month - 1;
          const a = angleOf(i);
          const len = R_IN + (R_OUT - R_IN) * (m.avgDays / max);
          const from = pt(a, R_IN), to = pt(a, len);
          const isPeak = peakMonth === m.month;
          return (
            <motion.line
              key={m.month}
              x1={from.x} y1={from.y}
              initial={calm ? false : { x2: from.x, y2: from.y }}
              animate={{ x2: to.x, y2: to.y }}
              transition={calm ? { duration: 0 } : { duration: 0.7, delay: i * 0.045, ease: EASE }}
              stroke="url(#ty-spoke)"
              strokeWidth={isPeak ? 13 : 10}
              strokeLinecap="round"
              opacity={isPeak ? 1 : 0.78}
            >
              <title>{`${FULL[i]}: ${m.avgDays.toFixed(1)} thunder days on average`}</title>
            </motion.line>
          );
        })}

        {/* Month initials, outside the spokes. */}
        {MONTHS.map((label, i) => {
          const p = pt(angleOf(i), R_OUT + 16);
          const isPeak = peakMonth === i + 1;
          return (
            <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize={isPeak ? 11 : 10} fontWeight={isPeak ? 800 : 500}
                  fill={isPeak ? "#fbbf24" : ROYAL.dim}>{label}</text>
          );
        })}

        <circle cx={CX} cy={CY} r={R_IN - 4} fill={ROYAL.ink} stroke={ROYAL.hairline} strokeWidth={1} />
        <text x={CX} y={CY - 5} textAnchor="middle" fontSize="17" fontWeight="800"
              fontFamily={HEADING} fill={ROYAL.text}>{max.toFixed(1)}</text>
        <text x={CX} y={CY + 9} textAnchor="middle" fontSize="7" letterSpacing="1.2"
              fill={ROYAL.dim}>PEAK DAYS</text>
      </svg>
    </div>
  );
});
