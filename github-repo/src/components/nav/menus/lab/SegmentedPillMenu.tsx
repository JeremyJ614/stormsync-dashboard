import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, X } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { entriesFor } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { EntryAction, Scrim } from "./shared";

/**
 * I1 · Segmented Pill.
 *
 * A segmented control floating above the content: one continuous track, a
 * gradient thumb sliding under whichever segment you are on, text only, no
 * icons, no dividers. The page keeps its full height behind it.
 *
 * NO SCRIM AT ALL. It floats over content you are still reading — that is the
 * entire reason to choose it over a sidebar — so the ground behind it is a bare
 * click-catcher. The first version dimmed the page to solid ink, which made the
 * app look crashed.
 *
 * THE THUMB IS MEASURED, NOT COMPUTED. Segment widths come from their text, so
 * no arithmetic on the index gives the right offset. It reads the focused
 * button's own box, which also re-measures for free when the label set changes:
 * drilling into a section swaps six section names for however many module
 * names, and the thumb simply lands on the new first one.
 *
 * It is positioned against the SCROLLING TRACK rather than the pill's outer
 * box, because on a phone the labels rarely fit and the track scrolls — a thumb
 * pinned to the outer box would drift away from its segment as you scroll.
 */
export function SegmentedPillMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const segRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [focus, setFocus] = useState(0);
  const [thumb, setThumb] = useState<{ x: number; w: number }>({ x: 0, w: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const seg = segRefs.current[focus];
    if (!trackRef.current || !seg) return;
    setThumb({ x: seg.offsetLeft, w: seg.offsetWidth });
  }, [open, focus, entries.length]);

  useLayoutEffect(() => { setFocus(0); }, [nav.section]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} weight="none" />

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute left-1/2 flex items-center gap-1"
            style={{
              bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
              maxWidth: "calc(100% - 24px)", padding: 5, borderRadius: 999,
              pointerEvents: "auto",
              background: "rgba(14,14,26,0.86)",
              backdropFilter: "blur(16px) saturate(1.2)",
              WebkitBackdropFilter: "blur(16px) saturate(1.2)",
              border: `1px solid ${ROYAL.hairline}`,
              boxShadow: "0 14px 34px -16px rgba(0,0,0,.9)",
            }}
            initial={calm ? { opacity: 0, x: "-50%" } : { opacity: 0, y: 18, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={calm ? { opacity: 0, x: "-50%" } : { opacity: 0, y: 18, x: "-50%" }}
            transition={calm ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 26 }}
            role="dialog" aria-modal="true" aria-label="Navigation"
          >
            {nav.section !== null && (
              <button
                onClick={nav.back}
                aria-label="All sections"
                className="grid place-items-center rounded-full flex-none"
                style={{ width: 30, height: 30, color: ROYAL.gold }}
              >
                <ChevronLeft style={{ width: 15, height: 15 }} />
              </button>
            )}

            <div
              ref={trackRef}
              className="relative flex items-center overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
              <motion.span
                className="absolute rounded-full pointer-events-none"
                style={{
                  top: 0, bottom: 0,
                  background: `linear-gradient(135deg, ${ROYAL.goldSoft}, ${ROYAL.irisSoft})`,
                  boxShadow: `inset 0 0 0 1px ${ROYAL.goldSoft}`,
                }}
                initial={false}
                animate={{ x: thumb.x, width: thumb.w }}
                transition={calm ? { duration: 0 } : { type: "spring", stiffness: 340, damping: 28 }}
                aria-hidden
              />
              {entries.map((e, i) => (
                <div
                  key={e.key}
                  ref={(el) => { segRefs.current[i] = el; }}
                  className="relative flex-none"
                  onPointerEnter={() => setFocus(i)}
                >
                  <EntryAction
                    entry={e} nav={nav}
                    className="relative rounded-full whitespace-nowrap block"
                    style={{
                      padding: "8px 14px", fontSize: 11.5, fontWeight: 700, fontFamily: HEADING,
                      color: focus === i ? ROYAL.text : ROYAL.dim,
                      transition: calm ? "none" : "color .24s",
                    }}
                  >
                    {e.label}
                  </EntryAction>
                </div>
              ))}
            </div>

            <button
              onClick={nav.close}
              aria-label="Close the menu"
              className="grid place-items-center rounded-full flex-none"
              style={{ width: 30, height: 30, color: ROYAL.dim }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          </motion.nav>
        )}
      </AnimatePresence>

      <button
        onClick={nav.toggle}
        aria-label="Open the menu"
        aria-expanded={open}
        className="absolute rounded-full grid place-items-center"
        style={{
          left: "50%", transform: "translateX(-50%)",
          bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          padding: "9px 18px", height: 40, zIndex: 80,
          pointerEvents: open ? "none" : "auto",
          opacity: open ? 0 : 1,
          transition: calm ? "none" : "opacity .22s",
          background: "rgba(14,14,26,0.86)",
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
