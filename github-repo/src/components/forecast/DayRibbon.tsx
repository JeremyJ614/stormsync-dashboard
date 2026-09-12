/**
 * The week, as one chart you can press.
 *
 * The old module drew seven identical cards in a grid: each one told you its own
 * high and low, and none of them told you anything about the week. Whether
 * Thursday is the warm day or the cold one is the single most common thing a
 * person wants from a seven-day forecast, and reading it off seven separate
 * numbers is work.
 *
 * So the highs and lows share one scale across the whole strip, and each day is
 * a bar between them. The shape of the week appears immediately — a cold front
 * is a step down, a warming trend is a staircase — and the numbers are still
 * there for anyone who wants them.
 *
 * The bars grow from where the day actually sits rather than from the floor,
 * staggered left to right so the week assembles in reading order. The selected
 * day carries a shared-element frame, so choosing a different day moves the
 * selection rather than redrawing it.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { ROYAL, HEADING, EASE, SPRING } from "../../lib/royal";

export interface RibbonDay {
  /** "2026-09-12" */
  key: string;
  dow: string;
  dayNum: string;
  hi: number | null;
  lo: number | null;
  icon: string;
  precipProb: number;
  isToday: boolean;
}

interface Props {
  days: RibbonDay[];
  selected: string;
  onSelect: (key: string) => void;
  still?: boolean;
}

/** Warm at the top of the week's range, cool at the bottom. */
function tempHue(t: number, lo: number, hi: number): string {
  const f = hi > lo ? (t - lo) / (hi - lo) : 0.5;
  // 205° (cold blue) → 28° (warm amber), the short way round.
  const h = 205 - f * 177;
  return `hsl(${h.toFixed(0)} 78% 62%)`;
}

export const DayRibbon = memo(function DayRibbon({ days, selected, onSelect, still }: Props) {
  const temps = days.flatMap((d) => [d.hi, d.lo]).filter((v): v is number => typeof v === "number");
  const lo = temps.length ? Math.min(...temps) : 0;
  const hi = temps.length ? Math.max(...temps) : 1;
  const span = Math.max(1, hi - lo);

  const TRACK = 86;   // px of vertical room the bars live in

  return (
    <div
      className="flex gap-1.5 overflow-x-auto no-scrollbar rounded-2xl p-2"
      style={{
        background: "rgba(10,10,22,0.5)",
        border: `1px solid ${ROYAL.hairline}`,
        scrollbarWidth: "none",
      }}
      role="radiogroup"
      aria-label="Choose a day"
    >
      {days.map((d, i) => {
        const on = d.key === selected;
        const top = d.hi ?? lo;
        const bot = d.lo ?? lo;
        const barH = Math.max(6, ((top - bot) / span) * TRACK);
        const offset = ((hi - top) / span) * TRACK;

        return (
          <button
            key={d.key}
            role="radio"
            aria-checked={on}
            onClick={() => onSelect(d.key)}
            className="relative shrink-0 w-[74px] sm:w-[84px] rounded-xl px-1.5 pt-2 pb-2.5 outline-none focus-visible:ring-2"
            style={{
              // @ts-expect-error custom property for the focus ring colour
              "--tw-ring-color": ROYAL.goldSoft,
            }}
          >
            {on && (
              <motion.span
                aria-hidden
                layoutId="dayribbon-active"
                className="absolute inset-0 rounded-xl"
                transition={still ? { duration: 0 } : SPRING.silk}
                style={{
                  background: `linear-gradient(180deg, ${ROYAL.goldFaint}, rgba(217,183,117,0.02))`,
                  border: `1px solid ${ROYAL.goldSoft}`,
                  boxShadow: `0 10px 26px -18px ${ROYAL.gold}`,
                }}
              />
            )}

            <div className="relative flex flex-col items-center gap-1">
              <div
                className="text-[10px] uppercase tracking-[0.16em] font-bold"
                style={{ color: on ? ROYAL.gold : d.isToday ? ROYAL.iris : ROYAL.dim }}
              >
                {d.isToday ? "Today" : d.dow}
              </div>
              <div className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>{d.dayNum}</div>
              <div className="text-base leading-none py-0.5" aria-hidden>{d.icon}</div>

              <div className="text-[13px] font-bold tabular-nums leading-none" style={{ color: ROYAL.text }}>
                {d.hi ?? "—"}°
              </div>

              {/* the bar: where this day's range sits inside the week's range */}
              <div className="relative w-[7px]" style={{ height: TRACK }}>
                <motion.span
                  className="absolute left-0 right-0 rounded-full"
                  style={{
                    top: offset,
                    background: `linear-gradient(180deg, ${tempHue(top, lo, hi)}, ${tempHue(bot, lo, hi)})`,
                    boxShadow: on ? `0 0 14px -3px ${tempHue(top, lo, hi)}` : undefined,
                  }}
                  initial={still ? { height: barH, opacity: 1 } : { height: 0, opacity: 0 }}
                  animate={{ height: barH, opacity: 1 }}
                  transition={still ? { duration: 0 } : { duration: 0.5, delay: 0.05 * i, ease: EASE }}
                />
              </div>

              <div className="text-[12px] font-semibold tabular-nums leading-none" style={{ color: ROYAL.dim }}>
                {d.lo ?? "—"}°
              </div>
              <div
                className="text-[10px] tabular-nums leading-none mt-0.5"
                style={{ color: d.precipProb >= 40 ? "#6fb6ff" : "transparent", fontFamily: HEADING }}
              >
                {d.precipProb}%
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
});

export default DayRibbon;
