import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { entriesFor } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { BackRow, EntryAction, LAB_EASE, LockMark, Scrim, delay } from "./shared";

/**
 * G2 · Labelled Stack.
 *
 * Springs upward as a column, each label sliding in from the right just after
 * its button lands.
 *
 * THE LABELS ARE ALWAYS VISIBLE, NOT ON HOVER. That is the whole reason to pick
 * this over the radial arc: a phone has no hover, so a fan of unlabelled circles
 * is a row of mystery buttons. The label arrives 110ms after its dot so the eye
 * follows the button up and then reads it, rather than both arriving at once and
 * competing.
 *
 * The column is capped and scrolls. A FAB stack is a shortcut surface, and one
 * that runs off the top of the screen has stopped being a shortcut — so with a
 * long section the stack scrolls rather than growing past the viewport.
 */
export function LabelledStackMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} />

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute flex flex-col-reverse items-end gap-2.5 overflow-y-auto"
            style={{
              right: 20, bottom: "calc(88px + env(safe-area-inset-bottom, 0px))",
              maxHeight: "calc(100% - 150px)", pointerEvents: "auto",
            }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.14 } }}
            role="dialog" aria-modal="true" aria-label="Navigation"
          >
            {nav.section !== null && (
              <div className="pt-1"><BackRow nav={nav} /></div>
            )}

            {entries.map((e, i) => {
              const Icon = e.icon;
              return (
                <motion.div
                  key={e.key}
                  className="flex items-center gap-2"
                  initial={calm ? false : { opacity: 0, y: 22, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={calm ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.85 }}
                  transition={calm ? { duration: 0 } : {
                    type: "spring", stiffness: 380, damping: 24, delay: delay(i, calm, 0, 0.058),
                  }}
                >
                  <motion.span
                    className="rounded-[8px] text-[11px] font-bold whitespace-nowrap"
                    style={{
                      padding: "6px 10px", color: ROYAL.text, fontFamily: HEADING,
                      background: ROYAL.panel,
                      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                      border: `1px solid ${ROYAL.hairline}`,
                    }}
                    initial={calm ? false : { opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={calm ? { duration: 0 } : { duration: 0.34, ease: LAB_EASE, delay: delay(i, calm, 0.11, 0.058) }}
                  >
                    {e.label}
                    {e.count > 0 && <span style={{ color: ROYAL.dim }}> · {e.count}</span>}
                  </motion.span>

                  <EntryAction
                    entry={e} nav={nav}
                    className="grid place-items-center rounded-full relative flex-none"
                    style={{
                      width: 44, height: 44,
                      background: ROYAL.panel,
                      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                      border: `1px solid ${ROYAL.hairline}`,
                    }}
                  >
                    <Icon style={{ width: 17, height: 17, color: ROYAL.gold }} />
                    {e.locked && <span className="absolute -bottom-0.5 -right-0.5"><LockMark size={10} /></span>}
                  </EntryAction>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={nav.toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-full"
        style={{
          right: 20, bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          width: 56, height: 56, zIndex: 80, pointerEvents: "auto",
          border: `1px solid ${ROYAL.goldSoft}`,
          background: `linear-gradient(135deg, ${ROYAL.gold}, #a8823f)`,
          boxShadow: `0 8px 26px -8px ${ROYAL.goldSoft}`,
        }}
      >
        <motion.span
          initial={false}
          animate={{ rotate: open ? 135 : 0 }}
          transition={calm ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 22 }}
        >
          <Plus style={{ width: 23, height: 23, color: "#0b0b12" }} />
        </motion.span>
      </button>
    </div>
  );
}
