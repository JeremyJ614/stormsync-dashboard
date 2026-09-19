import { AnimatePresence, motion } from "framer-motion";
import { Layers } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { entriesFor } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { BackRow, EntryAction, LAB_EASE, LockMark, Scrim, Trigger, Wordmark, delay, entrySub } from "./shared";

/**
 * A1 · Aurora Sidebar.
 *
 * The curtain, as a sidebar rather than an overlay. Three bands of light sweep
 * across the inside of the panel on a loop.
 *
 * WHY THE SOFT EDGE IS A GRADIENT AND NOT A BLUR. The lab's first version of
 * this lagged, and the cause was `filter: blur()` on a moving element: a blur
 * has to be re-rasterised on every frame the element moves, so a 2.6-second
 * sweep is 150-odd full re-rasters of a 206px-wide layer. The band here is a
 * linear-gradient whose own stops fade to transparent, which costs nothing to
 * move because the browser composites it rather than redrawing it. It looks the
 * same and it is free.
 *
 * The other lab bug — a strip of light left on screen after the menu closed —
 * was an animation with `forwards` holding its last frame on a node nothing
 * ever removed. It cannot happen here: the bands live inside the panel, and
 * AnimatePresence unmounts the whole panel on close.
 */
const BAND = (a: string, b: string) =>
  `linear-gradient(90deg, transparent, ${a} 42%, ${b} 62%, transparent)`;

export function AuroraSidebarMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} />

      <AnimatePresence>
        {open && (
          <motion.aside
            className="absolute inset-y-0 left-0 overflow-hidden flex flex-col"
            style={{
              width: 232, pointerEvents: "auto",
              background: ROYAL.panel,
              backdropFilter: "blur(16px) saturate(1.2)",
              WebkitBackdropFilter: "blur(16px) saturate(1.2)",
              borderRight: `1px solid ${ROYAL.hairline}`,
            }}
            initial={calm ? { opacity: 0 } : { x: "-100%" }}
            animate={calm ? { opacity: 1 } : { x: 0 }}
            exit={calm ? { opacity: 0 } : { x: "-100%" }}
            transition={calm ? { duration: 0 } : { duration: 0.5, ease: LAB_EASE }}
            role="dialog" aria-modal="true" aria-label="Navigation"
          >
            {/* The curtain. Three bands, offset in phase, crossing the panel. */}
            {!calm && (
              <div className="absolute pointer-events-none" style={{ inset: "-20% -40%" }} aria-hidden>
                {[
                  { left: "-20%", d: 0, g: BAND("rgba(204,204,255,0.34)", "rgba(217,183,117,0.26)") },
                  { left: "20%", d: 0.9, g: BAND("rgba(217,183,117,0.30)", "rgba(204,204,255,0.24)") },
                  { left: "60%", d: 1.8, g: BAND("rgba(204,204,255,0.26)", "rgba(217,183,117,0.20)") },
                ].map((b, i) => (
                  <motion.i
                    key={i}
                    className="absolute top-0 bottom-0 block"
                    style={{ left: b.left, width: 78, background: b.g, opacity: 0.55 }}
                    animate={{ x: ["-160%", "620%"], skewX: -9 }}
                    transition={{ duration: 2.6, repeat: Infinity, ease: LAB_EASE, delay: b.d }}
                  />
                ))}
              </div>
            )}

            <div className="relative flex flex-col h-full" style={{ padding: "16px 11px" }}>
              <div className="px-1 pb-3.5"><Wordmark /></div>

              <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 min-h-0">
                {entries.map((e, i) => {
                  const Icon = e.icon;
                  return (
                    <motion.div
                      key={e.key}
                      initial={calm ? false : { opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={calm ? { duration: 0 } : { duration: 0.4, ease: LAB_EASE, delay: delay(i, calm) }}
                    >
                      <EntryAction
                        entry={e} nav={nav}
                        className="flex items-center gap-2.5 rounded-[10px] w-full text-left"
                        style={{ padding: "10px 12px", color: ROYAL.dim }}
                      >
                        <Icon style={{ width: 17, height: 17, color: ROYAL.gold, flex: "none" }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold leading-tight"
                                style={{ color: ROYAL.text, fontFamily: HEADING }}>
                            {e.label}
                          </span>
                          <span className="block text-[9.5px] mt-px" style={{ color: ROYAL.dim }}>
                            {entrySub(e)}
                          </span>
                        </span>
                        {e.locked && <LockMark />}
                      </EntryAction>
                    </motion.div>
                  );
                })}
              </div>

              <div className="pt-3"><BackRow nav={nav} /></div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <Trigger nav={nav}>
        <motion.span
          className="grid place-items-center rounded-[13px]"
          style={{
            width: 52, height: 52,
            background: `linear-gradient(150deg, ${ROYAL.gold}, #a8823f)`,
            boxShadow: `0 10px 26px -10px ${ROYAL.goldSoft}`,
          }}
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={calm ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 20 }}
        >
          <Layers style={{ width: 21, height: 21, color: "#0b0b12" }} />
        </motion.span>
      </Trigger>
    </div>
  );
}
