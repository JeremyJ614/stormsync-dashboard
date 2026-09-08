import { memo, useMemo } from "react";
import { motion } from "framer-motion";

/**
 * The aurora itself, behind the number.
 *
 * A geomagnetic index is an abstraction. Kp 7 and Kp 1 are two digits on the
 * same card, and neither of them looks like the thing being forecast. This
 * draws it: curtains that hang faint and still when the field is quiet, and
 * brighten, redden and start moving when it is not.
 *
 * Everything scales off Kp, so the panel is never showing a storm it does not
 * have. Red only appears above Kp 5, which is where real displays start showing
 * red at their tops, and the drift quickens as the index climbs.
 *
 * It is decoration, so it obeys calm: during a warning at the member's own
 * location, or under prefers-reduced-motion, it renders its finished state and
 * stops. It is `aria-hidden` too — there is nothing here a screen reader needs
 * that the Kp value beside it does not already say.
 */

const VB_W = 1200, VB_H = 320;

/**
 * One curtain, hanging from the top edge.
 *
 * Auroral curtains are sheets seen edge-on, so they read as vertical folds that
 * lean and pinch rather than as blobs. `lean` is how far the bottom drifts from
 * the top and `waist` how hard it pinches in the middle — varying those two
 * across the set is what stops six copies of the same shape looking like six
 * copies of the same shape.
 */
function ribbon(w: number, h: number, lean: number, waist: number): string {
  return [
    `M 0 0`,
    `C ${lean} ${h * 0.30}, ${lean - waist} ${h * 0.62}, ${lean * 0.45} ${h}`,
    `L ${w + lean * 0.45} ${h}`,
    `C ${w + lean - waist} ${h * 0.62}, ${w + lean} ${h * 0.30}, ${w} 0`,
    `Z`,
  ].join(" ");
}

/** Position, width, height, lean and pinch for each curtain in the set. */
const SHEETS = [
  { x: -40,  w: 120, h: 300, lean: 62,  waist: 48, hue: 0 },
  { x: 110,  w: 78,  h: 236, lean: -44, waist: 30, hue: 1 },
  { x: 250,  w: 148, h: 288, lean: 78,  waist: 62, hue: 0 },
  { x: 400,  w: 92,  h: 250, lean: -58, waist: 40, hue: 1 },
  { x: 545,  w: 132, h: 306, lean: 50,  waist: 54, hue: 0 },
  { x: 700,  w: 86,  h: 228, lean: -40, waist: 26, hue: 1 },
  { x: 830,  w: 156, h: 292, lean: 70,  waist: 66, hue: 0 },
  { x: 1000, w: 100, h: 262, lean: -52, waist: 36, hue: 1 },
  { x: 1120, w: 124, h: 284, lean: 58,  waist: 50, hue: 0 },
];

export const AuroraCurtain = memo(function AuroraCurtain({
  kp, calm, height = 220,
}: { kp: number; calm: boolean; height?: number }) {
  const s = useMemo(() => {
    // Kp 0 is a blank sky, Kp 9 is the whole card alight. Everything below is
    // that one fraction, so nothing can drift out of step with the index.
    const f = Math.max(0, Math.min(1, kp / 9));
    return {
      opacity: 0.14 + f * 0.6,
      // Quiet aurora is green all the way up. Red comes from oxygen at 200 km,
      // which only gets excited when the field is genuinely disturbed.
      red: kp >= 5 ? Math.min(0.5, (kp - 5) * 0.13) : 0,
      period: 24 - f * 13,   // slow when quiet, restless when not
      sway: 8 + f * 34,
    };
  }, [kp]);

  const paths = useMemo(
    () => SHEETS.map((c) => ({ ...c, d: ribbon(c.w, c.h, c.lean, c.waist) })),
    [],
  );

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none"
         style={{ height,
                  maskImage: "linear-gradient(180deg, #000 0%, #000 42%, transparent 88%)",
                  WebkitMaskImage: "linear-gradient(180deg, #000 0%, #000 42%, transparent 88%)" }}>
      {/* `slice` rather than `none`: stretching the viewBox to the card's aspect
          smeared the blur sideways and the curtains came out as blobs. */}
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMin slice" className="w-full h-full">
        <defs>
          <linearGradient id="acGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#bef264" stopOpacity="0.15" />
            <stop offset="16%"  stopColor="#4ade80" stopOpacity="0.9" />
            <stop offset="58%"  stopColor="#22d3ee" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#4c1d95" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="acViolet" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#f0abfc" stopOpacity="0.2" />
            <stop offset="22%"  stopColor="#c084fc" stopOpacity="0.78" />
            <stop offset="100%" stopColor="#3b0764" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="acRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#fb7185" stopOpacity="0.85" />
            <stop offset="55%"  stopColor="#f472b6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
          </linearGradient>
          {/* Two passes. The soft one is the glow; the tight one keeps the
              folds readable — blur alone turned the curtains into smudges. */}
          <filter id="acSoft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="11" />
          </filter>
          <filter id="acEdge" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.6" />
          </filter>
        </defs>

        {/* the red upper band, only when the field is disturbed enough for it */}
        {s.red > 0 && (
          <motion.rect x="0" y="0" width={VB_W} height="110" fill="url(#acRed)"
            initial={{ opacity: calm ? s.red : 0 }}
            animate={calm ? { opacity: s.red } : { opacity: [s.red * 0.5, s.red, s.red * 0.5] }}
            transition={calm ? { duration: 0 } : { duration: s.period * 0.5, repeat: Infinity, ease: "easeInOut" }} />
        )}

        {[
          { filter: "url(#acSoft)", mul: 1 },
          { filter: "url(#acEdge)", mul: 0.5 },
        ].map((layer, li) => (
          <g key={li} filter={layer.filter} opacity={s.opacity * layer.mul}>
            {paths.map((c, i) => (
              <motion.path
                key={i}
                d={c.d}
                fill={c.hue ? "url(#acViolet)" : "url(#acGreen)"}
                style={{ transformOrigin: "0px 0px" }}
                initial={{ x: c.x, scaleX: 1, scaleY: 1, opacity: 0.8 }}
                animate={calm ? { x: c.x, scaleX: 1, scaleY: 1, opacity: 0.8 } : {
                  x: [c.x - s.sway, c.x + s.sway, c.x - s.sway],
                  scaleX: [0.86, 1.2, 0.86],
                  scaleY: [0.92, 1.08, 0.92],
                  opacity: [0.42, 0.95, 0.42],
                }}
                transition={calm ? { duration: 0 } : {
                  duration: s.period + i * 2.1,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.55,
                }} />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
});

export default AuroraCurtain;
