import { useMemo } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Lock } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { entriesFor, moduleCount } from "./entries";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Geometric.
 *
 * Every control is a regular polygon, and every polygon is in the middle of
 * becoming another one. A triangle rounds into a pentagon, a pentagon into an
 * octagon, an octagon back to a square — continuously, each tile on its own
 * phase, so the grid is never still and never busy either.
 *
 * The thing that makes that possible is below: `ngon` samples any polygon at a
 * FIXED number of points around its perimeter, rather than emitting one point
 * per corner. A CSS clip-path can only tween between two `polygon()` values
 * with the same number of points, so a three-point triangle and an eight-point
 * octagon cannot interpolate at all — the browser jumps. Sampling both at 24
 * points makes every shape the same list of coordinates and the whole family
 * becomes one continuous morph. Corners slide along edges and new corners grow
 * out of flat sides, which is exactly what it should look like.
 *
 * Behind them, a construction lattice: the triangular grid you would rule up
 * before drawing any of this, turning slowly and clipped to a soft circle so it
 * fades out rather than ending.
 */

/**
 * A regular n-gon as a `polygon()` clip-path, sampled at a fixed point count.
 *
 * The radius at any angle of a regular polygon is
 *   r(θ) = R · cos(π/n) / cos(θ mod 2π/n − π/n)
 * which is what lets us sample the outline anywhere rather than only at corners.
 */
function ngon(n: number, rotDeg = 0, samples = SAMPLES, R = 50): string {
  const step = (2 * Math.PI) / n;
  const pts: string[] = [];
  for (let i = 0; i < samples; i++) {
    const th = (i / samples) * 2 * Math.PI + (rotDeg * Math.PI) / 180 - Math.PI / 2;
    // Angle within the current edge's wedge, measured from the wedge's middle.
    const local = ((th % step) + step) % step - step / 2;
    const r = (R * Math.cos(Math.PI / n)) / Math.cos(local);
    pts.push(`${(50 + r * Math.cos(th)).toFixed(2)}% ${(50 + r * Math.sin(th)).toFixed(2)}%`);
  }
  return `polygon(${pts.join(", ")})`;
}

/**
 * How many points every shape is sampled at, and the shapes themselves.
 *
 * These two are not independent. A sample only lands exactly on a corner when
 * the sample count is a multiple of the side count, and a corner that falls
 * between samples is cut off — sampled at 24, a triangle loses a visible chip
 * from each of its three points and reads as a rounded blob rather than a
 * triangle. So the cycle is restricted to divisors of the sample count: 3, 4, 6,
 * 8, 12 and 24 all divide 24 exactly, every corner is hit, and 24 sides at this
 * size is a circle. Rotations are constrained to multiples of 360/24 = 15° for
 * the same reason.
 *
 * The pentagon was the casualty; exact corners on the shapes people actually
 * recognise is worth more than a fifth side that arrives blunted.
 */
const SAMPLES = 24;
const CYCLE = [3, 4, 6, 8, 12, 24];
/** One sample step, in degrees. Every rotation must be a multiple of it. */
const STEP_DEG = 360 / SAMPLES;

function shapeCycle(startAt: number): string[] {
  const order = [...CYCLE.slice(startAt % CYCLE.length), ...CYCLE.slice(0, startAt % CYCLE.length)];
  // Close the loop so the animation has no seam.
  return [...order, order[0]].map((n, i) => ngon(n, i * STEP_DEG));
}

