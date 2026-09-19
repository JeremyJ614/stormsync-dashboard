import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Menu, X } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { entriesFor, moduleCount } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { EntryAction, LAB_EASE, LockMark, Scrim, Wordmark, delay, entrySub } from "./shared";

/**
 * B3 · Bento Mega.
 *
 * Asymmetric tiles instead of columns, with one large tile carrying live
 * figures. Reads as a dashboard you can navigate rather than a list.
 *
 * THE SPANS ARE DERIVED, NOT DRAWN. The lab hand-placed six tiles because it
 * had six fixed links. Here the sections come from the member's own
 * entitlements, so there can be four or nine of them, and a hand-drawn bento
 * would either leave a hole or overflow. `spanFor` gives the section with the
 * most modules the wide tile and alternates the rest, so the grid stays full at
 * any count — the asymmetry is real rather than decorative, because it tracks
 * how much is actually inside each section.
 *
 * A SECTION TILE OPENS THE SECTION. It used to link straight to that section's
 * first module, on the theory that a mega panel should never make you open a
 * second panel — which was a fine theory and completely wrong in use: tapping
 * Severe Weather loaded SSWXCon Score, so every section but one appeared to be
 * broken and eight of its nine modules were unreachable. The tiles are the
 * level you are on now: sections first, then that section's modules in the same
 * grid, with the header tile carrying the way back.
 */
/**
 * How wide each tile is, as a whole pass rather than a per-tile guess.
 *
 * A per-tile rule cannot do this, which is why the first one left holes: a
 * full-width tile landing in the right-hand column gets pushed to the next row
 * by grid auto-placement, and the gap it leaves behind is a hole nothing can
 * fill. So the pass carries the column it is on, and whenever a full-width tile
 * would start in the right-hand column it widens the tile before it instead —
 * the orphan is promoted rather than stranded. A lone tile at the end is
 * widened for the same reason.
 */
function spansFor(count: number, biggest: number): number[] {
  const spans = new Array<number>(count).fill(1);
  if (biggest >= 0 && biggest < count) spans[biggest] = 2;

  let col = 0;
  for (let i = 0; i < count; i++) {
    if (spans[i] === 2) {
      if (col === 1) spans[i - 1] = 2;   // the tile left alone gets the row
      col = 0;
    } else {
      col = col === 0 ? 1 : 0;
    }
  }
  if (col === 1) spans[count - 1] = 2;
  return spans;
}

/** Clear of the app header, so the toggle never lands on the profile button. */
const BAR_TOP = "calc(56px + env(safe-area-inset-top, 0px))";
const BAR_H = 52;

