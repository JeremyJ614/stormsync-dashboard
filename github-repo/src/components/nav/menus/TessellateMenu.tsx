import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Lock } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { entriesFor, moduleCount } from "./entries";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Tessellate.
 *
 * A honeycomb. Cells in rows of two and three so the lattice interlocks and
 * everything stays inside thumb reach, spinning in from the centre outward.
 *
 * Three things were changed from the version this came from. The cells are
 * bigger — 100px against 86 — because at 86 a two-line module name had to be
 * clipped and a hexagon full of clipped text is a worse hexagon. Each cell is
 * built as three nested clip paths rather than two, so there is a genuine bevel
 * between the champagne rim and the dark face instead of a flat border; a
 * hexagon with a lit edge and a shaded interior reads as cast metal, and one
 * with a stroke reads as an icon. And a sweep of light crosses the comb on a
 * loop, entering at the top-left and leaving at the bottom-right — each cell
 * lights as the wave reaches it, so the lattice behaves as one surface rather
 * than as a set of buttons that happen to be adjacent.
 *
 * The stagger runs on distance from the centre, not on list order, so the comb
 * grows outward from the trigger's landing point.
 */
const HEX = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

/** Rows of 2 / 3 / 2 / 3 — the pattern that makes the cells interlock. */
function combRows(n: number): number[] {
  const rows: number[] = [];
  let left = n, width = 2;
  while (left > 0) {
    const take = Math.min(width, left);
    rows.push(take);
    left -= take;
    width = width === 2 ? 3 : 2;
  }
  return rows;
}

