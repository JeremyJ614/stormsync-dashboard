/**
 * The weather animations, in one place.
 *
 * These are the specific effects the app asked for, built as components rather
 * than scattered one-off `motion` calls so that they share a vocabulary and,
 * more importantly, share the calm-mode contract: every one of them takes a
 * `calm` prop and renders its finished state when it is set. See lib/calm.
 *
 * The common shape is "draw the thing the way it actually happens":
 *  - A cone is drawn outward from the storm, because that is the direction the
 *    uncertainty grows.
 *  - Risk polygons rise weakest-first, so the eye lands last on the worst area.
 *  - A barograph traces left to right at the rate a real drum turns.
 *  - Lightning pulses decay, because a strike is a flash and a fade, not a blink.
 */
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ROYAL, EASE } from "../../lib/royal";

// ─── cone / track draw-on ────────────────────────────────────────────────────
/**
 * Draws an SVG path on from its origin. Used for hurricane cones and storm
 * tracks; the cone widens away from the storm, which is the direction the
 * stroke travels, so the drawing motion carries the meaning.
 */
export const DrawPath = memo(function DrawPath({
  d, stroke = ROYAL.gold, width = 2, fill = "none", calm, delay = 0, duration = 1.1, dashed,
}: {
  d: string; stroke?: string; width?: number; fill?: string;
  calm?: boolean; delay?: number; duration?: number; dashed?: boolean;
}) {
  return (
    <motion.path
      d={d} fill={fill} stroke={stroke} strokeWidth={width}
      strokeLinecap="round" strokeLinejoin="round"
      strokeDasharray={dashed ? "6 5" : undefined}
      initial={calm ? false : { pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={calm ? { duration: 0 } : { pathLength: { duration, delay, ease: EASE }, opacity: { duration: 0.2, delay } }}
    />
  );
});

// ─── risk polygons rising by category ────────────────────────────────────────
/**
 * Fades a set of risk areas in weakest-first.
 *
 * The order is the point. Bringing the worst category up last means the eye
 * settles on it, rather than on whichever polygon happens to be largest.
 */
export const RiskRise = memo(function RiskRise({
  rank, total, calm, children,
}: { rank: number; total: number; calm?: boolean; children: ReactNode }) {
  const step = total > 1 ? rank / (total - 1) : 0;
  return (
    <motion.g
      initial={calm ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={calm ? { duration: 0 } : { duration: 0.5, delay: step * 0.55, ease: EASE }}
    >
      {children}
    </motion.g>
  );
});

// ─── live barograph ──────────────────────────────────────────────────────────
export interface BaroPoint { t: string; mb: number }

/**
 * A pressure trace that draws at the rate a drum barograph turns.
 *
 * The falling-fast marker is the part worth having: a drop of more than about
 * 1 mb/hr is what a forecaster looks for, and it is invisible in a line chart
 * unless something points at it.
 */
export const Barograph = memo(function Barograph({
  points, calm, height = 120,
}: { points: BaroPoint[]; calm?: boolean; height?: number }) {
  if (points.length < 2) {
    return <p className="text-xs py-6 text-center" style={{ color: ROYAL.dim }}>Not enough pressure history yet.</p>;
  }

  const W = 700, H = height;
  const vals = points.map((p) => p.mb);
  const lo = Math.min(...vals) - 1;
  const hi = Math.max(...vals) + 1;
  const span = Math.max(0.5, hi - lo);

  const xy = points.map((p, i) => ({
    x: (i / (points.length - 1)) * W,
    y: H - ((p.mb - lo) / span) * H,
  }));
  const d = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // Steepest fall over any hour in the series.
  let steepest = { drop: 0, index: 0 };
  for (let i = 1; i < points.length; i++) {
    const drop = points[i - 1].mb - points[i].mb;
    if (drop > steepest.drop) steepest = { drop, index: i };
  }
  const falling = steepest.drop >= 1;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" y1={H * f} x2={W} y2={H * f}
                stroke={ROYAL.iris} strokeOpacity="0.08" strokeWidth="1" />
        ))}
        <motion.path
          d={d} fill="none" stroke={falling ? "#e2373c" : ROYAL.gold}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          initial={calm ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={calm ? { duration: 0 } : { duration: 1.6, ease: "linear" }}
        />
        {falling && (
          <motion.circle
            cx={xy[steepest.index].x} cy={xy[steepest.index].y} r="4"
            fill="#e2373c"
            initial={calm ? false : { opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={calm ? { duration: 0 } : { delay: 1.4, duration: 0.3 }}
          />
        )}
      </svg>
      <div className="flex justify-between text-[10px] mt-1" style={{ color: ROYAL.dim }}>
        <span>{lo.toFixed(0)} mb</span>
        {falling
          ? <span style={{ color: "#e2373c" }}>falling {steepest.drop.toFixed(1)} mb in an hour</span>
          : <span>steady</span>}
        <span>{hi.toFixed(0)} mb</span>
      </div>
    </div>
  );
});

// ─── lightning strike pulses ─────────────────────────────────────────────────
/**
 * A strike is a flash and a decay, not a blink — so opacity falls off a sharp
 * peak rather than toggling, and the ring keeps expanding after the flash has
 * gone, the way the eye remembers one.
 */
export const StrikePulse = memo(function StrikePulse({
  x, y, calm, color = "#fde047", size = 18,
}: { x: number; y: number; calm?: boolean; color?: string; size?: number }) {
  if (calm) return null;
  return (
    <g>
      <motion.circle
        cx={x} cy={y} r={size}
        fill="none" stroke={color} strokeWidth="1.5"
        initial={{ opacity: 0.9, scale: 0.2 }}
        animate={{ opacity: 0, scale: 1.6 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
        style={{ transformOrigin: `${x}px ${y}px` }}
      />
      <motion.circle
        cx={x} cy={y} r={3}
        fill={color}
        initial={{ opacity: 1 }}
        animate={{ opacity: [1, 0.15, 0.6, 0] }}
        transition={{ duration: 0.85, times: [0, 0.25, 0.4, 1], ease: "easeOut" }}
      />
    </g>
  );
});

// ─── module unlock ───────────────────────────────────────────────────────────
/**
 * A module opening up. Two beats: the seal breaks and the panel expands.
 * Deliberately short — this fires on a purchase, and the member wants to be in
 * the module, not watching a door.
 */
export const ModuleUnlock = memo(function ModuleUnlock({
  children, calm, tone = ROYAL.gold,
}: { children: ReactNode; calm?: boolean; tone?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (calm) return <>{children}</>;

  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, filter: "blur(4px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.55, delay: 0.25, ease: EASE }}
      >
        {children}
      </motion.div>
      {!done && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ border: `1px solid ${tone}`, background: `${tone}0d`, transformOrigin: "center" }}
          initial={{ opacity: 1, scaleY: 1 }}
          animate={{ opacity: 0, scaleY: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.7, 0, 0.84, 0] }}
        />
      )}
    </div>
  );
});

