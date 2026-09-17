import { motion } from "framer-motion";
import { ROYAL, EASE } from "../../lib/royal";

/**
 * The scale, with today's reading standing on it.
 *
 * It used to be eight coloured cards in a grid. A grid of cards is a glossary;
 * it tells you what the words mean and nothing about where you are, which on a
 * page whose entire job is "how bad is it right now" is the wrong half of the
 * information.
 *
 * A ladder shows both. The bands sit in order at their true heights — the
 * 150–250 band is genuinely five times the depth of 0–30, because that is what
 * the scale does — and the reading is a lit rung across it. How much headroom
 * is left above today, and how far the country would have to climb to reach
 * the next name, are then things you can see rather than arithmetic you have
 * to do.
 */
export interface Band { from: number; to: number; label: string; color: string }

export function ScaleLadder({
  bands, score, threshold, max, calm, thresholdLabel = "activation",
}: {
  bands: Band[]; score: number; threshold: number; max: number; calm: boolean;
  /**
   * What the marked line MEANS on this scale.
   *
   * SSWXCon has an activation threshold; the Threat Index does not, and reusing
   * the ladder without saying so printed "ACTIVATION 60" on a module where no
   * such thing exists. A shared component may not carry one module's vocabulary
   * into another's.
   */
  thresholdLabel?: string;
}) {
  const pos = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  const here = bands.find((b) => score >= b.from && score < b.to) ?? bands[bands.length - 1];

  return (
    <div className="flex gap-3">
      {/* the ladder */}
      <div className="relative w-16 sm:w-20 shrink-0 rounded-xl overflow-hidden"
           style={{ height: 320, border: `1px solid ${ROYAL.hairline}` }}>
        {bands.map((b, i) => (
          <motion.div
            key={b.label}
            className="absolute left-0 right-0"
            style={{
              bottom: `${pos(b.from)}%`,
              height: `${pos(b.to) - pos(b.from)}%`,
              background: `linear-gradient(90deg, ${b.color}44, ${b.color}18)`,
              borderTop: `1px solid ${b.color}55`,
            }}
            initial={calm ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={calm ? { duration: 0 } : { duration: 0.45, delay: i * 0.05, ease: EASE }}
          />
        ))}

        {/* the activation threshold, drawn as a rule across everything */}
        <div className="absolute left-0 right-0 pointer-events-none"
             style={{ bottom: `${pos(threshold)}%`, height: 0,
                      borderTop: "1px dashed rgba(255,255,255,0.5)" }} />

        {/* today */}
        <motion.div
          className="absolute left-0 right-0 pointer-events-none"
          initial={calm ? false : { bottom: "0%" }}
          animate={{ bottom: `${pos(score)}%` }}
          transition={calm ? { duration: 0 } : { duration: 1.1, ease: EASE }}
          style={{ height: 0 }}
        >
          <div style={{
            height: 2, background: "#fff",
            boxShadow: `0 0 10px 1px ${here.color}, 0 0 22px 4px ${here.color}66`,
          }} />
        </motion.div>
      </div>

      {/* the names, aligned to the rungs they belong to */}
      <div className="relative flex-1" style={{ height: 320 }}>
        {bands.map((b) => {
          const mid = (pos(b.from) + pos(b.to)) / 2;
          const on = b === here;
          return (
            <div key={b.label} className="absolute left-0 right-0 flex items-center gap-2"
                 style={{ bottom: `calc(${mid}% - 9px)` }}>
              <span className="text-[11px] tabular-nums w-16 shrink-0"
                    style={{ color: on ? b.color : ROYAL.dim, fontWeight: on ? 800 : 500 }}>
                {b.from}–{b.to >= max ? `${max}+` : b.to}
              </span>
              <span className="text-[11.5px] truncate"
                    style={{ color: on ? ROYAL.text : ROYAL.dim, fontWeight: on ? 700 : 400 }}>
                {b.label}
              </span>
              {on && (
                <span className="text-[9px] uppercase tracking-[0.2em] px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: `${b.color}22`, border: `1px solid ${b.color}55`, color: b.color }}>
                  now
                </span>
              )}
            </div>
          );
        })}
        {/* Right-aligned, because the threshold sits inside a band and its
            label would otherwise land on top of that band's name — which is
            exactly where the eye goes to read "now". */}
        <div className="absolute left-0 right-0 flex items-center justify-end"
             style={{ bottom: `calc(${pos(threshold)}% - 7px)` }}>
          <span className="text-[9.5px] uppercase tracking-[0.18em] px-1.5 py-0.5 rounded"
                style={{ color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.07)" }}>
            {thresholdLabel} {threshold}
          </span>
        </div>
      </div>
    </div>
  );
}
