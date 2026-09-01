import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Lock, X } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Solari.
 *
 * A split-flap departure board. Rows arrive the way an airport board arrives —
 * each character riffling through the alphabet until it lands — and the whole
 * board re-flips when you pick a section.
 *
 * The reason to build a menu this way is that the theatre costs nothing in
 * readability. Underneath the animation it is a plain left-aligned list of
 * rows, which is the fastest thing to scan that exists and the only shape that
 * does not degrade at 37 modules. Every other ornate menu trades legibility for
 * spectacle; this one puts the spectacle in the transition and leaves the
 * resting state alone.
 *
 * The flap is CSS, not a library: each character is one span whose content is
 * swapped on a timer. Thirty rows of twenty characters is six hundred spans, so
 * the settle is staggered per row and per column and every character stops for
 * good once it lands — nothing loops.
 */
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&·- ";
const FONT_PX = 13.5;
/** Monospace advance is ~0.62em; the board sizes itself to what will fit. */
const CH_PX = FONT_PX * 0.62;
const FLAP_MS = 42;       // time on each intermediate glyph
const FLAPS = 7;          // how many glyphs a character riffles through
const ROW_STAGGER = 55;

/** One split-flap character. Riffles, then stops for good. */
function Flap({ target, delay, still }: { target: string; delay: number; still: boolean }) {
  const [ch, setCh] = useState(still ? target : " ");
  const [settled, setSettled] = useState(still);

  useEffect(() => {
    if (still) { setCh(target); setSettled(true); return; }
    setSettled(false);
    let n = 0;
    let timer = 0;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        n += 1;
        if (n >= FLAPS) {
          window.clearInterval(timer);
          setCh(target);
          setSettled(true);
          return;
        }
        setCh(GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
      }, FLAP_MS);
    }, delay);
    return () => { window.clearTimeout(start); window.clearInterval(timer); };
  }, [target, delay, still]);

  return (
    <span
      className="relative inline-block text-center"
      style={{
        width: "1ch",
        color: settled ? ROYAL.gold : "rgba(217,183,117,0.55)",
        // The seam across the middle of a real flap.
        backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.05) 0 49%, rgba(0,0,0,0.35) 49% 51%, rgba(255,255,255,0.02) 51% 100%)",
        transform: settled ? "none" : "rotateX(18deg)",
        transition: settled ? "transform .12s ease-out" : "none",
      }}
    >
      {ch === " " ? " " : ch}
    </span>
  );
}

/** A row of flaps. `gen` forces every character to re-riffle when the board changes. */
function FlapRow({ text, row, gen, still, cols }: { text: string; row: number; gen: number; still: boolean; cols: number }) {
  const chars = useMemo(() => {
    const up = text.toUpperCase().replace(/[^A-Z0-9&·\- ]/g, " ").slice(0, cols);
    return (up + " ".repeat(cols)).slice(0, cols).split("");
  }, [text, cols]);

  return (
    <span className="font-mono tracking-[0.06em] whitespace-pre" style={{ fontSize: FONT_PX }}>
      {chars.map((c, i) => (
        <Flap key={`${gen}-${row}-${i}`} target={c} delay={row * ROW_STAGGER + i * 14} still={still} />
      ))}
    </span>
  );
}

