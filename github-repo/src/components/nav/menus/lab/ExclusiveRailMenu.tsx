import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Layers } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { LAB_EASE, LockMark, Scrim, Trigger, Wordmark, delay } from "./shared";

/**
 * F2 · Exclusive with Rail.
 *
 * One section open at a time, with a gradient marker on the rail that springs
 * to the open one and stretches to its height. You always know where you are.
 *
 * EXCLUSIVE IS WHAT MAKES IT WORK ON A PHONE. If two sections could be open at
 * once the panel would be taller than the screen and the rail marker would be
 * pointing at something scrolled out of view. Opening one closes the rest, so
 * the panel stays roughly a screen tall whatever the member is entitled to.
 *
 * THE REVEAL IS A GRID ROW, NOT A HEIGHT. `grid-template-rows: 0fr -> 1fr` is
 * the one honest way to animate "to whatever height this content turns out to
 * be" — a max-height guess either clips long sections or eases against a number
 * the content never reaches, and a transform squashes the text inside it. This
 * is the lab's one deliberate exception to transform-and-opacity and it is kept
 * here for the same reason.
 */
export function ExclusiveRailMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef, sections, close } = nav;
  const [openIdx, setOpenIdx] = useState(0);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const secRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [mark, setMark] = useState<{ y: number; h: number }>({ y: 0, h: 44 });

  // Measured after the row has finished growing, so the marker lands on the
  // section's real height rather than the height it had on the way there.
  useLayoutEffect(() => {
    if (!open) return;
    const settle = () => {
      const wrap = wrapRef.current;
      const sec = secRefs.current[openIdx];
      if (!wrap || !sec) return;
      setMark({ y: sec.offsetTop, h: sec.offsetHeight });
    };
    settle();
    const t = window.setTimeout(settle, calm ? 0 : 380);
    return () => window.clearTimeout(t);
  }, [open, openIdx, calm, sections.length]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} />

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute inset-y-0 left-0 flex flex-col overflow-y-auto"
            style={{
              width: 254, pointerEvents: "auto",
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
            <div className="px-1.5 pb-3"><Wordmark size={12.5} /></div>

            <div ref={wrapRef} className="relative" style={{ paddingLeft: 14 }}>
              {/* The rail and its travelling marker. */}
              <div className="absolute inset-y-0 left-0" style={{ width: 2, background: ROYAL.hairline }} aria-hidden>
                <motion.i
                  className="absolute block"
                  style={{
                    left: -1, right: -1, borderRadius: 3,
                    background: `linear-gradient(180deg, ${ROYAL.gold}, ${ROYAL.iris})`,
                    boxShadow: `0 0 12px -2px ${ROYAL.goldSoft}`,
                  }}
                  initial={false}
                  animate={{ y: mark.y, height: mark.h }}
                  transition={calm ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 26 }}
                />
              </div>

              {sections.map((s, i) => {
                const Icon = s.icon;
                const isOpen = openIdx === i;
                return (
                  <div
                    key={s.label}
                    ref={(el) => { secRefs.current[i] = el; }}
                    style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}
                  >
                    <button
                      onClick={() => setOpenIdx(isOpen ? -1 : i)}
                      aria-expanded={isOpen}
                      className="flex items-center gap-2 w-full text-left"
                      style={{
                        padding: "12px 8px", fontSize: 12.5, fontWeight: 700, fontFamily: HEADING,
                        color: isOpen ? ROYAL.text : ROYAL.dim,
                        transition: calm ? "none" : "color .2s",
                      }}
                    >
                      <Icon style={{ width: 15, height: 15, color: ROYAL.gold, flex: "none" }} />
                      <span className="flex-1 truncate">{s.label}</span>
                      <ChevronRight
                        style={{
                          width: 12, height: 12, color: ROYAL.gold, flex: "none",
                          transform: isOpen ? "rotate(90deg)" : "none",
                          transition: calm ? "none" : "transform .36s cubic-bezier(.22,1,.36,1)",
                        }}
                      />
                    </button>

                    <div
                      className="grid"
                      style={{
                        gridTemplateRows: isOpen ? "1fr" : "0fr",
                        transition: calm ? "none" : "grid-template-rows .36s cubic-bezier(.22,1,.36,1)",
                        contain: "layout",
                      }}
                    >
                      <div style={{ overflow: "hidden", minHeight: 0 }}>
                        {s.items.map((it, k) => (
                          <Link
                            key={it.path}
                            href={it.path}
                            onClick={close}
                            className="flex items-center gap-1.5"
                            style={{
                              padding: "8px 8px 8px 26px", fontSize: 11.5, color: ROYAL.dim,
                              opacity: isOpen ? 1 : 0,
                              transform: isOpen ? "none" : "translateX(-10px)",
                              transition: calm ? "none"
                                : `opacity .3s ${delay(k, calm, 0.06, 0.036)}s, transform .3s ${delay(k, calm, 0.06, 0.036)}s`,
                            }}
                          >
                            <span className="truncate flex-1">{it.label}</span>
                            {it.locked && <LockMark size={10} />}
                          </Link>
                        ))}
                        {s.items.length === 0 && (
                          <p className="text-[11px]" style={{ padding: "8px 8px 8px 26px", color: ROYAL.dim }}>
                            Nothing here yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <Trigger nav={nav}>
        <motion.span
          className="grid place-items-center rounded-[13px]"
          style={{
            width: 52, height: 52,
            background: `linear-gradient(150deg, ${ROYAL.gold}, #a8823f)`,
            boxShadow: `0 10px 26px -10px ${ROYAL.goldSoft}`,
          }}
          initial={false}
          animate={{ rotate: open ? 90 : 0 }}
          transition={calm ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 20 }}
        >
          <Layers style={{ width: 21, height: 21, color: "#0b0b12" }} />
        </motion.span>
      </Trigger>
    </div>
  );
}
