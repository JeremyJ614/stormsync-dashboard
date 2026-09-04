import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { listWall } from "../lib/wall";
import {
  subscribeWallStyle, getWallStyleSnapshot, getWallStyleServerSnapshot,
  carve, carveCore, grooveFill, carvedType, tint, type WallStyle,
} from "../lib/wallStyle";
import { EASE, prefersReducedMotion } from "../lib/royal";

/**
 * The wall.
 *
 * A slate board with names cut into it. One name at the top in gold, a line
 * scratched under it by hand, and everyone else in white below. Names and
 * nothing else — no captions saying what anybody won, no heading explaining
 * what the board is. A wall of names explains itself, and labelling each one
 * with its prize turns a monument into a receipt.
 *
 * HOW A LETTER IS ACTUALLY CARVED HERE — two layers, and it needs both.
 *
 * The first attempt was one layer: a flat-coloured glyph with a glow hung off
 * it. That is a font with an effect on it, and it looked like one, because
 * every pixel of every stroke was the same colour and real carving never is.
 *
 * So: the BACK layer is the light escaping the groove onto the surface — the
 * bloom, and only the bloom. The FRONT layer is the cut itself, drawn by
 * painting a vertical gradient through the glyphs: shadowed along the top edge
 * where the near wall turns away from the light, brightest through the middle
 * where the light pools at the bottom of the V, a hard bright rim along the
 * lower lip, then back into shadow. Stack them and the bloom spills past the
 * edges of a letter that is itself shaded like a trench.
 *
 * The face is Cinzel by default — Roman inscriptional capitals, letterforms
 * drawn to be cut into stone with a chisel. Everything about the type is the
 * owner's to change in the admin panel, because "carved" is a look somebody
 * has to be able to judge on their own screen.
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

      <div className={`relative flex flex-col items-center justify-center text-center h-full
                       ${compact ? "px-2.5 py-4" : "px-3 py-5 sm:px-5 sm:py-6"}`}>
        {/* ── the one name ─────────────────────────────────────────────── */}
        {blessed ? (
          <Carved
            text={blessed.display}
            colour={style.blessed}
            style={style}
            /* Fluid rather than stepped: this sits in half a phone screen at
               one end and half a desktop row at the other, and a name has to
               be cut at the right size for the space it is in at every width
               in between — not at three chosen ones. */
            size={compact ? "clamp(13px, 4.4vw, 21px)" : "clamp(15px, 2.4vw, 27px)"}
            still={still}
          />
        ) : (
          <span style={{
            ...carvedType(style),
            fontSize: compact ? "clamp(10px, 3vw, 13px)" : "13px",
            color: tint(style.blessed, 0.32),
          }}>
            Unclaimed
          </span>
        )}

        {/* ── the line somebody scratched under it ─────────────────────── */}
        <Squiggle style={style} compact={compact} />

        {/* ── everybody else ───────────────────────────────────────────── */}
        {roll.length === 0 ? (
          <span style={{
            ...carvedType(style),
            fontSize: compact ? "clamp(9px, 2.6vw, 11px)" : "11.5px",
            color: tint(style.roll, 0.28),
          }}>
            No names yet
          </span>
        ) : (
          <ul className={`flex flex-wrap justify-center ${compact ? "gap-x-2.5 gap-y-1" : "gap-x-4 gap-y-1.5"}`}>
            {roll.map((n, i) => (
              <motion.li
                key={n.id}
                initial={still ? false : { opacity: 0, y: 4 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={still ? { duration: 0 } : { duration: 0.45, delay: Math.min(i, 10) * 0.05, ease: EASE }}
              >
                <Carved
                  text={n.display}
                  colour={style.roll}
                  style={style}
                  size={compact ? "clamp(9px, 2.7vw, 13px)" : "clamp(11px, 1.2vw, 15px)"}
                  scale={compact ? 0.7 : 0.85}
                  still={still}
                />
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ── a carved name ────────────────────────────────────────────────────────── */

/**
 * One name, cut into the board.
 *
 * The back copy carries the bloom and is `aria-hidden`; the front copy carries
 * the groove gradient and is the one a screen reader sees, so the name is
 * announced once rather than twice.
 *
 * `paintOrder`/`WebkitTextStroke` are deliberately absent: an outline is the
 * thing that made the first version look pasted on. The only darkness is the
 * shadow in `carve`, seating it into the surface.
 */
function Carved({
  text, colour, style, size, scale = 1, still,
}: {
  text: string; colour: string; style: WallStyle;
  size: string; scale?: number; still: boolean;
}) {
  const type = carvedType(style);
  const shared: CSSProperties = {
    ...type,
    fontSize: size,
    lineHeight: 1.16,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  };
  return (
    <motion.span
      className="relative inline-block"
      initial={still ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE }}
      style={shared}
    >
      {/* the light coming out of the cut */}
      <span aria-hidden className="absolute inset-0 pointer-events-none" style={{
        ...shared,
        color: carveCore(colour, style.glow),
        textShadow: carve(colour, style.glow, scale),
      }}>
        {text}
      </span>
      {/* the cut */}
      <span className="relative" style={{
        ...shared,
        backgroundImage: grooveFill(colour, style.glow, style.bevel),
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }}>
        {text}
      </span>
    </motion.span>
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
 * One hand-wobbled path rather than a rule, because the brief was a scratch
 * somebody made with a blade and "it's not perfect" is the point — a centred
 * 1px border reads as furniture. The wobble is fixed rather than random so it
 * does not change shape on every render: a scratch in slate stays where it was
 * cut.
 */
function Squiggle({ style, compact }: { style: WallStyle; compact: boolean }) {
  const g = style.glow / 100;
  return (
    <svg
      aria-hidden
      viewBox="0 0 220 12"
      className={compact ? "my-2" : "my-3.5"}
      style={{ width: compact ? "62%" : "56%", maxWidth: 190, height: compact ? 8 : 11, overflow: "visible" }}
      preserveAspectRatio="none"
    >
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
