import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Layers } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { entriesFor } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { BackRow, EntryAction, LAB_EASE, LockMark, Scrim, Trigger, Wordmark, delay } from "./shared";

/**
 * C3 · Floating Glass.
 *
 * A detached rounded panel over the page, with a scrubber rail beside the list
 * that travels to whichever entry your pointer is on.
 *
 * THE SCRUBBER IS MEASURED, NOT COMPUTED. The thumb takes its position and its
 * height from the focused row's own bounding box rather than from `index *
 * rowHeight`, because the rows are not all one height — a two-line module name
 * wraps — and an index-derived thumb drifts further from the truth with every
 * row below the first. It is measured in a layout effect so the thumb is in the
 * right place on the frame the panel first paints, not one frame later.
 *
 * IT BOUNCES TO ITS TARGET, AND ONLY IN Y. The thumb used to arrive on a stiff,
 * near-critically-damped spring — correct, and completely silent. This one is
 * under-damped (ζ ≈ 0.53) and slower, so it overshoots the row it is heading
 * for and settles back into it, which is what makes the rail read as a scrubber
 * being thrown rather than a highlight being redrawn.
 *
 * Its height is NOT on that spring. A thumb that bounces sideways is lively; a
 * thumb whose length springs past the row it is measuring looks like a bug, so
 * the two properties carry separate transitions and only travel is springy.
 */
export function FloatingGlassMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [focus, setFocus] = useState(0);
  const [thumb, setThumb] = useState<{ y: number; h: number }>({ y: 0, h: 30 });

  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const row = rowRefs.current[focus];
    if (!list || !row) return;
    const lr = list.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    setThumb({ y: rr.top - lr.top, h: rr.height });
  }, [open, focus, entries.length]);

  // Drilling in or back rebuilds the list, so the thumb goes home with it.
  useLayoutEffect(() => { setFocus(0); }, [nav.section]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} weight="light" />

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute flex flex-col overflow-hidden"
            style={{
              top: 16, bottom: 16, left: 14, width: 214, pointerEvents: "auto",
              borderRadius: 18,
              background: ROYAL.panel,
              backdropFilter: "blur(18px) saturate(1.25)",
              WebkitBackdropFilter: "blur(18px) saturate(1.25)",
              border: `1px solid ${ROYAL.hairline}`,
              boxShadow: "0 24px 60px -28px rgba(0,0,0,0.95)",
              padding: "14px 10px",
            }}
            initial={calm ? { opacity: 0 } : { x: "calc(-100% - 18px)", scale: 0.96 }}
            animate={calm ? { opacity: 1 } : { x: 0, scale: 1 }}
            exit={calm ? { opacity: 0 } : { x: "calc(-100% - 18px)", scale: 0.96 }}
            transition={calm ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}
            role="dialog" aria-modal="true" aria-label="Navigation"
          >
            <div className="px-1.5 pb-3"><Wordmark size={12.5} /></div>

            <div className="flex gap-2 flex-1 min-h-0">
              {/* The rail. A hairline track with a lit thumb riding it. */}
              <div className="relative flex-none my-0.5" style={{ width: 3, borderRadius: 2, background: ROYAL.hairline }} aria-hidden>
                <motion.i
                  className="absolute block"
                  style={{
                    left: -1, right: -1, borderRadius: 3,
                    background: `linear-gradient(180deg, ${ROYAL.gold}, ${ROYAL.iris})`,
                    boxShadow: `0 0 12px -2px ${ROYAL.goldSoft}`,
                  }}
                  initial={false}
                  animate={{ y: thumb.y, height: thumb.h }}
                  transition={calm ? { duration: 0 } : {
                    y: { type: "spring", stiffness: 120, damping: 11, mass: 0.9 },
                    height: { type: "spring", stiffness: 260, damping: 26 },
                  }}
                />
              </div>

              <div ref={listRef} className="flex-1 min-w-0 overflow-y-auto">
                {entries.map((e, i) => (
                  <motion.div
                    key={e.key}
                    ref={(el) => { rowRefs.current[i] = el; }}
                    initial={calm ? false : { opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={calm ? { duration: 0 } : { duration: 0.36, ease: LAB_EASE, delay: delay(i, calm, 0.1, 0.038) }}
                    onPointerEnter={() => setFocus(i)}
                    onFocus={() => setFocus(i)}
                  >
                    <EntryAction
                      entry={e} nav={nav}
                      className="flex items-center gap-2 rounded-[9px] w-full text-left"
                      style={{
                        padding: "8px 9px",
                        color: focus === i ? ROYAL.text : ROYAL.dim,
                        fontSize: 12.5, fontWeight: 600, fontFamily: HEADING,
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{e.label}</span>
                      {e.locked && <LockMark size={11} />}
                    </EntryAction>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="pt-3"><BackRow nav={nav} /></div>
          </motion.nav>
        )}
      </AnimatePresence>

      <Trigger nav={nav}>
        <motion.span
          className="grid place-items-center rounded-full"
          style={{
            width: 52, height: 52,
            background: ROYAL.panel,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: `1px solid ${ROYAL.goldSoft}`,
            boxShadow: `0 10px 26px -10px ${ROYAL.goldSoft}`,
          }}
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={calm ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 20 }}
        >
          <Layers style={{ width: 20, height: 20, color: ROYAL.gold }} />
        </motion.span>
      </Trigger>
    </div>
  );
}