export function TessellateMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, toggle, close, openSection, back, calm, containerRef } = nav;
  const entries = entriesFor(nav);
  const rows = combRows(entries.length);
  // Cells shrink only once the comb genuinely cannot fit the screen.
  const S = entries.length > 9 ? 88 : entries.length > 6 ? 100 : 112;

  let cursor = 0;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(85% 55% at 50% 42%, rgba(217,183,117,0.10), transparent 66%),` +
            `linear-gradient(180deg, #0a0a16, #04040c)`,
          backgroundColor: ROYAL.ink,
          backdropFilter: "blur(15px)",
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
            className="absolute inset-0 flex flex-col items-center justify-center px-3"
            style={{ pointerEvents: "auto" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.15 } }}
            aria-label="Navigation"
          >
            <div className="text-center mb-4">
              <div className="text-[9px] uppercase tracking-[0.44em]" style={{ color: ROYAL.gold }}>
                {current ? "Cells in" : "StormSync"}
              </div>
              <div className="text-[17px] font-semibold mt-1 leading-none"
                   style={{ color: ROYAL.text, fontFamily: HEADING, letterSpacing: "0.02em" }}>
                {current ? current.label : "Navigate"}
              </div>
              <div className="text-[10px] mt-1.5 tabular-nums" style={{ color: ROYAL.dim }}>
                {current ? `${entries.length} modules` : `${entries.length} sections · ${moduleCount(nav)} modules`}
              </div>
            </div>

            <div className="flex flex-col items-center" style={{ gap: 2 }}>
              {rows.map((count, r) => {
                const slice = entries.slice(cursor, cursor + count);
                const before = cursor;
                cursor += count;
                return (
                  <div key={r} className="flex" style={{ gap: 2, marginTop: r === 0 ? 0 : -S * 0.175 }}>
                    {slice.map((e, i) => {
                      const idx = before + i;
                      const Icon = e.icon;
                      // Distance from the middle of the comb drives the delay, so
                      // it grows outward rather than reading top to bottom.
                      const mid = (rows.length - 1) / 2;
                      const dist = Math.hypot(r - mid, i - (count - 1) / 2);

                      const inner = (
                        <span className="flex flex-col items-center gap-1 px-2" style={{ color: ROYAL.text }}>
                          <Icon style={{ width: S * 0.21, height: S * 0.21, color: ROYAL.gold }} />
                          <span
                            className="text-center leading-[1.1] overflow-hidden"
                            style={{
                              fontSize: S > 90 ? 9.5 : 8.5,
                              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                              maxWidth: S - 26,
                            }}
                          >
                            {e.label}
                          </span>
                          {e.count > 0 && (
                            <span className="text-[8px] tabular-nums" style={{ color: ROYAL.dim }}>{e.count}</span>
                          )}
                        </span>
                      );

                      return (
                        <motion.div
                          key={e.key}
                          className="relative grid place-items-center"
                          style={{ width: S, height: S * 1.02 }}
                          initial={calm ? false : { scale: 0, rotate: -120, opacity: 0 }}
                          animate={{ scale: 1, rotate: 0, opacity: 1 }}
                          exit={calm ? { opacity: 0 } : { scale: 0, rotate: 120, opacity: 0 }}
                          transition={calm ? { duration: 0 } : {
                            type: "spring", stiffness: 330, damping: 23, delay: dist * 0.05,
                          }}
                        >
                          {/* rim → bevel → face. Three layers is what buys the
                              lit edge; two gives a flat outline. */}
                          <span className="absolute inset-0" aria-hidden
                                style={{ clipPath: HEX, background: `linear-gradient(155deg, ${ROYAL.gold}, rgba(217,183,117,0.18) 55%, rgba(204,204,255,0.16))` }} />
                          <span className="absolute" aria-hidden
                                style={{ inset: 1.5, clipPath: HEX, background: "linear-gradient(155deg, rgba(255,255,255,0.16), rgba(0,0,0,0.55))" }} />
                          <span className="absolute" aria-hidden
                                style={{ inset: 3, clipPath: HEX, background: "linear-gradient(165deg, #14141f, #08080f 62%, #101019)" }} />

                          {/* The wave. One band crossing the whole comb, phased
                              by position, so the cells light in sequence. */}
                          {!calm && (
                            <motion.span
                              className="absolute pointer-events-none" aria-hidden
                              style={{
                                inset: 3, clipPath: HEX,
                                background: `linear-gradient(120deg, transparent 34%, rgba(217,183,117,0.30) 50%, transparent 66%)`,
                                backgroundSize: "300% 300%",
                              }}
                              animate={{ backgroundPosition: ["120% 120%", "-20% -20%"] }}
                              transition={{
                                duration: 2.6, repeat: Infinity, repeatDelay: 1.9, ease: EASE,
                                delay: 0.7 + (r * 0.18 + i * 0.1),
                              }}
                            />
                          )}

                          {e.locked && (
                            <Lock className="absolute w-3 h-3" style={{ top: S * 0.2, right: S * 0.18, color: ROYAL.dim }} />
                          )}

                          {e.to
                            ? <Link href={e.to} onClick={close} aria-label={e.label}
                                    className="absolute inset-0 grid place-items-center">{inner}</Link>
                            : <button onClick={() => openSection(e.index)} aria-label={e.label}
                                      className="absolute inset-0 grid place-items-center">{inner}</button>}
                        </motion.div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {section !== null && (
              <button
                onClick={back}
                className="mt-5 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
                style={{ color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(255,255,255,0.03)" }}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> All sections
              </button>
            )}
          </motion.nav>
        )}
      </AnimatePresence>

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
          className="grid place-items-center absolute"
          style={{ width: 56, height: 57, clipPath: HEX, background: `linear-gradient(150deg, ${ROYAL.gold}, #a8823f)` }}
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={calm ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 20 }}
        />
        {/* A single cell of the comb, drawn on the face. */}
        <motion.span
          className="relative"
          style={{ width: 22, height: 22 }}
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={calm ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 20 }}
          aria-hidden
        >
          {[[0, 6.5], [8.5, 0], [8.5, 13], [17, 6.5]].map(([l, t], i) => (
            <motion.span
              key={i}
              className="absolute"
              style={{ left: l, top: t, width: 8, height: 8.2, clipPath: HEX, background: "#0b0b12" }}
              initial={false}
              animate={calm ? { opacity: 1 } : { opacity: open ? [1, 0.35, 1] : 1 }}
              transition={calm ? { duration: 0 } : { duration: 1.8, repeat: Infinity, delay: i * 0.18 }}
            />
          ))}
        </motion.span>
      </button>
    </div>
  );
}
