/**
 * The moving field behind the sign-in card.
 *
 * Three slow-drifting colour bodies plus a fine grid, all far enough back that
 * they never fight the form. The bodies run on long, mismatched durations so
 * the composition never visibly loops. Under reduced-motion the same
 * composition renders, held still.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ROYAL, prefersReducedMotion } from "../../lib/royal";

const BODIES = [
  { color: "rgba(217,183,117,0.20)", size: 520, from: { x: "-18%", y: "-12%" }, to: { x: "12%", y: "16%" }, secs: 19 },
  { color: "rgba(124,110,255,0.20)", size: 620, from: { x: "70%", y: "-8%" },  to: { x: "48%", y: "22%" }, secs: 25 },
  { color: "rgba(90,180,230,0.13)",  size: 460, from: { x: "20%", y: "70%" },  to: { x: "56%", y: "48%" }, secs: 31 },
];

export function AuthAurora() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(prefersReducedMotion()), []);

  return (
    <div
      aria-hidden
      // z-0 rather than a negative index: the app shell paints an opaque
      // background, and a negatively-stacked child renders behind it.
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
      style={{ background: `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})` }}
    >
      {BODIES.map((b, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{
            width: b.size, height: b.size,
            background: `radial-gradient(circle, ${b.color} 0%, transparent 68%)`,
            filter: "blur(28px)",
          }}
          initial={b.from}
          animate={reduced ? b.from : { x: [b.from.x, b.to.x, b.from.x], y: [b.from.y, b.to.y, b.from.y] }}
          transition={{ duration: b.secs, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* Fine grid, faded toward the edges — gives the field a sense of plane. */}
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            `linear-gradient(hsl(var(--border)) 1px, transparent 1px),` +
            `linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 78%)",
        }}
      />
    </div>
  );
}

export default AuthAurora;
