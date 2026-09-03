import { useMemo, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { listWall, type WallName } from "../lib/wall";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

/**
 * The wall.
 *
 * A sheet of burnished gold in a dark stone frame, with names cut into the
 * metal, and one inlaid slot at the top that holds a single name at a time.
 *
 * WHY GOLD UNDER THE NAMES RATHER THAN GOLD LETTERS. Gold text on a dark panel
 * is the obvious reading of "golden plaque" and it is the wrong one: at the
 * size a name has to be legible on a phone, gold-on-black is a thin bright
 * stroke that smears on an OLED and disappears at a glance. Real engraved
 * plaques work the other way round — the metal is the field, and the letters
 * are dark recesses in it. So the plaque is the gold, and the names are cut
 * into it in deep bronze. That is both the more authentic object and, at
 * roughly 6.5:1, far more readable than any arrangement of gold type.
 *
 * HOW A CUT LETTER IS DRAWN. A recess in a top-lit surface is dark in the
 * letter itself, has a hard bright lip along its LOWER edge where the far wall
 * of the cut catches the light, and a soft shadow above it. Three shadows,
 * scaled together so a heading and a name in the roll look struck by the same
 * chisel.
 *
 * THE ONE NAME sits in an obsidian inlay set into the gold — a different
 * material, which is what makes it read as a different rank rather than as a
 * bigger version of the same thing. It gets the only bright thing on the
 * component: a band of light that travels THROUGH the letters, masked to the
 * glyphs, so the stone looks lit from within. The brief asked for godly and
 * explicitly not bright, so it is pale gold at a third opacity taking nine
 * seconds to cross.
 *
 * EVERYTHING THAT MOVES IS transform OR opacity. The sheen is a skewed bar
 * translated across the plaque, not an animated background-position, and
 * nothing here carries a blur filter — an animated `filter: blur()`
 * re-rasterises every frame and was measurably the thing making another menu
 * in this app stutter. Under reduced motion none of it runs and the plaque is
 * simply a lit object.
 */
export function NameWall() {
  const still = prefersReducedMotion();
  const q = useQuery({ queryKey: ["wall"], queryFn: () => listWall(), staleTime: 5 * 60_000 });

  const rows = q.data ?? [];
  const blessed = useMemo(() => rows.find((r) => r.slot === "blessed") ?? null, [rows]);
  const roll = useMemo(() => rows.filter((r) => r.slot !== "blessed"), [rows]);

  // An empty wall still goes up. It was tempting to render nothing until the
  // first name arrives, but the plaque is how most members will find out the
  // prize exists at all — an empty one that says the slot is unclaimed sells
  // the draw, and a homepage that silently omits the feature until somebody
  // wins it sells nothing. The only thing hidden while it loads is the flicker.
  if (q.isLoading) return null;

  return (
    <section className="relative rounded-3xl p-[3px]" aria-label="The wall of names"
             style={{
               // The frame: dark stone with a gold bezel, so the plaque inside
               // reads as mounted rather than as a coloured div.
               background:
                 `linear-gradient(160deg, rgba(233,206,152,0.75), rgba(122,93,44,0.35) 40%,` +
                 ` rgba(233,206,152,0.55) 70%, rgba(90,68,30,0.4))`,
               boxShadow: "0 30px 70px -46px #000, 0 0 0 1px rgba(0,0,0,0.6)",
             }}>
      <div className="relative overflow-hidden rounded-[21px]" style={{ background: "#0a0812" }}>
        {/* ── the metal ────────────────────────────────────────────────── */}
        <div className="absolute inset-0" aria-hidden style={GOLD} />
        {/* Brushed grain, kept as its own layer so it sits at a fixed strength
            over every band of the gradient beneath it. */}
        <div className="absolute inset-0" aria-hidden style={GRAIN} />
        {/* The plaque is lit from above; the bottom third falls away. */}
        <div className="absolute inset-0" aria-hidden
             style={{ background: "linear-gradient(180deg, rgba(255,250,235,0.16), transparent 26%, rgba(40,24,4,0.22) 82%, rgba(24,14,2,0.38))" }} />
        <Sheen still={still} />

        <Corners />

        <div className="relative px-5 py-7 md:px-10 md:py-9">
          <header className="text-center">
            <Crown />
            <h2 className="text-[21px] md:text-[27px] mt-2"
                style={{ fontFamily: HEADING, fontWeight: 800, letterSpacing: "0.14em", ...cut(1.15) }}>
              THE WALL
            </h2>
            <p className="text-[11px] mt-1.5 tracking-[0.14em] uppercase"
               style={{ color: "rgba(58,42,16,0.62)", fontWeight: 600 }}>
              Names won, and kept
            </p>
          </header>

          {/* ── the one name ───────────────────────────────────────────── */}
          <div className="mt-6 flex justify-center">
            <Inlay name={blessed} still={still} />
          </div>

          {/* The rule that separates the one from the many, struck into the
              metal the same way the letters are. */}
          <div className="mt-7 flex items-center gap-3" aria-hidden>
            <Rule flip />
            <span className="w-1.5 h-1.5 rotate-45 shrink-0"
                  style={{ background: "rgba(58,42,16,0.5)", boxShadow: "0 1px 0 rgba(255,246,222,0.5)" }} />
            <Rule />
          </div>

          {/* ── the roll ───────────────────────────────────────────────── */}
          {roll.length === 0 ? (
            <p className="mt-6 text-center text-[11.5px]" style={{ color: "rgba(58,42,16,0.6)" }}>
              The roll is empty. The first name goes up the moment somebody wins one.
            </p>
          ) : (
            <ul className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
              {roll.map((n, i) => (
                <motion.li
                  key={n.id}
                  className="text-center"
                  initial={still ? false : { opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={still ? { duration: 0 } : { duration: 0.5, delay: Math.min(i, 12) * 0.04, ease: EASE }}
                >
                  <span className="block text-[13.5px] md:text-[15px] leading-tight break-words"
                        style={{ fontFamily: HEADING, fontWeight: 700, letterSpacing: "0.035em", ...cut(0.85) }}>
                    {n.display}
                  </span>
                  {n.note && (
                    <span className="block text-[8.5px] mt-1 uppercase tracking-[0.18em]"
                          style={{ color: "rgba(58,42,16,0.52)", fontWeight: 600 }}>
                      {n.note}
                    </span>
                  )}
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── the material ─────────────────────────────────────────────────────────── */

/**
 * Gold leaf. Broad soft bands rather than a two-stop ramp: a flat gradient
 * reads as yellow plastic, and it is the alternation of warm highlight and
 * cooler shadow across the sheet that makes metal look like metal.
 */
const GOLD: CSSProperties = {
  background:
    "radial-gradient(130% 90% at 50% -25%, rgba(255,251,236,0.55), transparent 58%)," +
    "linear-gradient(163deg," +
    " #b8934f 0%, #e4c98f 12%, #cfa961 26%, #f0dcae 40%," +
    " #bc9552 55%, #ddbe83 70%, #a87f42 86%, #cfab6b 100%)",
};

const GRAIN: CSSProperties = {
  background:
    "repeating-linear-gradient(97deg, rgba(255,255,255,0.055) 0 1px, rgba(90,64,22,0.05) 1px 2px, transparent 2px 5px)",
  opacity: 0.6,
};

/** A slow bar of light crossing the sheet. Transform-only. */
function Sheen({ still }: { still: boolean }) {
  if (still) return null;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-[-20%] bottom-[-20%] w-[34%]"
      style={{
        left: 0,
        background: "linear-gradient(90deg, transparent, rgba(255,252,240,0.34), transparent)",
        transform: "skewX(-14deg)",
        willChange: "transform",
      }}
      initial={{ x: "-140%" }}
      animate={{ x: "520%" }}
      transition={{ duration: 5.5, repeat: Infinity, repeatDelay: 8, ease: "easeInOut" }}
    />
  );
}

/**
 * Letters cut into the metal.
 *
 * Dark in the recess; a hard bright lip along the lower edge where the far
 * wall of the cut faces the light; a soft shadow above it. `scale` keeps the
 * three offsets proportional at any size.
 */
function cut(scale: number): CSSProperties {
  const d = Math.max(1, Math.round(scale));
  return {
    color: "#372611",
    textShadow:
      `0 ${d}px 0 rgba(255,248,226,0.62), ` +
      `0 -${d}px ${d}px rgba(52,34,8,0.45), ` +
      `0 ${d * 2}px ${d * 2}px rgba(72,48,12,0.22)`,
  };
}

/** An engraved hairline. */
function Rule({ flip = false }: { flip?: boolean }) {
  return (
    <span className="h-[2px] flex-1 rounded-full"
          style={{
            background: `linear-gradient(${flip ? 270 : 90}deg, transparent, rgba(58,42,16,0.42))`,
            boxShadow: "0 1px 0 rgba(255,246,222,0.45)",
          }} />
  );
}

/** Struck corner ornaments — the "ancient kings" read, at almost no cost. */
function Corners() {
  const arm = (extra: CSSProperties): CSSProperties => ({
    position: "absolute", width: 26, height: 26,
    borderColor: "rgba(58,42,16,0.34)",
    filter: "drop-shadow(0 1px 0 rgba(255,246,222,0.45))",
    ...extra,
  });
  return (
    <div aria-hidden className="pointer-events-none absolute inset-3 md:inset-4">
      <span style={arm({ top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 10 })} />
      <span style={arm({ top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 10 })} />
      <span style={arm({ bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 10 })} />
      <span style={arm({ bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 10 })} />
    </div>
  );
}

/** A small struck crown above the title. */
function Crown() {
  return (
    <svg width="34" height="20" viewBox="0 0 34 20" className="mx-auto block" aria-hidden
         style={{ filter: "drop-shadow(0 1px 0 rgba(255,248,226,0.6))" }}>
      <path d="M2 17 L5 5 L11 11 L17 2 L23 11 L29 5 L32 17 Z"
            fill="rgba(55,38,13,0.72)" stroke="rgba(40,27,8,0.5)" strokeWidth="1" strokeLinejoin="round" />
      <rect x="2" y="17" width="30" height="2.4" rx="1.2" fill="rgba(55,38,13,0.72)" />
    </svg>
  );
}

/* ── the single slot ──────────────────────────────────────────────────────── */

/**
 * Obsidian set into the gold. Empty is a real state and says so rather than
 * collapsing, because an unclaimed slot is part of what makes the prize worth
 * winning.
 */
function Inlay({ name, still }: { name: WallName | null; still: boolean }) {
  return (
    <div className="relative rounded-2xl p-[2px] w-full max-w-md"
         style={{
           // The bezel: the lip of metal around the recess, bright on top where
           // it faces the light and dark underneath.
           background: "linear-gradient(180deg, rgba(74,52,18,0.9), rgba(240,222,180,0.85))",
           boxShadow: "0 2px 5px rgba(60,40,10,0.45)",
         }}>
      <div className="relative overflow-hidden rounded-[15px] px-6 py-4 md:px-10 md:py-5 text-center"
           style={{
             background:
               "radial-gradient(110% 130% at 50% 0%, rgba(217,183,117,0.14), transparent 68%)," +
               "linear-gradient(178deg, #171528, #0a0912 62%, #08070f)",
             boxShadow: "inset 0 3px 10px rgba(0,0,0,0.85), inset 0 -1px 0 rgba(217,183,117,0.14)",
           }}>
        {/* A warm breath behind the name — opacity only. */}
        {name && !still && (
          <motion.span aria-hidden className="pointer-events-none absolute inset-0"
                       style={{ background: "radial-gradient(80% 120% at 50% 110%, rgba(217,183,117,0.5), transparent 62%)" }}
                       initial={{ opacity: 0.16 }} animate={{ opacity: [0.16, 0.34, 0.16] }}
                       transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
        )}

        <div className="relative">
          <div className="text-[8.5px] uppercase tracking-[0.4em]"
               style={{ color: name ? ROYAL.gold : ROYAL.dim }}>
            The Blessed Name
          </div>

          {name ? (
            <div className="relative mt-1.5">
              <span className="block text-[22px] md:text-[28px] leading-tight break-words"
                    style={{
                      fontFamily: HEADING, fontWeight: 800, letterSpacing: "0.05em",
                      color: "#f4e6c4",
                      textShadow: "0 0 22px rgba(217,183,117,0.4), 0 1px 0 rgba(0,0,0,0.7)",
                    }}>
                {name.display}
              </span>

              {/* The light inside the stone: masked to the glyphs, so it travels
                  through the letters rather than across a rectangle over them. */}
              {!still && (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 block text-[22px] md:text-[28px] leading-tight break-words"
                  style={{
                    fontFamily: HEADING, fontWeight: 800, letterSpacing: "0.05em",
                    backgroundImage:
                      "linear-gradient(105deg, transparent 38%, rgba(255,248,228,0.9) 50%, transparent 62%)",
                    backgroundSize: "260% 100%",
                    WebkitBackgroundClip: "text", backgroundClip: "text",
                    color: "transparent",
                    opacity: 0.34,
                  }}
                  initial={{ backgroundPosition: "180% 0%" }}
                  animate={{ backgroundPosition: "-80% 0%" }}
                  transition={{ duration: 9, repeat: Infinity, repeatDelay: 3.5, ease: "linear" }}
                >
                  {name.display}
                </motion.span>
              )}

              {name.note && (
                <span className="block text-[9px] mt-1.5 uppercase tracking-[0.2em]"
                      style={{ color: "rgba(217,183,117,0.6)" }}>
                  {name.note}
                </span>
              )}
            </div>
          ) : (
            <p className="text-[12px] mt-2" style={{ color: ROYAL.dim }}>
              Unclaimed. One name at a time, and only from the Blessed draw.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
