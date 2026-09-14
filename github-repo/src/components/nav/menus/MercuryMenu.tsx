import { useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
import {
  AnimatePresence, animate, motion, useMotionValue, useTransform,
  type MotionValue,
} from "framer-motion";
import { ChevronLeft, Lock, Menu, X } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { entriesFor, moduleCount } from "./entries";
import type { MenuEntry } from "./entries";
import { ROYAL, HEADING } from "../../../lib/royal";

/**
 * Mercury.
 *
 * A reservoir of liquid metal hangs under the title. When the menu opens a
 * stream runs out of it and BEADS: the column stretches, the necks between the
 * beads thin, and each one pinches off into a separate drop. That break-up is a
 * real thing — a falling stream does it because surface tension costs less in
 * spheres than in a cylinder, which is why a tap runs smooth at the spout and
 * arrives as drops. It is the one behaviour of a liquid that everybody has
 * watched a hundred times and nobody has seen a menu do.
 *
 * It is also the right shape for this menu, which is the point. The traversal
 * here is one thing separating into its parts and then flowing back together,
 * and that is exactly what the drawing does: the sections come out of the
 * reservoir, and choosing one sends them back up and runs its modules out in
 * their place. Nothing is a metaphor laid over a list — the list IS the liquid.
 *
 * HOW IT IS DRAWN, AND WHY IT IS CHEAP
 * One motion value, `spread`, runs 0 → 1 on a spring. Everything else is read
 * off it: drop i's offset, and the scale of the neck above it. No component
 * re-renders while it moves — each drop subscribes to the value and writes a
 * transform, which is the compositor's job rather than React's.
 *
 * The necks are the trick. A neck is a fixed hourglass path in a box that is
 * ONE unit tall and one wide, stretched by `scaleY` as the gap opens and
 * squeezed by `scaleX` as the waist narrows. So a pinch-off is two numbers on a
 * transform, not a path recomputed per frame — and when a drop has landed its
 * neck has zero width, which means the settled menu is drawing nothing at all.
 *
 * THE METAL
 * It is chrome, not champagne, and that is a deliberate break from the app's
 * palette. A convex mirror shows you three things stacked: the light above it,
 * a dark band where it is reflecting the room, and the ground below it. Gold
 * pills with a top highlight are a button; those three bands in that order are
 * the only thing that reads as MOLTEN. The one concession to the palette is the
 * low band, which is warm — the drops are lit by the champagne the rest of the
 * app is made of, so they belong to it without being made of it.
 *
 * Each drop also carries a single diagonal specular streak. A gradient alone
 * describes a curved surface; a streak across it is a reflection of something
 * in the room, and a reflection is what tells you the surface is mirror-smooth.
 */

/**
 * The neck, in its own 10×10 box, squeezed and stretched from the foot.
 *
 * It has to be TALLER than it is wide or it reads as a shelf between two pills
 * rather than as a thread between two drops, which is what the first cut of
 * this did: the neck spanned the full 340px column inside a 15px gap, so the
 * pinch was a lip. So the neck is narrow — a tether off the middle of the drop
 * — and the gap it lives in is deep enough to stretch in. Nothing is lost by
 * not spanning the width: at the first frame every gap is zero and the drops
 * are touching, so the column is already unbroken without the neck's help.
 */
const NECK_W = 46;
const NECK_D =
  "M0,0 C0,2.8 3.2,3.4 3.2,5 C3.2,6.6 0,7.2 0,10 L10,10 C10,7.2 6.8,6.6 6.8,5 C6.8,3.4 10,2.8 10,0 Z";

const FLOW = { type: "spring", stiffness: 120, damping: 19, restDelta: 0.0004 } as const;

/** Mercury: white, room, warm ground. Locked drops are colder and flatter. */
const LIVE =
  "linear-gradient(180deg,#ffffff 0%,#eef1f6 7%,#b9c1cd 23%,#6a7280 41%,#2b303a 55%," +
  "#99a2b1 67%,#f4ead9 79%,#8d929d 91%,#4d525c 100%)";
const DEAD =
  "linear-gradient(180deg,#d7d9de 0%,#b6b9c1 10%,#80848d 28%,#4b4e57 46%,#26282f 58%," +
  "#6d7079 70%,#a9acb4 82%,#5a5d66 94%,#3a3c43 100%)";
/**
 * The reflection that proves it is a mirror and not a painted pill — and it is
 * NOT the same one on every drop. A column of identical streaks reads as a
 * decal; drops at different heights catch different parts of the room, so the
 * streak walks down the column.
 */
const specular = (i: number) => {
  const a = 12 + ((i * 17) % 46);
  return `linear-gradient(102deg, transparent ${a}%, rgba(255,255,255,0.36) ${a + 8}%,` +
         ` rgba(255,255,255,0.05) ${a + 14}%, transparent ${a + 25}%)`;
};

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Drop i's progress out of the reservoir. Each one leaves a little after the
 * one above it, and the stagger closes up as the list gets long so the last
 * drop still lands as the spring settles rather than well after it.
 */
function stagger(n: number) {
  const step = Math.min(0.058, 0.46 / Math.max(1, n - 1));
  return { step, span: 1 - step * (n - 1) };
}

export function MercuryMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, toggle, close, openSection, back, calm, containerRef } = nav;
  const entries = entriesFor(nav);

  // Drops shrink only when the column genuinely cannot hold the list.
  const n = entries.length;
  const H = n > 11 ? 38 : n > 8 ? 44 : 50;
  // The gap is what the break-up happens IN. At a third of the drop's height it
  // was fifteen pixels, and fifteen pixels of travel behind a fifty-pixel drop
  // is not an animation anybody sees — the first cut of this looked static.
  const G = Math.round(H * 0.62);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      {/* The gradients every neck shares. One definition, referenced across
          however many little SVGs are on screen. */}
      <svg width="0" height="0" aria-hidden className="absolute">
        <defs>
          <linearGradient id="sx-merc-neck" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a616e" />
            <stop offset="26%" stopColor="#e8edf4" />
            <stop offset="58%" stopColor="#2b303a" />
            <stop offset="82%" stopColor="#d4dae4" />
            <stop offset="100%" stopColor="#575c67" />
          </linearGradient>
          <linearGradient id="sx-merc-neck-dull" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4a4d55" />
            <stop offset="26%" stopColor="#b0b3bb" />
            <stop offset="58%" stopColor="#26282f" />
            <stop offset="82%" stopColor="#989ba3" />
            <stop offset="100%" stopColor="#45474f" />
          </linearGradient>
        </defs>
      </svg>

      <motion.div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(70% 40% at 50% 12%, rgba(217,183,117,0.13), transparent 70%),` +
            `linear-gradient(180deg, #0a0a14, #04040a)`,
          backgroundColor: ROYAL.ink,
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.28 }}
        onClick={close}
        aria-hidden={!open}
      />

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute inset-0 flex flex-col items-center justify-center px-5 py-8"
            style={{ pointerEvents: "auto" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.15 } }}
            aria-label="Navigation"
          >
            <div className="text-center shrink-0">
              <div className="text-[9px] uppercase tracking-[0.44em]" style={{ color: ROYAL.gold }}>
                {current ? "Drawn from" : "StormSync"}
              </div>
              <div className="text-[17px] font-semibold mt-1 leading-none"
                   style={{ color: ROYAL.text, fontFamily: HEADING, letterSpacing: "0.02em" }}>
                {current ? current.label : "Navigate"}
              </div>
              <div className="text-[10px] mt-1.5 tabular-nums" style={{ color: ROYAL.dim }}>
                {current ? `${n} modules` : `${n} sections · ${moduleCount(nav)} modules`}
              </div>
            </div>

            {/* The reservoir, and the drop hanging off it that everything
                below came out of. Flatter and wider than the drops, so it reads
                as the surface they left rather than as a seventh of them. */}
            <div className="relative shrink-0 mt-5 mb-1" style={{ width: "100%", maxWidth: 348 }}>
              <div aria-hidden className="relative overflow-hidden" style={{
                height: 14, borderRadius: 999, background: LIVE,
                boxShadow: "0 12px 26px -16px #000, inset 0 1px 0 rgba(255,255,255,0.9)",
              }}>
                <span className="absolute inset-0" style={{ background: specular(3) }} />
              </div>
              <span aria-hidden className="absolute" style={{
                left: "50%", top: 9, width: 17, height: 10, marginLeft: -8.5, background: LIVE,
                borderRadius: "50% 50% 46% 46% / 34% 34% 66% 66%",
              }} />
            </div>

            <div
              className="w-full min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ maxWidth: 348 }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <Stream
                  key={current ? `s${section}` : "top"}
                  entries={entries} H={H} G={G} calm={calm}
                  onPick={openSection} onGo={close}
                />
              </AnimatePresence>
            </div>

            {section !== null && (
              <div className="shrink-0 pb-5 pt-3">
                <button
                  onClick={back}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold"
                  style={{
                    color: "#0d1017", background: LIVE,
                    boxShadow: "0 6px 16px -10px #000, inset 0 1px 0 rgba(255,255,255,0.9)",
                  }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to the pool
                </button>
              </div>
            )}
          </motion.nav>
        )}
      </AnimatePresence>

      {/* The trigger is a bead of the same metal. Shut it is a sphere; open it
          has flattened the way a drop does when it lands on something. */}
      <motion.button
        onClick={toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center"
        style={{
          right: 22, bottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          width: 56, height: 56, zIndex: 80, pointerEvents: "auto",
          borderRadius: 999, color: "#0d1017", overflow: "hidden",
          background: LIVE,
          boxShadow: "0 12px 28px -12px #000, inset 0 2px 0 rgba(255,255,255,0.95), inset 0 -6px 12px -8px rgba(0,0,0,0.55)",
        }}
        initial={false}
        animate={calm ? {} : { scaleY: open ? 0.88 : 1, scaleX: open ? 1.06 : 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 17 }}
      >
        <span aria-hidden className="absolute inset-0" style={{ background: specular(3) }} />
        <span className="relative">{open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</span>
      </motion.button>
    </div>
  );
}

