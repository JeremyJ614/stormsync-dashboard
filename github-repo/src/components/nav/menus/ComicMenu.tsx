import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Lock } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { entriesFor, moduleCount } from "./entries";
import { EASE } from "../../../lib/royal";

/**
 * Comic.
 *
 * A page of panels. Hard, unsmoothed motion — panels snap into place rather
 * than easing, because easing is exactly what comic panels do not do.
 *
 * Two changes from the version this came from. The panels are much smaller and
 * laid out three across rather than two, so a whole section fits on the page
 * instead of two modules filling a phone; a comic page is dense by nature and a
 * grid of four huge boxes was neither dense nor comic. And it is drawn much
 * harder: white gutters between black-ruled panels, a real halftone screen at an
 * angle over each one, hand-lettered caption boxes in the corner rather than
 * centred labels, speed lines radiating behind the icon, and a starburst on the
 * section you are opening. The old version had a halftone and stopped there.
 *
 * The palette leaves the royal ground on purpose. Everything else in the set is
 * champagne on indigo; this one is newsprint, because a comic that is tasteful
 * is not a comic. It keeps the app's gold only as the ink for the caption boxes.
 */

/** The screen. Angled, because a halftone parallel to the panel reads as a grid. */
const HALFTONE =
  "radial-gradient(circle, rgba(0,0,0,0.30) 0.9px, transparent 1.3px) 0 0 / 5px 5px";
const NEWSPRINT = "#f4efe2";
const INK = "#0d0b12";

/** Panel fills, cycled. Flat, saturated, printed-looking. */
const FILLS = [
  "#ffd23f", "#4cc9f0", "#ff6b6b", "#8ac926", "#c77dff", "#ffa552",
  "#5ce1e6", "#ff8fab", "#a0c4ff", "#ffd6a5", "#9bf6ff",
];