// ─── radar / satellite scrubber ──────────────────────────────────────────────
/**
 * A frame scrubber that reads like a piece of equipment: ticks for every frame,
 * a longer tick on the hour, and a head that snaps between them.
 *
 * `onScrub` fires continuously while dragging, so the imagery follows the
 * finger rather than waiting for release — which is the whole reason to have a
 * scrubber instead of a play button.
 */
export const Scrubber = memo(function Scrubber({
  count, index, labels, onScrub, calm,
}: {
  count: number; index: number; labels?: string[];
  onScrub: (i: number) => void; calm?: boolean;
}) {
  const track = useRef<HTMLDivElement>(null);

  function pick(clientX: number) {
    const el = track.current;
    if (!el || count < 2) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onScrub(Math.round(f * (count - 1)));
  }

  return (
    <div className="select-none">
      <div
        ref={track}
        className="relative h-10 cursor-pointer touch-none"
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); pick(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons === 1) pick(e.clientX); }}
        role="slider"
        aria-valuemin={0} aria-valuemax={count - 1} aria-valuenow={index}
        aria-label="Frame"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onScrub(Math.max(0, index - 1));
          if (e.key === "ArrowRight") onScrub(Math.min(count - 1, index + 1));
        }}
      >
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px" style={{ background: ROYAL.hairline }} />
        {Array.from({ length: count }).map((_, i) => {
          const long = i % 6 === 0 || i === count - 1;
          const on = i === index;
          return (
            <span key={i}
              className="absolute top-1/2 -translate-y-1/2 w-px"
              style={{
                left: `${(i / Math.max(1, count - 1)) * 100}%`,
                height: on ? 22 : long ? 14 : 7,
                background: on ? ROYAL.gold : ROYAL.iris,
                opacity: on ? 1 : long ? 0.4 : 0.2,
              }} />
          );
        })}
        <motion.span
          className="absolute top-1/2 w-3 h-3 rounded-full pointer-events-none"
          style={{ background: ROYAL.gold, marginLeft: -6, marginTop: -6,
                   boxShadow: `0 0 12px ${ROYAL.gold}` }}
          animate={{ left: `${(index / Math.max(1, count - 1)) * 100}%` }}
          transition={calm ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
        />
      </div>
      {labels?.[index] && (
        <div className="text-center text-[11px] tabular-nums" style={{ color: ROYAL.gold }}>
          {labels[index]}
        </div>
      )}
    </div>
  );
});
