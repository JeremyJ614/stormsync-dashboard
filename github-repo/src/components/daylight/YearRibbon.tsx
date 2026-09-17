/**
 * The year, as one continuous reading — and the month picker.
 *
 * WHAT THIS REPLACES
 * A `grid-cols-3` of twelve cards, each holding a month name, a duration, a
 * delta, and a sunrise and sunset set at nine pixels. Twelve separate boxes
 * cannot show a year: the thing you want to see about daylight is the *curve*
 * — it climbs to midsummer and falls away — and a grid that wraps every three
 * months chops that curve into four unrelated rows. It was also four rows of
 * type too small to read, in five colours.
 *
 * WHAT THIS IS
 * Twelve columns side by side on one baseline, each as tall as its month is
 * long. The curve is simply there. The solstices mark themselves, because they
 * are the tallest and shortest columns, and a small caption names them rather
 * than colouring them like warnings.
 *
 * It is also the selector, so the year view and the month control are the same
 * object instead of two things that have to agree with each other.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { ROYAL, HEADING, EASE, SPRING } from "../../lib/royal";

export interface YearMonth {
  /** "JAN" */
  short: string;
  /** Minutes of daylight at the middle of the month. */
  minutes: number;
  lengthLabel: string;
  deltaLabel: string;
}

interface Props {
  months: YearMonth[];
  selected: number;
  longest: number;
  shortest: number;
  onSelect: (index: number) => void;
  still: boolean;
}

const COL_H = 132;

export const YearRibbon = memo(function YearRibbon({
  months, selected, longest, shortest, onSelect, still,
}: Props) {
  const max = Math.max(1, ...months.map((m) => m.minutes));
  // Bars are measured from a floor rather than from zero: every month of the
  // year has some daylight outside the poles, so a zero baseline spends most of
  // its height on the part nobody is comparing.
  const min = Math.min(...months.map((m) => m.minutes));
  const floor = Math.max(0, min - (max - min) * 0.45);
  const frac = (v: number) => (max === floor ? 1 : (v - floor) / (max - floor));

  return (
    <section className="relative rounded-2xl overflow-hidden"
             style={{
               border: `1px solid ${ROYAL.hairline}`,
               background: `linear-gradient(180deg, rgba(18,18,34,0.72), rgba(10,10,22,0.72))`,
             }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      <header className="px-4 py-3 flex items-baseline gap-3 border-b" style={{ borderColor: ROYAL.hairline }}>
        <h2 className="text-sm font-semibold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
          The year
        </h2>
        <span className="text-[11px]" style={{ color: ROYAL.dim }}>
          Daylight at the middle of each month · pick one
        </span>
      </header>

      <div className="px-3 pt-4 pb-3">
        <div className="flex items-end gap-1.5" style={{ height: COL_H }} role="group" aria-label="Month">
          {months.map((m, i) => {
            const on = i === selected;
            const h = Math.max(8, Math.round(frac(m.minutes) * COL_H));
            return (
              <motion.button
                key={m.short}
                type="button"
                onClick={() => onSelect(i)}
                aria-pressed={on}
                aria-label={`${m.short}, ${m.lengthLabel}`}
                whileHover={still ? undefined : { y: -2 }}
                whileTap={still ? undefined : { scale: 0.97 }}
                transition={SPRING.pop}
                className="sx-ribbon-col group relative flex-1 min-w-0 rounded-t-md focus-visible:outline-none"
                style={{ height: COL_H, display: "flex", alignItems: "flex-end" }}
              >
                <motion.span
                  className="block w-full rounded-t-md"
                  style={{
                    background: on
                      ? `linear-gradient(180deg, ${ROYAL.gold}, rgba(217,183,117,0.45))`
                      : "rgba(204,204,255,0.16)",
                    boxShadow: on ? `0 0 18px -4px ${ROYAL.goldSoft}` : "none",
                  }}
                  initial={still ? { height: h } : { height: 0 }}
                  animate={{ height: h }}
                  transition={{ duration: still ? 0 : 0.6, delay: still ? 0 : 0.03 * i, ease: EASE }}
                />
              </motion.button>
            );
          })}
        </div>

        <div className="flex gap-1.5 mt-2">
          {months.map((m, i) => (
            <span key={m.short} className="flex-1 min-w-0 text-center text-[10px] font-semibold tracking-wide"
                  style={{ color: i === selected ? ROYAL.gold : ROYAL.dim }}>
              {m.short[0]}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-3 flex-wrap text-[11px]"
             style={{ color: ROYAL.dim }}>
          <span>
            Longest <span className="tabular-nums" style={{ color: ROYAL.text }}>
              {months[longest].short} · {months[longest].lengthLabel}
            </span>
          </span>
          <span className="tabular-nums" style={{ color: ROYAL.gold }}>
            {months[selected].short} · {months[selected].lengthLabel} ({months[selected].deltaLabel})
          </span>
          <span>
            Shortest <span className="tabular-nums" style={{ color: ROYAL.text }}>
              {months[shortest].short} · {months[shortest].lengthLabel}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
});
