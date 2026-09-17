import { useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Lock, Orbit } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL, EASE } from "../../../lib/royal";

/**
 * The Singularity.
 *
 * The trigger falls to the middle of the screen and collapses; the sections
 * settle into orbit around it. Choosing one is a scale change rather than a new
 * screen — that section becomes the body at the centre and its modules become
 * moons of it — which is why the metaphor survives 37 modules where a flat
 * radial menu would not.
 *
 * The previous version had almost nothing in the middle and its bodies were
 * flat two-stop gradients: gumballs. Both are rebuilt here from what actually
 * makes each thing look real.
 *
 * THE BLACK HOLE. A black hole is not a dark circle with a ring round it. What
 * the eye recognises is four specific things, and all four are drawn:
 *
 *   · The disc is a flat annulus seen at a shallow angle, so it is an ellipse —
 *     and crucially it passes BEHIND the hole at the top and IN FRONT of it at
 *     the bottom. Painting the near half over the shadow is the single cue that
 *     separates a real disc from a ring pasted on.
 *   · Light from the far side of the disc is bent up over the top of the hole
 *     and down under the bottom, so a near-circular halo joins the flat ellipse
 *     at the left and right edges. That vertical band is the famous silhouette
 *     and it is a lensing effect, not a second ring.
 *   · The side rotating toward the viewer is beamed: much brighter, shifted
 *     blue. The receding side is dim and red. A symmetric disc reads as a logo.
 *   · Hard against the shadow sits the photon ring, where light orbits — thin,
 *     brighter than anything else, and never touching the horizon.
 *
 * The gas streams rather than spins as a rigid body: each radius carries its
 * own dash speed, faster nearer in, which is what differential rotation looks
 * like and what stops the disc reading as a turning wheel.
 *
 * THE PLANETS. What makes a sphere look like a sphere is not a gradient, it is
 * a terminator: a hard-ish day/night edge thrown by a single light source, with
 * limb darkening at the rim and a thin atmospheric crescent on the lit side.
 * Each body gets that, plus banding or mottling that drifts sideways so the
 * planet is turning, and a ring system on the ones far enough out to have one.
 * The light comes from the black hole, so every terminator faces the same way —
 * which is what makes them read as being in one place together.
 *
 * All of this is ornament, so calm mode strips it to the finished frame: no
 * collapse, no orbit, no spin. Someone reading a tornado warning does not need
 * a black hole breathing at them.
 */

// ── the core ─────────────────────────────────────────────────────────────────

/** Event-horizon radius, in the core's own SVG units. Everything scales off it. */
const RS = 34;
/** Inner edge of the far side. Clear of the shadow, so the halo shows above it. */
const DISC_IN_BACK = 62;
/**
 * Inner edge of the near side, and deliberately inside the shadow.
 *
 * On the far side the light we see is bent up and over; on the near side it is
 * bent toward us and inward, which is why the near edge visually crosses the
 * black sphere instead of stopping short of it. Drawing both halves with the
 * same inner radius is what made the old core read as a ring behind a circle:
 * nothing ever passed in front, so nothing established that the disc had a
 * front at all.
 */
const DISC_IN_FRONT = 30;
const DISC_OUT = 172;
/** cos(inclination). 0.19 is roughly 79° — steep enough to read as a plane. */
const FLAT = 0.19;

/** An elliptical annulus, as one evenodd path. */
function annulus(rxOut: number, rxIn: number, flat: number): string {
  const e = (rx: number) => {
    const ry = rx * flat;
    return `M ${-rx} 0 A ${rx} ${ry} 0 1 0 ${rx} 0 A ${rx} ${ry} 0 1 0 ${-rx} 0 Z`;
  };
  return `${e(rxOut)} ${e(rxIn)}`;
}

/** A circular annulus — the lensed halo over and under the shadow. */
function ring(rOut: number, rIn: number): string {
  const c = (r: number) => `M ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 Z`;
  return `${c(rOut)} ${c(rIn)}`;
}

/** Streaming filaments at one radius of the disc. */
function Filaments({ rx, flat, dash, dur, opacity, colour, calm }: {
  rx: number; flat: number; dash: string; dur: number; opacity: number; colour: string; calm: boolean;
}) {
  return (
    <motion.ellipse
      cx={0} cy={0} rx={rx} ry={rx * flat}
      fill="none" stroke={colour} strokeWidth={rx * flat * 0.1}
      strokeDasharray={dash} opacity={opacity}
      initial={false}
      animate={calm ? {} : { strokeDashoffset: [0, -220] }}
      transition={calm ? { duration: 0 } : { duration: dur, repeat: Infinity, ease: "linear" }}
    />
  );
}

