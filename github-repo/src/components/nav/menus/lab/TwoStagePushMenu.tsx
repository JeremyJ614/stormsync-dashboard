import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { entriesFor } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { BackRow, EntryAction, LAB_EASE, LockMark, delay } from "./shared";

/**
 * J3 · Two-Stage Push.
 *
 * Stage one is an icon rail; stage two expands it into a labelled panel. The
 * rail is useful on its own, so most of the time you never need stage two.
 *
 * HOW THE APP KNOWS WHICH STAGE IT IS IN. The push distance differs between the
 * stages — a 64px rail should nudge the page, a 300px panel should move it
 * properly — but the stage lives here and the transform is applied by Layout,
 * two components up. Rather than thread a callback through `MenuNav` for one
 * menu, this writes the distance to a CSS custom property on the document root
 * and Layout's transform reads it. That keeps the plumbing to one line each
 * side, and the property is cleared on unmount so a style change cannot leave
 * the page shoved over with no menu to explain why.
 */
const PUSH_VAR = "--sswx-push";

export function TwoStagePushMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef } = nav;
  const entries = entriesFor(nav);
  const [expanded, setExpanded] = useState(false);

  // Closing the menu always collapses it, so reopening starts at the rail.
  useEffect(() => { if (!open) setExpanded(false); }, [open]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(PUSH_VAR, !open ? "0px" : expanded ? "300px" : "64px");
    return () => { root.style.removeProperty(PUSH_VAR); };
  }, [open, expanded]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <AnimatePresence>
        {open && (
          <>
            {/* Stage one — the rail. */}
            <motion.nav
              className="absolute inset-y-0 left-0 flex flex-col items-center gap-1 overflow-y-auto"
              style={{
                width: 64, pointerEvents: "auto", paddingTop: 68, paddingBottom: 16,
                background: `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
                borderRight: `1px solid ${ROYAL.hairline}`,
              }}
              initial={calm ? { opacity: 0 } : { x: "-100%" }}
              animate={calm ? { opacity: 1 } : { x: 0 }}
              exit={calm ? { opacity: 0 } : { x: "-100%" }}
              transition={calm ? { duration: 0 } : { duration: 0.44, ease: LAB_EASE }}
              role="dialog" aria-modal="true" aria-label="Navigation"
            >
              {entries.map((e) => {
                const Icon = e.icon;
                return (
                  <EntryAction
                    key={e.key} entry={e} nav={nav}
                    className="grid place-items-center rounded-[11px] relative"
                    style={{ width: 44, height: 44, color: ROYAL.dim }}
                  >
                    <Icon style={{ width: 18, height: 18, color: ROYAL.gold }} />
                    {e.locked && <span className="absolute bottom-1 right-1"><LockMark size={9} /></span>}
                  </EntryAction>
                );
              })}
            </motion.nav>

            {/* Stage two — the labelled panel beside it. */}
            <AnimatePresence>
              {expanded && (
                <motion.nav
                  className="absolute inset-y-0 flex flex-col overflow-y-auto"
                  style={{
                    left: 64, width: 236, pointerEvents: "auto", padding: "68px 12px 16px",
                    background: `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
                    borderRight: `1px solid ${ROYAL.hairline}`,
                  }}
                  initial={calm ? { opacity: 0 } : { x: -236 }}
                  animate={calm ? { opacity: 1 } : { x: 0 }}
                  exit={calm ? { opacity: 0 } : { x: -236 }}
                  transition={calm ? { duration: 0 } : { duration: 0.44, ease: LAB_EASE }}
                  aria-label="Navigation labels"
                >
                  {entries.map((e, i) => {
                    const Icon = e.icon;
                    return (
                      <motion.div
                        key={e.key}
                        initial={calm ? false : { opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={calm ? { duration: 0 } : { duration: 0.34, ease: LAB_EASE, delay: delay(i, calm, 0.06, 0.04) }}
                      >
                        <EntryAction
                          entry={e} nav={nav}
                          className="flex items-center gap-2.5 rounded-[10px] w-full text-left"
                          style={{ padding: "10px 11px", color: ROYAL.dim }}
                        >
                          <Icon style={{ width: 16, height: 16, color: ROYAL.gold, flex: "none" }} />
                          <span className="text-[13px] font-semibold truncate flex-1"
                                style={{ color: ROYAL.text, fontFamily: HEADING }}>
                            {e.label}
                          </span>
                          {e.locked && <LockMark />}
                        </EntryAction>
                      </motion.div>
                    );
                  })}
                  <div className="pt-3"><BackRow nav={nav} /></div>
                </motion.nav>
              )}
            </AnimatePresence>

            {/* The stage handle, pinned to the rail's outer edge. */}
            <motion.button
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Collapse the labels" : "Expand the labels"}
              aria-expanded={expanded}
              className="absolute grid place-items-center rounded-[10px]"
              style={{
                bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
                width: 40, height: 40, zIndex: 82, pointerEvents: "auto",
                background: ROYAL.panel, border: `1px solid ${ROYAL.goldSoft}`,
              }}
              initial={false}
              animate={{ left: expanded ? 258 : 12 }}
              transition={calm ? { duration: 0 } : { duration: 0.44, ease: LAB_EASE }}
            >
              {expanded ? <ChevronLeft style={{ width: 17, height: 17, color: ROYAL.gold }} />
                        : <ChevronRight style={{ width: 17, height: 17, color: ROYAL.gold }} />}
            </motion.button>
          </>
        )}
      </AnimatePresence>

      <button
        onClick={nav.toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-[11px]"
        style={{
          top: "calc(12px + env(safe-area-inset-top, 0px))", left: 12,
          width: 42, height: 42, zIndex: 84, pointerEvents: "auto",
          background: ROYAL.panel,
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${ROYAL.goldSoft}`,
        }}
      >
        {open ? <X style={{ width: 19, height: 19, color: ROYAL.gold }} />
              : <Menu style={{ width: 19, height: 19, color: ROYAL.gold }} />}
      </button>
    </div>
  );
}
