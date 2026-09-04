import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { listWall } from "../lib/wall";
import {
  subscribeWallStyle, getWallStyleSnapshot, getWallStyleServerSnapshot,
  carve, carveCore, tint, type WallStyle,
} from "../lib/wallStyle";
import { HEADING, EASE, prefersReducedMotion } from "../lib/royal";

/**
 * The wall.
 *
 * A slate board with names cut into it. One gold name at the top, a line
 * scratched underneath it by hand, and everyone else in white below that.
 * Names and nothing else — no captions saying what anybody won, no headings
 * explaining what the board is. A wall of names explains itself, and labelling
 * each one with its prize turns a monument into a receipt.
 *
 * WHY IT IS BARELY THERE. The previous version was a sheet of gold, and it
 * shouted: on a near-black page it stopped being part of the app and became a
 * banner sitting on top of it. This one is the page's own darkness with a
 * surface — you notice the names before you notice the board, which is the
 * right way round.
 *
 * HYPER-REAL SLATE, HONESTLY CHEAP. Real chalkboard is not a flat fill. It has
 * a grain, it has the ghosts of a hundred erasings smeared in arcs across it,
 * it is darker at the edges than in the middle, and it has a faint sheen where
 * the light crosses it. All four are here as stacked gradients plus one static
 * SVG turbulence tile — no images to load, nothing animated, so the texture
 * costs a paint and never a frame.
 *
 * CARVED, NOT PRINTED. A cut letter is a groove: dark hard edge below where the
 * near wall is in shadow, softer dark above, and light living inside it. The
 * glow is what makes it read as cut rather than drawn, and it is also the thing
 * that turns the whole board into a neon sign the moment it is overdone — so it
 * is a dial the owner can turn, defaulting low.
 */
