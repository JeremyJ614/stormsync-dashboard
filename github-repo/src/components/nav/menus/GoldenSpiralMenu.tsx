import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Lock, Plus, X } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL } from "../../../lib/royal";

/**
 * The Golden Spiral.
 *
 * The tiling is the real thing: six squares in Fibonacci proportion — 40, 40,
 * 80, 120, 200, 320 — laid out as quarter-turns so they tile a 320×520 block
 * exactly, which is what lets it sit on a phone at all. A seventh square would
 * be 520 wide and the spiral would have to lie down flat to fit, so instead of
 * adding turns the largest square subdivides: it splits into golden-ratio rows
 * and carries everything the four small tiles could not. That keeps the number
 * of items unbounded without the geometry stopping being a golden spiral.
 *
 * Both levels use the identical rule — smallest tile navigates, four tiles hold
 * the first four entries, the big square holds the rest — so the spiral is
 * self-similar between sections and modules, which is the whole idea.
 */

/** Squares of the Fibonacci tiling, smallest first. Origin is bottom-left. */
const TILES = [
  { w: 40,  h: 40,  x: 0,   y: 0   },  // navigation cell (close / back)
  { w: 40,  h: 40,  x: 0,   y: 40  },
  { w: 80,  h: 80,  x: 40,  y: 0   },
  { w: 120, h: 120, x: 0,   y: 80  },
  { w: 200, h: 200, x: 120, y: 0   },
  { w: 320, h: 320, x: 0,   y: 200 },  // the square that subdivides
] as const;

const BOX_W = 320;
const BOX_H = 520;
const SMALL_SLOTS = 4;   // tiles 1..4 carry entries; tile 0 navigates, tile 5 holds the rest

