import { useEffect, useMemo, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ROYAL, HEADING, EASE } from "../../lib/royal";

/**
 * The SSWXCon instrument.
 *
 * REDESIGNED. What was here was a 270° needle dial: a banded track, a lit arc
 * and a pointer on a hub. It worked, and it was the wrong instrument. A needle
 * sweeping a continuous track is what a speedometer looks like, and it reads as
 * a RATE — how fast, how much. SSWXCon is not a rate. It is a level on a named
 * scale with a gate in it, and the two questions anyone actually brings to this
 * page are "which level" and "are we past activation".
 *
 * So the track is now sixty discrete segments and the gate is drawn on it.
 * Discrete segments read as a level because they can be counted, the way an
 * aircraft or reactor instrument is read; and the moment the lit segments cross
 * the gate the whole ring changes character, which is a state change you can
 * see from across a room. The needle is gone: with countable segments it was
 * duplicating the reading, and a hub that has to be fought into position (see
 * the note this replaced, about `transform-box` overrides) for information the
 * ring already carries is a poor trade.
 *
 * SEGMENTS BELOW THE GATE ARE COOL AND ABOVE IT ARE HOT. That is the whole
 * design. A score of 48 against a gate of 60 shows a ring three-quarters full
 * and entirely cold, which is the correct feeling for it; at 62 a handful of
 * segments burn and the number has not moved much at all.
 *
 * MOTION
 * The lighting sweep is a per-segment CSS transition delay, not an animation
 * loop and not a per-frame React render: sixty elements each with one delayed
 * opacity transition, which the compositor handles and which stops by itself.
 * This app has been slowed to a crawl once already by a splash screen animating
 * for ever, and an instrument that runs a loop while somebody reads a warning
 * is the same mistake in a smaller box. The numeral counts up through a motion
 * value with a single subscription, so it stays off the render path too.
 */

/** Where the named levels change, for the tick marks. */
const BAND_EDGES = [30, 50, 70, 90, 120, 150];

const SEGMENTS = 60;
const R_OUT = 108;          // outer end of a segment
const R_IN = 92;            // inner end
const CX = 140, CY = 134;
const SWEEP = 274;          // degrees of arc the scale occupies
// Bearings, not screen angles: 0 is straight up, 90 right, 180 down, 270 left.
// Starting at 223 leaves a gap at the bottom, under the reading, where the
// level name sits.
const START = 223;

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (deg: number, r: number) => ({ x: CX + r * Math.cos(rad(deg)), y: CY + r * Math.sin(rad(deg)) });