function BlackHole({ open, calm, size }: { open: boolean; calm: boolean; size: number }) {
  const half = size / 2;
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: "50%", top: "50%", width: 0, height: 0 }}
      initial={false}
      animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.4 }}
      transition={{ duration: calm ? 0 : 0.9, ease: EASE }}
      aria-hidden
    >
      <svg
        className="absolute"
        style={{ left: -half, top: -half, overflow: "visible" }}
        width={size} height={size} viewBox="-200 -200 400 400" fill="none"
      >
        <defs>
          {/* Relativistic beaming. The left limb is approaching, so it is
              brighter and bluer by a long way; the right is receding and dull
              red. The asymmetry is the point — it is what says this is matter
              moving at a fraction of c and not a decorative ring. */}
          <linearGradient id="sg-doppler" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="1" />
            <stop offset="14%"  stopColor="#d8ecff" stopOpacity="0.98" />
            <stop offset="34%"  stopColor="#ffd9a0" stopOpacity="0.82" />
            <stop offset="58%"  stopColor="#f0a44e" stopOpacity="0.6" />
            <stop offset="80%"  stopColor="#b8541c" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#5d2208" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id="sg-doppler-soft" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.75" />
            <stop offset="30%"  stopColor="#ffd9a0" stopOpacity="0.5" />
            <stop offset="65%"  stopColor="#e08a3c" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#5d2208" stopOpacity="0.16" />
          </linearGradient>
          <radialGradient id="sg-lens" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#c9b6ff" stopOpacity="0.30" />
            <stop offset="46%"  stopColor="#6f8cff" stopOpacity="0.13" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
          {/* The shadow's edge is not a hard vector edge — a hair of falloff is
              what keeps it from looking like a sticker. */}
          <radialGradient id="sg-horizon" cx="50%" cy="50%" r="50%">
            <stop offset="0%"  stopColor="#000000" />
            <stop offset="86%" stopColor="#000000" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.82" />
          </radialGradient>
          <filter id="sg-bloom" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="sg-soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
          {/* Halves of the disc. Back is painted before the shadow, front after,
              which is the whole trick. */}
          {/* Surface brightness falls off with radius. Without this the disc is
              a flat orange slab out to a hard rim, which is the single thing
              that most makes a drawn disc look drawn. */}
          <radialGradient id="sg-fade" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#fff" stopOpacity="1" />
            <stop offset="38%"  stopColor="#fff" stopOpacity="0.96" />
            <stop offset="72%"  stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="sg-disc-mask" maskUnits="userSpaceOnUse" x={-200} y={-200} width={400} height={400}>
            <ellipse cx={0} cy={0} rx={DISC_OUT + 8} ry={(DISC_OUT + 8) * FLAT * 2.6} fill="url(#sg-fade)" />
          </mask>
          <clipPath id="sg-back"><rect x={-200} y={-200} width={400} height={200} /></clipPath>
          <clipPath id="sg-front"><rect x={-200} y={0} width={400} height={200} /></clipPath>
        </defs>

        {/* Light bent around the mass, well outside everything else. */}
        <circle cx={0} cy={0} r={190} fill="url(#sg-lens)" />

        {/* ── far side of the disc, behind the shadow ─────────────────────── */}
        <g clipPath="url(#sg-back)" mask="url(#sg-disc-mask)">
          <path d={annulus(DISC_OUT + 6, DISC_IN_BACK - 4, FLAT)} fillRule="evenodd"
                fill="url(#sg-doppler-soft)" opacity={0.45} filter="url(#sg-soft)" />
          <path d={annulus(DISC_OUT, DISC_IN_BACK, FLAT)} fillRule="evenodd" fill="url(#sg-doppler)" />
          <Filaments rx={78}  flat={FLAT} dash="30 18"  dur={1.7} opacity={0.22} colour="#fff6e2" calm={calm} />
          <Filaments rx={98}  flat={FLAT} dash="34 22" dur={2.4} opacity={0.18} colour="#ffe6bd" calm={calm} />
          <Filaments rx={122} flat={FLAT} dash="40 26" dur={3.3} opacity={0.15} colour="#ffd9a0" calm={calm} />
          <Filaments rx={148} flat={FLAT} dash="46 32" dur={4.4} opacity={0.12} colour="#f0a44e" calm={calm} />
        </g>

        {/* ── the lensed halo ─────────────────────────────────────────────────
            Light from the underside of the far disc, bent up over the top of the
            hole and under the bottom. It meets the flat ellipse at the left and
            right limbs, which is why its radius is chosen to land just inside
            the disc's inner edge. */}
        <path d={ring(50, 40)} fillRule="evenodd" fill="url(#sg-doppler)" opacity={1} />
        <path d={ring(57, 37)} fillRule="evenodd" fill="url(#sg-doppler-soft)" opacity={0.28} filter="url(#sg-soft)" />

        {/* ── the shadow ──────────────────────────────────────────────────── */}
        <circle cx={0} cy={0} r={RS} fill="url(#sg-horizon)" />

        {/* ── the photon ring ─────────────────────────────────────────────────
            Hard against the shadow and brighter than the disc, because at that
            radius light has gone round more than once before reaching us. */}
        <motion.circle
          cx={0} cy={0} r={RS + 3.4} fill="none"
          stroke="#fffaf0" strokeWidth={1.8} filter="url(#sg-bloom)"
          initial={false}
          animate={calm ? { opacity: 0.95 } : { opacity: [0.82, 1, 0.82] }}
          transition={calm ? { duration: 0 } : { duration: 3.4, repeat: Infinity, ease: EASE }}
        />
        <circle cx={0} cy={0} r={RS + 3.4} fill="none" stroke="#ffe9c2" strokeWidth={0.6} opacity={0.9} />

        {/* ── near side of the disc, in front of the shadow ───────────────── */}
        <g clipPath="url(#sg-front)" mask="url(#sg-disc-mask)">
          <path d={annulus(DISC_OUT + 6, DISC_IN_FRONT, FLAT)} fillRule="evenodd"
                fill="url(#sg-doppler-soft)" opacity={0.45} filter="url(#sg-soft)" />
          <path d={annulus(DISC_OUT, DISC_IN_FRONT, FLAT)} fillRule="evenodd" fill="url(#sg-doppler)" />
          <Filaments rx={78}  flat={FLAT} dash="30 18"  dur={1.7} opacity={0.22} colour="#fff6e2" calm={calm} />
          <Filaments rx={98}  flat={FLAT} dash="34 22" dur={2.4} opacity={0.18} colour="#ffe6bd" calm={calm} />
          <Filaments rx={122} flat={FLAT} dash="40 26" dur={3.3} opacity={0.15} colour="#ffd9a0" calm={calm} />
          <Filaments rx={148} flat={FLAT} dash="46 32" dur={4.4} opacity={0.12} colour="#f0a44e" calm={calm} />
        </g>
      </svg>
    </motion.div>
  );
}

