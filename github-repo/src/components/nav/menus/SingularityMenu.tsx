import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Lock, Sparkles } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL } from "../../../lib/royal";

/**
 * The Singularity.
 *
 * The trigger falls into the middle of the screen and collapses into a black
 * hole; the sections settle into orbit around it. Choosing one is a scale
 * change rather than a new screen — that section becomes the body at the centre
 * and its modules become moons of it — which is why the metaphor survives 38
 * modules where a flat radial menu would not.
 *
 * Everything here is ornament, so calm mode strips it to the finished frame:
 * no collapse, no orbital drift, no pulse. Someone reading a tornado warning
 * does not need a black hole breathing at them.
 */
const PLANET_TINTS = [
  ["#34d399", "#1d4ed8"], ["#fca5a5", "#991b1b"], ["#fde047", "#b45309"],
  ["#c4b5fd", "#5b21b6"], ["#67e8f9", "#0e7490"], ["#fdba74", "#9a3412"],
  ["#f9a8d4", "#9d174d"], ["#a3e635", "#3f6212"], ["#93c5fd", "#1e3a8a"],
];

function orbit(i: number, n: number, r: number) {
  const deg = -90 + (360 * i) / n;
  const rad = (deg * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

export function SingularityMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;

  const entries = current
    ? current.items.map((it) => ({ key: it.path, label: it.label, icon: it.icon, to: it.path as string | null, locked: it.locked, index: -1 }))
    : sections.map((s, i) => ({ key: s.label, label: s.label, icon: s.items[0]?.icon, to: null as string | null, locked: false, index: i }));

  const n = entries.length;
  // Moons ride a wider, thinner orbit than planets so a nine-module section does
  // not collide with itself.
  const radius = current ? Math.min(158, 108 + n * 6) : 128;
  const size = current ? 46 : 58;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
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
      />

      {open && (
        <div className="absolute inset-x-0 top-14 text-center pointer-events-none">
          <div className="text-[10px] uppercase tracking-[0.35em]" style={{ color: ROYAL.dim }}>
            {current ? current.label : "StormSync"}
          </div>
        </div>
      )}

      {/* Orbiting bodies, centred on the singularity. */}
      <div className="absolute" style={{ left: "50%", top: "50%", width: 0, height: 0, pointerEvents: open ? "auto" : "none" }}>
        {entries.map((e, i) => {
          const p = orbit(i, n, radius);
          const [from, to] = PLANET_TINTS[i % PLANET_TINTS.length];
          const Icon = e.icon;
          const body = (
            <>
              {Icon ? <Icon style={{ width: size * 0.4, height: size * 0.4, color: "#fff" }} /> : null}
              {e.locked && <Lock className="absolute -top-1 -right-1 w-3 h-3" style={{ color: "#fff", opacity: 0.8 }} />}
            </>
          );
          return (
            <motion.div
              key={e.key}
              className="absolute"
              style={{ left: -size / 2, top: -size / 2, pointerEvents: open ? "auto" : "none" }}
              initial={false}
              animate={open ? { x: p.x, y: p.y, opacity: 1, scale: 1 } : { x: 0, y: 0, opacity: 0, scale: 0.2 }}
              transition={calm ? { duration: 0 } : { duration: 0.85, delay: 0.06 * i, ease: [0.1, 0.9, 0.2, 1] }}
            >
              <div className="relative flex flex-col items-center">
                {e.to ? (
                  <Link href={e.to} onClick={close} aria-label={e.label}
                        className="grid place-items-center rounded-full relative"
                        style={{
                          width: size, height: size,
                          background: `radial-gradient(circle at 30% 30%, ${from}, ${to})`,
                          boxShadow: "inset -10px -10px 20px rgba(0,0,0,.75), 0 10px 22px rgba(0,0,0,.55)",
                        }}>
                    {body}
                  </Link>
                ) : (
                  <button onClick={() => openSection(e.index)} aria-label={e.label}
                          className="grid place-items-center rounded-full relative"
                          style={{
                            width: size, height: size,
                            background: `radial-gradient(circle at 30% 30%, ${from}, ${to})`,
                            boxShadow: "inset -10px -10px 20px rgba(0,0,0,.75), 0 10px 22px rgba(0,0,0,.55)",
                          }}>
                    {body}
                  </button>
                )}
                <span className="mt-1.5 text-[10px] text-center leading-tight max-w-[86px]"
                      style={{ color: ROYAL.text, textShadow: "0 1px 5px #000" }}>
                  {e.label}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* The trigger. Closed it is a plain orb near the thumb; open it is the
          singularity everything else is orbiting. */}
      <motion.button
        onClick={() => (section !== null ? back() : toggle())}
        aria-label={section !== null ? "Back to sections" : open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-full"
        style={{
          left: "50%", marginLeft: -30, width: 60, height: 60, zIndex: 80,
          pointerEvents: "auto",
          border: open ? "2px solid rgba(168,85,247,0.55)" : "none",
        }}
        initial={false}
        animate={open
          ? {
              bottom: "50%", y: 30, width: 54, height: 54,
              background: "#05030a", color: "rgba(255,255,255,0)",
              boxShadow: calm
                ? "0 0 30px 10px #a855f7, 0 0 60px 20px #3b82f6"
                : ["0 0 26px 8px #a855f7, 0 0 52px 16px #3b82f6", "0 0 42px 16px #a855f7, 0 0 84px 30px #3b82f6", "0 0 26px 8px #a855f7, 0 0 52px 16px #3b82f6"],
              scale: calm ? 1 : [1, 1.08, 1],
            }
          : { bottom: 30, y: 0, width: 60, height: 60, background: "#f5f3ff", color: "#0b0b12", boxShadow: "0 10px 24px rgba(0,0,0,.5)", scale: 1 }}
        transition={open && !calm
          ? { duration: 1, ease: [0.4, 0, 0.2, 1], boxShadow: { duration: 2.4, repeat: Infinity }, scale: { duration: 2.4, repeat: Infinity } }
          : { duration: calm ? 0 : 0.8, ease: [0.4, 0, 0.2, 1] }}
      >
        {section !== null
          ? <ChevronLeft className="w-6 h-6" style={{ color: "#fff" }} />
          : <Sparkles className="w-6 h-6" />}
      </motion.button>
    </div>
  );
}
