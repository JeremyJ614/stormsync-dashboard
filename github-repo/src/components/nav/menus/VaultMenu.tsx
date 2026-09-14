import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Lock } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { entriesFor, moduleCount } from "./entries";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Vault.
 *
 * A strongroom. The menu is shut behind a round door with eight locking bolts
 * in its rim; the bolts withdraw, the wheel turns, and the door swings open on
 * its hinge in real perspective onto a wall of deposit boxes. Choosing a
 * section pulls that box out as a drawer and its modules are the brass tags
 * inside it.
 *
 * WHY A DOOR
 * Every other style in this set reveals a list. This one OPENS, and the
 * difference is the whole idea: an object that was closed a second ago and is
 * now not. The vault door is the thing everybody already reads as impenetrable,
 * so the moment it comes off its seat carries more than any fade can, and it
 * costs one rotateY.
 *
 * THE DOORWAY
 * The wall has a hole in it the exact size of the door, cut with a mask. That
 * one line is what makes the swing mean anything: without it the door was a
 * disc turning on an unbroken wall and there was nothing behind it to be let
 * into. With it you watch the strongroom appear through the opening as the door
 * comes off its seat, which is the only reason to draw a door at all.
 *
 * THE SEQUENCE, AND WHY IT IS SHORT
 * Bolts and wheel at 120ms, the swing at 220ms, boxes from 340ms, and the wall
 * gone by 700ms. The boxes are reachable while the door is still travelling —
 * theatre that makes you wait is just a delay wearing a costume, which is the
 * lesson the lift in this same set had to learn.
 *
 * WHAT MAKES IT LOOK MACHINED
 * Three gradients, none of them expensive. The bezel is a repeating CONIC
 * gradient, which is knurling — the fine cross-hatched grip milled into a rim —
 * because knurling is radial and a linear gradient can only ever be brushing.
 * The face is a second, much finer conic, which is what turning a disc on a
 * lathe leaves behind. The brass is a 160° linear with a bright band at 52%,
 * because polished brass has one specular line and everything either side of it
 * is the room.
 *
 * Nothing here loops. Every animation is a one-shot on open, on drill-in, or on
 * press, and at rest the whole menu is static paint.
 */

/** Knurling on the rim, and the finer turned finish on the face. */
const KNURL =
  "repeating-conic-gradient(from 0deg, #31343d 0deg 1.6deg, #14161c 1.6deg 3.2deg)";
const TURNED =
  "repeating-conic-gradient(from 0deg, rgba(255,255,255,0.055) 0deg 0.5deg, rgba(0,0,0,0.05) 0.5deg 1.3deg)";

const BRASS = "linear-gradient(160deg,#e9d3a2 0%,#a88c52 34%,#f2e2bb 52%,#8c7342 62%,#5f4d2a 100%)";
/**
 * The tags inside a drawer are satin, not polished: the same brass with the
 * specular band flattened out. Nine rows all carrying the same mirror streak in
 * the same place stops reading as nine pieces of metal and starts reading as
 * one texture stamped nine times.
 */
const BRASS_TAG = "linear-gradient(168deg,#dcc496 0%,#a78c54 42%,#c7ac73 56%,#8a7342 70%,#6a5631 100%)";
const BRASS_DULL = "linear-gradient(168deg,#c3c5cd 0%,#83868f 42%,#a9acb4 56%,#6a6d76 70%,#4a4c55 100%)";

const BOLTS = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * The wall the door is set into. Without it the door was a disc floating over
 * the boxes it was supposed to be keeping you out of, which gives the whole
 * thing away — a door only reads as shut if there is nothing visible past it.
 */
const WALL =
  "repeating-linear-gradient(90deg, rgba(255,255,255,0.018) 0 1px, transparent 1px 5px)," +
  "radial-gradient(120% 75% at 50% 6%, #24262e, #101218 52%, #07080c)";

/** The door's diameter, and the hole in the wall that matches it. */
const DOOR_W = "min(340px, 80vw)";
const DOORWAY =
  "radial-gradient(circle at center, transparent min(168px, 39.6vw), #000 min(171px, 40.3vw))";

