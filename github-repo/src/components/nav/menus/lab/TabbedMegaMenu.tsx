import { useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { LAB_EASE, LockMark, Scrim, Wordmark, delay } from "./shared";

/**
 * B2 · Tabbed Mega.
 *
 * A category list on the left swaps the right-hand content, and the panel stays
 * open while you browse. Cross-fade, so nothing jumps.
 *
 * THIS ONE DOES NOT DRILL. Every other ported menu walks the app's two levels
 * with `entriesFor` — pick a section, the list becomes its modules. A mega menu
 * exists precisely so you do not have to: both levels are on screen at once,
 * sections down the left and the chosen one's modules on the right. So it reads
 * `nav.sections` directly and never calls `openSection`, and hovering a tab
 * costs nothing because nothing navigates until you click a module.
 *
 * The inactive panes are kept mounted and faded rather than unmounted, which is
 * what makes the swap a cross-fade instead of a reflow — the panel's height is
 * the tallest pane's height and stays put as you move between tabs.
 */
export function TabbedMegaMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef, sections, close } = nav;
  const [tab, setTab] = useState(0);
  const active = sections[tab] ?? sections[0];

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} />

      {/* The bar. Always present so the trigger never moves. */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3"
        style={{
          height: 54, zIndex: 70, pointerEvents: "auto",
          paddingTop: "env(safe-area-inset-top, 0px)",
          background: open ? ROYAL.panel : "transparent",
          backdropFilter: open ? "blur(14px) saturate(1.2)" : "none",
          WebkitBackdropFilter: open ? "blur(14px) saturate(1.2)" : "none",
          borderBottom: open ? `1px solid ${ROYAL.hairline}` : "1px solid transparent",
          transition: calm ? "none" : "background .3s, border-color .3s",
        }}
      >
        <span className="mr-auto" style={{ opacity: open ? 1 : 0, transition: calm ? "none" : "opacity .25s" }}>
          <Wordmark />
        </span>
        <button
          onClick={nav.toggle}
          aria-label={open ? "Close the menu" : "Open the menu"}
          aria-expanded={open}
          className="grid place-items-center rounded-[10px]"
          style={{ width: 40, height: 40, background: ROYAL.goldFaint, border: `1px solid ${ROYAL.goldSoft}` }}
        >
          {open ? <X style={{ width: 18, height: 18, color: ROYAL.gold }} />
                : <Menu style={{ width: 18, height: 18, color: ROYAL.gold }} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute left-0 right-0 overflow-hidden"
            style={{
              top: "calc(54px + env(safe-area-inset-top, 0px))", pointerEvents: "auto",
              maxHeight: "calc(100% - 54px)",
              background: ROYAL.panel,
              backdropFilter: "blur(16px) saturate(1.2)",
              WebkitBackdropFilter: "blur(16px) saturate(1.2)",
              borderBottom: `1px solid ${ROYAL.hairline}`,
            }}
            initial={calm ? { opacity: 0 } : { y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={calm ? { opacity: 0 } : { y: -10, opacity: 0 }}
            transition={calm ? { duration: 0 } : { duration: 0.4, ease: LAB_EASE }}
            role="dialog" aria-modal="true" aria-label="Navigation"
          >
            <div className="grid" style={{ gridTemplateColumns: "132px 1fr", minHeight: 200 }}>
              <div className="flex flex-col gap-0.5 p-2 overflow-y-auto"
                   style={{ borderRight: `1px solid ${ROYAL.hairline}` }}>
                {sections.map((s, i) => (
                  <button
                    key={s.label}
                    onClick={() => setTab(i)}
                    onPointerEnter={() => setTab(i)}
                    className="text-left rounded-[9px] truncate"
                    style={{
                      padding: "9px 10px", fontSize: 12, fontWeight: 700, fontFamily: HEADING,
                      color: tab === i ? ROYAL.text : ROYAL.dim,
                      background: tab === i ? ROYAL.goldFaint : "transparent",
                      transform: tab === i ? "translateX(2px)" : "none",
                      transition: calm ? "none" : "color .2s, background-color .2s, transform .2s",
                    }}
                    aria-current={tab === i}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="relative p-3.5 overflow-y-auto">
                {/* Panes stay mounted; only opacity moves. That is the cross-fade. */}
                {sections.map((s, i) => (
                  <div
                    key={s.label}
                    className={i === tab ? "relative" : "absolute inset-3.5 pointer-events-none"}
                    style={{ opacity: i === tab ? 1 : 0, transition: calm ? "none" : "opacity .3s" }}
                    aria-hidden={i !== tab}
                  >
                    <h4 className="text-[15px] mb-2"
                        style={{ color: ROYAL.text, fontFamily: HEADING, fontWeight: 800 }}>
                      {s.label}
                    </h4>
                    {s.items.map((it, k) => (
                      <motion.div
                        key={it.path}
                        initial={calm ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={calm ? { duration: 0 } : { duration: 0.3, ease: LAB_EASE, delay: delay(k, calm, 0.04, 0.03) }}
                      >
                        <Link
                          href={it.path}
                          onClick={close}
                          className="flex items-center gap-2 py-1.5 text-[12px] font-semibold"
                          style={{ color: ROYAL.dim }}
                        >
                          <span className="truncate flex-1">{it.label}</span>
                          {it.locked && <LockMark size={11} />}
                        </Link>
                      </motion.div>
                    ))}
                    {s.items.length === 0 && (
                      <p className="text-[11px]" style={{ color: ROYAL.dim }}>Nothing here yet.</p>
                    )}
                  </div>
                ))}
                {!active && <p className="text-[11px]" style={{ color: ROYAL.dim }}>No sections available.</p>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