/** The ruled grid the shapes were constructed on. */
function Lattice({ calm }: { calm: boolean }) {
  const lines = useMemo(() => {
    const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let i = -12; i <= 12; i++) {
      const o = i * 34;
      out.push({ x1: o, y1: -420, x2: o, y2: 420 });                       // vertical
      out.push({ x1: -420, y1: o * 0.58, x2: 420, y2: o * 0.58 + 420 });   // +60°
      out.push({ x1: -420, y1: o * 0.58 + 420, x2: 420, y2: o * 0.58 });   // −60°
    }
    return out;
  }, []);

  return (
    <motion.svg
      className="absolute pointer-events-none"
      style={{
        left: "50%", top: "50%", width: 900, height: 900, marginLeft: -450, marginTop: -450,
        maskImage: "radial-gradient(circle, #000 20%, transparent 76%)",
        WebkitMaskImage: "radial-gradient(circle, #000 20%, transparent 76%)",
      }}
      viewBox="-420 -420 840 840"
      initial={false}
      animate={calm ? { rotate: 0 } : { rotate: 360 }}
      transition={calm ? { duration: 0 } : { duration: 240, repeat: Infinity, ease: "linear" }}
      aria-hidden
    >
      {lines.map((l, i) => (
        <line key={i} {...l} stroke={i % 3 === 0 ? "rgba(217,183,117,0.5)" : "rgba(204,204,255,0.22)"} strokeWidth={0.7} />
      ))}
    </motion.svg>
  );
}

