import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronUp, Lock } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { entriesFor, moduleCount } from "./entries";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Elevator.
 *
 * A shaft in section. Sections are floors; the car travels to whichever one you
 * pick and the doors open onto the modules on it.
 *
 * The version this came from was almost entirely black: floors were bare rows on
 * a flat ground, so nothing had an edge and the lift had no structure to run in.
 * Everything here has a border and every border is doing a job. Guide rails run
 * the full height with bolt plates at each floor. Each floor is a bordered plate
 * with a milled number badge and a threshold strip at its foot. The car is a lit
 * box with a visible frame, and it moves — a spring with real settle, because a
 * lift arriving is the one motion everybody has felt and a linear tween reads as
 * wrong immediately.
 *
 * The doors are the entrance. Two brushed panels part from a seam down the
 * middle, with the seam's shadow travelling with them; they close again on the
 * way out. That is the wow, and it costs two divs.
 *
 * The indicator above the doors shows where the car is and which way it is
 * going, which also makes the second level legible: on a floor, the panel reads
 * that floor's number and the modules are the doors along the corridor.
 *
 * WHY THIS IS FASTER THAN IT WAS
 * The lift felt like it lagged, and none of the four reasons were the spring:
 *
 *   • The backdrop carried `backdrop-filter: blur(16px)` UNDER AN OPAQUE
 *     GRADIENT. Nothing behind it was ever visible through it, so the blur was
 *     invisible by construction — but the compositor still resolved a
 *     full-screen blur of the entire app on every frame, while two full-height
 *     brushed-metal doors were travelling over the top of it. That was the
 *     jank. It is gone; the picture is pixel-for-pixel identical.
 *
 *   • The floor plates waited 280ms before starting, which is the beat the
 *     doors need on the way in — but it was also being paid on every floor
 *     change, when the doors are already open and there is nothing to wait for.
 *     The delay is now conditional on the doors actually being shut.
 *
 *   • The stagger was uncapped, so the last plate of a long section started
 *     more than half a second after the first. It is capped now, the same way
 *     the dashboard wall and the SSWXCon ring are.
 *
 *   • The call button animated `box-shadow` on an infinite loop, which cannot
 *     be composited: it repaints, for ever, whether the menu is open or not.
 *     The glow is now a sibling span with a fixed shadow whose OPACITY is
 *     animated, which the compositor takes.
 *
 * The car keeps its spring. It is the one motion here that is supposed to have
 * weight; it was simply arriving after everything else had given up waiting.
 */
const FLOOR_H = 62;

/** Brushed metal: a fine vertical grain over a shallow gradient. */
const BRUSHED =
  `repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px),` +
  `linear-gradient(180deg, #1a1a26, #101019 45%, #0a0a12)`;

