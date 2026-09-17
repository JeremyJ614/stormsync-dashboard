import { useMemo } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Lock } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { entriesFor, moduleCount } from "./entries";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Neon.
 *
 * A sign on a wet street at two in the morning. Sections are tubes; they strike
 * one after another when the menu opens, and one of them never quite settles.
 *
 * What makes drawn neon look like neon is not the colour, it is the falloff. A
 * real tube is a near-white core inside a saturated envelope that reaches a long
 * way and dies slowly, so each label carries five stacked shadows at increasing
 * radius and decreasing opacity rather than one big blur. Below that, the same
 * light lands on the street: a flipped, blurred, heavily faded copy, masked so
 * it dissolves within a couple of inches. Both together are what put the sign in
 * a place rather than on a background.
 *
 * The strike is modelled too. A cold tube does not fade up — it catches, drops
 * out, catches again and then holds, all inside about a fifth of a second. And
 * exactly one tube per opening is given a fault: a slow arrhythmic buzz that
 * never resolves, chosen from the section list so it is stable while the menu is
 * open and different next time. A sign where every tube is perfect reads as a
 * graphic; one bad tube reads as a sign.
 *
 * Under calm none of it fires: the tubes are simply lit, and nothing flickers at
 * someone who asked for less motion.
 */

/** Tube colours, warm to cool. Anchored on the app's champagne. */
const TUBES = ["#ffd489", "#b9b6ff", "#ff7ab8", "#7ef0e0", "#ffb46b", "#c9a5ff"];

/**
 * The falloff that makes a stroke read as a gas tube — at night, not at noon.
 *
 * This used to open with two pure-white stops and carry the colour out to 86px,
 * with the glyph itself filled near-white. That is how a tube looks
 * photographed with the exposure wide open: the core blows out, the halo covers
 * the frame, and everything ends up the same white. On a phone in the dark it
 * was the brightest screen in the app by a distance.
 *
 * A real sign on a real street is mostly its COLOUR. The core keeps one thin
 * warm stop so the tube still has a filament, the halo is shorter and lands
 * nearer the glass, and the glyph is filled with the colour rather than with
 * white — which is what lets the eye read "red tube" instead of "bright thing".
 */
function glow(c: string, scale = 1): string {
  return [
    `0 0 ${1.5 * scale}px rgba(255,252,244,0.9)`,
    `0 0 ${5 * scale}px ${c}`,
    `0 0 ${12 * scale}px ${c}`,
    `0 0 ${26 * scale}px ${c}`,
    `0 0 ${44 * scale}px ${c}`,
  ].join(", ");
}

/**
 * The tube's own glass colour, a shade off white so it still looks lit.
 * Filling with the hue itself would go muddy; filling with white blows out.
 */
function tubeFill(c: string): string {
  return `color-mix(in srgb, ${c} 62%, #fff8ec)`;
}

/** A tube striking: catch, drop, catch, hold. */
const STRIKE = { opacity: [0, 1, 0.15, 1, 0.5, 1], filter: ["brightness(0.4)", "brightness(1.12)", "brightness(0.5)", "brightness(1.04)", "brightness(0.8)", "brightness(1)"] };
const STRIKE_TIMES = [0, 0.12, 0.2, 0.34, 0.46, 1];
/** The faulty tube. Deliberately arrhythmic, so it never looks like a loop. */
const FAULT = { opacity: [1, 1, 0.28, 1, 1, 1, 0.4, 0.9, 1, 1] };
const FAULT_TIMES = [0, 0.42, 0.44, 0.47, 0.62, 0.71, 0.73, 0.76, 0.79, 1];

