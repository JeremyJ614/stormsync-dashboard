import { AnimatePresence, motion } from "framer-motion";
import { Layers, X } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { entriesFor } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { BackRow, EntryAction, LAB_EASE, LockMark, delay } from "./shared";

/**
 * A5 · Dual Pane Push.
 *
 * A real off-canvas push: the app moves aside rather than being covered, and
 * the panel carries oversized type with a numbered index.
 *
 * THE PUSH IS LAYOUT'S, NOT THIS COMPONENT'S. A child cannot transform its own
 * ancestor, and the app content is Layout's child, not this menu's. So Layout
 * reads the style and applies the transform; this file only opens and closes.
 * That split is why `PUSH_TRANSFORMS` lives in Layout rather than here.
 *
 * There is no scrim. A push menu that dims the page it just pushed aside is
 * covering it after all, which is the thing this kind exists not to do — so the
 * pushed app stays lit and tappable-to-close, and the panel simply sits beside
 * it.
 */
export function DualPanePushMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute inset-y-0 left-0 flex flex-col justify-center overflow-y-auto"
            style={{
              width: "74%", maxWidth: 340, pointerEvents: "auto",
              background: `linear-gradient(160deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
              borderRight: `1px solid ${ROYAL.hairline}`,
              padding: "52px 20px",
            }}
            initial={calm ? { opacity: 0 } : { x: "-100%" }}
            animate={calm ? { opacity: 1 } : { x: 0 }}
            exit={calm ? { opacity: 0 } : { x: "-100%" }}
            // The lab's `--snap`: fast away, hard stop. A push wants weight.
            transition={calm ? { duration: 0 } : { duration: 0.58, ease: [0.86, 0, 0.07, 1] }}
            role="dialog" aria-modal="true" aria-label="Navigation"
          >
            {entries.map((e, i) => (
              <motion.div
                key={e.key}
                initial={calm ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={calm ? { duration: 0 } : { duration: 0.4, ease: LAB_EASE, delay: delay(i, calm, 0.14, 0.046) }}
              >
                <EntryAction
                  entry={e} nav={nav}
                  className="flex items-baseline gap-2.5 w-full text-left"
                  style={{ padding: "3px 0" }}
                >
                  <span className="tabular-nums flex-none text-[9.5px] tracking-[0.1em]" style={{ color: ROYAL.dim }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="min-w-0 flex-1 uppercase leading-[1.04]"
                    style={{
                      fontFamily: HEADING, fontWeight: 900, letterSpacing: "-0.04em",
                      fontSize: entries.length > 7 ? 21 : 26,
                      color: ROYAL.text,
                    }}
                  >
                    {e.label}
                  </span>
                  {e.locked && <LockMark />}
                </EntryAction>
              </motion.div>
            ))}

            <div className="pt-5"><BackRow nav={nav} /></div>
          </motion.nav>
        )}
      </AnimatePresence>

      <button
        onClick={nav.toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-[11px]"
        style={{
          top: "calc(12px + env(safe-area-inset-top, 0px))", right: 12,
          width: 42, height: 42, zIndex: 80, pointerEvents: "auto",
          background: ROYAL.panel,
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${ROYAL.goldSoft}`,
        }}
      >
        {open ? <X style={{ width: 19, height: 19, color: ROYAL.gold }} />
              : <Layers style={{ width: 19, height: 19, color: ROYAL.gold }} />}
      </button>
    </div>
  );
}
