import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Compass, Lock } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { entriesFor, moduleCount } from "./entries";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Apex.
 *
 * A thumb-anchored arc. Press the trigger and it opens and stays open; tap a
 * node to choose it. Whatever is nearest the thumb magnifies like a dock, so it
 * is operable without looking down at the screen.
 *
 * It used to also be drivable by press-drag-release, and that mode is gone —
 * see `onTrigger` for why it made the arc feel like it had to be held.
 *
 * WHAT MADE THE ORIGINAL CRASH, AND WHY IT CANNOT HERE. It read a stats object
 * that could be undefined and dereferenced it during render, so any route where
 * that object was missing took the page to an error screen. The fix is not a
 * guard on that one field — it is that this version has no external data to read
 * at all. The readout above the arc is derived from the menu's own entries,
 * which the traversal guarantees exist, so there is nothing left that can be
 * absent. Everything else is bounded: the pointer resolves to an index or to
 * null and never to a guess, a release with no index closes rather than
 * navigating somewhere arbitrary, and every array access is checked.
 *
 * The other three bugs it shipped with were all in the drag path — stale drag
 * state, a tap being read as a drag because touch always jitters a few pixels,
 * and pointer capture surviving a drag that ended off-screen. Deleting that
 * path deletes all three along with the class of bug they came from: there is
 * no longer any gesture state to go stale, leak, or be misread.
 *
 * The style is the app's: a milled arc, champagne nodes, and a trigger that is a
 * ring gauge reading how far through the set your thumb currently is.
 */

/** The arc sweeps the top half, where a thumb actually reaches. */
const START_ANGLE = -166;
const END_ANGLE = -14;