export function VaultMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, toggle, close, openSection, back, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  // The door is on its seat for a beat before anything moves, or the bolts and
  // the swing read as one blur rather than as a mechanism.
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    if (!open) { setUnlocked(false); return; }
    if (calm) { setUnlocked(true); return; }
    const t = setTimeout(() => setUnlocked(true), 120);
    return () => clearTimeout(t);
  }, [open, calm]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(80% 50% at 50% 0%, rgba(217,183,117,0.11), transparent 68%),` +
            `linear-gradient(180deg, #0c0b10, #040409)`,
          backgroundColor: ROYAL.ink,
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.26 }}
        onClick={close}
        aria-hidden={!open}
      />

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute inset-0 flex flex-col items-center justify-center px-4 py-8"
            style={{ pointerEvents: "auto" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.15 } }}
            aria-label="Navigation"
          >
            <div className="text-center shrink-0">
              <div className="text-[9px] uppercase tracking-[0.44em]" style={{ color: ROYAL.gold }}>
                {current ? "Drawer" : "Strongroom"}
              </div>
              <div className="text-[17px] font-semibold mt-1 leading-none"
                   style={{ color: ROYAL.text, fontFamily: HEADING, letterSpacing: "0.02em" }}>
                {current ? current.label : "Navigate"}
              </div>
              <div className="text-[10px] mt-1.5 tabular-nums" style={{ color: ROYAL.dim }}>
                {current ? `${entries.length} modules` : `${entries.length} boxes · ${moduleCount(nav)} modules`}
              </div>
            </div>

            <div className="relative w-full min-h-0 mt-4" style={{ maxWidth: 420 }}>
              {/* ── the contents ─────────────────────────────────────────── */}
              <div className="max-h-full overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <AnimatePresence mode="wait" initial={false}>
                  {current ? (
                    <Drawer key={`d${section}`} nav={nav} calm={calm} onGo={close} />
                  ) : (
                    <motion.div
                      key="wall"
                      className="grid grid-cols-3 gap-2"
                      exit={calm ? { opacity: 0 } : { opacity: 0, scale: 0.95, transition: { duration: 0.16 } }}
                    >
                      {entries.map((e, i) => (
                        <Box key={e.key} e={e} i={i} calm={calm} onPick={() => openSection(e.index)} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

            </div>

            {section !== null && (
              <div className="shrink-0 pb-5 pt-2">
                <button
                  onClick={back}
                  className="flex items-center gap-1.5 rounded px-3.5 py-1.5 text-[11.5px] font-bold"
                  style={{ background: BRASS, color: "#2a2210", boxShadow: "0 6px 16px -10px #000" }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Close the drawer
                </button>
              </div>
            )}

            {/* ── the wall and its door, over everything, on their way out ─ */}
            {!calm && (
              <motion.div
                aria-hidden
                className="absolute inset-0"
                style={{ perspective: 1100, pointerEvents: "none", display: "grid", placeItems: "center" }}
                initial={{ opacity: 1 }}
                animate={{ opacity: unlocked ? 0 : 1 }}
                transition={{ duration: 0.26, delay: unlocked ? 0.3 : 0, ease: EASE }}
              >
                {/* The wall, with the doorway cut out of it. */}
                <span className="absolute inset-0" style={{
                  background: WALL, maskImage: DOORWAY, WebkitMaskImage: DOORWAY,
                }} />

                {/* The rebate the door seats into, just outside the opening. */}
                <span className="rounded-full" style={{
                  gridArea: "1 / 1", width: "min(374px, 88.5vw)", aspectRatio: "1",
                  boxShadow: "inset 0 0 0 3px rgba(0,0,0,0.72), inset 0 0 22px -6px #000, 0 1px 0 rgba(255,255,255,0.05)",
                }} />

                <motion.div
                  className="relative rounded-full"
                  style={{
                    gridArea: "1 / 1",
                    width: DOOR_W, aspectRatio: "1",
                    transformOrigin: "0% 50%", transformStyle: "preserve-3d",
                    background: KNURL,
                    boxShadow: "0 34px 70px -30px #000, 0 0 0 1px rgba(217,183,117,0.22)",
                  }}
                  initial={{ rotateY: 0 }}
                  animate={{ rotateY: unlocked ? -104 : 0 }}
                  transition={{ duration: 0.44, delay: unlocked ? 0.1 : 0, ease: [0.6, 0, 0.3, 1] }}
                >
                  {/* Bolts in the rim, withdrawing. */}
                  {BOLTS.map((deg) => (
                    <div key={deg} className="absolute inset-0" style={{ transform: `rotate(${deg}deg)` }}>
                      <motion.span
                        className="absolute rounded-sm"
                        style={{
                          left: "50%", top: -7, width: 13, height: 26, marginLeft: -6.5,
                          background: "linear-gradient(180deg,#f0dfb6,#b3985c 40%,#6d5a31)",
                          boxShadow: "0 1px 0 rgba(255,255,255,0.4) inset",
                        }}
                        initial={{ y: 0 }}
                        animate={{ y: unlocked ? 22 : 0 }}
                        transition={{ duration: 0.2, ease: EASE }}
                      />
                    </div>
                  ))}

                  {/* The face: turned steel inside the knurled rim. */}
                  <div className="absolute rounded-full" style={{
                    inset: "7%",
                    background: `${TURNED}, radial-gradient(115% 115% at 30% 18%, #474b57, #1c1e26 56%, #0c0e13)`,
                    boxShadow: "inset 0 2px 0 rgba(255,255,255,0.10), inset 0 -18px 34px -22px #000",
                  }} />
                  {["16%", "24%", "33%"].map((inset) => (
                    <div key={inset} className="absolute rounded-full" style={{
                      inset, border: "1px solid rgba(255,255,255,0.055)",
                    }} />
                  ))}

                  {/* The combination dial and the wheel, turning as it frees. */}
                  <motion.div
                    className="absolute rounded-full grid place-items-center"
                    style={{
                      inset: "36%",
                      background: "linear-gradient(155deg,#585c69,#2a2d36 52%,#16181e)",
                      boxShadow: "0 6px 16px -8px #000, inset 0 1px 0 rgba(255,255,255,0.16)",
                    }}
                    initial={{ rotate: 0 }}
                    animate={{ rotate: unlocked ? -168 : 0 }}
                    transition={{ duration: 0.46, delay: unlocked ? 0.04 : 0, ease: [0.5, 0, 0.2, 1] }}
                  >
                    {[0, 90].map((d) => (
                      <span key={d} className="absolute rounded-full" style={{
                        width: "108%", height: 9, transform: `rotate(${d}deg)`,
                        background: "linear-gradient(90deg,#7b6a3d,#f2e2bb 50%,#7b6a3d)",
                        boxShadow: "0 2px 6px -3px #000",
                      }} />
                    ))}
                    <span className="absolute rounded-full" style={{
                      width: "34%", height: "34%", background: BRASS,
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 3px 8px -4px #000",
                    }} />
                  </motion.div>

                  <span className="absolute rounded-sm px-2 py-0.5 text-[7.5px] tracking-[0.3em] font-bold"
                        style={{
                          left: "50%", transform: "translateX(-50%)", bottom: "12%",
                          background: BRASS, color: "#2a2210",
                        }}>
                    STORMSYNC
                  </span>
                </motion.div>
              </motion.div>
            )}
          </motion.nav>
        )}
      </AnimatePresence>

      {/* The trigger is the dial off the door. */}
      <motion.button
        onClick={toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-full"
        style={{
          right: 22, bottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          width: 56, height: 56, zIndex: 80, pointerEvents: "auto",
          background: KNURL,
          boxShadow: "0 12px 28px -12px #000, 0 0 0 1px rgba(217,183,117,0.25)",
        }}
        initial={false}
        animate={calm ? {} : { rotate: open ? -168 : 0 }}
        transition={{ type: "spring", stiffness: 210, damping: 22 }}
      >
        <span className="absolute rounded-full" style={{
          inset: 7, background: `${TURNED}, linear-gradient(180deg,#42454f,#1c1e25 62%,#111319)`,
        }} />
        {[0, 90].map((d) => (
          <span key={d} className="absolute rounded-full" style={{
            width: 40, height: 6, transform: `rotate(${d}deg)`,
            background: "linear-gradient(90deg,#7b6a3d,#f2e2bb 50%,#7b6a3d)",
          }} />
        ))}
        <span className="absolute rounded-full" style={{
          width: 15, height: 15, background: BRASS,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
        }} />
      </motion.button>
    </div>
  );
}

/** One deposit box in the wall. */
function Box({
  e, i, calm, onPick,
}: { e: { key: string; label: string; icon: typeof Lock; count: number }; i: number; calm: boolean; onPick: () => void }) {
  const Icon = e.icon;
  return (
    <motion.button
      onClick={onPick}
      className="relative rounded-md overflow-hidden text-left group"
      style={{
        height: 92, padding: 2, background: BRASS,
        boxShadow: "0 8px 18px -12px #000, inset 0 1px 0 rgba(255,255,255,0.55)",
      }}
      initial={calm ? false : { opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={calm ? { duration: 0 } : {
        type: "spring", stiffness: 320, damping: 26,
        delay: 0.34 + Math.min(i * 0.028, 0.34),
      }}
      whileHover={calm ? undefined : { y: -3 }}
      whileTap={calm ? undefined : { scale: 0.97 }}
    >
      {/* The recessed face inside the frame. */}
      <span className="absolute rounded-[4px] flex flex-col items-center justify-center gap-1.5 px-1.5"
            style={{
              inset: 4,
              background: "linear-gradient(170deg,#6d5930,#4a3c1f 46%,#7a6537 58%,#3c3118)",
              boxShadow: "inset 0 2px 5px -2px #000, inset 0 -1px 0 rgba(255,255,255,0.16)",
            }}>
        <span className="absolute top-1 left-1.5 text-[8px] font-bold tabular-nums"
              style={{ color: "#d8c089", textShadow: "0 1px 0 rgba(0,0,0,0.6)" }}>
          {String(i + 1).padStart(2, "0")}
        </span>

        {/* Two keyholes and the pull, which is what a box front actually is. */}
        <span className="flex items-center gap-2 mt-1.5">
          <Hole />
          <span className="rounded-[2px]" style={{
            width: 30, height: 7, background: "linear-gradient(180deg,#f2e2bb,#a88c52 50%,#6d5930)",
            boxShadow: "0 2px 5px -2px #000",
          }} />
          <Hole />
        </span>

        <Icon className="w-3.5 h-3.5" style={{ color: "#e5d1a4" }} />

        <span className="text-[8.5px] leading-[1.15] text-center uppercase tracking-[0.1em] font-bold overflow-hidden"
              style={{
                color: "#f0e2c2", textShadow: "0 1px 0 rgba(0,0,0,0.65)",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>
          {e.label}
        </span>
        <span className="text-[7.5px] tabular-nums" style={{ color: "#c2a469" }}>{e.count}</span>
      </span>
    </motion.button>
  );
}

function Hole() {
  return (
    <span className="rounded-full relative" style={{
      width: 7, height: 7, background: "#15110a",
      boxShadow: "inset 0 1px 2px #000, 0 1px 0 rgba(255,255,255,0.25)",
    }}>
      <span className="absolute rounded-b-[1px]" style={{
        left: "50%", top: "55%", width: 2, height: 4, marginLeft: -1, background: "#15110a",
      }} />
    </span>
  );
}

/** The chosen box, pulled out. The modules are the tags inside it. */
function Drawer({ nav, calm, onGo }: { nav: MenuNav; calm: boolean; onGo: () => void }) {
  const entries = entriesFor(nav);
  return (
    <motion.div
      className="rounded-lg overflow-hidden"
      style={{ transformOrigin: "50% 0%", background: BRASS, padding: 3 }}
      initial={calm ? false : { opacity: 0, scaleY: 0.16, y: -10 }}
      animate={{ opacity: 1, scaleY: 1, y: 0 }}
      exit={calm ? { opacity: 0 } : { opacity: 0, scaleY: 0.16, y: -10, transition: { duration: 0.18 } }}
      transition={calm ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 26 }}
    >
      {/* The drawer front, still carrying its pull. */}
      <div className="flex items-center justify-center gap-2 py-1.5">
        <Hole />
        <span className="rounded-[2px]" style={{
          width: 54, height: 7, background: "linear-gradient(180deg,#fff6e0,#a88c52 50%,#6d5930)",
        }} />
        <Hole />
      </div>

      {/* The tray. */}
      <div className="rounded-md p-2 space-y-1.5"
           style={{
             background: "linear-gradient(180deg,#171308,#0d0b06)",
             boxShadow: "inset 0 4px 10px -4px #000",
           }}>
        {entries.map((e, i) => {
          const Icon = e.icon;
          return (
            <motion.div
              key={e.key}
              initial={calm ? false : { opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={calm ? { duration: 0 } : {
                type: "spring", stiffness: 340, damping: 27, delay: 0.08 + Math.min(i * 0.032, 0.36),
              }}
            >
              <Link
                href={e.to ?? "#"}
                onClick={onGo}
                className="flex items-center gap-2.5 rounded px-2.5 py-2"
                style={{
                  background: e.locked ? BRASS_DULL : BRASS_TAG,
                  boxShadow: "0 4px 10px -7px #000, inset 0 1px 0 rgba(255,255,255,0.55)",
                }}
              >
                {e.locked
                  ? <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: "#35373f" }} />
                  : <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: "#2a2210" }} />}
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold"
                      style={{ color: e.locked ? "#35373f" : "#2a2210", letterSpacing: "0.01em" }}>
                  {e.label}
                </span>
                {e.locked && (
                  <span className="text-[8px] uppercase tracking-[0.2em] shrink-0" style={{ color: "#4b4d55" }}>
                    locked
                  </span>
                )}
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
