/**
 * The number the page opens with.
 *
 * A 0 to 10 rating for the whole country today, with a word or two beside it.
 * The ring sweeps to the score, the digits count up to meet it, and a faint
 * second ring lags behind so the sweep has something to be measured against.
 *
 * The count-up is driven by a Framer motion value rather than a state interval,
 * so it costs one animation frame subscription instead of a re-render per tick.
 */
import { memo, useEffect, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import { bandFor } from "../../lib/chase";

const R = 78;
const C = 2 * Math.PI * R;

export const ChaseScore = memo(function ChaseScore({
  score, label, headline, still,
}: { score: number; label: string; headline?: string | null; still: boolean }) {
  const band = bandFor(score);
  const frac = Math.max(0, Math.min(1, score / 10));

  const mv = useMotionValue(still ? score : 0);
  const [shown, setShown] = useState(still ? score : 0);
  const dash = useTransform(mv, (v) => `${(Math.max(0, Math.min(10, v)) / 10) * C} ${C}`);

  useEffect(() => {
    if (still) { mv.set(score); setShown(score); return; }
    const controls = animate(mv, score, { duration: 1.5, ease: EASE });
    const unsub = mv.on("change", (v) => setShown(Math.round(v * 10) / 10));
    return () => { controls.stop(); unsub(); };
  }, [score, still, mv]);

  return (
    <div className="relative rounded-3xl overflow-hidden px-5 py-6 sm:px-8"
         style={{
           background: `radial-gradient(120% 140% at 50% 0%, ${band.color}1c, ${ROYAL.ink2} 62%)`,
           border: `1px solid ${band.color}44`,
         }}>
      {/* Geometric backdrop: concentric arcs on the same centre as the dial. */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true"
           viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
        {[52, 92, 132, 172].map((r, i) => (
          <circle key={r} cx={200} cy={104} r={r} fill="none"
                  stroke={band.color} strokeWidth={0.6} opacity={0.13 - i * 0.022} />
        ))}
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
          return (
            <line key={i}
              x1={200 + Math.cos(a) * 176} y1={104 + Math.sin(a) * 176}
              x2={200 + Math.cos(a) * 186} y2={104 + Math.sin(a) * 186}
              stroke={band.color} strokeWidth={1} opacity={0.14} />
          );
        })}
      </svg>

      <div className="relative flex flex-col sm:flex-row items-center gap-5 sm:gap-8">
        <div className="relative shrink-0" style={{ width: 186, height: 186 }}>
          <svg viewBox="0 0 186 186" className="w-full h-full -rotate-90">
            <circle cx={93} cy={93} r={R} fill="none" stroke={ROYAL.hairline} strokeWidth={9} />
            {/* Ghost ring: the full scale, so the sweep has a reference. */}
            <circle cx={93} cy={93} r={R} fill="none" stroke={band.color} strokeWidth={9}
                    strokeDasharray={`${C} ${C}`} opacity={0.1} strokeLinecap="round" />
            <motion.circle
              cx={93} cy={93} r={R} fill="none" stroke={band.color} strokeWidth={9}
              strokeLinecap="round"
              style={{ strokeDasharray: dash, filter: `drop-shadow(0 0 9px ${band.glow})` }}
            />
            {/* Tick at each whole point. */}
            {Array.from({ length: 11 }).map((_, i) => {
              const a = (i / 10) * Math.PI * 2;
              const on = i / 10 <= frac;
              return (
                <line key={i}
                  x1={93 + Math.cos(a) * (R - 15)} y1={93 + Math.sin(a) * (R - 15)}
                  x2={93 + Math.cos(a) * (R - 10)} y2={93 + Math.sin(a) * (R - 10)}
                  stroke={on ? band.color : ROYAL.dim} strokeWidth={1.4}
                  opacity={on ? 0.85 : 0.3} />
              );
            })}
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center leading-none">
              <div className="text-[54px] font-black tabular-nums tracking-tight"
                   style={{ color: band.color, fontFamily: HEADING, textShadow: `0 0 26px ${band.glow}` }}>
                {shown.toFixed(1)}
              </div>
              <div className="text-[11px] uppercase tracking-[0.3em] mt-1" style={{ color: ROYAL.dim }}>
                out of 10
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="text-[10px] uppercase tracking-[0.32em] font-semibold mb-1.5"
               style={{ color: ROYAL.dim }}>
            Today's chase potential
          </div>
          <motion.h2
            initial={still ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: still ? 0 : 0.35, ease: EASE }}
            className="text-3xl sm:text-5xl font-black leading-[1.02] tracking-tight"
            style={{ color: band.color, fontFamily: HEADING, textShadow: `0 0 34px ${band.glow}` }}
          >
            {label}
          </motion.h2>
          {headline && (
            <motion.p
              initial={still ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: still ? 0 : 0.5, ease: EASE }}
              className="text-sm mt-2.5 leading-relaxed max-w-xl mx-auto sm:mx-0"
              style={{ color: ROYAL.text }}
            >
              {headline}
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
});

export default ChaseScore;
