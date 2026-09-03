import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Lock, Zap } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { entriesFor, moduleCount } from "./entries";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Kinetic.
 *
 * The animation study. Rows arrive from alternating sides fast enough to
 * overshoot, and the thing that makes them read as fast is not the duration —
 * it is that they leave a trail.
 *
 * HOW THE TRAIL WORKS. Behind every row sit two identical copies running the
 * same animation on deliberately softer springs. A softer spring is slower to
 * the target, so the ghosts lag by a few frames, sit behind the row in the
 * direction it came from, and catch up as it settles. That is a real motion
 * trail computed by the physics rather than a blur pretending to be one, and it
 * costs two extra transforms per row. They are also blurred and skewed along the
 * direction of travel, which is what a fast object does to film.
 *
 * SUB-MENUS. The version this came from was a flat list and could not hold them;
 * this one can, and the traversal is where most of the drama is. Choosing a
 * section sends every OTHER row back out the exact side it arrived from — so the
 * screen empties the way it filled — while the modules cascade in from that same
 * side. Nothing cross-fades. Every element on screen is always visibly going
 * somewhere it came from, which is what separates motion design from movement.
 *
 * Under calm the trails, the sweeps and the overshoot are all gone and this is a
 * list that appears.
 */

/** Rows alternate sides; index parity decides which, at both levels. */
const from = (i: number) => (i % 2 === 0 ? -1 : 1);

