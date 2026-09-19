import { AnimatePresence, motion } from "framer-motion";
import { Layers } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { entriesFor } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { BackRow, EntryAction, LAB_EASE, LockMark, Scrim, Trigger, Wordmark, delay, entrySub } from "./shared";

/**
 * C2 · Stacked Cards.
 *
 * Bold title over a small subtitle, as cards rather than a list. The card under
 * the pointer slides out of the rail and takes an edge light.
 *
 * THE SUBTITLE IS THE POINT. A rail this wide only earns its width if it says
 * more than a list of names would: "Severe Weather · 9 modules" tells you
 * whether it is worth opening, and "Severe Weather" does not. That is why
 * `entrySub` exists rather than each card inventing its own second line.
 *
 * The glow is periwinkle rather than champagne — the Owner's call in the lab,
 * and it does sit better against the ink ground than gold-on-gold would. Both
 * are ROYAL tokens, so it moves if the palette moves.
 */
export function StackedCardsMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} />

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute inset-y-0 left-0 flex flex-col overflow-hidden"
            style={{
              width: 236, pointerEvents: "auto",
              background: `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
              borderRight: `1px solid ${ROYAL.hairline}`,
              padding: "14px 10px",
            }}
            initial={calm ? { opacity: 0 } : { x: "-100%" }}
            animate={calm ? { opacity: 1 } : { x: 0 }}
            exit={calm ? { opacity: 0 } : { x: "-100%" }}
            transition={calm ? { duration: 0 } : { duration: 0.46, ease: LAB_EASE }}
            role="dialog" aria-modal="true" aria-label="Navigation"
          >
            <div className="px-1.5 pb-3"><Wordmark /></div>

            <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 min-h-0">
              {entries.map((e, i) => {
                const Icon = e.icon;
                return (
                  <motion.div
                    key={e.key}
                    initial={calm ? false : { opacity: 0, x: -18 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={calm ? { duration: 0 } : { duration: 0.4, ease: LAB_EASE, delay: delay(i, calm, 0.08, 0.044) }}
                    whileHover={calm ? undefined : { x: 6 }}
                  >
                    <EntryAction
                      entry={e} nav={nav}
                      className="flex items-center gap-2.5 rounded-[11px] w-full text-left group"
                      style={{
                        padding: "10px 11px",
                        background: "rgba(255,255,255,0.035)",
                        border: "1px solid transparent",
                        // The edge light: a hard periwinkle bar on the leading
                        // edge plus a soft bloom, both on the same token.
                        boxShadow: "none",
                        transition: calm ? "none" : "border-color .22s, box-shadow .22s",
                      }}
                    >
                      <Icon style={{ width: 16, height: 16, color: ROYAL.gold, flex: "none" }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-bold leading-tight"
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
          </motion.nav>
        )}
      </AnimatePresence>

      <Trigger nav={nav}>
        <motion.span
          className="grid place-items-center rounded-[13px]"
          style={{
            width: 52, height: 52,
            background: `linear-gradient(150deg, ${ROYAL.iris}, #8f8fd6)`,
            boxShadow: `0 10px 26px -10px ${ROYAL.irisSoft}`,
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
