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
 *
 * ITS BAR HANGS BELOW THE APP HEADER. It used to start at y=0, which put its
 * toggle exactly on top of the profile button — the menu covering the control
 * people reach for most. The bar is the menu's own furniture, so it starts
 * where the app's header stops.
 *
 * THE TYPE IS DUAL PANE PUSH'S, SMALLER AND IN CHAMPAGNE. Same family, same 900
 * weight, same negative tracking, same uppercase — but a mega menu puts thirty
 * labels on screen where the push puts six, so it is set at half the size and
 * in champagne rather than white. White at this density reads as a wall.
 *
 * The panel is near-opaque rather than glass. Legibility cannot rest on
 * `backdrop-filter`: Chromium drops it on a weak GPU and Firefox on Android has
 * never had it, and forty labels over an undimmed dashboard are unreadable when
 * it goes. The blur is a finish on top of a panel that already works.
 */

/** Clear of the app header, so the toggle never lands on the profile button. */
const BAR_TOP = "calc(56px + env(safe-area-inset-top, 0px))";
const BAR_H = 52;

export function TabbedMegaMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef, sections, close } = nav;
  const [tab, setTab] = useState(0);
  const active = sections[tab] ?? sections[0];

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} weight="light" />

      {/* The bar. Always present so the trigger never moves. */}
      <div
        className="absolute left-0 right-0 flex items-center gap-2 px-3"
        style={{
          top: BAR_TOP, height: BAR_H, zIndex: 70, pointerEvents: "auto",
          background: open ? "rgba(11,11,26,0.97)" : "transparent",
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
          style={{
            width: 40, height: 40,
            background: open ? ROYAL.goldFaint : ROYAL.panel,
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${ROYAL.goldSoft}`,
          }}
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
              top: `calc(${BAR_TOP} + ${BAR_H}px)`, pointerEvents: "auto",
              maxHeight: `calc(100% - ${BAR_TOP} - ${BAR_H}px)`,
              background: "linear-gradient(180deg, rgba(11,11,26,0.97), rgba(7,7,19,0.97))",
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
            <div className="grid" style={{ gridTemplateColumns: "148px 1fr", minHeight: 200 }}>
              <div className="flex flex-col gap-0.5 p-2 overflow-y-auto"
                   style={{ borderRight: `1px solid ${ROYAL.hairline}` }}>
                {sections.map((s, i) => (
                  <button
                    key={s.label}
                    onClick={() => setTab(i)}
                    onPointerEnter={() => setTab(i)}
                    className="text-left rounded-[9px] truncate uppercase"
                    style={{
                      padding: "9px 10px",
                      fontFamily: HEADING, fontSize: 11.5, fontWeight: 900, letterSpacing: "-0.03em",
                      color: tab === i ? ROYAL.gold : ROYAL.dim,
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
                    <h4 className="mb-2 uppercase leading-none"
                        style={{
                          fontFamily: HEADING, fontSize: 14, fontWeight: 900,
                          letterSpacing: "-0.035em", color: ROYAL.gold,
                        }}>
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
                          className="flex items-center gap-2 py-1.5 uppercase"
                          style={{
                            fontFamily: HEADING, fontSize: 11.5, fontWeight: 800,
                            letterSpacing: "-0.015em", color: ROYAL.dim,
                          }}
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