export function KineticMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, toggle, close, openSection, back, calm, containerRef } = nav;
  const entries = entriesFor(nav);
  const dense = entries.length > 7;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(110% 60% at 0% 0%, rgba(217,183,117,0.12), transparent 55%),` +
            `radial-gradient(110% 60% at 100% 100%, rgba(204,204,255,0.10), transparent 58%),` +
            `linear-gradient(155deg, #0a0a18, #04040c)`,
          backgroundColor: ROYAL.ink,
          backdropFilter: "blur(15px)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.28 }}
        onClick={close}
        aria-hidden={!open}
      />

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute inset-0 flex flex-col justify-center px-4 overflow-hidden"
            style={{ pointerEvents: "auto" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.14 } }}
            aria-label="Navigation"
          >
            <motion.div
              className="px-2 pb-3"
              initial={calm ? false : { opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={calm ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 24 }}
            >
              <div className="text-[9px] uppercase tracking-[0.44em]" style={{ color: ROYAL.gold }}>
                {current ? "Inside" : "StormSync"}
              </div>
              <div className="flex items-baseline gap-2.5 mt-1">
                <span className="text-[19px] font-semibold leading-none"
                      style={{ color: ROYAL.text, fontFamily: HEADING, letterSpacing: "0.015em" }}>
                  {current ? current.label : "Navigate"}
                </span>
                <span className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>
                  {current ? entries.length : moduleCount(nav)}
                </span>
              </div>
            </motion.div>

            <div
              className="min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{
                // A centred column that overflows is cut off at the top as well
                // as the bottom, which took the header with it. Scroll instead,
                // and fade the cut so a long list reads as continuing.
                maskImage: "linear-gradient(180deg, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)",
                WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)",
              }}
            >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={current ? `s${section}` : "top"} className="flex flex-col gap-2 py-1">
                {entries.map((e, i) => {
                  const Icon = e.icon;
                  const dir = from(i);
                  const off = dir * 340;

                  const enter = { x: off, opacity: 0, rotate: dir * -6, skewX: dir * 9 };
                  const rest = { x: 0, opacity: 1, rotate: 0, skewX: 0 };
                  const leave = { x: off, opacity: 0, rotate: dir * 6, skewX: dir * -9 };

                  const body = (
                    <>
                      <motion.span
                        className="relative grid shrink-0 place-items-center rounded-xl"
                        style={{
                          width: dense ? 36 : 42, height: dense ? 36 : 42,
                          background: "rgba(217,183,117,0.10)",
                          border: `1px solid ${ROYAL.goldSoft}`,
                          color: ROYAL.gold,
                        }}
                        initial={calm ? false : { rotate: dir * -30 }}
                        animate={{ rotate: 0 }}
                        transition={calm ? { duration: 0 } : {
                          type: "spring", stiffness: 240, damping: 12, delay: 0.05 + i * 0.055,
                        }}
                      >
                        <Icon style={{ width: dense ? 17 : 19, height: dense ? 17 : 19 }} />
                      </motion.span>

                      <span className="relative flex-1 min-w-0">
                        <span className="block truncate font-semibold"
                              style={{ color: ROYAL.text, fontSize: dense ? 14 : 16, letterSpacing: "0.01em" }}>
                          {e.label}
                        </span>
                        <span className="block text-[9.5px] uppercase tracking-[0.22em] mt-0.5"
                              style={{ color: ROYAL.dim }}>
                          {e.count > 0 ? `${e.count} module${e.count === 1 ? "" : "s"}` : e.locked ? "locked" : "open"}
                        </span>
                      </span>

                      {e.locked
                        ? <Lock className="relative w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />
                        : <motion.span
                            className="relative shrink-0"
                            style={{ color: ROYAL.gold }}
                            animate={calm ? {} : { x: [0, 4, 0] }}
                            transition={calm ? { duration: 0 } : { duration: 1.6, repeat: Infinity, delay: i * 0.12, ease: EASE }}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </motion.span>}
                    </>
                  );

                  const skin: React.CSSProperties = {
                    background: "linear-gradient(100deg, rgba(255,255,255,0.075), rgba(255,255,255,0.02))",
                    border: `1px solid ${ROYAL.hairline}`,
                    borderLeft: `2px solid ${ROYAL.goldSoft}`,
                    boxShadow: "0 16px 30px -22px rgba(0,0,0,0.95)",
                  };
                  // Two class strings, not one with `absolute` appended: Tailwind
                  // emits `.relative` after `.absolute`, so a ghost carrying both
                  // won `position: relative`, left the stacking context and laid
                  // out in flow as an empty row between the real ones.
                  const pad = dense ? "px-4 py-2.5" : "px-4 py-3";
                  const cls = `relative flex items-center gap-3.5 overflow-hidden rounded-2xl ${pad}`;
                  const ghostCls = `absolute inset-0 flex items-center gap-3.5 overflow-hidden rounded-2xl pointer-events-none ${pad}`;

                  return (
                    <div key={e.key} className="relative">
                      {/* Trail. One ghost on a softer spring: it lags, then
                          catches up.
                          It used to be two, each carrying `filter: blur()`
                          while it moved. An animating blur is re-rasterised on
                          every frame — it is the single most expensive thing
                          that can be put on a moving element — and there was
                          one per row per ghost, so a five-row menu was
                          re-blurring ten layers a frame on top of the panel's
                          own `backdrop-filter`. That is the lag.
                          Offset and opacity read as a trail on their own, cost
                          a composited layer and nothing else, and `willChange`
                          keeps it on the compositor rather than bouncing back
                          to the main thread each time the spring settles. */}
                      {!calm && (
                        <motion.div
                          className={ghostCls}
                          style={{ ...skin, opacity: 0.26, willChange: "transform, opacity" }}
                          initial={enter}
                          animate={rest}
                          exit={leave}
                          transition={{
                            type: "spring", stiffness: 105, damping: 15, mass: 1.35,
                            delay: i * 0.055,
                          }}
                          aria-hidden
                        />
                      )}

                      <motion.div
                        initial={calm ? false : enter}
                        animate={rest}
                        exit={calm ? { opacity: 0 } : leave}
                        transition={calm ? { duration: 0 } : {
                          type: "spring", stiffness: 260, damping: 16, mass: 0.9, delay: i * 0.055,
                        }}
                        whileTap={calm ? undefined : { scale: 0.96, rotate: dir * -1.4 }}
                      >
                        {e.to
                          ? <Link href={e.to} onClick={close} className={cls} style={skin}>
                              {!calm && <Sweep i={i} />}{body}
                            </Link>
                          : <button onClick={() => openSection(e.index)} className={`w-full text-left ${cls}`} style={skin}>
                              {!calm && <Sweep i={i} />}{body}
                            </button>}
                      </motion.div>
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
            </div>

            {section !== null && (
              <motion.button
                onClick={back}
                className="mt-4 self-start flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
                style={{ color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(255,255,255,0.03)" }}
                initial={calm ? false : { opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={calm ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 24, delay: 0.2 }}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> All sections
              </motion.button>
            )}
          </motion.nav>
        )}
      </AnimatePresence>

      <motion.button
        onClick={toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center"
        style={{
          right: 22, bottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          width: 56, height: 56, zIndex: 80, pointerEvents: "auto",
          background: `linear-gradient(135deg, ${ROYAL.gold}, #b08a44 62%, #cbb8ff)`,
          color: "#0b0b12",
          boxShadow: "0 10px 26px rgba(0,0,0,.55)",
        }}
        initial={false}
        animate={calm
          ? { borderRadius: open ? "34%" : "50%", rotate: open ? 135 : 0 }
          : { borderRadius: open ? "34%" : "50%", rotate: open ? 135 : 0, scale: open ? 1 : [1, 1.05, 1] }}
        transition={calm ? { duration: 0 } : open
          ? { type: "spring", stiffness: 320, damping: 18 }
          : { scale: { duration: 2.2, repeat: Infinity, ease: EASE },
              default: { type: "spring", stiffness: 320, damping: 18 } }}
      >
        <motion.span initial={false} animate={{ rotate: open ? -135 : 0 }}
                     transition={calm ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 18 }}>
          <Zap className="w-6 h-6" />
        </motion.span>
      </motion.button>
    </div>
  );
}

/** A highlight travelling across a row, on a long repeat so it never nags. */
function Sweep({ i }: { i: number }) {
  return (
    <motion.span
      className="pointer-events-none absolute inset-y-0 w-24"
      style={{ background: "linear-gradient(90deg, transparent, rgba(217,183,117,0.20), transparent)" }}
      initial={{ x: -140 }}
      animate={{ x: 520 }}
      transition={{ duration: 1.5, delay: 0.5 + i * 0.055, repeat: Infinity, repeatDelay: 3.2, ease: EASE }}
      aria-hidden
    />
  );
}
