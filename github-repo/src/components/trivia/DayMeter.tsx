/**
 * The day's standing, as one reading.
 *
 * The old strip was a flex row with two stacked label/value pairs in it: "2 of
 * 2 answered" on the left, a points figure on the right. Both were the same
 * size, so neither led, and nothing on it moved or changed as you played — you
 * could answer a question and the only thing that happened was a number
 * quietly becoming a different number.
 *
 * Trivia is a once-a-day thing with one attempt per question. The bar should
 * feel like a scoreboard, so: the points are the only figure at display size
 * and they arrive rather than appear, and each question is a pip that fills as
 * it is answered — right in champagne, wrong left hollow with a rule through
 * it. You can read the day at a glance without counting anything.
 */
import { memo, useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { ROYAL, HEADING, EASE, SPRING } from "../../lib/royal";

export interface Pip {
  id: string;
  /** null while unanswered. */
  correct: boolean | null;
}

/** A figure that counts to its value once, then stays put. */
const Ticker = memo(function Ticker({ value, still }: { value: number; still: boolean }) {
  const mv = useMotionValue(still ? value : 0);
  const shown = useTransform(mv, (v) => Math.round(v).toString());
  useEffect(() => {
    if (still) { mv.set(value); return; }
    const c = animate(mv, value, { duration: 0.8, ease: EASE });
    return () => c.stop();
  }, [value, still, mv]);
  return <motion.span>{shown}</motion.span>;
});

export const DayMeter = memo(function DayMeter({
  pips, points, still, note,
}: { pips: Pip[]; points: number; still: boolean; note: string }) {
  const answered = pips.filter((p) => p.correct !== null).length;

  return (
    <section
      className="relative rounded-2xl overflow-hidden px-4 py-3.5 flex items-center gap-4 flex-wrap"
      style={{
        border: `1px solid ${ROYAL.hairline}`,
        background:
          `radial-gradient(58% 130% at 4% -30%, rgba(217,183,117,0.16), transparent 60%),`
          + `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: ROYAL.gold }}>
          Today
        </div>
        <div className="mt-2 flex items-center gap-2">
          {pips.map((p, i) => (
            <Pips key={p.id} pip={p} index={i} still={still} />
          ))}
          <span className="ml-1.5 text-xs tabular-nums" style={{ color: ROYAL.dim }}>
            {answered} of {pips.length}
          </span>
        </div>
        <p className="mt-1.5 text-[11px]" style={{ color: ROYAL.dim }}>{note}</p>
      </div>

      <div className="text-right shrink-0">
        <div className="text-[10px] uppercase tracking-[0.28em]" style={{ color: ROYAL.dim }}>
          Points today
        </div>
        <div className="text-[34px] leading-none font-bold tabular-nums"
             style={{ fontFamily: HEADING, color: ROYAL.gold }}>
          <Ticker value={points} still={still} />
        </div>
      </div>
    </section>
  );
});

/**
 * One question's state.
 *
 * Filled champagne for a right answer, a hollow ring with a rule through it for
 * a wrong one, and a faint outline while it is still open. Three states that
 * are distinguishable without colour, because a quiz result that is only red
 * versus green is a quiz result a colour-blind member cannot read.
 */
function Pips({ pip, index, still }: { pip: Pip; index: number; still: boolean }) {
  const open = pip.correct === null;
  return (
    <motion.span
      initial={still ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={still ? { duration: 0.2 } : { ...SPRING.pop, delay: 0.08 * index }}
      className="relative inline-grid place-items-center w-4 h-4 rounded-full"
      style={{
        background: pip.correct === true ? ROYAL.gold : "transparent",
        border: `1.5px solid ${open ? ROYAL.hairline : pip.correct ? ROYAL.gold : "rgba(232,138,110,0.7)"}`,
      }}
    >
      {pip.correct === false && (
        <span aria-hidden className="block w-2 h-px" style={{ background: "rgba(232,138,110,0.9)" }} />
      )}
    </motion.span>
  );
}
