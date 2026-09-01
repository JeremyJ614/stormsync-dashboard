import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Lock, X } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL, HEADING, EASE, SPRING } from "../../../lib/royal";

/**
 * Deck.
 *
 * The sections are dealt. One card leaves the trigger, arcs across the screen,
 * spins, and lands in its place in a grid — six times, a beat apart. Pick one
 * and it turns face up while the rest are swept off the table; its modules
 * cascade out from underneath it.
 *
 * Dealing is the right animation for a menu because it has a source. Most
 * ornate menus fade or explode from nowhere; a dealt card comes *from the
 * button you pressed*, which is what makes the whole thing feel caused rather
 * than merely animated.
 *
 * A 2x3 grid of cards is legible at any section count, and the second level is
 * a plain list, so 11 modules read exactly as well as 3. Nothing here paginates
 * and nothing overlaps.
 */
const CARD_H = 92;

export function DeckMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;
  const still = calm;

  // Where the cards come from: the trigger, in viewport coordinates, as an
  // offset from the centre of the grid.
  const [from, setFrom] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const measure = () => setFrom({
      x: window.innerWidth / 2 - 49,   // trigger sits 22px from the right, 54 wide
      y: window.innerHeight / 2 - 60,
    });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 60% at 50% 40%, rgba(24,58,44,0.55), transparent 70%)," +
            "linear-gradient(180deg, #06080a, #030406)",
          backdropFilter: "blur(15px)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: still ? 0 : 0.3 }}
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
            exit={{ opacity: 0, transition: { duration: still ? 0 : 0.16 } }}
          >
            <div className="px-6 pt-10 pb-3 shrink-0">
              <div className="text-[9.5px] uppercase tracking-[0.42em]" style={{ color: ROYAL.gold }}>
                StormSync
              </div>
              <div className="text-[21px] font-semibold leading-none mt-1"
                   style={{ color: ROYAL.text, fontFamily: HEADING }}>
                {current ? current.label : "Pick a hand"}
              </div>
              <div className="text-[11px] mt-1.5" style={{ color: ROYAL.dim }}>
                {current
                  ? `${current.items.length} module${current.items.length === 1 ? "" : "s"}`
                  : `${sections.length} sections · ${sections.reduce((t, s) => t + s.items.length, 0)} modules`}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <AnimatePresence mode="wait" initial={false}>
                {current ? (
                  <motion.div
                    key={`sec-${section}`}
                    className="max-w-md mx-auto space-y-2 pt-1"
                    initial={still ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: still ? 0 : 0.12 } }}
                  >
                    {current.items.map((it, i) => {
                      const Icon = it.icon;
                      return (
                        <motion.div
                          key={it.path}
                          // Modules slide out from under the turned card.
                          initial={still ? false : { opacity: 0, y: -18, rotate: -2.5, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                          transition={still ? { duration: 0 } : { ...SPRING, delay: 0.04 * i }}
                        >
                          <Link
                            href={it.path}
                            onClick={close}
                            className="flex items-center gap-3 rounded-xl px-3.5 h-[52px]"
                            style={{
                              background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
                              border: `1px solid ${ROYAL.hairline}`,
                              boxShadow: "0 1px 0 0 rgba(217,183,117,0.13) inset, 0 10px 22px -18px #000",
                            }}
                          >
                            <span className="grid place-items-center rounded-lg shrink-0"
                                  style={{ width: 32, height: 32, background: ROYAL.goldFaint, color: ROYAL.gold }}>
                              <Icon className="w-4 h-4" />
                            </span>
                            <span className="flex-1 min-w-0 truncate text-[13.5px] font-medium"
                                  style={{ color: ROYAL.text }}>
                              {it.label}
                            </span>
                            {it.locked
                              ? <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />
                              : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: ROYAL.dim }} />}
                          </Link>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                ) : (
                  <motion.div
                    key="deal"
                    className="max-w-md mx-auto grid grid-cols-2 gap-2.5 pt-1"
                    initial={false}
                    exit={{ opacity: 0, transition: { duration: still ? 0 : 0.12 } }}
                  >
                    {sections.map((s, i) => {
                      const Icon = s.icon;
                      return (
                        <motion.button
                          key={s.label}
                          onClick={() => openSection(i)}
                          className="relative rounded-2xl overflow-hidden text-left px-3.5 py-3 flex flex-col justify-between"
                          style={{
                            height: CARD_H,
                            background:
                              "linear-gradient(150deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02) 55%)," +
                              "linear-gradient(180deg, #0d1016, #080a0f)",
                            border: `1px solid ${ROYAL.hairline}`,
                            boxShadow: "0 14px 30px -20px #000, inset 0 1px 0 rgba(255,255,255,0.08)",
                          }}
                          // Dealt: from the trigger, face down, spinning into place.
                          initial={still ? false : {
                            opacity: 0,
                            x: from.x, y: from.y,
                            rotate: -180 + i * 9,
                            scale: 0.55,
                          }}
                          animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
                          transition={still ? { duration: 0 } : {
                            type: "spring", stiffness: 240, damping: 26, delay: 0.06 * i,
                          }}
                          whileTap={still ? undefined : { scale: 0.97 }}
                        >
                          {/* The corner pip, like an index on a playing card. */}
                          <span className="absolute top-2 right-2.5 text-[10px] tabular-nums"
                                style={{ color: ROYAL.dim }}>
                            {s.items.length}
                          </span>
                          {/* A champagne seam across the face. */}
                          <span aria-hidden className="absolute inset-x-0 top-0 h-px"
                                style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
                          <span className="grid place-items-center rounded-lg"
                                style={{ width: 30, height: 30, background: ROYAL.goldFaint,
                                         border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="block text-[13px] font-semibold leading-tight"
                                style={{ color: ROYAL.text, fontFamily: HEADING }}>
                            {s.label}
                          </span>
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {section !== null && (
              <div className="shrink-0 px-5 pb-4">
                <button onClick={back}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
                  style={{ color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(255,255,255,0.03)" }}>
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to the table
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => toggle()}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-2xl"
        style={{
          right: 22, bottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          width: 54, height: 54, zIndex: 80,
          background: open ? "rgba(180,69,31,0.92)" : "rgba(8,8,18,0.94)",
          border: `1px solid ${open ? "rgba(255,255,255,0.35)" : ROYAL.goldSoft}`,
          color: open ? "#fff" : ROYAL.gold,
          boxShadow: "0 10px 26px rgba(0,0,0,.55)",
          pointerEvents: "auto",
        }}
      >
        {open ? <X className="w-5 h-5" /> : <DeckGlyph calm={still} />}
      </button>
    </div>
  );
}

/** Three cards, the top one lifting off the stack and settling back. */
function DeckGlyph({ calm }: { calm: boolean }) {
  return (
    <span className="relative block" style={{ width: 20, height: 20 }} aria-hidden>
      {[2, 1, 0].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-[3px]"
          style={{
            width: 13, height: 18, left: 3 + i * 1.5, top: 1 - i * 0.5,
            background: i === 0 ? ROYAL.gold : "transparent",
            border: `1.4px solid ${ROYAL.gold}`,
            opacity: i === 0 ? 1 : 0.45,
          }}
          animate={calm || i !== 0 ? undefined : { x: [0, 6, 0], y: [0, -4, 0], rotate: [0, 14, 0] }}
          transition={calm ? undefined : { duration: 2.4, repeat: Infinity, ease: EASE, times: [0, 0.45, 1] }}
        />
      ))}
    </span>
  );
}

export default DeckMenu;