export function ConGauge({
  score, max, threshold, color, label, calm,
}: {
  score: number; max: number; threshold: number;
  color: string; label: string; calm: boolean;
}) {
  const pct = Math.max(0, Math.min(1, score / max));
  const gate = Math.max(0, Math.min(1, threshold / max));
  const live = Math.round(pct * SEGMENTS);
  const gateSeg = Math.round(gate * SEGMENTS);
  const over = score >= threshold;

  // One frame of "all dark", then the sweep runs itself through CSS delays.
  const [lit, setLit] = useState(calm);
  useEffect(() => {
    if (calm) { setLit(true); return; }
    const t = requestAnimationFrame(() => setLit(true));
    return () => cancelAnimationFrame(t);
  }, [calm]);

  // Count-up without a re-render per frame.
  const mv = useMotionValue(0);
  const shown = useTransform(mv, (v) => v.toFixed(1));
  const [text, setText] = useState("0.0");
  useEffect(() => {
    const unsub = shown.on("change", (v) => setText(v));
    const controls = animate(mv, score, calm ? { duration: 0 } : { duration: 1.2, ease: EASE });
    return () => { unsub(); controls.stop(); };
  }, [score, calm, mv, shown]);

  const segments = useMemo(() => Array.from({ length: SEGMENTS }, (_, i) => {
    const a = START + (SWEEP * (i + 0.5)) / SEGMENTS;
    const o = pt(a, R_OUT), n = pt(a, R_IN);
    return { i, a, x1: n.x, y1: n.y, x2: o.x, y2: o.y, hot: i >= gateSeg };
  }), [gateSeg]);

  const delta = Math.abs(score - threshold);

  return (
    <div className="relative w-full grid place-items-center" style={{ minHeight: 250 }}>
      <svg width="280" height="252" viewBox="0 0 280 252" fill="none" role="img"
           aria-label={`SSWXCon ${score.toFixed(1)} of ${max}, level ${label}, activation ${threshold}`}>
        <defs>
          <filter id="con-burn" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* The ring. Every segment is drawn; only the reached ones are lit, and
            only the ones past the gate are hot. */}
        <g strokeLinecap="round">
          {segments.map((s) => {
            const on = lit && s.i < live;
            /*
             * Three states, and they have to separate at a glance — this was
             * the one thing wrong with the first cut. Lit-but-cool at 55% white
             * against unlit at 13% looked like one grey mass from a normal
             * viewing distance, so the reading itself disappeared and only the
             * handful of burning segments registered.
             *
             * Now: dark, periwinkle, and the level colour. The middle state
             * carries the app's own accent rather than a grey, which makes it
             * unmistakably ON while still reading as cold.
             */
            const stroke = !on ? "rgba(204,204,255,0.09)"
              : s.hot ? color
              : ROYAL.iris;
            return (
              <line
                key={s.i}
                x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                stroke={stroke}
                strokeOpacity={!on ? 1 : s.hot ? 1 : 0.8}
                strokeWidth={!on ? 3.5 : s.hot ? 6 : 4.5}
                filter={on && s.hot ? "url(#con-burn)" : undefined}
                style={calm ? undefined : {
                  transition: "stroke 260ms ease, stroke-width 260ms ease, stroke-opacity 260ms ease",
                  // The sweep. Capped so a full ring still finishes inside a
                  // second rather than crawling round for two.
                  transitionDelay: `${Math.min(s.i * 13, 780)}ms`,
                }}
              />
            );
          })}
        </g>

        {/* The gate. The single most important mark on the instrument: below it
            this is weather, above it it is an event. */}
        {(() => {
          const a = START + SWEEP * gate;
          const o = pt(a, R_IN - 9), i2 = pt(a, R_OUT + 9);
          const t = pt(a, R_OUT + 21);
          return (
            <g>
              <line x1={o.x} y1={o.y} x2={i2.x} y2={i2.y}
                    stroke={ROYAL.gold} strokeWidth={2.2} strokeLinecap="round" />
              <text x={t.x} y={t.y} fill={ROYAL.gold} fontSize="7.5" letterSpacing="1.6"
                    textAnchor="middle" dominantBaseline="middle">ACT</text>
            </g>
          );
        })()}

        {/* Band edges, as hairline ticks outside the ring — where the names
            change, for anyone reading the ladder further down the page. */}
        {BAND_EDGES.filter((v) => v < max).map((v) => {
          const a = START + SWEEP * (v / max);
          const o = pt(a, R_OUT + 3), n = pt(a, R_OUT + 8);
          return <line key={v} x1={o.x} y1={o.y} x2={n.x} y2={n.y}
                       stroke={ROYAL.hairline} strokeWidth={1.4} />;
        })}

        {/* The reading. */}
        <text x={CX} y={CY - 40} textAnchor="middle" fill={ROYAL.dim} fontSize="8.5" letterSpacing="3.4">SSWXCON</text>
        <text x={CX} y={CY + 16} textAnchor="middle" fill={color} fontSize="46" fontWeight="800"
              fontFamily={HEADING} style={{ letterSpacing: "-1px" }}>{text}</text>
        <text x={CX} y={CY + 36} textAnchor="middle" fill={ROYAL.dim} fontSize="8.5" letterSpacing="1.6">
          OF {max}
        </text>

        {/* The delta, which is the operational sentence: not "how big" but
            "how far from the line". */}
        <text x={CX} y={CY + 58} textAnchor="middle" fontSize="9.5" letterSpacing="0.6"
              fill={over ? color : ROYAL.dim}>
          {delta < 0.05
            ? "at activation"
            : `${delta.toFixed(1)} ${over ? "above" : "below"} activation`}
        </text>
      </svg>

      {/* Level name, under the dial. */}
      <motion.div
        initial={calm ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: calm ? 0 : 0.45, delay: calm ? 0 : 0.5, ease: EASE }}
        className="-mt-2 px-5 py-1.5 rounded-full text-sm font-black tracking-[0.22em] uppercase"
        style={{ color, background: `${color}18`, border: `1px solid ${color}55` }}
      >
        {label}
      </motion.div>
    </div>
  );
}