export function BentoMegaMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef, sections } = nav;
  const entries = entriesFor(nav);
  const inSection = nav.current !== null;

  // Only the top level has a "biggest" tile: inside a section every entry is
  // one module, so there is nothing for the wide tile to be about.
  const biggest = inSection
    ? -1
    : entries.reduce((best, e, i) => (e.count > (entries[best]?.count ?? -1) ? i : best), 0);
  const spans = spansFor(entries.length, biggest);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} weight="light" />

      <div
        className="absolute left-0 right-0 flex items-center gap-2 px-3"
        style={{
          top: BAR_TOP, height: BAR_H, zIndex: 70, pointerEvents: "auto",
          background: open ? "rgba(11,11,26,0.97)" : "transparent",
          backdropFilter: open ? "blur(14px) saturate(1.2)" : "none",
          WebkitBackdropFilter: open ? "blur(14px) saturate(1.2)" : "none",
          borderBottom: `1px solid ${open ? ROYAL.hairline : "transparent"}`,
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
          className="grid place-items-center rounded-[10px] gap-1 px-3"
          style={{
            height: 40,
            background: open ? ROYAL.goldFaint : ROYAL.panel,
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            border: `1px solid ${ROYAL.goldSoft}`,
          }}
        >
          <span className="flex items-center gap-1.5 text-[12px] font-bold" style={{ color: ROYAL.gold, fontFamily: HEADING }}>
            {open ? <X style={{ width: 15, height: 15 }} /> : <Menu style={{ width: 15, height: 15 }} />}
            {open ? "Close" : "Explore"}
          </span>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute left-0 right-0 overflow-y-auto"
            style={{
              top: `calc(${BAR_TOP} + ${BAR_H}px)`, pointerEvents: "auto",
              maxHeight: `calc(100% - ${BAR_TOP} - ${BAR_H}px)`,
              background: "linear-gradient(180deg, rgba(11,11,26,0.97), rgba(7,7,19,0.97))",
              backdropFilter: "blur(16px) saturate(1.2)",
              WebkitBackdropFilter: "blur(16px) saturate(1.2)",
              borderBottom: `1px solid ${ROYAL.hairline}`,
              padding: 12,
            }}
            initial={calm ? { opacity: 0 } : { y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={calm ? { opacity: 0 } : { y: -10, opacity: 0 }}
            transition={calm ? { duration: 0 } : { duration: 0.4, ease: LAB_EASE }}
            role="dialog" aria-modal="true" aria-label="Navigation"
          >
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              {/* The header tile. At the top level it is the live figure the lab
                  gave to the weather; inside a section it is the way back. */}
              <motion.div
                style={{ gridColumn: "span 2" }}
                initial={calm ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={calm ? { duration: 0 } : { duration: 0.38, ease: LAB_EASE }}
              >
                {inSection ? (
                  <button
                    onClick={nav.back}
                    className="w-full text-left rounded-[12px] p-3 flex items-center gap-2.5"
                    style={{
                      border: `1px solid ${ROYAL.goldSoft}`,
                      background: `linear-gradient(120deg, ${ROYAL.goldFaint}, transparent 70%), ${ROYAL.ink2}`,
                    }}
                  >
                    <ChevronLeft style={{ width: 17, height: 17, color: ROYAL.gold, flex: "none" }} />
                    <span className="min-w-0">
                      <b className="block text-[13px] truncate" style={{ color: ROYAL.text, fontFamily: HEADING }}>
                        {nav.current?.label}
                      </b>
                      <span className="block text-[10px]" style={{ color: ROYAL.dim }}>
                        {entries.length} module{entries.length === 1 ? "" : "s"} · all sections
                      </span>
                    </span>
                  </button>
                ) : (
                  <div
                    className="rounded-[12px] p-3 flex flex-col justify-end"
                    style={{
                      minHeight: 108,
                      border: `1px solid ${ROYAL.hairline}`,
                      background:
                        `radial-gradient(70% 90% at 30% 40%, ${ROYAL.goldSoft}, transparent 70%),`
                        + `radial-gradient(60% 80% at 70% 70%, ${ROYAL.irisSoft}, transparent 70%),`
                        + `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
                    }}
                  >
                    <span className="text-[10px]" style={{ color: ROYAL.dim }}>Everything you can reach</span>
                    <span className="text-[30px] font-black leading-none tabular-nums"
                          style={{ color: ROYAL.text, letterSpacing: "-0.03em", fontFamily: HEADING }}>
                      {moduleCount(nav)}
                    </span>
                    <span className="text-[10.5px] mt-0.5" style={{ color: ROYAL.dim }}>
                      modules across {sections.length} section{sections.length === 1 ? "" : "s"}
                    </span>
                  </div>
                )}
              </motion.div>

              {entries.map((e, i) => {
                const Icon = e.icon;
                return (
                  <motion.div
                    key={e.key}
                    style={{ gridColumn: `span ${spans[i]}` }}
                    initial={calm ? false : { opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={calm ? { duration: 0 } : { duration: 0.38, ease: LAB_EASE, delay: delay(i, calm, 0.05, 0.048) }}
                  >
                    <EntryAction
                      entry={e} nav={nav}
                      className="block w-full text-left rounded-[12px] p-3 h-full"
                      style={{ border: `1px solid ${ROYAL.hairline}`, background: "rgba(255,255,255,0.035)" }}
                    >
                      <span className="flex items-center gap-1.5">
                        <Icon style={{ width: 16, height: 16, color: ROYAL.gold, flex: "none" }} />
                        {e.locked && <LockMark size={11} />}
                      </span>
                      <b className="block text-[12px] mt-1.5" style={{ color: ROYAL.text, fontFamily: HEADING }}>
                        {e.label}
                      </b>
                      <span className="block text-[10px] mt-0.5 leading-snug" style={{ color: ROYAL.dim }}>
                        {entrySub(e)}
                      </span>
                    </EntryAction>
                  </motion.div>
                );
              })}

              {entries.length === 0 && (
                <p className="text-[11px] col-span-2" style={{ color: ROYAL.dim }}>Nothing here yet.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