// ── the bodies ───────────────────────────────────────────────────────────────

/**
 * One world.
 *
 * Composed rather than gradient-filled. Reading outward: an albedo base, a
 * texture that drifts sideways so the body is turning, the terminator thrown by
 * the core, limb darkening at the edge, and an atmospheric crescent on the lit
 * side. Optionally a ring system, drawn in two pieces so the planet sits
 * between them.
 *
 * `light` is the direction of the core from this body, in degrees, so the day
 * side always faces the middle of the screen.
 */
interface World {
  /** Albedo, lit → shadowed. */
  hi: string; mid: string; lo: string;
  kind: "banded" | "rocky" | "icy";
  ringed?: boolean;
  ring?: string;
}

const WORLDS: World[] = [
  { hi: "#f6e2b8", mid: "#c99a55", lo: "#4a3116", kind: "banded", ringed: true, ring: "rgba(232,206,160,0.75)" },
  { hi: "#bfe3ff", mid: "#4f8fd6", lo: "#122744", kind: "icy" },
  { hi: "#ffcfa8", mid: "#c2542c", lo: "#3d150a", kind: "rocky" },
  { hi: "#d8f0e2", mid: "#4fa987", lo: "#123326", kind: "banded" },
  { hi: "#e6dcff", mid: "#8163d4", lo: "#231246", kind: "icy", ringed: true, ring: "rgba(203,184,255,0.6)" },
  { hi: "#ffe8b0", mid: "#d0a232", lo: "#43310a", kind: "rocky" },
  { hi: "#ffd2e2", mid: "#c95c8c", lo: "#3f0f26", kind: "banded" },
  { hi: "#d6f2a8", mid: "#7ba63c", lo: "#22300d", kind: "rocky" },
  { hi: "#c6d8ff", mid: "#5570c9", lo: "#141c3d", kind: "icy" },
  { hi: "#f0e0c0", mid: "#a98a52", lo: "#3a2c15", kind: "banded" },
  { hi: "#a8f0dc", mid: "#33927e", lo: "#0c2b26", kind: "rocky" },
];