export function GoldenSpiralMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;

  // What the spiral is showing: sections at the top level, modules inside one.
  // Sections are ordered by size so the tiling means something: the smallest
  // section lands on the 40px square and the largest two get the 320 panel,
  // where there is room to draw them as cards rather than list rows.
  const entries = current
    ? current.items.map((it) => ({ key: it.path, label: it.label, icon: it.icon, to: it.path, locked: it.locked }))
    : sections
        .map((s, i) => ({ key: s.label, label: s.label, icon: s.items[0]?.icon, to: null as string | null, index: i, count: s.items.length }))
        .sort((a, b) => a.count - b.count);

  // Scale the whole tiling to fit, rather than reflowing it: a Fibonacci spiral
  // that reflows stops being one.
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 32) / BOX_W, (window.innerHeight - 120) / BOX_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const inTiles = entries.slice(0, SMALL_SLOTS);
  const overflow = entries.slice(SMALL_SLOTS);
  // Two or three entries in a 320px square look lost as list rows, so the panel
  // draws them as cards that fill it instead.
  const roomy = overflow.length > 0 && overflow.length <= 3;

  const ease = [0.34, 1.56, 0.64, 1] as const;
  const springIn = (i: number) =>
    calm ? { duration: 0 } : { duration: 0.55, delay: 0.04 * i, ease };

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      {/* Ground. Tapping it closes; it also stops the page behind reading through. */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: "rgba(4,6,16,0.72)",
          backdropFilter: "blur(10px)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.35 }}
        onClick={close}
        aria-hidden={!open}
      />

      <div
        className="absolute pointer-events-none"
        style={{
          left: "50%", bottom: 24,
          width: BOX_W, height: BOX_H,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: "bottom center",
        }}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label="Navigation"
      >
        {/* Tile 0 — the trigger, and once open the way back out. */}
        <button
          onClick={() => (section !== null ? back() : toggle())}
          aria-label={section !== null ? "Back to sections" : open ? "Close the menu" : "Open the menu"}
          aria-expanded={open}
          className="absolute grid place-items-center rounded-xl"
          style={{
            width: TILES[0].w, height: TILES[0].h, left: TILES[0].x, bottom: TILES[0].y,
            background: open ? "rgba(255,255,255,0.08)" : ROYAL.gold,
            color: open ? ROYAL.text : "#0b0b12",
            border: open ? `1px solid ${ROYAL.goldSoft}` : "none",
            borderRadius: open ? 0 : 12,
            transition: calm ? "none" : "all .45s cubic-bezier(.34,1.56,.64,1)",
            zIndex: 60,
            pointerEvents: "auto",
          }}
        >
          {section !== null ? <ChevronLeft className="w-5 h-5" /> : open ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
        </button>

        {/* Tiles 1..4 — the first four entries. */}
        {inTiles.map((e, i) => {
          const t = TILES[i + 1];
          const Icon = e.icon;
          const body = (
            <>
              {Icon && <Icon className="shrink-0" style={{ width: t.w >= 120 ? 34 : 20, height: t.w >= 120 ? 34 : 20, color: ROYAL.gold }} />}
              {t.w >= 80 && (
                <span className="px-2 text-center leading-tight" style={{ fontSize: t.w >= 200 ? 15 : 10.5, color: ROYAL.text }}>
                  {e.label}
                </span>
              )}
              {"count" in e && t.w >= 120 && (
                <span style={{ fontSize: 10, color: ROYAL.dim }}>{e.count} modules</span>
              )}
              {"locked" in e && e.locked && <Lock className="w-3 h-3" style={{ color: ROYAL.dim }} />}
            </>
          );
          const shell = "absolute flex flex-col items-center justify-center gap-1 overflow-hidden";
          const style: React.CSSProperties = {
            width: t.w, height: t.h, left: t.x, bottom: t.y,
            background: "rgba(20,20,28,0.62)",
            border: `1px solid ${ROYAL.goldSoft}`,
            backdropFilter: "blur(15px)",
            boxShadow: "0 10px 30px rgba(0,0,0,.3)",
            pointerEvents: open ? "auto" : "none",
          };
          return (
            <motion.div
              key={e.key}
              className={shell}
              style={style}
              initial={false}
              animate={open ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 0.2, rotate: -90 }}
              transition={springIn(i)}
            >
              {e.to ? (
                <Link href={e.to} onClick={close} aria-label={e.label} className="w-full h-full flex flex-col items-center justify-center gap-1">
                  {body}
                </Link>
              ) : (
                <button onClick={() => openSection((e as { index: number }).index)} aria-label={e.label}
                        className="w-full h-full flex flex-col items-center justify-center gap-1">
                  {body}
                </button>
              )}
            </motion.div>
          );
        })}

        {/* Tile 5 — the 320² square, subdivided by φ to carry everything else. */}
        <motion.div
          className="absolute overflow-hidden flex flex-col"
          style={{
            width: TILES[5].w, height: TILES[5].h, left: TILES[5].x, bottom: TILES[5].y,
            background: "rgba(20,20,28,0.62)",
            border: `1px solid ${ROYAL.goldSoft}`,
            backdropFilter: "blur(15px)",
            boxShadow: "0 10px 30px rgba(0,0,0,.3)",
            pointerEvents: open ? "auto" : "none",
          }}
          initial={false}
          animate={open ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 0.2, rotate: -90 }}
          transition={springIn(SMALL_SLOTS)}
        >
          <div className="px-4 pt-4 pb-2 shrink-0">
            <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: ROYAL.dim }}>
              {current ? current.label : "StormSync"}
            </div>
            <div className="text-2xl font-extrabold" style={{ color: ROYAL.text }}>
              {current ? `${current.items.length} modules` : "Where to?"}
            </div>
          </div>
          <div className={`flex-1 overflow-y-auto px-3 pb-3 ${roomy ? "flex flex-col gap-2" : "space-y-1"}`}>
            {overflow.map((e) => {
              const Icon = e.icon;
              const inner = roomy ? (
                <>
                  {Icon && <Icon className="w-7 h-7 shrink-0" style={{ color: ROYAL.gold }} />}
                  <div className="min-w-0">
                    <div className="text-[17px] font-semibold leading-tight" style={{ color: ROYAL.text }}>{e.label}</div>
                    {"count" in e && <div className="text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>{e.count} modules</div>}
                  </div>
                  {"locked" in e && e.locked && <Lock className="ml-auto w-3.5 h-3.5" style={{ color: ROYAL.dim }} />}
                </>
              ) : (
                <>
                  {Icon && <Icon className="w-4 h-4 shrink-0" style={{ color: ROYAL.gold }} />}
                  <span className="truncate text-sm" style={{ color: ROYAL.text }}>{e.label}</span>
                  {"count" in e && <span className="ml-auto text-[10px]" style={{ color: ROYAL.dim }}>{e.count}</span>}
                  {"locked" in e && e.locked && <Lock className="ml-auto w-3 h-3" style={{ color: ROYAL.dim }} />}
                </>
              );
              const cls = roomy
                ? "flex-1 flex items-center gap-3 px-4 rounded-xl hover:bg-white/5 text-left"
                : "flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5";
              const roomyStyle = roomy
                ? { background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}` }
                : undefined;
              return e.to ? (
                <Link key={e.key} href={e.to} onClick={close} aria-label={e.label} className={cls} style={roomyStyle}>
                  {inner}
                </Link>
              ) : (
                <button key={e.key} onClick={() => openSection((e as { index: number }).index)} aria-label={e.label}
                        className={`w-full ${cls}`} style={roomyStyle}>
                  {inner}
                </button>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
