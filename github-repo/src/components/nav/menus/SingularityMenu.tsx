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
 * The core is not a hole. A hole is a gap in the design, and it read as one:
 * what is there instead is a lit object — an accretion disc turning on a tilted
 * plane, a photon ring hard against the event horizon, and the horizon itself
 * dark only because everything around it is bright. That reads as something
 * rather than as an absence.
 *
 * All of this is ornament, so calm mode strips it to the finished frame: no
 * collapse, no orbit, no spin. Someone reading a tornado warning does not need
 * a black hole breathing at them.
 */
const PLANET_TINTS = [
  ["#8fe3c4", "#1d4ed8"], ["#f6b0a6", "#9f1239"], ["#f7e08a", "#b45309"],
  ["#cbb8ff", "#5b21b6"], ["#8fe0f5", "#0e7490"], ["#f9c48a", "#9a3412"],
  ["#f7aed0", "#9d174d"], ["#c3e88a", "#3f6212"], ["#a9c8ff", "#1e3a8a"],
  ["#e9d5a1", "#8a6a25"], ["#a5f3d0", "#0f766e"],
];

function orbit(i: number, n: number, r: number) {
  const deg = -90 + (360 * i) / n;
  const rad = (deg * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad), deg };
}

/** The lit core: horizon, photon ring, and a disc turning on a tilted plane. */
function Core({ open, calm }: { open: boolean; calm: boolean }) {
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: "50%", top: "50%", width: 0, height: 0 }}
      initial={false}
      animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.4 }}
      transition={{ duration: calm ? 0 : 0.9, ease: EASE }}
      aria-hidden
    >
      {/* Lensing haze — the light bent around the mass. */}
      <div
        className="absolute rounded-full"
        style={{
          left: -132, top: -132, width: 264, height: 264,
          background: "radial-gradient(circle, rgba(168,85,247,0.30) 0%, rgba(59,130,246,0.16) 42%, transparent 68%)",
          filter: "blur(10px)",
        }}
      />

      {/* Accretion disc.
          Full ellipses rather than part-arcs: rx well over ry already reads as a
          circle seen edge-on, and a complete ring encircles the horizon instead
          of sweeping past it. Rotation is carried by dashes travelling along the
          stroke, which reads as the disc turning and costs one animated property
          instead of a spinning layout box. */}
      <svg
        className="absolute"
        style={{ left: -150, top: -60, overflow: "visible" }}
        width={300} height={120} viewBox="-150 -60 300 120" fill="none" aria-hidden
      >
        <motion.ellipse
          cx={0} cy={0} rx={90} ry={26}
          stroke={ROYAL.gold} strokeWidth={1.6} strokeDasharray="16 9" opacity={0.75}
          style={{ filter: `drop-shadow(0 0 5px ${ROYAL.goldSoft})` }}
          initial={false}
          animate={calm ? {} : { strokeDashoffset: [0, -100] }}
          transition={calm ? { duration: 0 } : { duration: 3.4, repeat: Infinity, ease: "linear" }}
        />
        <motion.ellipse
          cx={0} cy={0} rx={72} ry={20}
          stroke="rgba(168,85,247,0.85)" strokeWidth={1.2} strokeDasharray="10 7" opacity={0.7}
          initial={false}
          animate={calm ? {} : { strokeDashoffset: [0, 68] }}
          transition={calm ? { duration: 0 } : { duration: 2.6, repeat: Infinity, ease: "linear" }}
        />
        <ellipse cx={0} cy={0} rx={104} ry={31} stroke="rgba(59,130,246,0.35)" strokeWidth={1} />
      </svg>

      {/* Photon ring, hard against the horizon. */}
      <motion.div
        className="absolute rounded-full"
        style={{
          left: -34, top: -34, width: 68, height: 68,
          boxShadow: `0 0 14px 2px ${ROYAL.gold}, 0 0 30px 8px rgba(168,85,247,0.55), inset 0 0 10px 2px rgba(255,255,255,0.35)`,
          border: `1.5px solid rgba(255,240,210,0.9)`,
        }}
        animate={calm ? {} : { scale: [1, 1.045, 1], opacity: [0.9, 1, 0.9] }}
        transition={calm ? { duration: 0 } : { duration: 3.2, repeat: Infinity, ease: EASE }}
      />

      {/* The horizon. Dark because everything around it is lit. */}
      <div
        className="absolute rounded-full"
        style={{ left: -29, top: -29, width: 58, height: 58, background: "#03020a" }}
      />
    </motion.div>
  );
}