export function ElevatorMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  // The doors are shut before the shaft is revealed and shut again on the way
  // out, so `open` alone cannot drive them — they need a beat of their own.
  const [parted, setParted] = useState(false);
  useEffect(() => {
    if (!open) { setParted(false); return; }
    if (calm) { setParted(true); return; }
    const t = setTimeout(() => setParted(true), 110);
    return () => clearTimeout(t);
  }, [open, calm]);

  const floors = sections.length;
  const carAt = section ?? 0;

  // The floors are behind the doors on the way in and have to wait for them.
  // On a floor change the doors are already open, so there is nothing to wait
  // for and the plates should move the instant the choice is made.
  const lead = calm || parted ? 0.02 : 0.2;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, #0b0b14, #05050b)`,
          backgroundColor: "#05050b",
          // No backdrop-filter: this gradient is opaque, so a blur behind it
          // was a full-screen filter pass per frame that nothing could see.
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.28 }}
        onClick={close}
        aria-hidden={!open}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute inset-0 flex flex-col"
            style={{ pointerEvents: "auto" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.16 } }}
          >
            {/* ── the indicator panel ───────────────────────────────────── */}
            <div className="shrink-0 pt-8 px-5">
              <div
                className="mx-auto flex items-center gap-3 rounded-lg px-3.5 py-2"
                style={{
                  maxWidth: 300,
                  background: "linear-gradient(180deg, #14141f, #0b0b13)",
                  border: `1px solid rgba(217,183,117,0.28)`,
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 22px -14px #000`,
                }}
              >
                <motion.span
                  style={{ color: ROYAL.gold }}
                  animate={calm ? {} : { opacity: [0.35, 1, 0.35], y: [1, -1, 1] }}
                  transition={calm ? { duration: 0 } : { duration: 1.4, repeat: Infinity, ease: EASE }}
                >
                  <ChevronUp className="w-4 h-4" />
                </motion.span>
                <span
                  className="tabular-nums font-bold"
                  style={{
                    fontFamily: HEADING, fontSize: 20, letterSpacing: "0.12em",
                    color: ROYAL.gold, textShadow: `0 0 12px rgba(217,183,117,0.55)`,
                  }}
                >
                  {String(floors - carAt).padStart(2, "0")}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-[11.5px] font-medium" style={{ color: ROYAL.text }}>
                    {current ? current.label : "Select a floor"}
                  </span>
                  <span className="block text-[8.5px] uppercase tracking-[0.28em] mt-0.5" style={{ color: ROYAL.dim }}>
                    {current ? `${entries.length} on this floor` : `${floors} floors · ${moduleCount(nav)} modules`}
                  </span>
                </span>
              </div>
            </div>

            {/* ── the shaft ─────────────────────────────────────────────── */}
            <div className="flex-1 min-h-0 relative mt-4 mx-4 mb-4">
              {/* The shaft wall. Without it the space between and below the
                  floor plates is bare black, which is what made the original
                  read as a list rather than as a lift. */}
              <div
                className="absolute inset-0 rounded-md pointer-events-none"
                style={{
                  background:
                    `repeating-linear-gradient(180deg, rgba(255,255,255,0.022) 0 1px, transparent 1px 8px),` +
                    `linear-gradient(90deg, #0e0e17, #0a0a12 30%, #0a0a12 70%, #0e0e17)`,
                  border: `1px solid ${ROYAL.hairline}`,
                  boxShadow: "inset 0 14px 26px -18px #000, inset 0 -14px 26px -18px #000",
                }}
                aria-hidden
              />
              {/* Guide rails, full height, with a bolt plate at every floor. */}
              {[0, 1].map((side) => (
                <div
                  key={side}
                  className="absolute top-0 bottom-0"
                  style={{
                    [side ? "right" : "left"]: 0, width: 12,
                    background: "linear-gradient(90deg, #16161f, #0d0d15 60%, #08080e)",
                    border: `1px solid ${ROYAL.hairline}`,
                    borderRadius: 3,
                  }}
                  aria-hidden
                >
                  {Array.from({ length: Math.max(floors, entries.length) }, (_, i) => (
                    <span
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        left: 3.5, top: 18 + i * FLOOR_H, width: 3, height: 3,
                        background: ROYAL.goldSoft,
                      }}
                    />
                  ))}
                </div>
              ))}

              <div className="absolute inset-x-[18px] inset-y-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {/* The car. Behind the floor plates, lit, and it travels. */}
                {!calm && section !== null && (
                  <motion.div
                    className="absolute left-0 right-0 rounded-md pointer-events-none"
                    style={{
                      height: FLOOR_H - 6,
                      background: "linear-gradient(180deg, rgba(217,183,117,0.16), rgba(217,183,117,0.05))",
                      border: `1px solid ${ROYAL.goldSoft}`,
                      boxShadow: `0 0 26px -6px ${ROYAL.gold}`,
                    }}
                    initial={{ top: 3 }}
                    animate={{ top: 3 + carAt * FLOOR_H }}
                    // Still a lift: it overshoots a little and settles. Just
                    // one that reaches the floor while you are still looking.
                    transition={{ type: "spring", stiffness: 170, damping: 19 }}
                    aria-hidden
                  />
                )}

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={current ? `s${section}` : "top"}
                    initial={calm ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={calm ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.08 } }}
                  >
                    {entries.map((e, i) => {
                      const Icon = e.icon;
                      const num = entries.length - i;

                      const inner = (
                        <>
                          {/* Milled floor badge. */}
                          <span
                            className="grid place-items-center shrink-0 rounded-md tabular-nums font-bold"
                            style={{
                              width: 42, height: 38, fontSize: 14,
                              background: "linear-gradient(180deg, #1b1b27, #0e0e17)",
                              border: `1px solid ${ROYAL.hairline}`,
                              color: ROYAL.dim,
                              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
                            }}
                          >
                            {String(num).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-medium" style={{ color: ROYAL.text }}>
                              {e.label}
                            </span>
                            <span className="block text-[8.5px] uppercase tracking-[0.26em] mt-0.5" style={{ color: ROYAL.dim }}>
                              {e.count > 0 ? `${e.count} module${e.count === 1 ? "" : "s"}` : e.to ? "open" : "floor"}
                            </span>
                          </span>
                          <span className="shrink-0 grid place-items-center rounded"
                                style={{ width: 26, height: 26, border: `1px solid ${ROYAL.hairline}`, color: ROYAL.gold }}>
                            {e.locked ? <Lock className="w-3 h-3" style={{ color: ROYAL.dim }} /> : <Icon className="w-3.5 h-3.5" />}
                          </span>
                        </>
                      );

                      const plate: React.CSSProperties = {
                        height: FLOOR_H - 6,
                        background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012))",
                        border: `1px solid ${ROYAL.hairline}`,
                        // The threshold strip at the foot of each plate — the
                        // detail that makes a row read as a landing.
                        borderBottom: `2px solid rgba(217,183,117,0.22)`,
                        borderRadius: 8,
                      };

                      return (
                        <motion.div
                          key={e.key}
                          style={{ height: FLOOR_H, paddingTop: 3 }}
                          initial={calm ? false : { opacity: 0, x: 26 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={calm ? { duration: 0 } : {
                            type: "spring", stiffness: 320, damping: 26,
                            // `lead` is the wait for the doors, and it is only
                            // owed once. `stagger` is capped so a long section
                            // still finishes before the doors do.
                            delay: lead + Math.min(i * 0.035, 0.34),
                          }}
                        >
                          {e.to ? (
                            <Link href={e.to} onClick={close}
                                  className="flex items-center gap-3 px-3 relative" style={plate}>{inner}</Link>
                          ) : (
                            <button onClick={() => openSection(e.index)}
                                    className="w-full flex items-center gap-3 px-3 text-left relative" style={plate}>{inner}</button>
                          )}
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* ── the doors ───────────────────────────────────────────── */}
              {[0, 1].map((side) => (
                <motion.div
                  key={side}
                  className="absolute inset-y-0 pointer-events-none"
                  style={{
                    [side ? "right" : "left"]: 12, width: "calc(50% - 12px)",
                    background: BRUSHED,
                    borderLeft: side ? `1px solid rgba(217,183,117,0.35)` : `1px solid ${ROYAL.hairline}`,
                    borderRight: side ? `1px solid ${ROYAL.hairline}` : `1px solid rgba(217,183,117,0.35)`,
                    boxShadow: side ? "-14px 0 26px -18px #000" : "14px 0 26px -18px #000",
                  }}
                  initial={{ x: 0 }}
                  animate={{ x: parted ? (side ? "100%" : "-100%") : 0 }}
                  transition={calm ? { duration: 0 } : { duration: 0.46, ease: [0.65, 0, 0.35, 1] }}
                  aria-hidden
                />
              ))}
            </div>

            {section !== null && (
              <div className="shrink-0 px-5 pb-5">
                <button
                  onClick={back}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
                  style={{ color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(255,255,255,0.03)" }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Lobby
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The call button, complete with its ring. */}
      <button
        onClick={toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-xl"
        style={{
          right: 22, bottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          width: 56, height: 56, zIndex: 80, pointerEvents: "auto",
          background: "linear-gradient(180deg, #16161f, #0a0a12)",
          border: `1px solid ${open ? "rgba(255,255,255,0.3)" : ROYAL.goldSoft}`,
          boxShadow: "0 10px 26px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        {/* The glow is its own span with a FIXED shadow and an animated
            opacity. Animating `box-shadow` itself, as this did, is a repaint
            every frame of an loop that never ends — the one animation in the
            app that was running even with the menu shut. */}
        <motion.span
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 30, height: 30,
            boxShadow: open
              ? "0 0 14px 2px rgba(255,255,255,0.35)"
              : "0 0 14px 2px rgba(217,183,117,0.55)",
          }}
          initial={false}
          animate={calm ? { opacity: 0 } : { opacity: [0, 1, 0] }}
          transition={calm ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: EASE }}
        />
        <span
          className="relative grid place-items-center rounded-full"
          style={{
            width: 30, height: 30,
            border: `1.5px solid ${open ? "#fff" : ROYAL.gold}`,
            color: open ? "#fff" : ROYAL.gold,
          }}
        >
          <motion.span initial={false} animate={{ rotate: open ? 180 : 0 }}
                       transition={calm ? { duration: 0 } : { duration: 0.4, ease: EASE }}>
            <ChevronUp className="w-4 h-4" />
          </motion.span>
        </span>
      </button>
    </div>
  );
}
