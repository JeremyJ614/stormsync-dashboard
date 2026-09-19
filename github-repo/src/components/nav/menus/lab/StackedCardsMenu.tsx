import { useLayoutEffect, useState } from "react";
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
 *
 * ONE CARD IS ALWAYS LIT, AND IT IS THE FIRST UNTIL YOU SAY OTHERWISE. The
 * selection was hover-only, which on a phone means never: the rail opened with
 * every card identical and nothing to read first. The glow is a ring plus two
 * blooms on the same periwinkle, drawn as box-shadows rather than a blurred
 * element behind the card — a shadow is composited, so it costs nothing and it
 * cannot smear when the card moves.
 *
 * PRESSING ONE LIFTS IT OUT OF THE RAIL. The card tips a few degrees about its
 * own left edge under a shallow perspective and grows very slightly, so it
 * rotates toward you out of the stack instead of sinking into it the way a
 * button would. Eleven degrees and two per cent is the whole effect, and the
 * scroller carries 7px of padding so the ring and its blooms have somewhere to
 * fall: `overflow-y: auto` clips the horizontal axis as well, so without that
 * gutter the glow would be shaved off flat down the right-hand side.
 */
export function StackedCardsMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef } = nav;
  const entries = entriesFor(nav);
  const [lit, setLit] = useState(0);

  // Drilling in or back rebuilds the list, so the light goes back to the top.
  useLayoutEffect(() => { setLit(0); }, [nav.section]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} weight="light" />

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute inset-y-0 left-0 flex flex-col overflow-hidden"
            style={{
              width: 236, pointerEvents: "auto",
              background: `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
              borderRight: `1px solid ${ROYAL.hairline}`,
              padding: "14px 3px",
            }}
            initial={calm ? { opacity: 0 } : { x: "-100%" }}
            animate={calm ? { opacity: 1 } : { x: 0 }}
            exit={calm ? { opacity: 0 } : { x: "-100%" }}
            transition={calm ? { duration: 0 } : { duration: 0.46, ease: LAB_EASE }}
            role="dialog" aria-modal="true" aria-label="Navigation"
          >
            <div className="px-2 pb-3"><Wordmark /></div>

            <div className="flex flex-col gap-1.5 overflow-y-auto flex-1 min-h-0"
                 style={{ padding: "2px 7px" }}>
              {entries.map((e, i) => {
                const Icon = e.icon;
                return (
                  <motion.div
                    key={e.key}
                    className="flex-none"
                    style={{ transformPerspective: 760, transformOrigin: "left center" }}
                    initial={calm ? false : { opacity: 0, x: -18 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={calm ? { duration: 0 } : { duration: 0.4, ease: LAB_EASE, delay: delay(i, calm, 0.08, 0.044) }}
                    whileHover={calm ? undefined : { x: 6 }}
                    whileTap={calm ? undefined : { scale: 1.02, rotateY: -11, x: 4 }}
                    onPointerDown={() => setLit(i)}
                    onPointerEnter={() => setLit(i)}
                    onFocus={() => setLit(i)}
                  >
                    <EntryAction
                      entry={e} nav={nav}
                      className="flex items-center gap-2.5 rounded-[11px] w-full text-left group"
                      style={{
                        padding: "10px 11px",
                        background: lit === i ? "rgba(204,204,255,0.075)" : "rgba(255,255,255,0.035)",
                        border: `1px solid ${lit === i ? "rgba(204,204,255,0.34)" : "transparent"}`,
                        // The edge light: a hard periwinkle bar on the leading
                        // edge, a ring on the outline, and two blooms outside it.
                        boxShadow: lit === i
                          ? `inset 2px 0 0 0 ${ROYAL.iris},`
                            + " 0 0 0 1px rgba(204,204,255,0.22),"
                            + " 0 0 18px -2px rgba(204,204,255,0.42),"
                            + " 0 0 42px -10px rgba(204,204,255,0.32)"
                          : "none",
                        transition: calm ? "none" : "border-color .22s, box-shadow .22s, background-color .22s",
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

            <div className="pt-3 px-[7px]"><BackRow nav={nav} /></div>
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
