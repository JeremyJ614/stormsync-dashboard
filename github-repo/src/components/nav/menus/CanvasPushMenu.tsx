import { Link } from "wouter";
import { motion } from "framer-motion";
import { Lock, X } from "lucide-react";
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
 *
 * Two things were wrong and are fixed here.
 *
 * Dismissal: the shared outside-click handler measures against `containerRef`,
 * and this style put that ref on a layer covering the whole screen — so no
 * click was ever outside it and the only way back was the trigger, which sits
 * in the bottom-left corner behind the tilted app. The exposed ground to the
 * right of the panel now closes on click in its own right, there is a close
 * control in the header where a close control belongs, and the tilted app
 * itself is a dismiss target, because tapping the thing you want back is the
 * gesture everyone tries first.
 *
 * Type: the header was set at 19px in the heading face with no tracking and
 * nothing under it, which is the size at which Raleway stops having any
 * character. The header is now a small-caps masthead with a champagne rule and
 * a live count, and the module rows are set tighter and quieter so the section
 * headings can do the structural work instead of the labels shouting over each
 * other.
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

const PANEL_W = "min(74vw, 340px)";

export function CanvasPushMenu({ nav }: { nav: MenuNav }) {
  const { open, sections, toggle, close, calm, containerRef } = nav;
  const modules = sections.reduce((n, s) => n + s.items.length, 0);
  let row = 0;   // running index so the stagger runs across sections, not within

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          // The gradient's first stop is translucent gold, so on its own the
          // app read straight through the top-left corner of the panel. The
          // flat ink underneath is what makes this a backdrop rather than a tint.
          background: `radial-gradient(120% 90% at 8% 0%, rgba(217,183,117,0.10), ${ROYAL.ink} 46%, #05050e 100%)`,
          backgroundColor: ROYAL.ink,
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.4 }}
        aria-hidden={!open}
      />

      {/* Everything right of the seam — which is where the tilted app is —
          dismisses. A menu you can only leave through one 52px control in a
          corner is a menu that has taken the app hostage. */}
      {open && (
        <button
          className="absolute inset-y-0 right-0"
          style={{ left: PANEL_W, pointerEvents: "auto", cursor: "pointer" }}
          onClick={close}
          aria-label="Close the menu"
          tabIndex={-1}
        />
      )}

      {/* The seam: a champagne edge-light where the app has folded away, so the
          tilt reads as an object catching light rather than a flat transform. */}
      <motion.div
        className="absolute inset-y-0"
        style={{
          left: PANEL_W, width: 2,
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
        style={{ width: PANEL_W, pointerEvents: open ? "auto" : "none" }}
        initial={false}
        animate={open ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
        transition={{ duration: calm ? 0 : 0.4, delay: calm ? 0 : 0.1 }}
        aria-label="Navigation"
        aria-hidden={!open}
      >
        {/* Masthead. Small caps and wide tracking rather than a large weight:
            the panel is 340px at most and a 19px sentence across it reads as a
            paragraph that lost its page. */}
        <div className="px-6 pt-9 pb-4 shrink-0 relative">
          <button
            onClick={close}
            aria-label="Close the menu"
            className="absolute top-8 right-5 grid place-items-center rounded-full transition-colors"
            style={{
              width: 30, height: 30,
              border: `1px solid ${ROYAL.hairline}`,
              background: "rgba(255,255,255,0.04)",
              color: ROYAL.dim,
            }}
          >
            <X className="w-3.5 h-3.5" />
          </button>

          <div className="text-[9px] uppercase tracking-[0.46em] leading-none" style={{ color: ROYAL.gold }}>
            StormSync
          </div>
          <div
            className="mt-2 uppercase leading-none"
            style={{
              color: ROYAL.text, fontFamily: HEADING,
              fontSize: 13, fontWeight: 600, letterSpacing: "0.30em",
            }}
          >
            Navigation
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-[10px]" style={{ color: ROYAL.dim }}>
            <span className="tabular-nums" style={{ color: ROYAL.gold }}>{sections.length}</span>
            <span className="uppercase tracking-[0.18em]">sections</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span className="tabular-nums" style={{ color: ROYAL.gold }}>{modules}</span>
            <span className="uppercase tracking-[0.18em]">modules</span>
          </div>
          <div className="mt-3.5 h-px" style={{ background: `linear-gradient(90deg, ${ROYAL.gold}, transparent)` }} />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-4">
          {sections.map((sec) => {
            const SecIcon = sec.icon;
            return (
              <div key={sec.label}>
                {/* The section heading carries the champagne, so the module
                    rows underneath can stay quiet and still group correctly. */}
                <div className="flex items-center gap-2 px-2 pb-1.5">
                  <SecIcon className="w-3 h-3 shrink-0" style={{ color: ROYAL.gold, opacity: 0.9 }} />
                  <span className="text-[9px] uppercase tracking-[0.3em]" style={{ color: ROYAL.gold, opacity: 0.85 }}>
                    {sec.label}
                  </span>
                  <span className="flex-1 h-px" style={{ background: ROYAL.hairline }} />
                </div>
                <div className="space-y-px">
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
                          className="group relative flex items-center gap-3 pl-3 pr-2 py-[7px] rounded-md hover:bg-white/[0.055]"
                        >
                          {/* Champagne rail that lights on hover, as elsewhere in the app. */}
                          <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: ROYAL.gold }} aria-hidden />
                          <Icon className="w-[15px] h-[15px] shrink-0 transition-opacity opacity-70 group-hover:opacity-100"
                                style={{ color: ROYAL.gold }} />
                          {/* Colour via classes, not `style`: an inline colour
                              would win over the hover rule and the row would
                              never light. */}
                          <span
                            className="truncate transition-colors font-medium text-[13px] tracking-[0.012em] text-[#a3a3cc] group-hover:text-[#f1f4ff]"
                          >
                            {it.label}
                          </span>
                          {it.locked && <Lock className="ml-auto w-3 h-3 shrink-0" style={{ color: ROYAL.dim, opacity: 0.7 }} />}
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
          bottom: 26, left: 20, width: 52, height: 52, zIndex: 70,
          background: open ? "rgba(255,255,255,0.08)" : ROYAL.gold,
          color: open ? ROYAL.text : "#0b0b12",
          border: open ? `1px solid ${ROYAL.goldSoft}` : "none",
          borderRadius: open ? 26 : 15,
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
