/**
 * A number that settles into place instead of snapping.
 *
 * Driven by a spring rather than a timed tween so a value that changes while
 * the animation is still running retargets smoothly instead of restarting.
 * Renders tabular figures so the width never jitters mid-count.
 */
import { useEffect, useState } from "react";
import { useSpring, useMotionValueEvent } from "framer-motion";
import { prefersReducedMotion } from "../../lib/royal";

export function CountUp({
  value, decimals = 0, className, style,
}: {
  value: number | null | undefined;
  decimals?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const target = Number.isFinite(value as number) ? (value as number) : 0;
  const [reduced, setReduced] = useState(false);
  const [shown, setShown] = useState(target);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  const spring = useSpring(target, { stiffness: 90, damping: 20, mass: 0.8 });
  useEffect(() => { spring.set(target); }, [target, spring]);
  useMotionValueEvent(spring, "change", (v) => setShown(v));

  if (value == null || !Number.isFinite(value)) {
    return <span className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>—</span>;
  }
  const out = (reduced ? target : shown).toFixed(decimals);
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {out}
    </span>
  );
}

export default CountUp;
