import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ROYAL, HEADING, EASE } from "../../lib/royal";

/**
 * The SSWXCon instrument.
 *
 * A 270° dial rather than a bar, because the thing being shown is a level on a
 * named scale and a dial is what a level on a scale looks like. Three rings do
 * the work: a banded track showing where the thresholds sit, a lit arc for the
 * current reading, and a needle. The activation threshold is marked on the
 * track, so how close the country is to it is legible without reading a number.
 *
 * Drawn in SVG and animated through two motion values — the arc's length and
 * the needle's rotation — so the whole thing costs two interpolations rather
 * than a repainting canvas. The count-up subscribes to a motion value instead
 * of setting state per frame, which keeps it off the React render path.
 */
const BANDS = [
  { to: 30,  color: "#4ade80" },
  { to: 50,  color: "#fbbf24" },
  { to: 70,  color: "#f97316" },
  { to: 90,  color: "#ef4444" },
  { to: 120, color: "#cc2222" },
  { to: 150, color: "#e03030" },
  { to: 250, color: "#ff3333" },
];

const R = 108;              // track radius
const CX = 140, CY = 132;
const SWEEP = 270;          // degrees
// Bearings, not screen angles: 0 is straight up, 90 right, 180 down, 270 left.
// The dial starts at bottom-left and sweeps clockwise through the top to
// bottom-right, leaving the gap under the reading where the label sits.
const START = 225;
const NEEDLE = R - 18;      // needle length from the hub
const TIP = 3;              // radius of the dot on its end

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (deg: number, r: number) => ({ x: CX + r * Math.cos(rad(deg)), y: CY + r * Math.sin(rad(deg)) });

/** Arc path from a to b degrees at radius r. */
function arcPath(a: number, b: number, r: number): string {
  const s = pt(a, r), e = pt(b, r);
  const large = Math.abs(b - a) > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export function ConGauge({
  score, max, threshold, color, label, calm,
}: {
  score: number; max: number; threshold: number;
  color: string; label: string; calm: boolean;
}) {
  const pct = Math.max(0, Math.min(1, score / max));
  const angle = START + SWEEP * pct;

  // Count-up without a re-render per frame.
  const mv = useMotionValue(0);
  const shown = useTransform(mv, (v) => v.toFixed(1));
  const [text, setText] = useState("0.0");
  useEffect(() => {
    const unsub = shown.on("change", (v) => setText(v));
    const controls = animate(mv, score, calm ? { duration: 0 } : { duration: 1.1, ease: EASE });
    return () => { unsub(); controls.stop(); };
  }, [score, calm, mv, shown]);

  const trackLen = useRef<number>(0);

  return (
    <div className="relative w-full grid place-items-center" style={{ minHeight: 250 }}>
      <svg width="280" height="250" viewBox="0 0 280 250" fill="none" role="img"
           aria-label={`SSWXCon score ${score.toFixed(1)} of ${max}, level ${label}`}>
        <defs>
          <filter id="con-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Banded track — where the named levels actually sit. */}
        {BANDS.map((b, i) => {
          const from = i === 0 ? 0 : BANDS[i - 1].to;
          const a = START + SWEEP * Math.min(1, from / max);
          const z = START + SWEEP * Math.min(1, b.to / max);
          if (z <= a) return null;
          return (
            <path key={b.to} d={arcPath(a, z, R)} stroke={b.color} strokeWidth={7}
                  strokeLinecap="butt" opacity={0.2} />
          );
        })}

        {/* Ticks every 25 points, longer at each band edge. */}
        {Array.from({ length: Math.floor(max / 25) + 1 }, (_, i) => i * 25).map((v) => {
          const a = START + SWEEP * (v / max);
          const edge = BANDS.some((b) => Math.abs(b.to - v) < 12.5);
          const o = pt(a, R + 6), inn = pt(a, R + (edge ? 14 : 10));
          return <line key={v} x1={o.x} y1={o.y} x2={inn.x} y2={inn.y}
                       stroke={edge ? ROYAL.gold : ROYAL.hairline} strokeWidth={edge ? 1.6 : 1} opacity={edge ? 0.8 : 0.5} />;
        })}

        {/* Activation threshold — the number that decides whether this is an event. */}
        {(() => {
          const a = START + SWEEP * Math.min(1, threshold / max);
          const o = pt(a, R - 12), i2 = pt(a, R + 16);
          return (
            <g>
              <line x1={o.x} y1={o.y} x2={i2.x} y2={i2.y} stroke={ROYAL.gold} strokeWidth={2} strokeDasharray="3 2" />
              <text x={pt(a, R + 27).x} y={pt(a, R + 27).y} fill={ROYAL.gold} fontSize="8"
                    textAnchor="middle" dominantBaseline="middle" letterSpacing="1.2">ACT</text>
            </g>
          );
        })()}

        {/* The reading. */}
        <motion.path
          ref={(el) => { if (el) trackLen.current = el.getTotalLength(); }}
          d={arcPath(START, Math.max(START + 0.01, angle), R)}
          stroke={color} strokeWidth={9} strokeLinecap="round"
          filter="url(#con-glow)"
          initial={false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={calm ? { duration: 0 } : { duration: 1.1, ease: EASE }}
        />

        {/* Needle.
            Two things had to be true for this to sit on the hub, and neither is
            obvious. Motion writes its own transform-box:fill-box and
            transform-origin:50% 50% onto an animated SVG group, overriding any
            origin given in style — measured at `46.5px 3px`, the centre of the
            needle's own bounding box. So the needle pivoted about its middle and
            its tail swung off the hub by a distance that changed with the score.

            Rather than fight the override, this makes 50% 50% the right answer:
            an outer translate puts the hub at the group's origin, and an
            unpainted circle sized to enclose the whole needle forces the bounding
            box to be symmetric about it. Its centre is then exactly the hub.
            The circle must cover the tip too — at just NEEDLE it fell 3u short
            and left a wobble of up to 3u. */}
        <g transform={`translate(${CX} ${CY})`}>
          <motion.g
            initial={false}
            animate={{ rotate: angle - 90 }}
            transition={calm ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 14 }}
          >
            <circle cx={0} cy={0} r={NEEDLE + TIP} fill="none" stroke="none" />
            <line x1={0} y1={0} x2={NEEDLE} y2={0} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={NEEDLE} cy={0} r={TIP} fill={color} />
          </motion.g>
        </g>
        <circle cx={CX} cy={CY} r={9} fill={ROYAL.ink} stroke={color} strokeWidth={2} />

        {/* Reading. */}
        <text x={CX} y={CY - 34} textAnchor="middle" fill={ROYAL.dim} fontSize="9" letterSpacing="3.2">SSWXCON</text>
        <text x={CX} y={CY + 46} textAnchor="middle" fill={color} fontSize="34" fontWeight="800"
              fontFamily={HEADING} style={{ letterSpacing: "-0.5px" }}>{text}</text>
        <text x={CX} y={CY + 64} textAnchor="middle" fill={ROYAL.dim} fontSize="9" letterSpacing="1.6">
          OF {max} · ACT {threshold}
        </text>
      </svg>

      {/* Level name, under the dial. */}
      <div className="-mt-1 px-5 py-1.5 rounded-full text-sm font-black tracking-[0.22em] uppercase"
           style={{ color, background: `${color}18`, border: `1px solid ${color}55` }}>
        {label}
      </div>
    </div>
  );
}
