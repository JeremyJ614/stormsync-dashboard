import { Link } from "wouter";
import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Canvas Push.
 *
 * The app tilts away on the Y axis and the menu stands behind it, so the menu
 * reads as a place the app was covering rather than a panel laid on top. The
 * transform belongs to Layout — a child cannot push its own ancestor — so this
 * file draws the menu, the seam of light along the fold, and the trigger.
 *
 * It is the one style that shows every section at once. With 37 modules a
 * single scrolling column under section headings beats making anyone drill in
 * and back out again.
 */

/**
 * The trigger: a geometric morph rather than a swap.
 *
 * Closed it is three bars in a rounded square. Opening rotates the square a
 * quarter turn while it rounds off into a circle, and the bars travel — the
 * outer two converge and cross, the middle one scales out of existence. Nothing
 * is hidden and re-shown, so the shape reads as one object changing rather than
 * two icons trading places. Under calm it snaps to the end state.
 */
function MorphTrigger({ open, calm }: { open: boolean; calm: boolean }) {
  const t = calm ? { duration: 0 } : { duration: 0.5, ease: EASE };
  // Transforms only. Animating y1/y2 alongside `rotate` sends motion down the
  // transform path and the SVG attribute resolves to undefined on the first
  // frame, which the browser rejects outright — so the bars travel by
  // translate and rotate instead, which is also what makes it read as one
  // object moving rather than three.
  const common = {
    x1: 4, x2: 20, strokeWidth: 2, strokeLinecap: "round" as const,
    stroke: "currentColor", style: { originX: "12px", originY: "12px" },
    initial: false as const, transition: t,
  };
  return (
    <motion.span
      className="grid place-items-center"
      style={{ width: 46, height: 46 }}
      initial={false}
      animate={{ rotate: open ? 90 : 0 }}
      transition={t}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
        <motion.line {...common} y1={7} y2={7} animate={{ y: open ? 5 : 0, rotate: open ? 45 : 0 }} />
        <motion.line {...common} y1={12} y2={12} animate={{ scaleX: open ? 0 : 1, opacity: open ? 0 : 1 }} />
        <motion.line {...common} y1={17} y2={17} animate={{ y: open ? -5 : 0, rotate: open ? -45 : 0 }} />
      </svg>
    </motion.span>
  );
}

export function CanvasPushMenu({ nav }: { nav: MenuNav }) {
  const { open, sections, toggle, close, calm, containerRef } = nav;
  let row = 0;   // running index so the stagger runs across sections, not within

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 90% at 8% 0%, rgba(217,183,117,0.10), ${ROYAL.ink} 46%, #05050e 100%)`,
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.4 }}
        aria-hidden={!open}
      />

      {/* The seam: a champagne edge-light where the app has folded away, so the
          tilt reads as an object catching light rather than a flat transform. */}
      <motion.div
        className="absolute inset-y-0"
        style={{
          left: "min(74vw, 340px)", width: 2,
          background: `linear-gradient(180deg, transparent, ${ROYAL.gold}, transparent)`,
          filter: "blur(0.5px)",
          pointerEvents: "none",
        }}
        initial={false}
        animate={{ opacity: open ? 0.85 : 0, scaleY: open ? 1 : 0.4 }}
        transition={{ duration: calm ? 0 : 0.55, delay: calm ? 0 : 0.15 }}
        aria-hidden
      />

      <motion.nav
        className="absolute inset-y-0 left-0 flex flex-col"
        style={{ width: "min(74vw, 340px)", pointerEvents: open ? "auto" : "none" }}
        initial={false}
        animate={open ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
        transition={{ duration: calm ? 0 : 0.4, delay: calm ? 0 : 0.1 }}
        aria-label="Navigation"
        aria-hidden={!open}
      >
        <div className="px-6 pt-20 pb-4 shrink-0">
          <div className="text-[10px] uppercase tracking-[0.35em]" style={{ color: ROYAL.gold }}>StormSync</div>
          <div className="text-3xl font-extrabold" style={{ color: ROYAL.text, fontFamily: HEADING }}>Menu</div>
          <div className="mt-3 h-px" style={{ background: `linear-gradient(90deg, ${ROYAL.gold}, transparent)` }} />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-5">
          {sections.map((sec) => {
            const SecIcon = sec.icon;
            return (
              <div key={sec.label}>
                <div className="flex items-center gap-2 px-2 pb-1.5">
                  <SecIcon className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.gold, opacity: 0.9 }} />
                  <span className="text-[10px] uppercase tracking-[0.28em]" style={{ color: ROYAL.dim }}>{sec.label}</span>
                </div>
                <div className="space-y-0.5">
                  {sec.items.map((it) => {
                    const Icon = it.icon;
                    const i = row++;
                    return (
                      <motion.div
                        key={it.path}
                        initial={false}
                        animate={open ? { opacity: 1, x: 0 } : { opacity: 0, x: -14 }}
                        transition={calm ? { duration: 0 } : { duration: 0.32, delay: 0.16 + i * 0.012, ease: EASE }}
                      >
                        <Link
                          href={it.path}
                          onClick={close}
                          className="group relative flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5"
                        >
                          {/* Champagne rail that lights on hover, as elsewhere in the app. */}
                          <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: ROYAL.gold }} aria-hidden />
                          <Icon className="w-4 h-4 shrink-0" style={{ color: ROYAL.gold }} />
                          <span className="truncate text-[15px] font-medium" style={{ color: ROYAL.text }}>{it.label}</span>
                          {it.locked && <Lock className="ml-auto w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />}
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </motion.nav>

      <button
        onClick={toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center"
        style={{
          top: 14, left: 14, width: 46, height: 46, zIndex: 70,
          background: open ? "rgba(255,255,255,0.08)" : ROYAL.gold,
          color: open ? ROYAL.text : "#0b0b12",
          border: open ? `1px solid ${ROYAL.goldSoft}` : "none",
          borderRadius: open ? 23 : 13,
          boxShadow: open ? `0 0 22px -6px ${ROYAL.gold}` : "0 8px 20px rgba(0,0,0,.45)",
          pointerEvents: "auto",
          transition: calm ? "none" : "background .4s, color .4s, border-radius .5s, box-shadow .4s",
        }}
      >
        <MorphTrigger open={open} calm={calm} />
      </button>
    </div>
  );
}