export function ApexMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, toggle, close, openSection, back, calm, containerRef } = nav;
  const [, navigate] = useLocation();
  const entries = entriesFor(nav);
  const [hover, setHover] = useState<number | null>(null);

  const n = Math.max(1, entries.length);
  // A crowded arc needs a longer radius, or the nodes touch.
  const radius = Math.min(168, 108 + n * 7);
  const node = n > 8 ? 46 : 52;

  const angleFor = useCallback(
    (i: number) => (n <= 1 ? (START_ANGLE + END_ANGLE) / 2
      : START_ANGLE + (i / (n - 1)) * (END_ANGLE - START_ANGLE)),
    [n],
  );

  const posFor = useCallback((i: number) => {
    const r = (angleFor(i) * Math.PI) / 180;
    return { x: Math.cos(r) * radius, y: Math.sin(r) * radius };
  }, [angleFor, radius]);

  /** Act on an index, whether it came from a release or a tap. */
  const choose = useCallback((i: number) => {
    const e = entries[i];
    if (!e) return;
    if (e.to) { close(); setTimeout(() => navigate(e.to as string), 90); }
    else openSection(e.index);
  }, [entries, close, openSection, navigate]);

  /*
   * The trigger is a plain toggle.
   *
   * It used to be press-drag-release: pressing opened the arc, moving more than
   * twelve pixels armed a selection, and lifting either went somewhere or shut
   * the menu. On a thumb that is not a choice you opt into — a press is never
   * perfectly still, so almost every open ended in a release that closed the
   * thing you had just opened, and the only way to keep the arc up was to hold
   * your thumb down. Hence "you have to hold it".
   *
   * Press opens and it stays open. The nodes are ordinary buttons, so a tap
   * picks one and a tap anywhere else, or on the trigger again, closes. Nothing
   * is armed by movement, so a slide costs nothing.
   */
  const onTrigger = () => { toggle(); setHover(null); };

  /*
   * Something is always named.
   *
   * `hover` starts null, and on a touch screen there is no hover at all — so
   * with the node labels gone the readout would have said "Pick a section"
   * until the first drag and named nothing in the meantime. Falling back to the
   * first entry means the readout is populated the instant the arc opens, and
   * dragging simply moves it.
   */
  const focused = hover !== null ? entries[hover] : (entries[0] ?? null);
  const focusedIdx = hover !== null ? hover : 0;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(80% 46% at 50% 96%, rgba(217,183,117,0.14), transparent 62%),` +
            `linear-gradient(180deg, #080812, #04040b)`,
          backgroundColor: ROYAL.ink,
          backdropFilter: "blur(16px) saturate(1.2)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.24 }}
        onClick={close}
        aria-hidden={!open}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute inset-0"
            style={{ pointerEvents: "auto" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.15 } }}
            role="dialog" aria-modal="true" aria-label="Navigation"
          >
            {/* Readout. Derived from the entries themselves — there is no
                external object here that could be missing. */}
            <motion.div
              className="absolute inset-x-0 flex flex-col items-center gap-1 px-6 text-center pointer-events-none"
              style={{ top: "calc(env(safe-area-inset-top, 0px) + 52px)" }}
              initial={calm ? false : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={calm ? { duration: 0 } : { duration: 0.26, ease: EASE }}
            >
              <span className="text-[9px] uppercase tracking-[0.44em]" style={{ color: ROYAL.gold }}>
                {current ? current.label : "StormSync"}
              </span>
              <span className="text-[26px] font-semibold leading-none"
                    style={{ color: ROYAL.text, fontFamily: HEADING, letterSpacing: "0.01em" }}>
                {focused ? focused.label : current ? "Pick a module" : "Pick a section"}
              </span>
              <span className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>
                {focused
                  ? (focused.count > 0
                      ? `${focused.count} module${focused.count === 1 ? "" : "s"} inside`
                      : focused.locked ? "locked" : "opens this module")
                  : current ? `${n} module${n === 1 ? "" : "s"}` : `${n} sections · ${moduleCount(nav)} modules`}
              </span>
            </motion.div>

            {/* The arc, its milling, and the nodes. */}
            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 48px)" }}
            >
              <svg
                className="absolute pointer-events-none"
                style={{ left: -radius - 30, top: -radius - 30, overflow: "visible" }}
                width={(radius + 30) * 2} height={(radius + 30) * 2}
                viewBox={`${-radius - 30} ${-radius - 30} ${(radius + 30) * 2} ${(radius + 30) * 2}`}
                aria-hidden
              >
                {/* The rail the nodes sit on. */}
                <path
                  d={`M ${Math.cos((START_ANGLE * Math.PI) / 180) * radius} ${Math.sin((START_ANGLE * Math.PI) / 180) * radius}` +
                     ` A ${radius} ${radius} 0 0 1 ` +
                     `${Math.cos((END_ANGLE * Math.PI) / 180) * radius} ${Math.sin((END_ANGLE * Math.PI) / 180) * radius}`}
                  fill="none" stroke={ROYAL.hairline} strokeWidth={1}
                />
                {/* Milling, one tick per degree band — the instrument read. */}
                {Array.from({ length: 39 }, (_, k) => {
                  const a = ((START_ANGLE + (k / 38) * (END_ANGLE - START_ANGLE)) * Math.PI) / 180;
                  const big = k % 6 === 0;
                  const r1 = radius + 12, r2 = radius + (big ? 22 : 17);
                  return (
                    <line
                      key={k}
                      x1={Math.cos(a) * r1} y1={Math.sin(a) * r1}
                      x2={Math.cos(a) * r2} y2={Math.sin(a) * r2}
                      stroke={big ? ROYAL.goldSoft : "rgba(204,204,255,0.14)"} strokeWidth={big ? 1.4 : 0.8}
                    />
                  );
                })}
              </svg>

              {entries.map((e, i) => {
                const { x, y } = posFor(i);
                const Icon = e.icon;
                const on = focusedIdx === i;
                const near = hover !== null && Math.abs(hover - i) === 1;
                const scale = on ? 1.34 : near ? 1.12 : 1;

                return (
                  <motion.button
                    key={e.key}
                    onClick={(ev) => { ev.stopPropagation(); choose(i); }}
                    onPointerEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onPointerLeave={() => setHover((h) => (h === i ? null : h))}
                    className="absolute flex flex-col items-center gap-1.5"
                    style={{ left: -node / 2, top: -node / 2, transformOrigin: "center" }}
                    initial={calm ? false : { x: 0, y: 0, scale: 0, opacity: 0 }}
                    animate={{ x, y, scale, opacity: 1 }}
                    exit={calm ? { opacity: 0 } : { x: 0, y: 0, scale: 0, opacity: 0 }}
                    transition={calm ? { duration: 0 } : {
                      type: "spring", stiffness: 340, damping: 24, delay: i * 0.026,
                    }}
                    aria-label={e.label}
                  >
                    <span
                      className="grid place-items-center rounded-2xl relative"
                      style={{
                        width: node, height: node,
                        background: on
                          ? `linear-gradient(150deg, ${ROYAL.gold}, #b48c45)`
                          : "linear-gradient(160deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))",
                        border: `1px solid ${on ? ROYAL.gold : ROYAL.hairline}`,
                        color: on ? "#0b0b12" : ROYAL.gold,
                        boxShadow: on
                          ? `0 0 30px -6px ${ROYAL.gold}, 0 12px 26px -14px #000`
                          : "0 10px 22px -16px #000",
                        backdropFilter: "blur(8px)",
                      }}
                    >
                      <Icon style={{ width: node * 0.38, height: node * 0.38 }} />
                      {e.locked && (
                        <Lock className="absolute -top-1 -right-1 w-3 h-3"
                              style={{ color: ROYAL.dim, filter: "drop-shadow(0 1px 2px #000)" }} />
                      )}
                      {e.count > 0 && !on && (
                        <span className="absolute -bottom-1 -right-1 grid place-items-center rounded-full tabular-nums"
                              style={{
                                width: 15, height: 15, fontSize: 8, color: ROYAL.gold,
                                background: "#0b0b14", border: `1px solid ${ROYAL.goldSoft}`,
                              }}>
                          {e.count}
                        </span>
                      )}
                    </span>
                    {/*
                      NO LABEL ON THE NODE.
                      There was one, at 8px, truncated to twelve characters and
                      staggered onto two radii to stop seven of them colliding
                      on a 314px arc. It collided anyway, and even where it did
                      not, "METEOROLOGIC…" at eight pixels over a lit tile is
                      not a readable name — which is exactly how it was
                      reported.

                      The arc cannot hold seven legible names at once, so it
                      holds none. The readout above is 26px and names whatever
                      is nearest the thumb, which is the same information in a
                      size somebody can actually read, and it is where the eye
                      already is while dragging. What the node carries is its
                      mark and its count, which is all a node has to do.
                    */}
                  </motion.button>
                );
              })}
            </div>

            <div
              className="absolute inset-x-0 flex flex-col items-center gap-2 pointer-events-none"
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)" }}
            >
              {section !== null && (
                <button
                  onClick={back}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px]"
                  style={{ color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(8,8,18,0.7)" }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> All sections
                </button>
              )}
            </div>

            <motion.p
              className="absolute inset-x-0 text-center text-[9px] tracking-[0.3em] uppercase pointer-events-none"
              style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)", color: ROYAL.dim }}
              initial={calm ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={calm ? { duration: 0 } : { delay: 0.3 }}
            >
              Tap a section to open it
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The trigger doubles as a gauge: the ring fills to wherever the thumb
          currently is along the arc, so the control reports the gesture. */}
      <motion.button
        onClick={onTrigger}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute left-1/2 grid place-items-center touch-none"
        style={{
          marginLeft: -34, bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          width: 68, height: 68, zIndex: 80, pointerEvents: "auto", background: "none", border: "none",
        }}
        whileTap={calm ? undefined : { scale: 0.93 }}
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 68 68" aria-hidden>
          <circle cx="34" cy="34" r="31" fill="none" stroke={ROYAL.hairline} strokeWidth="3" />
          <motion.circle
            cx="34" cy="34" r="31" fill="none"
            stroke={ROYAL.gold} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 31}
            initial={false}
            animate={{
              strokeDashoffset: 2 * Math.PI * 31 * (1 - (hover === null ? 0 : (hover + 1) / n)),
            }}
            transition={calm ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}
          />
        </svg>
        <motion.span
          className="grid place-items-center rounded-full"
          style={{
            width: 54, height: 54,
            background: `linear-gradient(150deg, ${ROYAL.gold}, #a8823f)`,
            color: "#0b0b12",
            boxShadow: `0 10px 28px -10px ${ROYAL.gold}`,
          }}
          initial={false}
          animate={{ rotate: open ? 135 : 0 }}
          transition={calm ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 22 }}
        >
          <motion.span initial={false} animate={{ rotate: open ? -135 : 0 }}
                       transition={calm ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 22 }}>
            <Compass className="w-6 h-6" />
          </motion.span>
        </motion.span>
      </motion.button>
    </div>
  );
}