export function ComicMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, toggle, close, openSection, back, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          // The page is dark, and the panels are the only bright thing on it.
          //
          // This was a full-bleed sheet of newsprint, which is what a comic
          // actually is — and which made the menu the single most glaring
          // screen in an app that is otherwise near-black. Opening it at night
          // was unpleasant. The panels keep their printed colours and their
          // newsprint gutters; what changes is what surrounds them, so the ink
          // now reads as a comic laid on a dark table rather than a lightbox.
          background:
            `radial-gradient(120% 85% at 50% 32%, rgba(58,50,74,0.55), transparent 70%),` +
            `linear-gradient(160deg, #14111c, #0a0810)`,
          backgroundColor: INK,
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.2 }}
        onClick={close}
        aria-hidden={!open}
      />

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute inset-0 flex flex-col justify-center px-3"
            style={{ pointerEvents: "auto" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.12 } }}
            aria-label="Navigation"
          >
            {/* The title block, ruled like a masthead. */}
            <div
              className="mb-2.5 px-3 py-2 mx-auto w-full"
              // Same measure as the panel grid: a masthead wider than the strip
              // it heads reads as a different page.
              style={{ maxWidth: 348, background: INK, border: `3px solid ${INK}`,
                       boxShadow: `4px 4px 0 rgba(0,0,0,0.35)` }}
            >
              <div className="text-[8.5px] uppercase tracking-[0.4em]" style={{ color: "#d9b775" }}>
                {current ? "Meanwhile…" : "StormSync presents"}
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[19px] font-black uppercase leading-none tracking-[-0.01em]"
                      style={{ color: NEWSPRINT }}>
                  {current ? current.label : "Navigate!"}
                </span>
                <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: "#d9b775" }}>
                  {current ? `${entries.length} pt` : `${moduleCount(nav)} pt`}
                </span>
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current ? `s${section}` : "top"}
                // A touch smaller than before: the panels were filling the
                // width edge to edge, and a comic page has a margin.
                className="grid grid-cols-3 gap-1.5 content-center mx-auto w-full"
                style={{ maxWidth: 348 }}
                initial={calm ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={calm ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.1 } }}
              >
                {entries.map((e, i) => {
                  const Icon = e.icon;
                  const fill = FILLS[i % FILLS.length];
                  const tilt = (i % 3 === 0 ? -1.4 : i % 3 === 1 ? 0.9 : -0.6);

                  const inner = (
                    <>
                      <span className="pointer-events-none absolute inset-0"
                            style={{ background: HALFTONE, mixBlendMode: "multiply", opacity: 0.55 }} aria-hidden />
                      {/* Speed lines behind the icon — the cheapest and most
                          effective comic cue there is. */}
                      <span className="pointer-events-none absolute inset-0" aria-hidden
                            style={{
                              background: `repeating-conic-gradient(from 0deg at 50% 38%, ${INK}22 0 2deg, transparent 2deg 13deg)`,
                              maskImage: "radial-gradient(circle at 50% 38%, transparent 26%, #000 62%, transparent 78%)",
                              WebkitMaskImage: "radial-gradient(circle at 50% 38%, transparent 26%, #000 62%, transparent 78%)",
                            }} />

                      <span className="relative grid place-items-center" style={{ height: "56%" }}>
                        <Icon style={{ width: 24, height: 24, color: INK, strokeWidth: 2.4 }} />
                      </span>

                      {/* Caption box, bottom-left, overhanging the rule. */}
                      <span
                        className="absolute left-[-2px] bottom-[-2px] right-[-2px] px-1.5 py-1"
                        style={{ background: NEWSPRINT, borderTop: `3px solid ${INK}` }}
                      >
                        <span
                          className="block text-center font-black uppercase leading-[1.05] overflow-hidden"
                          style={{
                            fontSize: 8, letterSpacing: "0.02em", color: INK,
                            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                          }}
                        >
                          {e.label}
                        </span>
                      </span>

                      {e.count > 0 && (
                        <span
                          className="absolute -top-1.5 -right-1.5 grid place-items-center font-black tabular-nums"
                          style={{
                            width: 20, height: 20, fontSize: 9, color: INK,
                            background: NEWSPRINT, border: `2.5px solid ${INK}`, borderRadius: "50%",
                          }}
                        >
                          {e.count}
                        </span>
                      )}
                      {e.locked && (
                        <span className="absolute -top-1.5 -right-1.5 grid place-items-center"
                              style={{ width: 20, height: 20, background: NEWSPRINT, border: `2.5px solid ${INK}`, borderRadius: "50%" }}>
                          <Lock style={{ width: 9, height: 9, color: INK }} />
                        </span>
                      )}
                    </>
                  );

                  const panel: React.CSSProperties = {
                    background: fill,
                    border: `3px solid ${INK}`,
                    boxShadow: `3px 3px 0 rgba(13,11,18,0.85)`,
                  };

                  return (
                    <motion.div
                      key={e.key}
                      className="relative"
                      style={{ aspectRatio: "1 / 1.02" }}
                      initial={calm ? false : { scale: 0.25, opacity: 0, rotate: tilt * 7 }}
                      animate={{ scale: 1, opacity: 1, rotate: tilt }}
                      // Exit is a duration, not the entry spring. A spring is
                      // only "finished" once it settles, and AnimatePresence in
                      // wait mode holds the incoming page until then — the swap
                      // between levels took the better part of a second, which
                      // is the opposite of what this style is for.
                      exit={calm ? { opacity: 0 } : { scale: 0.25, opacity: 0, transition: { duration: 0.11, ease: "easeIn" } }}
                      // Very stiff, very little damping: panels arrive with a
                      // report rather than a glide.
                      transition={calm ? { duration: 0 } : {
                        type: "spring", stiffness: 620, damping: 19, delay: i * 0.035,
                      }}
                      whileTap={calm ? undefined : { scale: 0.9, rotate: 0 }}
                    >
                      {e.to
                        ? <Link href={e.to} onClick={close} aria-label={e.label}
                                className="absolute inset-0 flex flex-col overflow-visible" style={panel}>{inner}</Link>
                        : <button onClick={() => openSection(e.index)} aria-label={e.label}
                                  className="absolute inset-0 flex flex-col overflow-visible" style={panel}>{inner}</button>}
                    </motion.div>
                  );
                })}
              </motion.div>
            </AnimatePresence>

            {section !== null && (
              <button
                onClick={back}
                className="mt-3 mx-1 self-start flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]"
                style={{ background: INK, color: NEWSPRINT, border: `3px solid ${INK}`, boxShadow: "3px 3px 0 rgba(13,11,18,0.35)" }}
              >
                <ChevronLeft className="w-3 h-3" /> Back a page
              </button>
            )}
          </motion.nav>
        )}
      </AnimatePresence>

      {/* The trigger is a starburst, and it says something. */}
      <button
        onClick={toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center"
        style={{
          right: 20, bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
          width: 62, height: 62, zIndex: 80, pointerEvents: "auto", background: "none", border: "none",
        }}
      >
        <motion.span
          className="absolute grid place-items-center"
          style={{
            width: 62, height: 62,
            background: open ? "#ff6b6b" : "#ffd23f",
            filter: `drop-shadow(3px 3px 0 ${INK})`,
            clipPath:
              "polygon(50% 0%, 61% 22%, 84% 13%, 79% 38%, 100% 50%, 79% 62%, 84% 87%, 61% 78%, 50% 100%, 39% 78%, 16% 87%, 21% 62%, 0% 50%, 21% 38%, 16% 13%, 39% 22%)",
          }}
          initial={false}
          animate={calm ? { rotate: 0 } : { rotate: open ? 22 : [0, -4, 4, 0] }}
          transition={calm ? { duration: 0 } : open
            ? { duration: 0.3, ease: EASE }
            : { duration: 3.4, repeat: Infinity, ease: EASE }}
        />
        <span
          className="relative font-black uppercase leading-none"
          style={{ fontSize: 12, color: INK, letterSpacing: "-0.02em", transform: "rotate(-8deg)" }}
        >
          {open ? "END!" : "GO!"}
        </span>
      </button>
    </div>
  );
}
