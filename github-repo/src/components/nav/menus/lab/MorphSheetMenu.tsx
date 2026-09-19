import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { entriesFor } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { BackRow, EntryAction, LAB_EASE, LockMark, Scrim, delay, entrySub, levelTitle } from "./shared";

/**
 * G3 · Morph to Sheet.
 *
 * The button becomes the sheet. One element grows from a 56px circle in the
 * corner to a rounded panel across the bottom, and the contents fade in once it
 * has arrived.
 *
 * WHY IT IS ONE ELEMENT AND NOT TWO. A circle that fades out while a sheet
 * fades in is a cross-fade wearing a morph's clothes — you see both at once and
 * neither is convincingly the other. Animating width, height, radius and offset
 * on a single node means the corner control genuinely is the sheet, which is
 * what makes this the most satisfying of the three FABs and the only one that
 * can hold real content once open.
 *
 * The transform-origin is the bottom-right corner, so it grows out of where the
 * button was rather than out of its own centre.
 */
export function MorphSheetMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef } = nav;
  const entries = entriesFor(nav);
  const { title, sub } = levelTitle(nav, entries);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} />

      <motion.div
        className="absolute overflow-hidden"
        style={{
          pointerEvents: open ? "auto" : "none",
          transformOrigin: "bottom right",
          background: ROYAL.panel,
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
          border: `1px solid ${open ? ROYAL.hairline : ROYAL.goldSoft}`,
          zIndex: 78,
        }}
        initial={false}
        animate={{
          width: open ? "calc(100% - 28px)" : 56,
          height: open ? "min(62%, 340px)" : 56,
          borderRadius: open ? 20 : 28,
          right: 14,
          bottom: open ? 14 : 20,
        }}
        transition={calm ? { duration: 0 } : { duration: 0.5, ease: LAB_EASE }}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Navigation" : undefined}
        aria-hidden={!open}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              className="absolute inset-0 overflow-y-auto"
              style={{ padding: "18px 14px 14px" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={calm ? { duration: 0 } : { duration: 0.3, delay: 0.16 }}
            >
              {/* The grabber. Tapping it closes, the way a sheet should. */}
              <button
                onClick={nav.close}
                aria-label="Close the menu"
                className="absolute left-1/2 rounded-full"
                style={{ top: 8, transform: "translateX(-50%)", width: 36, height: 4, background: ROYAL.hairline }}
              />

              <h4 className="text-[15px]" style={{ color: ROYAL.text, fontFamily: HEADING, fontWeight: 800 }}>
                {title}
              </h4>
              <div className="text-[11px] mb-3" style={{ color: ROYAL.dim }}>{sub}</div>

              <div className="flex flex-col gap-0.5">
                {entries.map((e, i) => {
                  const Icon = e.icon;
                  return (
                    <motion.div
                      key={e.key}
                      initial={calm ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={calm ? { duration: 0 } : { duration: 0.3, ease: LAB_EASE, delay: 0.2 + delay(i, calm, 0, 0.035) }}
                    >
                      <EntryAction
                        entry={e} nav={nav}
                        className="flex items-center gap-2.5 rounded-[10px] w-full text-left"
                        style={{ padding: "10px 11px", color: ROYAL.dim }}
                      >
                        <Icon style={{ width: 17, height: 17, color: ROYAL.gold, flex: "none" }} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold leading-tight"
                                style={{ color: ROYAL.text, fontFamily: HEADING }}>
                            {e.label}
                          </span>
                          <span className="block text-[9.5px] mt-px" style={{ color: ROYAL.dim }}>{entrySub(e)}</span>
                        </span>
                        {e.locked && <LockMark />}
                      </EntryAction>
                    </motion.div>
                  );
                })}
              </div>

              <div className="pt-3"><BackRow nav={nav} /></div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* The plus, which disappears into the sheet it became. */}
      <motion.button
        onClick={nav.toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-full"
        style={{
          right: 14, bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          width: 56, height: 56, zIndex: 80,
          pointerEvents: open ? "none" : "auto",
          background: `linear-gradient(135deg, ${ROYAL.gold}, #a8823f)`,
          border: `1px solid ${ROYAL.goldSoft}`,
          boxShadow: `0 8px 26px -8px ${ROYAL.goldSoft}`,
        }}
        initial={false}
        animate={{ opacity: open ? 0 : 1, scale: open ? 0.6 : 1, rotate: open ? 90 : 0 }}
        transition={calm ? { duration: 0 } : { duration: 0.28, ease: LAB_EASE }}
      >
        <Plus style={{ width: 23, height: 23, color: "#0b0b12" }} />
      </motion.button>
    </div>
  );
}
