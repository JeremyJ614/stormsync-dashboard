/**
 * The period's numbers, as one instrument.
 *
 * WHAT WAS WRONG WITH THE LAST ONE
 * Three equal boxes in a `grid-cols-2 sm:grid-cols-3`, which on a phone is two
 * boxes and an orphan — the "uneven" in the complaint, and it was structural
 * rather than a spacing mistake. Each box then set a 26px black numeral in the
 * category's own warning colour: pillar-box red, and a chartreuse borrowed from
 * a severe-thunderstorm polygon. Those hues are correct on a map, where they
 * are conventions a forecaster reads. Blown up to display size on a champagne
 * and periwinkle page they are three saturated shouts that belong to no palette
 * at all, which is the "cartoonish" and the "colours don't match".
 *
 * WHAT THIS IS
 * One reading, then its breakdown — the shape of every real instrument.
 *
 * The total is the only figure at display size, and it is champagne, because
 * the page has exactly one accent and this is the number the page is about. The
 * categories become a ruled column: aligned labels, right-aligned tabular
 * figures on a shared decimal, and a proportion bar on one common scale, so you
 * can see at a glance that severe thunderstorm warnings are most of the period
 * and tornado warnings are a tenth of it. Their warning colours survive as the
 * bar and a marker — small, where a convention is useful and a shout is not.
 *
 * Being a list rather than a grid, it cannot go uneven: one column on a phone,
 * two beside each other when there is room, every row on the same baseline.
 */
import { memo, useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { ROYAL, HEADING, EASE } from "../../lib/royal";

export interface BankRow {
  label: string;
  /** The figure as written — "142", "EF3", "4 · 37". */
  value: string;
  color: string;
  /** Present when the row is part of the total, and drives the bar. */
  count?: number;
}

interface Props {
  eyebrow: string;
  /** The one number the period is about. */
  total: number;
  /** "warnings issued", "tornado paths". */
  unit: string;
  /** The span the figure covers — "Sep 9 → Sep 12". */
  caption?: string;
  rows: BankRow[];
  still: boolean;
}

/** A total that arrives rather than appears. One-shot; nothing loops. */
const Ticker = memo(function Ticker({ value, still }: { value: number; still: boolean }) {
  const mv = useMotionValue(still ? value : 0);
  const shown = useTransform(mv, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    if (still) { mv.set(value); return; }
    const c = animate(mv, value, { duration: 0.9, ease: EASE });
    return () => c.stop();
  }, [value, still, mv]);
  return <motion.span>{shown}</motion.span>;
});

export const StatBank = memo(function StatBank({ eyebrow, total, unit, caption, rows, still }: Props) {
  const scale = Math.max(1, ...rows.map((r) => r.count ?? 0));
  const proportional = rows.some((r) => typeof r.count === "number");

  return (
    <section
      className="relative rounded-2xl overflow-hidden"
      style={{
        border: `1px solid ${ROYAL.hairline}`,
        background:
          `radial-gradient(62% 130% at 6% -25%, rgba(217,183,117,0.14), transparent 62%),`
          + `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
      }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      <div className="relative p-4 sm:p-5 flex flex-col sm:flex-row sm:items-stretch gap-5 sm:gap-7">
        {/* the reading */}
        <div className="sm:w-[210px] shrink-0">
          <div className="text-[9px] uppercase tracking-[0.28em] font-semibold" style={{ color: ROYAL.gold }}>
            {eyebrow}
          </div>
          <div
            className="font-black tabular-nums leading-[0.86] mt-2"
            style={{
              fontFamily: HEADING,
              color: ROYAL.text,
              fontSize: "clamp(44px, 11vw, 68px)",
              letterSpacing: "-0.03em",
              textShadow: "0 14px 40px rgba(0,0,0,0.6)",
            }}
          >
            <Ticker value={total} still={still} />
          </div>
          <div className="text-[11px] mt-1.5 uppercase tracking-[0.2em]" style={{ color: ROYAL.dim }}>
            {unit}
          </div>

          {/* A tick ladder, as on a measuring plate. Drawn once, never animated. */}
          <div aria-hidden className="flex items-end gap-[3px] h-3.5 mt-3.5">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} className="w-px"
                    style={{
                      height: i % 6 === 0 ? 13 : 6,
                      background: i % 6 === 0 ? ROYAL.goldSoft : ROYAL.hairline,
                    }} />
            ))}
          </div>

          {caption && (
            <div className="text-[11px] tabular-nums mt-2" style={{ color: ROYAL.dim }}>{caption}</div>
          )}
        </div>

        {/* what it is made of */}
        <div className="flex-1 min-w-0 flex flex-col justify-center"
             style={{ borderLeft: "none" }}>
          <ul className="divide-y" style={{ borderColor: ROYAL.hairline }}>
            {rows.map((r, i) => {
              const share = proportional && typeof r.count === "number" && total > 0
                ? r.count / total : null;
              return (
                <motion.li
                  key={r.label}
                  className="flex items-center gap-3 py-2"
                  initial={still ? { opacity: 0 } : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: still ? 0.2 : 0.4, delay: still ? 0 : 0.12 + i * 0.05, ease: EASE }}
                >
                  <span className="w-[3px] h-4 rounded-full shrink-0" style={{ background: r.color }} />
                  {/* A fixed label column, so every bar starts on the same
                      vertical — a ragged left edge is what makes a set of bars
                      read as five separate widgets instead of one scale. */}
                  <span className="text-[12.5px] truncate flex-1 sm:flex-none sm:w-[168px] sm:shrink-0"
                        style={{ color: ROYAL.text }}>{r.label}</span>

                  {typeof r.count === "number" && (
                    <span className="hidden sm:block flex-1 h-[5px] rounded-full mx-2 min-w-[40px]"
                          style={{ background: "rgba(255,255,255,0.05)" }}>
                      <motion.span
                        className="block h-full rounded-full"
                        style={{ background: r.color, opacity: 0.85 }}
                        initial={still ? { width: `${(r.count / scale) * 100}%` } : { width: 0 }}
                        animate={{ width: `${(r.count / scale) * 100}%` }}
                        transition={still ? { duration: 0 } : { duration: 0.65, delay: 0.18 + i * 0.05, ease: EASE }}
                      />
                    </span>
                  )}

                  <span className="ml-auto text-[15px] font-bold tabular-nums shrink-0"
                        style={{ color: ROYAL.text, fontFamily: HEADING }}>
                    {r.value}
                  </span>
                  {share !== null && (
                    <span className="w-11 text-right text-[11px] tabular-nums shrink-0" style={{ color: ROYAL.dim }}>
                      {(share * 100).toFixed(share < 0.1 ? 1 : 0)}%
                    </span>
                  )}
                </motion.li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
});

export default StatBank;