export function NameWall({ compact = false }: { compact?: boolean }) {
  const still = prefersReducedMotion();
  const q = useQuery({ queryKey: ["wall"], queryFn: () => listWall(), staleTime: 5 * 60_000 });
  const { style } = useSyncExternalStore(
    subscribeWallStyle, getWallStyleSnapshot, getWallStyleServerSnapshot);

  const rows = q.data ?? [];
  const blessed = useMemo(() => rows.find((r) => r.slot === "blessed") ?? null, [rows]);
  const roll = useMemo(() => rows.filter((r) => r.slot !== "blessed"), [rows]);

  // Only the flicker is hidden while it loads. An empty board still goes up:
  // it is how most members find out the prize exists at all.
  if (q.isLoading) return null;

  return (
    <section className="relative h-full rounded-2xl overflow-hidden" aria-label="The wall of names"
             style={boardStyle(style)}>
      <Slate style={style} />

      <div className={`relative flex flex-col items-center justify-center text-center h-full ${
        compact ? "px-4 py-5" : "px-5 py-7 md:px-7"}`}>
        {/* ── the one name ─────────────────────────────────────────────── */}
        {blessed ? (
          <motion.span
            className={`block break-words ${compact ? "text-[19px] md:text-[22px]" : "text-[22px] md:text-[27px]"}`}
            style={{
              // Lighter weight and wider tracking on purpose: a thick letter
              // with a halo is a neon sign, and a thin one with the same halo
              // is a chisel mark. The reference is all thin strokes.
              fontFamily: HEADING, fontWeight: 500, letterSpacing: "0.16em",
              color: carveCore(style.blessed, style.glow),
              textShadow: carve(style.blessed, style.glow, compact ? 1 : 1.25),
            }}
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            {blessed.display}
          </motion.span>
        ) : (
          <span className={`block ${compact ? "text-[13px]" : "text-[15px]"}`}
                style={{
                  fontFamily: HEADING, fontWeight: 600, letterSpacing: "0.06em",
                  color: tint(style.blessed, 0.34),
                }}>
            Unclaimed
          </span>
        )}

        {/* ── the line somebody scratched under it ─────────────────────── */}
        <Squiggle style={style} compact={compact} />

        {/* ── everybody else ───────────────────────────────────────────── */}
        {roll.length === 0 ? (
          <span className={compact ? "text-[11px]" : "text-[12px]"}
                style={{ color: tint(style.roll, 0.3), fontFamily: HEADING, letterSpacing: "0.05em" }}>
            No names yet
          </span>
        ) : (
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
            {roll.map((n, i) => (
              <motion.li
                key={n.id}
                initial={still ? false : { opacity: 0, y: 4 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={still ? { duration: 0 } : { duration: 0.45, delay: Math.min(i, 10) * 0.05, ease: EASE }}
                className={`break-words ${compact ? "text-[12.5px]" : "text-[14px] md:text-[15px]"}`}
                style={{
                  fontFamily: HEADING, fontWeight: 500, letterSpacing: "0.11em",
                  color: carveCore(style.roll, style.glow),
                  textShadow: carve(style.roll, style.glow, compact ? 0.75 : 0.9),
                }}
              >
                {n.display}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ── the board ────────────────────────────────────────────────────────────── */

/**
 * The slate itself.
 *
 * `brightness` decides how far it lifts off the page rather than how light the
 * board is — a chalkboard that is actually bright stops being a chalkboard. So
 * the dial moves the edge light, the surface sheen and the border, and leaves
 * the slate colour alone.
 */
function boardStyle(s: WallStyle): CSSProperties {
  const b = s.brightness / 100;
  return {
    background: s.board,
    border: `1px solid ${tint(s.rule, 0.1 + b * 0.22)}`,
    boxShadow: `inset 0 1px 0 rgba(255,255,255,${(0.02 + b * 0.05).toFixed(3)}),`
             + ` inset 0 0 60px rgba(0,0,0,0.75),`
             + ` 0 18px 40px -30px #000`,
  };
}

/** Grain, erasing ghosts, vignette and sheen. Four layers, none of them moving. */
function Slate({ style }: { style: WallStyle }) {
  const b = style.brightness / 100;
  return (
    <>
      {/* Grain. One tile of fractal noise, drawn by the browser, no request. */}
      <span aria-hidden className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(
          `<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>` +
          `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/>` +
          `<feColorMatrix type='saturate' values='0'/></filter>` +
          `<rect width='140' height='140' filter='url(%23n)' opacity='0.5'/></svg>`)}")`,
        opacity: 0.06 + b * 0.04,
        mixBlendMode: "overlay",
      }} />
      {/* The ghosts of erasing: broad, faint, off-axis arcs. */}
      <span aria-hidden className="absolute inset-0 pointer-events-none" style={{
        background:
          `radial-gradient(60% 22% at 22% 34%, rgba(226,232,240,${(0.030 + b * 0.030).toFixed(3)}), transparent 70%),` +
          `radial-gradient(48% 18% at 74% 26%, rgba(226,232,240,${(0.022 + b * 0.024).toFixed(3)}), transparent 72%),` +
          `radial-gradient(70% 20% at 56% 76%, rgba(226,232,240,${(0.026 + b * 0.026).toFixed(3)}), transparent 74%),` +
          `radial-gradient(38% 26% at 12% 82%, rgba(226,232,240,${(0.018 + b * 0.020).toFixed(3)}), transparent 76%)`,
        transform: "rotate(-1.4deg) scale(1.06)",
      }} />
      {/* Sheen along the top, vignette into the corners. */}
      <span aria-hidden className="absolute inset-0 pointer-events-none" style={{
        background:
          `linear-gradient(178deg, rgba(255,255,255,${(0.020 + b * 0.030).toFixed(3)}), transparent 34%),` +
          `radial-gradient(120% 90% at 50% 45%, transparent 42%, rgba(0,0,0,0.55))`,
      }} />
    </>
  );
}

/**
 * The line under the blessed name.
 *
 * Drawn as one hand-wobbled path rather than a rule, because the brief was a
 * scratch somebody made with a blade and "it's not perfect" is the whole
 * point — a centred 1px border reads as furniture. The wobble is fixed rather
 * than random so it does not change shape on every render, which would be its
 * own kind of wrong: a scratch in slate stays where it was cut.
 */
function Squiggle({ style, compact }: { style: WallStyle; compact: boolean }) {
  const g = style.glow / 100;
  return (
    <svg
      aria-hidden
      viewBox="0 0 220 12"
      className={compact ? "my-3" : "my-4"}
      style={{ width: compact ? 150 : 190, height: compact ? 9 : 12, overflow: "visible" }}
      preserveAspectRatio="none"
    >
      {/* The shadow in the groove, offset a hair down, as with the letters. */}
      {/* The dark the broken edge throws, then the lit groove over it — the
          same two parts as a letter, so the scratch belongs to the same hand. */}
      <path d={SQUIGGLE} fill="none" stroke="rgba(0,0,0,0.92)" strokeWidth={2.4}
            strokeLinecap="round" transform="translate(0,1.3)" />
      <path d={SQUIGGLE} fill="none" stroke={carveCore(style.rule, style.glow)} strokeWidth={1.15}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 ${(1 + g * 3).toFixed(1)}px ${tint(style.rule, 0.55 + g * 0.35)})`
                           + ` drop-shadow(0 0 ${(4 + g * 12).toFixed(1)}px ${tint(style.rule, 0.18 + g * 0.3)})` }} />
    </svg>
  );
}

/**
 * One scratch, with the pressure and direction changes of a real one: it digs
 * in at the start, wanders off the centreline, and lifts before the end.
 */
const SQUIGGLE =
  "M4,7.4 C22,5.2 30,8.4 48,6.1 C64,4.1 72,7.9 92,5.6 " +
  "C106,4.0 116,8.1 132,6.0 C150,3.7 158,7.6 176,5.4 C192,3.5 202,6.4 216,4.9";