export function SingularityMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;

  const entries = current
    ? current.items.map((it) => ({ key: it.path, label: it.label, icon: it.icon, to: it.path as string | null, locked: it.locked, index: -1 }))
    : sections.map((s, i) => ({ key: s.label, label: s.label, icon: s.icon, to: null as string | null, locked: false, index: i }));

  const n = entries.length;
  // Moons ride a wider, thinner orbit than planets so a large section does not
  // collide with itself.
  const radius = current ? Math.min(158, 104 + n * 6) : 132;
  const size = current ? 44 : 56;

  // A fixed starfield — regenerating it on every render would make it twitch.
  const stars = useMemo(
    () => Array.from({ length: 40 }, (_, i) => ({
      x: ((i * 61) % 100), y: ((i * 37) % 100), s: 0.6 + ((i * 13) % 10) / 9, d: (i % 7) * 0.4,
    })),
    [],
  );

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0 overflow-hidden"
        style={{
          background: "radial-gradient(circle at 50% 50%, rgba(12,4,28,0.96), #000 68%)",
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
            animate={calm ? { opacity: 0.5 } : { opacity: [0.15, 0.7, 0.15] }}
            transition={calm ? { duration: 0 } : { duration: 3 + st.d, repeat: Infinity, delay: st.d }}
          />
        ))}
      </motion.div>

      <Core open={open} calm={calm} />

      {open && (
        <div className="absolute inset-x-0 top-14 text-center pointer-events-none">
          <div className="text-[10px] uppercase tracking-[0.35em]" style={{ color: ROYAL.gold }}>
            {current ? current.label : "StormSync"}
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
          animate={{ opacity: calm ? 0.5 : [0.25, 0.5, 0.25] }}
          transition={calm ? { duration: 0 } : { duration: 5, repeat: Infinity }}
          aria-hidden
        />
      )}

      <div className="absolute" style={{ left: "50%", top: "50%", width: 0, height: 0, pointerEvents: open ? "auto" : "none" }}>
        {entries.map((e, i) => {
          const p = orbit(i, n, radius);
          const [from, to] = PLANET_TINTS[i % PLANET_TINTS.length];
          const Icon = e.icon;
          const body = (
            <>
              {Icon ? <Icon style={{ width: size * 0.4, height: size * 0.4, color: "#fff" }} /> : null}
              {e.locked && <Lock className="absolute -top-1 -right-1 w-3 h-3" style={{ color: "#fff", opacity: 0.85 }} />}
            </>
          );
          const sphere: React.CSSProperties = {
            width: size, height: size,
            background: `radial-gradient(circle at 30% 28%, ${from}, ${to})`,
            boxShadow: `inset -10px -10px 20px rgba(0,0,0,.75), 0 10px 22px rgba(0,0,0,.6), 0 0 18px -6px ${from}`,
          };
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
                        className="grid place-items-center rounded-full relative" style={sphere}>
                    {body}
                  </Link>
                ) : (
                  <button onClick={() => openSection(e.index)} aria-label={e.label}
                          className="grid place-items-center rounded-full relative" style={sphere}>
                    {body}
                  </button>
                )}
                <span className="mt-1.5 text-[10px] text-center leading-tight max-w-[88px]"
                      style={{ color: ROYAL.text, textShadow: "0 1px 6px #000" }}>
                  {e.label}
                </span>
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

      {/* Once open the core itself is the way back, so the control moves there. */}
      {open && (
        <button
          onClick={() => (section !== null ? back() : close())}
          aria-label={section !== null ? "Back to sections" : "Close the menu"}
          className="absolute grid place-items-center rounded-full"
          style={{
            left: "50%", top: "50%", marginLeft: -29, marginTop: -29, width: 58, height: 58,
            zIndex: 82, pointerEvents: "auto", color: "rgba(255,255,255,0.85)",
          }}
        >
          {section !== null ? <ChevronLeft className="w-5 h-5" /> : null}
        </button>
      )}
    </div>
  );
}
