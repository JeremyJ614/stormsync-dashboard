import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { entriesFor } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { EntryAction, Scrim } from "./shared";

/**
 * I2 · Collapsing Pill.
 *
 * The pill shrinks to the active label while you scroll down and comes back
 * when you scroll up. Navigation out of the way while reading, back when you
 * want it, and no hamburger.
 *
 * IT LISTENS TO THE WINDOW, NOT A PANE. In the lab the mock page was a scrolling
 * div, so the handler bound to that element. Here the page is the document and
 * the menu is `position: fixed` over it, so the scroller is the window — binding
 * to anything else gives a pill that never collapses because the thing it was
 * watching never moves.
 *
 * DIRECTION, NOT POSITION, drives it, with a 4px dead band. Without the band a
 * single-pixel jitter — which a trackpad and a phone both produce constantly —
 * flips the pill open and shut on alternate frames. The band is what makes it
 * feel decided rather than nervous.
 */
export function CollapsingPillMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef } = nav;
  const entries = entriesFor(nav);
  const [shrunk, setShrunk] = useState(false);

  useEffect(() => {
    if (!open) { setShrunk(false); return; }
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > last + 4 && y > 24) setShrunk(true);
      else if (y < last - 4) setShrunk(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      {/* No blur over the page: this menu's whole point is reading behind it. */}
      <Scrim nav={nav} tint="transparent" />

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute left-1/2 flex items-center gap-1 overflow-x-auto"
            style={{
              bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
              maxWidth: "calc(100% - 28px)", padding: 5, borderRadius: 999,
              pointerEvents: "auto", scrollbarWidth: "none",
              background: ROYAL.panel,
              backdropFilter: "blur(16px) saturate(1.2)",
              WebkitBackdropFilter: "blur(16px) saturate(1.2)",
              border: `1px solid ${ROYAL.hairline}`,
              boxShadow: "0 12px 30px -14px rgba(0,0,0,.85)",
            }}
            initial={calm ? { opacity: 0, x: "-50%" } : { opacity: 0, y: 18, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={calm ? { opacity: 0, x: "-50%" } : { opacity: 0, y: 18, x: "-50%" }}
            transition={calm ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 26 }}
            role="dialog" aria-modal="true" aria-label="Navigation"
          >
            {nav.section !== null && !shrunk && (
              <button
                onClick={nav.back}
                aria-label="All sections"
                className="grid place-items-center rounded-full flex-none"
                style={{ width: 30, height: 30, color: ROYAL.gold }}
              >
                <ChevronLeft style={{ width: 15, height: 15 }} />
              </button>
            )}

            {entries.map((e, i) => {
              // Collapsed, only the first survives — it is the one standing in
              // for the whole pill, so it keeps its padding and the rest lose
              // theirs rather than everything shrinking a little.
              const kept = i === 0;
              return (
                <EntryAction
                  key={e.key} entry={e} nav={nav}
                  className="rounded-full whitespace-nowrap overflow-hidden flex-none block"
                  style={{
                    padding: shrunk && !kept ? "8px 0" : "8px 13px",
                    maxWidth: shrunk && !kept ? 0 : 160,
                    opacity: shrunk && !kept ? 0 : 1,
                    fontSize: 11.5, fontWeight: 700, fontFamily: HEADING,
                    color: kept ? ROYAL.text : ROYAL.dim,
                    background: kept ? ROYAL.goldFaint : "transparent",
                    transition: calm ? "none"
                      : "max-width .4s cubic-bezier(.22,1,.36,1), padding .4s cubic-bezier(.22,1,.36,1), opacity .26s",
                  }}
                >
                  {e.label}
                </EntryAction>
              );
            })}

            <span
              className="flex-none tabular-nums"
              style={{
                padding: "0 8px", fontSize: 9, color: ROYAL.dim, whiteSpace: "nowrap",
                opacity: shrunk ? 1 : 0, maxWidth: shrunk ? 90 : 0, overflow: "hidden",
                transition: calm ? "none" : "opacity .26s, max-width .4s",
              }}
              aria-hidden
            >
              scroll ↑
            </span>
          </motion.nav>
        )}
      </AnimatePresence>

      <button
        onClick={nav.toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute rounded-full grid place-items-center"
        style={{
          left: "50%", transform: "translateX(-50%)",
          bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          padding: "9px 18px", height: 40, zIndex: 80,
          pointerEvents: open ? "none" : "auto",
          opacity: open ? 0 : 1,
          transition: calm ? "none" : "opacity .22s",
          background: ROYAL.panel,
          backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
          border: `1px solid ${ROYAL.goldSoft}`,
          color: ROYAL.gold, fontFamily: HEADING, fontSize: 12, fontWeight: 700,
        }}
      >
        Navigate
      </button>
    </div>
  );
}
