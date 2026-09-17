/**
 * Twenty-four hours of mosquito activity, as a clock.
 *
 * The old module put one number in a canvas gauge and a 48-hour bar chart
 * underneath it. Both are true and neither answers the question people actually
 * have, which is not "how bad is it" but "when". Mosquito activity is a
 * two-humped curve pinned to dawn and dusk, and that shape is the single most
 * useful thing the index knows.
 *
 * So the day is drawn as a day. Midnight at the top, noon at the bottom, one
 * spoke per hour, each reaching out as far as that hour scores and coloured by
 * the band it falls in. The dawn and dusk humps appear as two bulges you can
 * read in a glance, and the hour you are actually in is marked.
 *
 * Each spoke sits at its own clock angle, so the ring is a clock face and not
 * merely a circular bar chart — but the twenty-four hours fed in are the next
 * twenty-four, not today's. Both are true at once because the coming day covers
 * every clock hour exactly once. The spokes then arrive in the order they will
 * happen, which makes the animation the day going by rather than decoration
 * laid over it.
 *
 * SVG rather than the canvas this replaces, so it is sharp on a phone, scales
 * with the card, and can be read out by a screen reader.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { ROYAL, HEADING, EASE } from "../../lib/royal";

export interface DialHour {
  /** 0-23, local. */
  hour: number;
  score: number;
  color: string;
}

interface Props {
  hours: DialHour[];
  /** Index into `hours` for the hour we are in, or -1. */
  nowAt: number;
  score: number;
  level: string;
  levelColor: string;
  still?: boolean;
  size?: number;
}

const R_IN = 58;
const R_OUT = 104;

export const ActivityDial = memo(function ActivityDial({
  hours, nowAt, score, level, levelColor, still, size = 260,
}: Props) {
  const C = 128;                       // centre of the 256 viewBox
  // Angle by clock hour, not by position in the array: −90° puts midnight at
  // the top and noon at the bottom however the twenty-four hours are ordered.
  const angleFor = (h: number) => (h / 24) * Math.PI * 2 - Math.PI / 2;

  return (
    <div className="relative mx-auto" style={{ width: "100%", maxWidth: size }}>
      <svg viewBox="0 0 256 256" className="w-full" role="img"
           aria-label={`Mosquito activity index ${score} of 100, ${level}. Hourly activity for the next day.`}>
        <defs>
          <radialGradient id="dial-core">
            <stop offset="0%" stopColor={levelColor} stopOpacity="0.20" />
            <stop offset="70%" stopColor={levelColor} stopOpacity="0.05" />
            <stop offset="100%" stopColor={levelColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* the rail the spokes stand on */}
        <circle cx={C} cy={C} r={R_IN - 4} fill="url(#dial-core)" />
        <circle cx={C} cy={C} r={R_IN - 4} fill="none" stroke={ROYAL.hairline} strokeWidth={1} />
        <circle cx={C} cy={C} r={R_OUT + 6} fill="none" stroke={ROYAL.hairline} strokeWidth={1} strokeDasharray="1 5" />

        {/* the hours */}
        {hours.map((h, i) => {
          const a = angleFor(h.hour);
          const reach = R_IN + (R_OUT - R_IN) * Math.max(0.04, Math.min(1, h.score / 100));
          const x1 = C + Math.cos(a) * R_IN, y1 = C + Math.sin(a) * R_IN;
          const x2 = C + Math.cos(a) * reach, y2 = C + Math.sin(a) * reach;
          const on = i === nowAt;
          return (
            <motion.line
              key={h.hour}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={h.color}
              strokeWidth={on ? 7 : 5.5}
              strokeLinecap="round"
              strokeOpacity={on ? 1 : 0.72}
              initial={still ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={still ? { duration: 0 } : { duration: 0.45, delay: 0.1 + i * 0.028, ease: EASE }}
              style={on ? { filter: `drop-shadow(0 0 6px ${h.color})` } : undefined}
            />
          );
        })}

        {/* where we are in the day */}
        {nowAt >= 0 && hours[nowAt] && (() => {
          const a = angleFor(hours[nowAt].hour);
          const x = C + Math.cos(a) * (R_OUT + 13);
          const y = C + Math.sin(a) * (R_OUT + 13);
          return (
            <motion.g
              initial={still ? false : { opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={still ? { duration: 0 } : { delay: 0.85, type: "spring", stiffness: 320, damping: 16 }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            >
              <circle cx={x} cy={y} r={4} fill={ROYAL.gold} />
              <circle cx={x} cy={y} r={8} fill="none" stroke={ROYAL.gold} strokeOpacity={0.35} strokeWidth={1} />
            </motion.g>
          );
        })()}

        {/* clock marks, so "when" is readable without counting spokes */}
        {[0, 6, 12, 18].map((h) => {
          const a = angleFor(h);
          const x = C + Math.cos(a) * (R_OUT + 26);
          const y = C + Math.sin(a) * (R_OUT + 26);
          return (
            <text key={h} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
                  fontSize="9" letterSpacing="1.6" fill={ROYAL.dim}>
              {h === 0 ? "12a" : h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`}
            </text>
          );
        })}
      </svg>

      {/* the reading, centred in the dial */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <motion.div
          className="font-black leading-none tabular-nums"
          style={{ fontFamily: HEADING, color: levelColor, fontSize: size * 0.21, textShadow: `0 0 34px ${levelColor}66` }}
          initial={still ? false : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={still ? { duration: 0 } : { delay: 0.25, type: "spring", stiffness: 260, damping: 18 }}
        >
          {score}
        </motion.div>
        <div className="text-[9px] uppercase tracking-[0.3em] mt-1" style={{ color: ROYAL.dim }}>out of 100</div>
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] mt-1.5" style={{ color: levelColor }}>
          {level}
        </div>
      </div>
    </div>
  );
});

export default ActivityDial;