export function SolariMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;
  const still = calm;

  // How many flaps fit. Fixing this at eighteen cut "Meteorological Technology"
  // to "METEOROLOGICAL TEC" on a phone that had room for all of it — a real
  // departure board truncates, but never a word short of the space available.
  const [cols, setCols] = useState(20);
  useEffect(() => {
    const measure = () => {
      const board = Math.min(window.innerWidth - 24, 440);
      const forChars = board - 24 /* padding */ - 26 /* icon */ - 34 /* index */;
      setCols(Math.max(12, Math.min(34, Math.floor(forChars / CH_PX))));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Bumped on every board change so the flaps re-run rather than sitting still.
  const gen = useRef(0);
  const key = `${open}-${section}`;
  const lastKey = useRef(key);
  if (lastKey.current !== key) { lastKey.current = key; gen.current += 1; }

  const rows = current
    ? current.items.map((it) => ({ label: it.label, path: it.path, locked: it.locked, icon: it.icon }))
    : sections.map((s, i) => ({ label: s.label, path: null as string | null, locked: false, icon: s.icon, idx: i }));

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(120% 70% at 50% 0%, rgba(217,183,117,0.07), transparent 60%), #05050b",
          backdropFilter: "blur(14px)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: still ? 0 : 0.28 }}
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
            {/* Board header — the strip above a real departure board. */}
            <div
              className="px-5 pt-10 pb-2.5 shrink-0"
              style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[9.5px] uppercase tracking-[0.4em]" style={{ color: ROYAL.gold }}>
                  {current ? "Modules" : "Departures"}
                </span>
                <span className="text-[9.5px] tabular-nums" style={{ color: ROYAL.dim }}>
                  {rows.length.toString().padStart(2, "0")}
                </span>
              </div>
              <div
                className="text-[20px] font-semibold leading-tight mt-0.5"
                style={{ color: ROYAL.text, fontFamily: HEADING }}
              >
                {current ? current.label : "StormSync"}
              </div>
            </div>

            {/* The board */}
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div
                className="rounded-xl overflow-hidden mx-auto"
                style={{
                  maxWidth: 440,
                  background: "linear-gradient(180deg, #0a0a12, #06060c)",
                  border: `1px solid ${ROYAL.hairline}`,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05), 0 18px 40px -24px #000",
                }}
              >
                {rows.map((r, i) => {
                  const Icon = r.icon;
                  const body = (
                    <>
                      <Icon className="w-4 h-4 shrink-0" style={{ color: ROYAL.gold, opacity: 0.8 }} />
                      <FlapRow text={r.label} row={i} gen={gen.current} still={still} cols={cols} />
                      {r.locked
                        ? <Lock className="w-3.5 h-3.5 ml-auto shrink-0" style={{ color: ROYAL.dim }} />
                        : <span className="ml-auto text-[10px] tabular-nums shrink-0" style={{ color: ROYAL.dim }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>}
                    </>
                  );
                  const rowStyle = {
                    borderTop: i === 0 ? "none" : `1px solid rgba(0,0,0,0.6)`,
                    background: i % 2 ? "rgba(255,255,255,0.012)" : "transparent",
                  };
                  return r.path ? (
                    <Link
                      key={r.path}
                      href={r.path}
                      onClick={close}
                      className="flex items-center gap-2.5 px-3 py-2.5 w-full"
                      style={rowStyle}
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      key={r.label}
                      onClick={() => openSection((r as { idx: number }).idx)}
                      className="flex items-center gap-2.5 px-3 py-2.5 w-full text-left"
                      style={rowStyle}
                    >
                      {body}
                    </button>
                  );
                })}
              </div>
            </div>

            {section !== null && (
              <div className="shrink-0 px-5 pb-4">
                <button
                  onClick={back}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
                  style={{ color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(255,255,255,0.03)" }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> All departures
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
        {open ? <X className="w-5 h-5" /> : <BoardGlyph calm={still} />}
      </button>
    </div>
  );
}

/** Three flaps turning over, in miniature. */
function BoardGlyph({ calm }: { calm: boolean }) {
  return (
    <span className="relative block font-mono" style={{ width: 22, height: 18 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute left-0 rounded-[1.5px]"
          style={{
            width: 22, height: 4, top: i * 6,
            background: `linear-gradient(180deg, ${ROYAL.gold} 0 45%, rgba(0,0,0,0.55) 45% 55%, ${ROYAL.gold} 55%)`,
            transformOrigin: "50% 100%",
          }}
          animate={calm ? undefined : { rotateX: [0, -80, 0], opacity: [1, 0.35, 1] }}
          transition={calm ? undefined : {
            duration: 2.2, repeat: Infinity, ease: EASE, delay: i * 0.18, times: [0, 0.35, 1],
          }}
        />
      ))}
    </span>
  );
}

export default SolariMenu;
