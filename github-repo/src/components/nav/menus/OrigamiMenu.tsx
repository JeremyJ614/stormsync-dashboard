import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Lock } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { entriesFor, moduleCount } from "./entries";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Origami.
 *
 * A folded sheet. Closed, the whole menu is one square of paper; opening
 * unfolds it into a column of panels, each hinged on the crease it shares with
 * the panel above or below it. Alternating hinges are what make it read as
 * paper rather than as rows sliding in: a fold pivots about its edge, and the
 * face catches light differently depending on which way it turned.
 *
 * Three things do the work.
 *
 *   · The hinge is the shared edge, so consecutive panels rotate about opposite
 *     ends and the sheet concertinas. Getting this wrong — every panel hinged at
 *     its own top — gives a stack of falling cards, which is a different and
 *     much worse effect.
 *   · Each face carries a diagonal light gradient whose direction flips with the
 *     fold, so adjacent panels differ in value. That is the only cue that says
 *     "this surface is at an angle to that one", and without it the column is
 *     flat however it moved.
 *   · A crease line sits on every shared edge, brighter where the fold is
 *     sharper. Paper without creases is just card.
 *
 * The trigger is the sheet in miniature and genuinely changes shape: square,
 * then a kite, then the four-point star of a fully-folded piece, driven by one
 * animated clip-path so the silhouette itself morphs rather than an icon
 * swapping inside a fixed box.
 */

/** The trigger's silhouette at each stage of the fold. Same point count, so it tweens. */
const SHEET   = "polygon(4% 4%, 96% 4%, 96% 96%, 4% 96%, 50% 50%, 50% 50%, 50% 50%, 50% 50%)";
const KITE    = "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 50% 62%, 50% 62%, 50% 62%, 50% 62%)";
const FOLDED  = "polygon(50% 0%, 68% 32%, 100% 50%, 68% 68%, 50% 100%, 32% 68%, 0% 50%, 32% 32%)";

