/**
 * How a warning arrives on screen.
 *
 * Two entrances, and the app alternates between them so a run of warnings does
 * not read as a single repeated stamp:
 *
 *  - SLAM: the card drops in and lands hard, with a shock ring that expands out
 *    of the impact and a short recoil. The vocabulary of something heavy
 *    hitting a surface.
 *  - HYPERSPACE: the card arrives from off-screen at speed, stretched along its
 *    direction of travel with a trail behind it, then snaps to rest as the
 *    stretch releases. Ships dropping out of lightspeed. Sides alternate too,
 *    so consecutive hyperspace entries come from opposite edges.
 *
 * The alternation is deterministic on an index rather than random, because
 * random means two identical entrances in a row often enough to look like a
 * bug, and because a deterministic sequence is testable.
 *
 * Calm mode outranks all of it. When a warning is active for the member's own
 * location the card simply appears — see lib/calm for why that is not a
 * preference but a rule.
 */
import { memo, type ReactNode } from "react";
import { motion } from "framer-motion";

export type EntranceKind = "slam" | "hyperspace";

/** Deterministic alternation: slam, hyperspace-left, slam, hyperspace-right, … */
export function entranceFor(index: number): { kind: EntranceKind; from: -1 | 1 } {
  const kind: EntranceKind = index % 2 === 0 ? "slam" : "hyperspace";
  const from: -1 | 1 = Math.floor(index / 2) % 2 === 0 ? -1 : 1;
  return { kind, from };
}

interface Props {
  index: number;
  /** Suppresses the entrance entirely — calm mode, or reduced motion. */
  calm?: boolean;
  /** Severity tint for the shock ring. */
  tone?: string;
  children: ReactNode;
  className?: string;
}

export const WarningEntrance = memo(function WarningEntrance({
  index, calm, tone = "#e2373c", children, className,
}: Props) {
  const { kind, from } = entranceFor(index);

  if (calm) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.16 }} className={className}>
        {children}
      </motion.div>
    );
  }

  if (kind === "hyperspace") {
    return (
      <motion.div
        className={`relative ${className ?? ""}`}
        initial={{ x: from * 620, scaleX: 2.6, scaleY: 0.72, opacity: 0, filter: "blur(6px)" }}
        animate={{ x: 0, scaleX: 1, scaleY: 1, opacity: 1, filter: "blur(0px)" }}
        transition={{
          x: { type: "spring", stiffness: 420, damping: 30, mass: 0.8 },
          // The stretch releases a beat *after* the card lands, which is what
          // sells the arrival — snapping both at once just reads as a slide.
          scaleX: { duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: 0.06 },
          scaleY: { duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: 0.06 },
          opacity: { duration: 0.16 },
          filter: { duration: 0.3 },
        }}
        style={{ transformOrigin: from < 0 ? "left center" : "right center" }}
      >
        {/* the trail, drawn behind and gone almost immediately */}
        <motion.span
          aria-hidden
          className="absolute inset-y-2 rounded-full pointer-events-none"
          style={{
            [from < 0 ? "right" : "left"]: "100%",
            width: 220,
            background: `linear-gradient(${from < 0 ? "90deg" : "270deg"}, transparent, ${tone}44)`,
          }}
          initial={{ opacity: 0.9, scaleX: 1 }}
          animate={{ opacity: 0, scaleX: 0.2 }}
          transition={{ duration: 0.38, ease: "easeOut" }}
        />
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`relative ${className ?? ""}`}
      initial={{ y: -34, scale: 1.04, opacity: 0 }}
      animate={{ y: [-34, 4, 0], scale: [1.04, 0.985, 1], opacity: 1 }}
      transition={{
        duration: 0.46,
        times: [0, 0.62, 1],
        ease: [0.34, 1.2, 0.64, 1],
      }}
    >
      {/* shock ring out of the impact */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{ border: `2px solid ${tone}` }}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: [0, 0.55, 0], scale: [0.98, 1.06, 1.1] }}
        transition={{ duration: 0.55, delay: 0.24, ease: "easeOut" }}
      />
      {children}
    </motion.div>
  );
});

export default WarningEntrance;