export function NeonMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, toggle, close, openSection, back, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  // Which tube is broken. Chosen from the length so it holds still while the
  // menu is open, and lands somewhere else the next time the set changes.
  const faulty = useMemo(
    () => (entries.length ? (entries.length * 7 + (section ?? 0) * 3) % entries.length : -1),
    [entries.length, section],
  );

  // Tube size has to answer to the longest word as well as the count: at 26px
  // "Environmental & Model Data" ran straight through both sides of the sign,
  // and a sign whose letters escape its own frame is not a sign.
  const longest = entries.reduce((m, e) => Math.max(m, e.label.length), 0);
  const byCount = entries.length <= 7 ? 26 : entries.length <= 10 ? 21 : 18;
  const byWidth = longest > 24 ? 15 : longest > 19 ? 18 : longest > 15 ? 21 : 26;
  const fontSize = Math.min(byCount, byWidth);

  const sign = (
    <div className="flex flex-col items-center gap-0.5">
      {entries.map((e, i) => {
        const Icon = e.icon;
        const c = TUBES[i % TUBES.length];
        const isFault = i === faulty;

        const label = (
          <span className="flex items-baseline gap-2.5">
            <Icon
              style={{
                width: fontSize * 0.62, height: fontSize * 0.62, color: c,
                filter: `drop-shadow(0 0 1.5px rgba(255,252,244,0.85)) drop-shadow(0 0 7px ${c}) drop-shadow(0 0 16px ${c})`,
                alignSelf: "center",
              }}
            />
            <span
              style={{
                fontFamily: HEADING, fontSize, fontWeight: 700, letterSpacing: "0.06em",
                color: tubeFill(c), textShadow: glow(c, fontSize / 24),
                whiteSpace: "nowrap",
              }}
            >
              {e.label}
            </span>
            {e.count > 0 && (
              <span
                className="tabular-nums"
                style={{ fontSize: fontSize * 0.42, color: c, textShadow: glow(c, 0.5), opacity: 0.9 }}
              >
                {e.count}
              </span>
            )}
            {e.locked && <Lock style={{ width: 12, height: 12, color: c, opacity: 0.8 }} />}
          </span>
        );

        const cls = "relative px-3 py-1.5 max-w-full overflow-hidden";

        return (
          <motion.div
            key={e.key}
            initial={calm ? false : { opacity: 0 }}
            animate={calm ? { opacity: 1 } : isFault ? FAULT : STRIKE}
            exit={calm ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.12 } }}
            transition={calm ? { duration: 0 } : isFault
              ? { duration: 5.5, times: FAULT_TIMES, repeat: Infinity, delay: 0.9 + i * 0.13, ease: "linear" }
              : { duration: 0.62, times: STRIKE_TIMES, delay: i * 0.13, ease: "linear" }}
          >
            {e.to
              ? <Link href={e.to} onClick={close} className={cls}>{label}</Link>
              : <button onClick={() => openSection(e.index)} className={cls}>{label}</button>}
          </motion.div>
        );
      })}
    </div>
  );

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0 overflow-hidden"
        style={{
          // Wet asphalt: a cold ground with a warm pool of light under the sign.
          background:
            `radial-gradient(120% 55% at 50% 34%, rgba(255,190,120,0.06), transparent 62%),` +
            `radial-gradient(90% 40% at 50% 104%, rgba(150,140,255,0.055), transparent 70%),` +
            `linear-gradient(180deg, #05040a 0%, #07060f 52%, #0a0812 100%)`,
          backgroundColor: "#05040a",
          backdropFilter: "blur(18px)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.34 }}
        onClick={close}
        aria-hidden={!open}
      >
        {/* Brickwork, barely there — enough that the light has something to
            fall on. Without a surface the glow floats in a void. */}
        <span
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              `repeating-linear-gradient(0deg, rgba(255,255,255,0.022) 0 1px, transparent 1px 26px),` +
              `repeating-linear-gradient(90deg, rgba(255,255,255,0.016) 0 1px, transparent 1px 54px)`,
            maskImage: "radial-gradient(120% 70% at 50% 34%, #000 20%, transparent 78%)",
            WebkitMaskImage: "radial-gradient(120% 70% at 50% 34%, #000 20%, transparent 78%)",
          }}
          aria-hidden
        />
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute inset-0 flex flex-col items-center justify-center px-4"
            style={{ pointerEvents: "auto" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.16 } }}
            aria-label="Navigation"
          >
            {/* The sign's own tubing — a rectangle of gas around the whole set,
                struck first, so everything after it reads as inside a sign. */}
            <motion.div
              className="relative px-6 py-6 rounded-[22px]"
              style={{
                border: `1.6px solid #ffd489`,
                boxShadow:
                  `0 0 2px rgba(255,246,224,0.8), 0 0 10px rgba(255,212,137,0.55), 0 0 26px rgba(255,212,137,0.25),` +
                  `inset 0 0 18px rgba(255,212,137,0.18)`,
                maxWidth: "min(94vw, 460px)",
              }}
              initial={calm ? false : { opacity: 0 }}
              animate={calm ? { opacity: 1 } : STRIKE}
              transition={calm ? { duration: 0 } : { duration: 0.5, times: STRIKE_TIMES, ease: "linear" }}
            >
              <div
                className="absolute left-1/2 -translate-x-1/2 px-3 text-[9px] uppercase tracking-[0.44em]"
                style={{
                  top: -7, background: "#05040a", color: "#ffd489",
                  textShadow: "0 0 1.5px rgba(255,252,244,0.85), 0 0 8px #ffd489, 0 0 18px #ffd489",
                }}
              >
                {current ? current.label : "StormSync"}
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={current ? `s${section}` : "top"}
                            initial={calm ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={calm ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.1 } }}>
                  {sign}
                </motion.div>
              </AnimatePresence>

              <div
                className="mt-3 pt-2.5 text-center text-[9px] uppercase tracking-[0.3em]"
                style={{ borderTop: "1px solid rgba(255,212,137,0.18)", color: "rgba(255,212,137,0.55)" }}
              >
                {current ? `${entries.length} inside` : `${moduleCount(nav)} modules · open all night`}
              </div>
            </motion.div>

            {/* The street. A flipped copy, blurred and cut off quickly, because
                the reflection is what puts the sign somewhere. */}
            {!calm && (
              <div
                className="pointer-events-none select-none mt-1"
                style={{
                  transform: "scaleY(-1)",
                  filter: "blur(7px) saturate(1.25)",
                  opacity: 0.24,
                  maskImage: "linear-gradient(0deg, transparent 4%, #000 96%)",
                  WebkitMaskImage: "linear-gradient(0deg, transparent 4%, #000 96%)",
                  maxHeight: 120, overflow: "hidden",
                  maxWidth: "min(94vw, 460px)",
                }}
                aria-hidden
              >
                {sign}
              </div>
            )}

            {section !== null && (
              <button
                onClick={back}
                className="mt-5 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] uppercase tracking-[0.22em]"
                style={{
                  color: "#b9b6ff",
                  border: "1px solid rgba(185,182,255,0.5)",
                  textShadow: "0 0 3px #fff, 0 0 12px #b9b6ff",
                  boxShadow: "0 0 12px rgba(185,182,255,0.35), inset 0 0 10px rgba(185,182,255,0.12)",
                }}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back outside
              </button>
            )}
          </motion.nav>
        )}
      </AnimatePresence>

      {/* The trigger is the door sign, and it says what it will do. */}
      <button
        onClick={toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-lg"
        style={{
          right: 22, bottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          minWidth: 74, height: 44, padding: "0 12px", zIndex: 80, pointerEvents: "auto",
          background: "rgba(7,6,15,0.94)",
          border: `1.4px solid ${open ? "#ff7ab8" : "#7ef0e0"}`,
          boxShadow: open
            ? "0 0 4px #fff, 0 0 16px rgba(255,122,184,0.8), 0 0 40px rgba(255,122,184,0.35)"
            : "0 0 4px #fff, 0 0 16px rgba(126,240,224,0.8), 0 0 40px rgba(126,240,224,0.35)",
          transition: calm ? "none" : "border-color .3s, box-shadow .3s",
        }}
      >
        <motion.span
          className="text-[11px] font-bold uppercase tracking-[0.26em]"
          style={{
            color: "#fffdf6",
            textShadow: glow(open ? "#ff7ab8" : "#7ef0e0", 0.62),
          }}
          initial={false}
          animate={calm ? { opacity: 1 } : { opacity: [1, 1, 0.45, 1, 1] }}
          transition={calm ? { duration: 0 } : { duration: 6.5, times: [0, 0.7, 0.72, 0.75, 1], repeat: Infinity, ease: EASE }}
        >
          {open ? "Closed" : "Open"}
        </motion.span>
      </button>
    </div>
  );
}
