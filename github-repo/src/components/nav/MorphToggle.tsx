/**
 * The sidebar's expand/collapse control.
 *
 * The mark is a single polygon that folds between a hexagon (collapsed) and a
 * triangle (expanded). Both are the same six points on a circle — the triangle
 * is just the hexagon with its odd vertices pulled to half radius, which puts
 * them exactly on the triangle's edges. That makes it a true geometric fold
 * rather than a cross-fade between two drawings, and it means one scalar drives
 * the whole thing: the path, the counter-rotating outer ring, the core, and the
 * colour all read from the same spring.
 */
import { useEffect, useState } from "react";
import { motion, useSpring, useTransform, type MotionValue } from "framer-motion";
import { ROYAL, prefersReducedMotion } from "../../lib/royal";

const C = 12;      // viewBox centre
const R = 8.4;     // circumradius of the hexagon
const SIDES = 6;

/**
 * Six points at 60° steps. `fold` of 0 leaves every point at R (a hexagon);
 * 1 pulls the odd points to R/2, which lands them on the midpoints of the
 * triangle's edges — so the outline is exactly a triangle.
 */
function polygon(fold: number, radius = R): string {
  const pts: string[] = [];
  for (let i = 0; i < SIDES; i++) {
    const a = (-90 + i * (360 / SIDES)) * (Math.PI / 180);
    const r = i % 2 === 0 ? radius : radius * (1 - 0.5 * fold);
    pts.push(`${(C + Math.cos(a) * r).toFixed(3)},${(C + Math.sin(a) * r).toFixed(3)}`);
  }
  return `M${pts.join("L")}Z`;
}

export function MorphToggle({ expanded, size = 18 }: { expanded: boolean; size?: number }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(prefersReducedMotion()), []);

  // One spring, everything downstream derives from it.
  const fold: MotionValue<number> = useSpring(expanded ? 1 : 0, {
    stiffness: 240, damping: 22, mass: 0.7,
  });
  useEffect(() => { fold.set(expanded ? 1 : 0); }, [expanded, fold]);

  const d = useTransform(fold, (v) => polygon(v));
  const ringD = useTransform(fold, (v) => polygon(1 - v, R * 1.02));
  const spin = useTransform(fold, [0, 1], [0, 180]);
  const counterSpin = useTransform(fold, [0, 1], [0, -120]);
  const ringOpacity = useTransform(fold, [0, 0.5, 1], [0.16, 0.5, 0.16]);
  const coreScale = useTransform(fold, [0, 0.5, 1], [1, 0.2, 1]);
  const stroke = useTransform(fold, [0, 1], [ROYAL.iris, ROYAL.gold]);

  if (reduced) {
    // No fold, no spin — just show the end state.
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d={polygon(expanded ? 1 : 0)} stroke={expanded ? ROYAL.gold : ROYAL.iris}
              strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden
         style={{ overflow: "visible" }}>
      {/* Counter-rotating ghost — folds the opposite way, so the two cross at
          the midpoint of the transition and the mark reads as one moving object. */}
      <motion.g style={{ rotate: counterSpin, transformBox: "fill-box", transformOrigin: "center" }}>
        <motion.path d={ringD} stroke={ROYAL.gold} strokeWidth={1} strokeLinejoin="round"
                     style={{ opacity: ringOpacity }} />
      </motion.g>

      {/* The mark itself. */}
      <motion.g style={{ rotate: spin, transformBox: "fill-box", transformOrigin: "center" }}>
        <motion.path d={d} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round"
                     style={{ stroke }} />
      </motion.g>

      {/* Core pip — collapses to nothing as the fold passes its midpoint, which
          sells the shape as folding through itself rather than morphing flatly. */}
      {/* transformBox/transformOrigin rather than originX/Y: an SVG element
          otherwise scales about the viewBox origin, not its own centre. */}
      <motion.circle
        cx={C} cy={C} r={1.9}
        style={{ scale: coreScale, fill: stroke, transformBox: "fill-box", transformOrigin: "center" }}
      />
    </svg>
  );
}

export default MorphToggle;
