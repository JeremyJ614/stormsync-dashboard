/**
 * The selected day, at the size it deserves.
 *
 * One number is what a person opens a forecast for. The old module gave that
 * number the same 18px as the wind direction underneath it and put it in the
 * third of seven identical boxes. Here the temperature is the page: display
 * weight, tabular figures so it does not jitter as it settles, and everything
 * else arranged around it in descending order of how often anybody needs it.
 *
 * The number counts up rather than appearing. That is not ornament — it is the
 * same trick a good instrument uses, which is to let the eye catch the value
 * arriving so it registers as a reading rather than as a label.
 */
import { memo, useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import { SunArc } from "./SunArc";

export interface Readout {
  label: string;
  value: string;
  sub?: string;
  tone?: "gold" | "iris" | "rain" | "plain";
}

interface Props {
  eyebrow: string;
  title: string;
  condition: string;
  icon: string;
  /** The one big number. */
  temp: number | null;
  tempCaption: string;
  hi: number | null;
  lo: number | null;
  feels: number | null;
  sunrise?: string;
  sunset?: string;
  isToday: boolean;
  readouts: Readout[];
  still?: boolean;
}

const TONE: Record<NonNullable<Readout["tone"]>, string> = {
  gold: ROYAL.gold,
  iris: ROYAL.iris,
  rain: "#6fb6ff",
  plain: ROYAL.text,
};

/** A number that arrives rather than appears. */
const Ticker = memo(function Ticker({ value, still }: { value: number; still?: boolean }) {
  const mv = useMotionValue(still ? value : 0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  useEffect(() => {
    if (still) { mv.set(value); return; }
    const controls = animate(mv, value, { duration: 0.85, ease: EASE });
    return () => controls.stop();
  }, [value, still, mv]);
  return <motion.span>{rounded}</motion.span>;
});

export const DayHero = memo(function DayHero({
  eyebrow, title, condition, icon, temp, tempCaption, hi, lo, feels,
  sunrise, sunset, isToday, readouts, still,
}: Props) {
  return (
    <motion.section
      className="relative rounded-3xl overflow-hidden"
      initial={still ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: still ? 0.2 : 0.5, ease: EASE }}
      style={{
        border: `1px solid ${ROYAL.hairline}`,
        background:
          `radial-gradient(80% 120% at 6% -10%, rgba(217,183,117,0.16), transparent 58%),` +
          `radial-gradient(70% 120% at 96% 0%, rgba(120,110,255,0.15), transparent 62%),` +
          `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
        boxShadow: "0 30px 70px -50px rgba(0,0,0,1)",
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      <div className="relative p-5 sm:p-6 flex flex-col lg:flex-row gap-6 lg:gap-8 lg:items-center">
        {/* the reading */}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: ROYAL.gold }}>
            {eyebrow}
          </div>
          <h2 className="text-lg sm:text-xl font-bold mt-1 tracking-[0.01em]"
              style={{ fontFamily: HEADING, color: ROYAL.text }}>
            {title}
          </h2>

          <div className="flex items-end gap-4 mt-3">
            <div
              className="font-black leading-[0.82] tabular-nums"
              style={{
                fontFamily: HEADING,
                color: ROYAL.text,
                fontSize: "clamp(64px, 14vw, 108px)",
                letterSpacing: "-0.035em",
                textShadow: "0 18px 50px rgba(0,0,0,0.65)",
              }}
            >
              {temp === null ? "—" : <Ticker value={temp} still={still} />}
              <span style={{ color: ROYAL.gold, fontSize: "0.42em", verticalAlign: "super", marginLeft: 2 }}>°</span>
            </div>
            <div className="pb-2 min-w-0">
              <div className="text-2xl leading-none mb-1.5" aria-hidden>{icon}</div>
              <div className="text-sm font-semibold leading-tight" style={{ color: ROYAL.text }}>{condition}</div>
              <div className="text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>{tempCaption}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-[13px]">
            <span style={{ color: ROYAL.dim }}>
              High <strong className="tabular-nums" style={{ color: ROYAL.text }}>{hi ?? "—"}°</strong>
            </span>
            <span style={{ color: ROYAL.dim }}>
              Low <strong className="tabular-nums" style={{ color: ROYAL.text }}>{lo ?? "—"}°</strong>
            </span>
            {feels !== null && (
              <span style={{ color: ROYAL.dim }}>
                Feels like <strong className="tabular-nums" style={{ color: ROYAL.text }}>{feels}°</strong>
              </span>
            )}
          </div>
        </div>

        {/* the day's shape */}
        <div className="shrink-0 w-full lg:w-[330px] flex justify-center lg:justify-end">
          <SunArc sunrise={sunrise} sunset={sunset} isToday={isToday} still={still} />
        </div>
      </div>

      {/* the readouts */}
      {readouts.length > 0 && (
        <div
          className="relative grid grid-cols-2 sm:grid-cols-4 gap-px"
          style={{ background: ROYAL.hairline, borderTop: `1px solid ${ROYAL.hairline}` }}
        >
          {readouts.map((r, i) => (
            <motion.div
              key={r.label}
              className="px-4 py-3"
              style={{ background: "rgba(8,8,18,0.72)" }}
              initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: still ? 0.2 : 0.4, delay: still ? 0 : 0.25 + i * 0.06, ease: EASE }}
            >
              <div className="text-[9px] uppercase tracking-[0.24em]" style={{ color: ROYAL.dim }}>{r.label}</div>
              <div className="text-lg font-bold tabular-nums leading-tight mt-0.5"
                   style={{ color: TONE[r.tone ?? "plain"], fontFamily: HEADING }}>
                {r.value}
              </div>
              {r.sub && <div className="text-[10px] mt-px" style={{ color: ROYAL.dim }}>{r.sub}</div>}
            </motion.div>
          ))}
        </div>
      )}
    </motion.section>
  );
});

export default DayHero;