/** One run of the stream — the sections, or the modules of the chosen one. */
function Stream({
  entries, H, G, calm, onPick, onGo,
}: {
  entries: MenuEntry[]; H: number; G: number; calm: boolean;
  onPick: (i: number) => void; onGo: () => void;
}) {
  const spread = useMotionValue(calm ? 1 : 0);
  const { step, span } = useMemo(() => stagger(entries.length), [entries.length]);

  useEffect(() => {
    if (calm) { spread.set(1); return; }
    spread.set(0);
    const c = animate(spread, 1, FLOW);
    return () => c.stop();
  }, [spread, calm, entries.length]);

  return (
    <motion.div
      className="relative w-full"
      style={{ height: entries.length * (H + G) + G + 8 }}
      initial={false}
      // Going back up is the reverse of coming out, and it is short: the drain
      // is a beat, the pour is the show.
      exit={calm ? { opacity: 0 } : { opacity: 0, y: -14, transition: { duration: 0.16 } }}
    >
      {entries.map((e, i) => (
        <Drop
          key={e.key} e={e} i={i} H={H} G={G} step={step} span={span}
          spread={spread} calm={calm} onPick={onPick} onGo={onGo}
        />
      ))}
    </motion.div>
  );
}

function Drop({
  e, i, H, G, step, span, spread, calm, onPick, onGo,
}: {
  e: MenuEntry; i: number; H: number; G: number; step: number; span: number;
  spread: MotionValue<number>; calm: boolean;
  onPick: (i: number) => void; onGo: () => void;
}) {
  // Where the drop is, given how far the stream has run. Each gap above it is
  // only as wide as that drop's own progress, so the column extends rather than
  // the drops sliding through one another.
  const geom = useRef({ H, G, step, span, i });
  geom.current = { H, G, step, span, i };

  const at = (s: number) => {
    const g = geom.current;
    let y = 0;
    for (let j = 0; j <= g.i; j++) {
      y += g.G * smooth(clamp01((s - j * g.step) / g.span)) + (j < g.i ? g.H : 0);
    }
    return y;
  };
  const mine = (s: number) => smooth(clamp01((s - geom.current.i * geom.current.step) / geom.current.span));

  const settled = i * (H + G) + G;
  const y = useTransform(spread, (s) => at(s) - settled);
  const neckY = useTransform(spread, (s) => Math.max(0.0001, mine(s)));
  // Squared, so the waist holds most of its width and then goes quickly — the
  // pinch is the moment worth seeing.
  const neckX = useTransform(spread, (s) => (1 - mine(s)) ** 2);

  const Icon = e.icon;
  const face = e.locked ? DEAD : LIVE;
  const ink = e.locked ? "#2b2d34" : "#0d1017";

  const body = (
    <>
      <span aria-hidden className="absolute inset-0 rounded-full pointer-events-none"
            style={{ background: specular(i) }} />
      <span className="relative grid place-items-center shrink-0 rounded-full"
            style={{ width: 26, height: 26, background: "rgba(8,11,18,0.20)" }}>
        {e.locked
          ? <Lock className="w-3.5 h-3.5" style={{ color: ink }} />
          : <Icon className="w-3.5 h-3.5" style={{ color: ink }} />}
      </span>
      <span className="relative min-w-0 flex-1 truncate text-[14px] font-bold"
            style={{ color: ink, letterSpacing: "0.01em" }}>
        {e.label}
      </span>
      {e.count > 0 && (
        <span className="relative shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
              style={{ background: "rgba(8,11,18,0.22)", color: ink }}>
          {e.count}
        </span>
      )}
    </>
  );

  const skin: React.CSSProperties = {
    height: H, borderRadius: 999, background: face, position: "relative", overflow: "hidden",
    boxShadow: "0 14px 28px -18px #000, inset 0 1.5px 0 rgba(255,255,255,0.95), inset 0 -7px 14px -10px rgba(0,0,0,0.55)",
  };

  return (
    <motion.div
      className="absolute left-0 right-0"
      style={{ top: settled, height: H, y }}
    >
      {/* The neck to whatever is above — the reservoir, or the drop before it.
          Zero width once this one has landed. */}
      {!calm && (
        <motion.div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            left: "50%", marginLeft: -NECK_W / 2, width: NECK_W,
            bottom: "100%", height: G + 1,
            transformOrigin: "50% 100%", scaleX: neckX, scaleY: neckY,
          }}
        >
          <svg width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none">
            <path d={NECK_D} fill={`url(#sx-merc-neck${e.locked ? "-dull" : ""})`} />
          </svg>
        </motion.div>
      )}

      {e.to ? (
        <Link href={e.to} onClick={onGo} className="flex items-center gap-2.5 px-3.5" style={skin}>
          {body}
        </Link>
      ) : (
        <button onClick={() => onPick(e.index)}
                className="w-full flex items-center gap-2.5 px-3.5 text-left" style={skin}>
          {body}
        </button>
      )}
    </motion.div>
  );
}