function textureFor(w: World, size: number): string {
  if (w.kind === "banded") {
    // Latitude bands, slightly off-horizontal so the axis reads as tilted.
    return (
      `repeating-linear-gradient(96deg,` +
      ` rgba(255,255,255,0.14) 0 ${size * 0.045}px,` +
      ` rgba(0,0,0,0.10) ${size * 0.045}px ${size * 0.085}px,` +
      ` rgba(255,255,255,0.06) ${size * 0.085}px ${size * 0.13}px,` +
      ` rgba(0,0,0,0.14) ${size * 0.13}px ${size * 0.2}px)`
    );
  }
  if (w.kind === "icy") {
    return (
      `radial-gradient(ellipse 60% 26% at 30% 16%, rgba(255,255,255,0.5), transparent 70%),` +
      `radial-gradient(ellipse 70% 24% at 62% 88%, rgba(255,255,255,0.42), transparent 72%),` +
      `repeating-linear-gradient(88deg, rgba(255,255,255,0.10) 0 ${size * 0.06}px, transparent ${size * 0.06}px ${size * 0.16}px)`
    );
  }
  // Rocky: mottled maria and a few craters, which is enough at this size.
  return (
    `radial-gradient(circle at 26% 62%, rgba(0,0,0,0.34) 0 ${size * 0.13}px, transparent ${size * 0.14}px),` +
    `radial-gradient(circle at 66% 30%, rgba(0,0,0,0.26) 0 ${size * 0.09}px, transparent ${size * 0.1}px),` +
    `radial-gradient(circle at 74% 70%, rgba(255,255,255,0.18) 0 ${size * 0.07}px, transparent ${size * 0.08}px),` +
    `radial-gradient(circle at 42% 24%, rgba(0,0,0,0.2) 0 ${size * 0.06}px, transparent ${size * 0.07}px)`
  );
}

