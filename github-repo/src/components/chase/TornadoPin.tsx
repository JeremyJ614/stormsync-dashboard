/**
 * The chase target marker: a funnel with an X planted under it.
 *
 * Two states. The primary pin is the day's best target and it earns the motion
 * budget: the funnel is drawn as three stacked ribbons that skew on their own
 * offset cycles, which reads as a rope wobbling rather than a shape wiggling,
 * and a ground ring pulses outward from the X. The secondary pin is the same
 * drawing, held still and desaturated, so at a glance you know which one the
 * forecast actually likes.
 *
 * Everything animated here is inside an SVG that already scales with the map, so
 * the funnel is drawn once in marker-local coordinates and translated into
 * place. That matters: Framer's `scale` and `rotate` overwrite an element's CSS
 * transform, so position and animation are never allowed to share an element.
 *
 * Nothing moves when the viewer asked for less motion, or when the calm rule is
 * in force. The X, the ring and the label all still render; they simply hold.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { EASE } from "../../lib/royal";

interface Props {
  x: number;
  y: number;
  color: string;
  /** The best target gets the animation and the heavier weight. */
  primary?: boolean;
  label?: string;
  still?: boolean;
  /** Marker scale in map units. The map viewBox is 975 wide. */
  size?: number;
  onClick?: () => void;
}

/**
 * One ribbon of the funnel, in local coordinates where (0,0) is the touchdown
 * point and the funnel opens upward.
 */
function ribbon(topHalf: number, botHalf: number, top: number, bottom: number): string {
  return `M ${-topHalf} ${top} L ${topHalf} ${top} L ${botHalf} ${bottom} L ${-botHalf} ${bottom} Z`;
}

export const TornadoPin = memo(function TornadoPin({
  x, y, color, primary = false, label, still = false, size = 1, onClick,
}: Props) {
  const s = size * (primary ? 1 : 0.78);
  const dim = primary ? 1 : 0.55;

  // Funnel segments, widest at the top. The taper is deliberately not linear:
  // real condensation funnels neck in fast just above the ground.
  const segs = [
    { topHalf: 13, botHalf: 8.5, top: -46, bottom: -30, delay: 0 },
    { topHalf: 8.5, botHalf: 4.8, top: -30, bottom: -16, delay: 0.18 },
    { topHalf: 4.8, botHalf: 2.2, top: -16, bottom: -2, delay: 0.36 },
  ];

  return (
    <g
      transform={`translate(${x} ${y})`}
      style={{ cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      aria-label={label ? `${label}${primary ? ", best target" : ""}` : undefined}
    >
      <g transform={`scale(${s})`}>
        {/* Ground ring. On the primary it breathes outward from the X. */}
        {primary && !still && (
          <motion.circle
            cx={0} cy={0} r={16} fill="none" stroke={color} strokeWidth={1.6}
            initial={{ scale: 0.5, opacity: 0.75 }}
            animate={{ scale: [0.5, 1.7], opacity: [0.75, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
            style={{ transformOrigin: "0px 0px" }}
          />
        )}
        <circle cx={0} cy={0} r={15} fill="none" stroke={color} strokeWidth={primary ? 1.4 : 1}
                opacity={primary ? 0.5 : 0.28} />

        {/* Debris fan at the base, so the funnel looks planted rather than floating. */}
        <path d="M -13 0 Q 0 -9 13 0 Q 0 4 -13 0 Z" fill={color} opacity={0.22 * dim} />

        {/* The funnel. */}
        <g opacity={dim}>
          {segs.map((seg, i) =>
            still ? (
              <path key={i} d={ribbon(seg.topHalf, seg.botHalf, seg.top, seg.bottom)}
                    fill={color} opacity={0.42 + i * 0.13} />
            ) : (
              <motion.path
                key={i}
                d={ribbon(seg.topHalf, seg.botHalf, seg.top, seg.bottom)}
                fill={color}
                opacity={0.42 + i * 0.13}
                animate={primary
                  ? { skewX: [-7, 7, -7], x: [-1.4, 1.4, -1.4] }
                  : { skewX: [-2.5, 2.5, -2.5] }}
                transition={{
                  duration: primary ? 2.1 : 3.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: seg.delay,
                }}
                style={{ transformOrigin: "0px 0px" }}
              />
            ),
          )}
        </g>

        {/* Wall cloud above the funnel, which is what you actually see first. */}
        <ellipse cx={0} cy={-50} rx={19} ry={6.5} fill={color} opacity={0.3 * dim} />
        <ellipse cx={0} cy={-53} rx={26} ry={5} fill={color} opacity={0.17 * dim} />

        {/* The X: the target itself, drawn on top of everything. */}
        <g strokeLinecap="round">
          <line x1={-7} y1={-7} x2={7} y2={7} stroke="#0a0a16" strokeWidth={5} />
          <line x1={7} y1={-7} x2={-7} y2={7} stroke="#0a0a16" strokeWidth={5} />
          <line x1={-7} y1={-7} x2={7} y2={7} stroke={color} strokeWidth={2.6} />
          <line x1={7} y1={-7} x2={-7} y2={7} stroke={color} strokeWidth={2.6} />
        </g>
      </g>

      {label && (
        // The label sits on its own plate. A stroked outline alone was not
        // enough: the map already carries state abbreviations, and "Wells
        // County, IN" landed straight on top of IL, IN and OH. An opaque plate
        // is the only thing that reliably wins that collision.
        <g transform={`translate(0 ${26 * s})`}>
          <rect
            x={-(label.length * 3.6 + 9)} y={-11}
            width={label.length * 7.2 + 18} height={19} rx={5}
            fill="#0a0a16" fillOpacity={0.88}
            stroke={color} strokeOpacity={primary ? 0.6 : 0.35} strokeWidth={1}
          />
          <text textAnchor="middle" y={3} fontSize={13} fontWeight={800}
                fill={color} fontFamily="system-ui, sans-serif">
            {label}
          </text>
        </g>
      )}
    </g>
  );
});

/**
 * The entrance. Pins drop in from above and settle, which reads as "planted
 * here" rather than "faded in". Kept separate from the pin itself because the
 * pin's own animation lives on inner elements, and stacking a Framer transform
 * on the positioned <g> would fight the translate.
 */
export const PinDrop = memo(function PinDrop({
  children, delay = 0, still = false,
}: { children: React.ReactNode; delay?: number; still?: boolean }) {
  if (still) {
    return (
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay }}>
        {children}
      </motion.g>
    );
  }
  return (
    <motion.g
      initial={{ opacity: 0, y: -46 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 18, delay }}
    >
      {children}
    </motion.g>
  );
});

/**
 * The line between the two targets, drawn on so the reader's eye is walked from
 * the best pick to the alternative rather than having to hunt for it.
 */
export const TargetLink = memo(function TargetLink({
  x1, y1, x2, y2, color, still,
}: { x1: number; y1: number; x2: number; y2: number; color: string; still: boolean }) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  return (
    <motion.line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={color} strokeWidth={1.6} strokeDasharray="7 9" opacity={0.4}
      initial={still ? { opacity: 0 } : { strokeDashoffset: len, opacity: 0 }}
      animate={still ? { opacity: 0.4 } : { strokeDashoffset: 0, opacity: 0.4 }}
      transition={{ duration: still ? 0.3 : 1.5, delay: 0.7, ease: EASE }}
    />
  );
});

export default TornadoPin;
