import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import type { MenuNav } from "../useMenuNav";
import { moduleCount } from "../entries";
import { ROYAL, HEADING } from "../../../../lib/royal";
import { LAB_EASE, Scrim, Wordmark, delay } from "./shared";

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
 * Like Tabbed Mega this does not drill: a section tile goes straight to its
 * first module, because a mega panel that makes you open a second panel has
 * stopped being a mega panel.
 */
function spanFor(i: number, count: number, isBiggest: boolean): string {
  if (isBiggest) return "span 2";
  // Two per row, except a lone last tile which takes the full width rather
  // than sitting half-empty beside nothing.
  const isLast = i === count - 1;
  return isLast && (count - 1) % 2 === 1 ? "span 2" : "span 1";
}

export function BentoMegaMenu({ nav }: { nav: MenuNav }) {
  const { open, calm, containerRef, sections, close } = nav;

  const biggest = sections.reduce(
    (best, s, i) => (s.items.length > (sections[best]?.items.length ?? -1) ? i : best), 0,
  );

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <Scrim nav={nav} />

      <div
        className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3"
        style={{
          height: 54, zIndex: 70, pointerEvents: "auto",
          paddingTop: "env(safe-area-inset-top, 0px)",
          background: open ? ROYAL.panel : "transparent",
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
          style={{ height: 40, background: ROYAL.goldFaint, border: `1px solid ${ROYAL.goldSoft}` }}
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
              top: "calc(54px + env(safe-area-inset-top, 0px))", pointerEvents: "auto",
              maxHeight: "calc(100% - 54px)",
              background: ROYAL.panel,
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
              {/* The live tile. The lab's showed the weather; the honest
                  equivalent here is what the menu itself actually knows. */}
              <motion.div
                className="rounded-[12px] p-3 flex flex-col justify-end"
                style={{
                  gridColumn: "span 2", minHeight: 108,
                  border: `1px solid ${ROYAL.hairline}`,
                  background:
                    `radial-gradient(70% 90% at 30% 40%, ${ROYAL.goldSoft}, transparent 70%),`
                    + `radial-gradient(60% 80% at 70% 70%, ${ROYAL.irisSoft}, transparent 70%),`
                    + `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
                }}
                initial={calm ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={calm ? { duration: 0 } : { duration: 0.38, ease: LAB_EASE }}
              >
                <span className="text-[10px]" style={{ color: ROYAL.dim }}>Everything you can reach</span>
                <span className="text-[30px] font-black leading-none tabular-nums"
                      style={{ color: ROYAL.text, letterSpacing: "-0.03em", fontFamily: HEADING }}>
                  {moduleCount(nav)}
                </span>
                <span className="text-[10.5px] mt-0.5" style={{ color: ROYAL.dim }}>
                  modules across {sections.length} section{sections.length === 1 ? "" : "s"}
                </span>
              </motion.div>

              {sections.map((s, i) => {
                const first = s.items[0];
                const Icon = s.icon;
                return (
                  <motion.div
                    key={s.label}
                    style={{ gridColumn: spanFor(i, sections.length, i === biggest) }}
                    initial={calm ? false : { opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={calm ? { duration: 0 } : { duration: 0.38, ease: LAB_EASE, delay: delay(i, calm, 0.05, 0.048) }}
                  >
                    {first ? (
                      <Link
                        href={first.path}
                        onClick={close}
                        className="block rounded-[12px] p-3 h-full"
                        style={{ border: `1px solid ${ROYAL.hairline}`, background: "rgba(255,255,255,0.035)" }}
                      >
                        <Icon style={{ width: 16, height: 16, color: ROYAL.gold }} />
                        <b className="block text-[12px] mt-1.5" style={{ color: ROYAL.text, fontFamily: HEADING }}>
                          {s.label}
                        </b>
                        <span className="block text-[10px] mt-0.5 leading-snug" style={{ color: ROYAL.dim }}>
                          {s.items.length} module{s.items.length === 1 ? "" : "s"} · starts at {first.label}
                        </span>
                      </Link>
                    ) : (
                      <div className="rounded-[12px] p-3 h-full"
                           style={{ border: `1px solid ${ROYAL.hairline}`, background: "rgba(255,255,255,0.02)" }}>
                        <b className="block text-[12px]" style={{ color: ROYAL.dim, fontFamily: HEADING }}>{s.label}</b>
                        <span className="block text-[10px] mt-0.5" style={{ color: ROYAL.dim }}>Nothing here yet</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