export function GeometricMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, toggle, close, openSection, back, calm, containerRef } = nav;
  const entries = entriesFor(nav);
  // Tiles shrink as the set grows, so a 9-module section still fits without
  // scrolling — the grid is the point, and a scrolling grid is not one.
  const tile = entries.length > 8 ? 98 : entries.length > 6 ? 110 : 124;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0 overflow-hidden"
        style={{
          background:
            `radial-gradient(90% 60% at 50% 8%, rgba(217,183,117,0.09), transparent 62%),` +
            `linear-gradient(180deg, #0a0a17, #030309)`,
          backgroundColor: ROYAL.ink,
          backdropFilter: "blur(14px)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.3 }}
        onClick={close}
        aria-hidden={!open}
      >
        {open && <Lattice calm={calm} />}
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute inset-0 flex flex-col items-center justify-center px-4"
            style={{ pointerEvents: "auto" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.15 } }}
            aria-label="Navigation"
          >
            <div className="text-center mb-5">
              <div className="text-[9px] uppercase tracking-[0.44em]" style={{ color: ROYAL.gold }}>
                {current ? "Construction" : "StormSync"}
              </div>
              <div className="text-[17px] font-semibold mt-1 leading-none"
                   style={{ color: ROYAL.text, fontFamily: HEADING, letterSpacing: "0.02em" }}>
                {current ? current.label : "Navigate"}
              </div>
              <div className="text-[10px] mt-1.5 tabular-nums" style={{ color: ROYAL.dim }}>
                {current ? `${entries.length} modules` : `${entries.length} sections · ${moduleCount(nav)} modules`}
              </div>
            </div>

            <div
              className="grid gap-2.5 justify-center"
              style={{ gridTemplateColumns: `repeat(auto-fit, ${tile}px)`, maxWidth: tile * 3 + 24 }}
            >
              {entries.map((e, i) => {
                const Icon = e.icon;
                const frames = shapeCycle(i);
                const inner = (
                  <span className="relative z-10 flex flex-col items-center gap-1.5 px-2">
                    <Icon style={{ width: tile * 0.2, height: tile * 0.2, color: ROYAL.gold }} />
                    <span
                      className="text-center leading-[1.12] overflow-hidden"
                      style={{
                        fontSize: tile > 100 ? 10 : 9, color: ROYAL.text,
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        maxWidth: tile - 22,
                      }}
                    >
                      {e.label}
                    </span>
                    {e.count > 0 && (
                      <span className="text-[8.5px] tabular-nums" style={{ color: ROYAL.dim }}>{e.count}</span>
                    )}
                    {e.locked && (
                      <Lock className="absolute -top-1 right-0 w-3 h-3" style={{ color: ROYAL.dim }} />
                    )}
                  </span>
                );

                return (
                  <motion.div
                    key={e.key}
                    className="relative grid place-items-center"
                    style={{ width: tile, height: tile }}
                    initial={calm ? false : { scale: 0, rotate: -140, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    exit={calm ? { opacity: 0 } : { scale: 0, rotate: 140, opacity: 0 }}
                    transition={calm ? { duration: 0 } : {
                      type: "spring", stiffness: 300, damping: 22, delay: i * 0.04,
                    }}
                  >
                    {/* The shape itself. Two layers: an outer that carries the
                        champagne edge and an inset that carries the ground, both
                        morphing in lockstep so the border stays a border. */}
                    <motion.span
                      className="absolute inset-0"
                      style={{ background: `linear-gradient(150deg, ${ROYAL.gold}, rgba(217,183,117,0.35) 48%, rgba(204,204,255,0.30))` }}
                      initial={false}
                      animate={calm ? { clipPath: frames[0] } : { clipPath: frames }}
                      transition={calm ? { duration: 0 } : {
                        duration: 16, repeat: Infinity, ease: "easeInOut", delay: i * 0.5,
                      }}
                      aria-hidden
                    />
                    <motion.span
                      className="absolute"
                      style={{ inset: 1.6, background: "linear-gradient(160deg, #191926, #0b0b14 62%, #14141f)" }}
                      initial={false}
                      animate={calm ? { clipPath: frames[0] } : { clipPath: frames }}
                      transition={calm ? { duration: 0 } : {
                        duration: 16, repeat: Infinity, ease: "easeInOut", delay: i * 0.5,
                      }}
                      aria-hidden
                    />

                    {e.to ? (
                      <Link href={e.to} onClick={close} aria-label={e.label}
                            className="absolute inset-0 grid place-items-center">
                        {inner}
                      </Link>
                    ) : (
                      <button onClick={() => openSection(e.index)} aria-label={e.label}
                              className="absolute inset-0 grid place-items-center">
                        {inner}
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {section !== null && (
              <button
                onClick={back}
                className="mt-5 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
                style={{ color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(255,255,255,0.03)" }}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> All sections
              </button>
            )}
          </motion.nav>
        )}
      </AnimatePresence>

      {/* The trigger runs the same morph, faster, so the closed control is a
          working sample of what opens. */}
      <button
        onClick={toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center"
        style={{
          right: 22, bottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          width: 58, height: 58, zIndex: 80, pointerEvents: "auto", background: "none", border: "none",
        }}
      >
        <motion.span
          className="absolute"
          style={{ width: 56, height: 56, background: `linear-gradient(140deg, ${ROYAL.gold}, #a8823f)` }}
          initial={false}
          animate={calm
            ? { clipPath: ngon(open ? 4 : 6, 0) }
            : { clipPath: open ? [ngon(6, 0), ngon(4, STEP_DEG * 3)] : shapeCycle(0), rotate: open ? 45 : 0 }}
          transition={calm ? { duration: 0 } : open
            ? { duration: 0.4, ease: EASE }
            : { duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="relative grid place-items-center"
          style={{ width: 22, height: 22 }}
          initial={false}
          animate={{ rotate: open ? 135 : 0 }}
          transition={calm ? { duration: 0 } : { duration: 0.4, ease: EASE }}
          aria-hidden
        >
          <span className="absolute" style={{ left: 0, top: 10.5, width: 22, height: 1.8, borderRadius: 1, background: "#0b0b12" }} />
          <motion.span
            className="absolute"
            style={{ left: 10.1, top: 0, width: 1.8, height: 22, borderRadius: 1, background: "#0b0b12" }}
            initial={false}
            animate={{ scaleY: open ? 1 : 0.001, opacity: open ? 1 : 0 }}
            transition={calm ? { duration: 0 } : { duration: 0.4, ease: EASE }}
          />
          <motion.span
            className="absolute"
            style={{ left: 0, top: 4, width: 22, height: 1.8, borderRadius: 1, background: "#0b0b12" }}
            initial={false}
            animate={{ opacity: open ? 0 : 1, y: open ? 6.5 : 0 }}
            transition={calm ? { duration: 0 } : { duration: 0.4, ease: EASE }}
          />
          <motion.span
            className="absolute"
            style={{ left: 0, top: 17, width: 22, height: 1.8, borderRadius: 1, background: "#0b0b12" }}
            initial={false}
            animate={{ opacity: open ? 0 : 1, y: open ? -6.5 : 0 }}
            transition={calm ? { duration: 0 } : { duration: 0.4, ease: EASE }}
          />
        </motion.span>
      </button>
    </div>
  );
}
