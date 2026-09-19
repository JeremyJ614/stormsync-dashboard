import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, X } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { entriesFor } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { EntryAction, LAB_EASE, Scrim } from "./shared";

/**
 * I2 · Collapsing Pill.
 *
 * Icon-led chips separated by champagne hairlines, with a gold underline
 * travelling beneath the active one. Scroll down and it folds to a single chip;
 * scroll back up and it opens out again.
 *
 * HOW THIS DIFFERS FROM THE SEGMENTED PILL, deliberately. They were built as
 * near-twins the first time and that was wrong — they are two menus, not one
 * with a setting. Segmented Pill is a segmented control: a continuous track,
 * text only, a filled gradient thumb sliding under the choice. This is a strip
 * of discrete chips: each carries its section's own icon, hairlines divide
 * them, and the active mark is a 2px underline rather than a filled block.
 * Different mark, different divider, different content, different silhouette.
 *
 * COLLAPSE ON DOWN, EXPAND ON UP. Down means you are reading and the navigation
 * is in the way; up means you are going back for it. It listens to the window,
 * because the menu is `position: fixed` over the document and the document is
 * what scrolls — the lab bound to a scrolling div, which here would be an
 * element that never moves.
 *
 * DIRECTION, NOT POSITION, with a 4px dead band. A trackpad and a thumb both
 * emit constant one-pixel jitter, and without the band the pill flips open and
 * shut on alternate frames. The band is what makes it feel decided.
 */
export function CollapsingPillMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef } = nav;
  const entries = entriesFor(nav);
  const [shrunk, setShrunk] = useState(false);
  const [focus, setFocus] = useState(0);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [bar, setBar] = useState<{ x: number; w: number }>({ x: 0, w: 0 });

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

  useLayoutEffect(() => {
    if (!open || shrunk) return;
    const chip = chipRefs.current[focus];
    if (!trackRef.current || !chip) return;
    setBar({ x: chip.offsetLeft, w: chip.offsetWidth });
  }, [open, shrunk, focus, entries.length]);

  useLayoutEffect(() => { setFocus(0); }, [nav.section]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      {/* Nothing dims. Reading behind it is the point of this menu. */}
      <Scrim nav={nav} weight="none" />

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute left-1/2 flex items-center"
            style={{
              bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
              maxWidth: "calc(100% - 24px)", padding: "4px 6px", borderRadius: 16,
              pointerEvents: "auto",
              background: "rgba(14,14,26,0.9)",
              backdropFilter: "blur(16px) saturate(1.2)",
              WebkitBackdropFilter: "blur(16px) saturate(1.2)",
              border: `1px solid ${ROYAL.goldSoft}`,
              boxShadow: "0 14px 34px -16px rgba(0,0,0,.9)",
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
                className="grid place-items-center flex-none"
                style={{ width: 28, height: 30, color: ROYAL.gold }}
              >
                <ChevronLeft style={{ width: 15, height: 15 }} />
              </button>
            )}

            <div ref={trackRef} className="relative flex items-stretch overflow-x-auto"
                 style={{ scrollbarWidth: "none" }}>
              {/* The travelling underline — a rule, not a filled thumb. */}
              <motion.span
                className="absolute pointer-events-none"
                style={{
                  bottom: 0, height: 2, borderRadius: 2,
                  background: `linear-gradient(90deg, transparent, ${ROYAL.gold}, transparent)`,
                  opacity: shrunk ? 0 : 1,
                }}
                initial={false}
                animate={{ x: bar.x, width: bar.w }}
                transition={calm ? { duration: 0 } : { type: "spring", stiffness: 330, damping: 27 }}
                aria-hidden
              />

              {entries.map((e, i) => {
                const Icon = e.icon;
                const kept = i === focus;
                const hidden = shrunk && !kept;
                return (
                  <div
                    key={e.key}
                    ref={(el) => { chipRefs.current[i] = el; }}
                    className="relative flex-none flex items-center"
                    onPointerEnter={() => setFocus(i)}
                    style={{
                      // A hairline between chips, never before the first.
                      borderLeft: i === 0 || hidden ? "none" : `1px solid ${ROYAL.goldFaint}`,
                      maxWidth: hidden ? 0 : 200,
                      opacity: hidden ? 0 : 1,
                      overflow: "hidden",
                      transition: calm ? "none"
                        : "max-width .42s cubic-bezier(.22,1,.36,1), opacity .24s, border-color .24s",
                    }}
                  >
                    <EntryAction
                      entry={e} nav={nav}
                      className="flex items-center gap-1.5 whitespace-nowrap"
                      style={{
                        padding: hidden ? "9px 0" : "9px 12px",
                        fontSize: 11.5, fontWeight: 700, fontFamily: HEADING,
                        color: kept ? ROYAL.text : ROYAL.dim,
                        transition: calm ? "none" : "color .24s, padding .42s cubic-bezier(.22,1,.36,1)",
                      }}
                    >
                      <Icon style={{ width: 14, height: 14, color: kept ? ROYAL.gold : ROYAL.dim, flex: "none" }} />
                      {e.label}
                    </EntryAction>
                  </div>
                );
              })}
            </div>

            <motion.span
              className="flex-none tabular-nums overflow-hidden"
              style={{ fontSize: 9, color: ROYAL.dim, whiteSpace: "nowrap" }}
              initial={false}
              animate={{ opacity: shrunk ? 1 : 0, maxWidth: shrunk ? 70 : 0, paddingLeft: shrunk ? 8 : 0 }}
              transition={calm ? { duration: 0 } : { duration: 0.32, ease: LAB_EASE }}
              aria-hidden
            >
              scroll up
            </motion.span>

            <button
              onClick={nav.close}
              aria-label="Close the menu"
              className="grid place-items-center flex-none"
              style={{ width: 28, height: 30, color: ROYAL.dim }}
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
        className="absolute grid place-items-center"
        style={{
          left: "50%", transform: "translateX(-50%)",
          bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          padding: "9px 18px", height: 40, zIndex: 80, borderRadius: 16,
          pointerEvents: open ? "none" : "auto",
          opacity: open ? 0 : 1,
          transition: calm ? "none" : "opacity .22s",
          background: "rgba(14,14,26,0.9)",
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
