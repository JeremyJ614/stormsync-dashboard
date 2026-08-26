/**
 * The skull, and the one that travels.
 *
 * There is exactly one of these on screen at a time, sharing a `layoutId`, so
 * when the splash lifts the mark does not cross-fade into the header logo — it
 * flies there. Framer interpolates the position and scale between the two
 * mounts, which is why the splash now overlays the app instead of replacing it:
 * a `layoutId` can only animate between elements that exist in the same tree.
 *
 * The drip is drawn rather than baked in. The mark is a raster file, so its
 * insides cannot be animated, but droplets can fall from under its jaw — three
 * of them, on offset loops, each elongating as it falls the way a real drop
 * does under surface tension. Under reduced motion they are not rendered at
 * all; a looping animation is decoration and decoration is the first thing that
 * should go.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { prefersReducedMotion } from "../lib/royal";

const MARK = "/img/mark.webp";

export const BRAND_LAYOUT_ID = "sswx-brand-mark";

interface Props {
  size: number;
  /** Opt out of the shared layout animation (e.g. a second, decorative copy). */
  standalone?: boolean;
  /** Drips are for the big treatment; the 32px header copy would just smear. */
  drip?: boolean;
  glow?: string;
  className?: string;
}

export const BrandMark = memo(function BrandMark({
  size, standalone, drip, glow = "rgba(155,80,220,0.45)", className,
}: Props) {
  const still = prefersReducedMotion();
  const h = Math.round(size * (149 / 112)); // the mark's own aspect

  const img = (
    <img
      src={MARK}
      alt="StormSync"
      width={size}
      height={h}
      className="block object-contain"
      style={{ width: size, height: h, filter: `drop-shadow(0 0 ${size * 0.3}px ${glow})` }}
    />
  );

  return (
    <span className={`relative inline-block ${className ?? ""}`} style={{ width: size, height: h }}>
      {standalone ? img : (
        <motion.span
          layoutId={BRAND_LAYOUT_ID}
          transition={still ? { duration: 0 } : { type: "spring", stiffness: 190, damping: 26, mass: 0.9 }}
          className="block"
        >
          {img}
        </motion.span>
      )}

      {drip && !still && (
        <svg
          aria-hidden
          className="absolute left-0 pointer-events-none"
          style={{ top: h * 0.62, width: size, height: h * 0.62, overflow: "visible" }}
          viewBox="0 0 112 92"
        >
          {[
            { x: 38, delay: 0,   dur: 2.9 },
            { x: 56, delay: 1.1, dur: 3.4 },
            { x: 73, delay: 2.0, dur: 3.1 },
          ].map((d) => (
            <ellipse
              key={d.x}
              className="sswx-drip"
              cx={d.x} cy={0} rx={3} ry={3}
              fill="#b06be0"
              style={{ animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s` }}
            />
          ))}
        </svg>
      )}
    </span>
  );
});

export default BrandMark;