export function OrigamiMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, toggle, close, openSection, back, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(120% 80% at 50% -10%, rgba(217,183,117,0.11), transparent 60%),` +
            `linear-gradient(170deg, #0a0a16, #04040c)`,
          backgroundColor: ROYAL.ink,
          backdropFilter: "blur(14px)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.3 }}
        onClick={close}
        aria-hidden={!open}
      />

      <AnimatePresence>
        {open && (
          <motion.nav
            key="sheet"
            className="absolute inset-0 flex flex-col justify-center px-5"
            style={{ perspective: 1400, pointerEvents: "auto" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.16 } }}
            aria-label="Navigation"
          >
            <div className="mb-4 px-1 flex items-end justify-between">
              <div>
                <div className="text-[9px] uppercase tracking-[0.44em]" style={{ color: ROYAL.gold }}>
                  {current ? "Folded open" : "StormSync"}
                </div>
                <div className="text-[17px] font-semibold mt-1 leading-none"
                     style={{ color: ROYAL.text, fontFamily: HEADING, letterSpacing: "0.02em" }}>
                  {current ? current.label : "Navigate"}
                </div>
              </div>
              <div className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>
                {current ? `${entries.length} modules` : `${moduleCount(nav)} modules`}
              </div>
            </div>

            <div style={{ transformStyle: "preserve-3d" }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={current ? `s${section}` : "top"}
                  initial={calm ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={calm ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.12 } }}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  {entries.map((e, i) => {
                    const Icon = e.icon;
                    const down = i % 2 === 0;   // which edge this panel hinges on
                    const first = i === 0;
                    const last = i === entries.length - 1;

                    // The face's light. A panel folded down catches light along
                    // its top edge; one folded up catches it along the bottom.
                    const face = down
                      ? "linear-gradient(163deg, rgba(255,255,255,0.085) 0%, rgba(255,255,255,0.028) 52%, rgba(0,0,0,0.16) 100%)"
                      : "linear-gradient(17deg, rgba(255,255,255,0.062) 0%, rgba(255,255,255,0.018) 48%, rgba(0,0,0,0.22) 100%)";

                    const inner = (
                      <>
                        {/* The crease this panel shares with the one before it. */}
                        {!first && (
                          <span
                            className="pointer-events-none absolute inset-x-0 top-0 h-px"
                            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft} 18%, ${ROYAL.goldSoft} 82%, transparent)` }}
                            aria-hidden
                          />
                        )}
                        <span
                          className="grid place-items-center rounded-md shrink-0"
                          style={{
                            width: 30, height: 30,
                            background: "rgba(217,183,117,0.10)",
                            border: `1px solid ${ROYAL.goldSoft}`,
                            color: ROYAL.gold,
                          }}
                        >
                          <Icon style={{ width: 15, height: 15 }} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-[14px] font-medium" style={{ color: ROYAL.text }}>
                            {e.label}
                          </span>
                          {e.count > 0 && (
                            <span className="block text-[9.5px] mt-0.5 uppercase tracking-[0.2em]" style={{ color: ROYAL.dim }}>
                              {e.count} module{e.count === 1 ? "" : "s"}
                            </span>
                          )}
                        </span>
                        {e.locked
                          ? <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />
                          : <span className="text-[9px] uppercase tracking-[0.22em] shrink-0"
                                  style={{ color: ROYAL.gold, opacity: 0.55 }}>
                              {e.to ? "open" : "fold"}
                            </span>}
                      </>
                    );

                    const shape: React.CSSProperties = {
                      transformOrigin: down ? "top center" : "bottom center",
                      transformStyle: "preserve-3d",
                      background: face,
                      borderLeft: `1px solid ${ROYAL.hairline}`,
                      borderRight: `1px solid ${ROYAL.hairline}`,
                      borderTop: first ? `1px solid ${ROYAL.hairline}` : "none",
                      borderBottom: last ? `1px solid ${ROYAL.hairline}` : "none",
                      borderRadius: first ? "16px 16px 0 0" : last ? "0 0 16px 16px" : 0,
                    };

                    const cls = "group relative w-full flex items-center gap-3 px-4 py-3 text-left";

                    return (
                      <motion.div
                        key={e.key}
                        style={{ transformStyle: "preserve-3d" }}
                        initial={calm ? false : { rotateX: down ? -96 : 96, opacity: 0 }}
                        animate={{ rotateX: 0, opacity: 1 }}
                        // The exit needs its own, much shorter transition, and
                        // this is the whole reason drilling in felt sluggish.
                        // `AnimatePresence mode="wait"` holds the incoming level
                        // until every outgoing panel has finished, and the
                        // outgoing panels were folding away on the SAME spring
                        // they arrive on, each with its own stagger — so the
                        // last one started 0.18s in and then took a spring's
                        // worth of settling to reach 96 degrees. Most of a
                        // second passed before the new modules began to appear.
                        //
                        // Folding shut is not a moment anyone is admiring, so it
                        // is a flat, undelayed tween and the next level starts
                        // almost at once.
                        exit={calm ? { opacity: 0 } : {
                          rotateX: down ? -96 : 96, opacity: 0,
                          transition: { duration: 0.13, ease: "easeIn" },
                        }}
                        transition={calm ? { duration: 0 } : {
                          type: "spring", stiffness: 240, damping: 22, delay: i * 0.035,
                        }}
                      >
                        {e.to ? (
                          <Link href={e.to} onClick={close} className={cls} style={shape}>{inner}</Link>
                        ) : (
                          <button onClick={() => openSection(e.index)} className={cls} style={shape}>{inner}</button>
                        )}
                      </motion.div>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>

            {section !== null && (
              <div className="mt-4 px-1">
                <button
                  onClick={back}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
                  style={{ color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(255,255,255,0.03)" }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Fold back
                </button>
              </div>
            )}
          </motion.nav>
        )}
      </AnimatePresence>

      {/* The trigger. One clip-path, three silhouettes: the outline itself
          changes shape, which no amount of swapping icons inside a fixed box
          can imitate. */}
      <button
        onClick={toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center"
        style={{
          right: 22, bottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          width: 58, height: 58, zIndex: 80, pointerEvents: "auto", background: "none", border: "none",
        }}
      >
        <motion.span
          className="grid place-items-center"
          style={{
            width: 54, height: 54,
            background: `linear-gradient(135deg, ${ROYAL.gold}, #b8914a 58%, #7d6130)`,
            boxShadow: `0 10px 26px rgba(0,0,0,.55)`,
          }}
          initial={false}
          animate={calm
            ? { clipPath: open ? FOLDED : SHEET }
            : { clipPath: open ? [SHEET, KITE, FOLDED] : [FOLDED, KITE, SHEET], rotate: open ? 180 : 0 }}
          transition={calm ? { duration: 0 } : { duration: 0.62, ease: EASE, times: [0, 0.5, 1] }}
        >
          {/* The paper's own crease, drawn on the face so the shape reads as
              folded rather than merely cut out. */}
          <motion.span
            className="block"
            style={{ width: 26, height: 26, position: "relative" }}
            initial={false}
            animate={{ rotate: open ? -180 : 0 }}
            transition={calm ? { duration: 0 } : { duration: 0.62, ease: EASE }}
            aria-hidden
          >
            <span className="absolute" style={{ left: 0, top: 13, width: 26, height: 1, background: "rgba(11,11,18,0.55)" }} />
            <span className="absolute" style={{ left: 13, top: 0, width: 1, height: 26, background: "rgba(11,11,18,0.35)" }} />
            <span className="absolute" style={{
              left: 3, top: 3, width: 20, height: 20,
              border: "1px solid rgba(11,11,18,0.45)",
              transform: "rotate(45deg)",
            }} />
          </motion.span>
        </motion.span>
      </button>
    </div>
  );
}