function Planet({
  size, world, light, spin, calm, children,
}: {
  size: number; world: World; light: number; spin: number; calm: boolean; children?: React.ReactNode;
}) {
  // Where the light is coming from, as a percentage position inside the disc.
  const lx = 50 + 42 * Math.cos((light * Math.PI) / 180);
  const ly = 50 + 42 * Math.sin((light * Math.PI) / 180);
  // The terminator is thrown from the opposite side.
  const nx = 100 - lx, ny = 100 - ly;

  return (
    <span className="relative block" style={{ width: size, height: size }}>
      {/* Ring system, far half — behind the planet. */}
      {world.ringed && (
        <span
          className="absolute pointer-events-none"
          style={{
            left: -size * 0.42, top: size * 0.28, width: size * 1.84, height: size * 0.44,
            borderRadius: "50%",
            border: `${Math.max(1, size * 0.035)}px solid ${world.ring}`,
            borderBottomColor: "transparent",
            transform: "rotate(-14deg)",
            opacity: 0.75,
            clipPath: "inset(0 0 55% 0)",
          }}
          aria-hidden
        />
      )}

      <span
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{
          background: `radial-gradient(circle at ${lx}% ${ly}%, ${world.hi} 0%, ${world.mid} 46%, ${world.lo} 92%)`,
          // Limb darkening plus the atmospheric crescent, in one shadow list.
          boxShadow:
            `inset ${(-(lx - 50) / 50) * size * 0.16}px ${(-(ly - 50) / 50) * size * 0.16}px ${size * 0.34}px ${size * 0.02}px rgba(0,0,0,0.72),` +
            `inset 0 0 ${size * 0.16}px ${size * 0.02}px rgba(0,0,0,0.45),` +
            `0 0 ${size * 0.34}px ${-size * 0.1}px ${world.hi}`,
        }}
      >
        {/* Surface, drifting sideways: the body is turning. */}
        <motion.span
          className="absolute"
          style={{
            inset: `-6% -60% -6% -60%`,
            background: textureFor(world, size),
            mixBlendMode: "overlay",
            opacity: 0.9,
          }}
          initial={false}
          animate={calm ? {} : { x: [0, -size * 1.2] }}
          transition={calm ? { duration: 0 } : { duration: spin, repeat: Infinity, ease: "linear" }}
          aria-hidden
        />
        {/* Night side. Offset toward the far limb rather than centred, so the
            terminator is a curve across the disc and not a vignette. */}
        <span
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at ${nx}% ${ny}%, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.78) 34%, rgba(0,0,0,0.18) 66%, transparent 82%)`,
          }}
          aria-hidden
        />
        {/* Specular sheen on the day limb — thin, or it looks like plastic. */}
        <span
          className="absolute rounded-full"
          style={{
            left: `${lx - 22}%`, top: `${ly - 22}%`, width: "34%", height: "26%",
            background: "radial-gradient(ellipse, rgba(255,255,255,0.34), transparent 68%)",
            filter: `blur(${size * 0.04}px)`,
          }}
          aria-hidden
        />
      </span>

      {/* Ring system, near half — in front of the planet. */}
      {world.ringed && (
        <span
          className="absolute pointer-events-none"
          style={{
            left: -size * 0.42, top: size * 0.28, width: size * 1.84, height: size * 0.44,
            borderRadius: "50%",
            border: `${Math.max(1, size * 0.035)}px solid ${world.ring}`,
            borderTopColor: "transparent",
            transform: "rotate(-14deg)",
            opacity: 0.9,
            clipPath: "inset(45% 0 0 0)",
          }}
          aria-hidden
        />
      )}

      {children}
    </span>
  );
}

function orbit(i: number, n: number, r: number) {
  const deg = -90 + (360 * i) / n;
  const rad = (deg * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad), deg };
}

export function SingularityMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;

  const entries = current
    ? current.items.map((it) => ({ key: it.path, label: it.label, icon: it.icon, to: it.path as string | null, locked: it.locked, index: -1 }))
    : sections.map((s, i) => ({ key: s.label, label: s.label, icon: s.icon, to: null as string | null, locked: false, index: i }));

  const n = entries.length;
  // Moons ride a wider, thinner orbit than planets so a large section does not
  // collide with itself.
  const radius = current ? Math.min(168, 112 + n * 6) : 144;
  const size = current ? 40 : 54;
  // Sized so the disc's outer edge clears the orbit: at this width the disc
  // spans 0.86 of the SVG box, so half of it is ~0.43 × core, and the bodies
  // need to be outside that or the brightest part of the disc sits behind them.
  const core = current ? 200 : 250;

  // A fixed starfield — regenerating it on every render would make it twitch.
  const stars = useMemo(
    () => Array.from({ length: 60 }, (_, i) => ({
      x: ((i * 61) % 100), y: ((i * 37) % 100), s: 0.5 + ((i * 13) % 10) / 11, d: (i % 7) * 0.4,
    })),
    [],
  );

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0 overflow-hidden"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(9,3,22,0.97), #000 66%)",
          backdropFilter: "blur(16px)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.8 }}
        onClick={close}
        aria-hidden={!open}
      >
        {open && stars.map((st, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s * 2, height: st.s * 2, background: "#fff" }}
            animate={calm ? { opacity: 0.5 } : { opacity: [0.12, 0.65, 0.12] }}
            transition={calm ? { duration: 0 } : { duration: 3 + st.d, repeat: Infinity, delay: st.d }}
          />
        ))}
      </motion.div>

      <BlackHole open={open} calm={calm} size={core} />

      {open && (
        <div className="absolute inset-x-0 top-12 text-center pointer-events-none">
          <div className="text-[10px] uppercase tracking-[0.35em]" style={{ color: ROYAL.gold }}>
            {current ? current.label : "StormSync"}
          </div>
          <div className="text-[9px] mt-1 tracking-[0.2em] uppercase" style={{ color: ROYAL.dim, opacity: 0.7 }}>
            {current ? `${n} moon${n === 1 ? "" : "s"}` : `${n} worlds in orbit`}
          </div>
        </div>
      )}

      {/* The orbital path the bodies sit on — faint, so the ring reads as a
          system rather than as icons scattered on black. */}
      {open && (
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            left: "50%", top: "50%",
            width: radius * 2, height: radius * 2, marginLeft: -radius, marginTop: -radius,
            border: `1px solid ${ROYAL.hairline}`,
          }}
          initial={false}
          animate={{ opacity: calm ? 0.5 : [0.2, 0.42, 0.2] }}
          transition={calm ? { duration: 0 } : { duration: 5, repeat: Infinity }}
          aria-hidden
        />
      )}

      <div className="absolute" style={{ left: "50%", top: "50%", width: 0, height: 0, pointerEvents: open ? "auto" : "none" }}>
        {entries.map((e, i) => {
          const p = orbit(i, n, radius);
          const world = WORLDS[i % WORLDS.length];
          const Icon = e.icon;
          // The core is at the origin, so the light on each body comes from the
          // bearing back toward the middle.
          const lightDeg = p.deg + 180;
          const spin = 14 + (i % 5) * 4;

          const face = (
            <Planet size={size} world={world} light={lightDeg} spin={spin} calm={calm}>
              {e.locked && (
                <Lock className="absolute -top-1 -right-1 w-3 h-3"
                      style={{ color: "#fff", opacity: 0.9, filter: "drop-shadow(0 1px 2px #000)" }} />
              )}
            </Planet>
          );

          const caption = (
            <span className="mt-2 flex items-center gap-1 max-w-[96px]">
              {Icon && <Icon className="w-[9px] h-[9px] shrink-0" style={{ color: ROYAL.gold }} />}
              <span className="text-[9.5px] leading-tight text-center"
                    style={{ color: ROYAL.text, textShadow: "0 1px 6px #000" }}>
                {e.label}
              </span>
            </span>
          );

          return (
            <motion.div
              key={e.key}
              className="absolute"
              style={{ left: -size / 2, top: -size / 2, pointerEvents: open ? "auto" : "none" }}
              initial={false}
              // Bodies spiral out rather than sliding: they leave the core along
              // the orbit they will settle on, which is how they got there.
              animate={open
                ? { x: p.x, y: p.y, opacity: 1, scale: 1, rotate: 0 }
                : { x: 0, y: 0, opacity: 0, scale: 0.15, rotate: -120 }}
              transition={calm ? { duration: 0 } : { duration: 0.95, delay: 0.05 * i, ease: [0.12, 0.85, 0.2, 1] }}
            >
              <div className="relative flex flex-col items-center">
                {e.to ? (
                  <Link href={e.to} onClick={close} aria-label={e.label}
                        className="grid place-items-center relative rounded-full">
                    {face}
                  </Link>
                ) : (
                  <button onClick={() => openSection(e.index)} aria-label={e.label}
                          className="grid place-items-center relative rounded-full">
                    {face}
                  </button>
                )}
                {caption}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* The trigger. Closed it is an orb near the thumb; open it falls to the
          centre and hands the middle of the screen to the core. */}
      <motion.button
        onClick={() => (section !== null ? back() : toggle())}
        aria-label={section !== null ? "Back to sections" : open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-full"
        style={{ left: "50%", marginLeft: -30, width: 60, height: 60, zIndex: 80, pointerEvents: "auto" }}
        initial={false}
        animate={open
          ? { bottom: "50%", y: 30, opacity: 0, scale: 0.4 }
          : { bottom: 30, y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: calm ? 0 : 0.8, ease: [0.4, 0, 0.2, 1] }}
      >
        <span className="grid place-items-center rounded-full w-full h-full"
              style={{ background: "radial-gradient(circle at 32% 28%, #f0dcae, #b98f3d)", color: "#0b0b12", boxShadow: "0 10px 24px rgba(0,0,0,.5)" }}>
          <Orbit className="w-6 h-6" />
        </span>
      </motion.button>

      {/* Once open the core itself is the way back, so the control moves there.
          It is sized to the shadow, not to the disc: the disc is scenery and
          swallowing a tap that lands on it would feel broken. */}
      {open && (
        <button
          onClick={() => (section !== null ? back() : close())}
          aria-label={section !== null ? "Back to sections" : "Close the menu"}
          className="absolute grid place-items-center rounded-full"
          style={{
            left: "50%", top: "50%", marginLeft: -30, marginTop: -30, width: 60, height: 60,
            zIndex: 82, pointerEvents: "auto", color: "rgba(255,255,255,0.85)",
          }}
        >
          {section !== null ? <ChevronLeft className="w-5 h-5" /> : null}
        </button>
      )}
    </div>
  );
}
