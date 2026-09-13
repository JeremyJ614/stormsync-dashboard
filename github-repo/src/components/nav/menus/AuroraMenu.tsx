import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Lock } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { entriesFor, moduleCount } from "./entries";
import { HEADING, EASE } from "../../../lib/royal";

/**
 * Aurora.
 *
 * The sky, which is what this whole product is about.
 *
 * Every other style in the set borrows a metaphor from somewhere else — a lift,
 * a comic, a filing system, a black hole. This one is the thing itself. Each
 * section is a curtain of aurora standing over a ridge line; choosing one folds
 * the curtains down to the horizon and the modules inside it come out as a named
 * constellation you can read and tap.
 *
 * WHY IT IS A CANVAS. Aurora is additive light. A curtain is not an object with
 * an edge, it is a few hundred overlapping emissions that sum where they cross,
 * and the only honest way to draw that is to composite in `lighter` and let the
 * arithmetic do it. Done in DOM with blurred divs you get soft rectangles;
 * summed on a canvas you get the real thing — brighter where folds overlap, and
 * the deep magenta at the top appearing only where enough green has piled up
 * underneath it. That single decision is most of why this looks like a sky.
 *
 * WHAT MAKES IT MOVE RIGHT. Real curtains do three things at once and all three
 * are here: they ripple along their length (a travelling wave in x), they breathe
 * in height on a slower period, and they drift sideways slower still. Three
 * incommensurable periods per curtain, so the motion never repeats visibly. Each
 * column also carries its own vertical ramp — oxygen green low, nitrogen violet
 * high — so a fold that reaches higher genuinely changes colour rather than just
 * getting taller.
 *
 * WHAT PUTS IT SOMEWHERE. A ridge. Two silhouette layers at the bottom, near one
 * darker than far, and a faint snow line catching the aurora's own light. An
 * aurora with no ground under it is a screensaver; with a ridge it is a place.
 *
 * THE SECOND LEVEL. Modules become a constellation, drawn from a hash of the
 * section's name so each section has its own figure and gets the same one every
 * time. Stars vary in magnitude, sit on faint joining lines, and the brightest
 * carries the module's name. It is a real star chart's grammar, and it reads at
 * a glance in a way that a second list would not.
 *
 * CALM. No canvas at all: the curtains become one still gradient band and the
 * constellation stops twinkling. Everything remains legible and nothing moves.
 */

/** Emission colours, low to high. Oxygen green, oxygen red-teal, nitrogen violet. */
const RAMP: [number, number, number][] = [
  [ 92, 255, 168],
  [ 78, 232, 214],
  [126, 178, 255],
  [198, 118, 255],
];

/** Sample the ramp at 0…1 and return `r,g,b` for a CSS colour. */
function rampAt(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(0.999, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i], b = RAMP[i + 1] ?? RAMP[i];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Stable small hash, so a section's constellation is the same every time. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

/**
 * The sky.
 *
 * One rAF loop, one canvas, no per-frame allocation beyond the gradient objects
 * the 2D context needs. `focus` is read through a ref rather than a prop so a
 * hover cannot restart the animation — restarting it resets the phase and the
 * whole sky visibly jumps.
 */
function Sky({
  curtains, focus, dimmed, calm,
}: { curtains: number; focus: number | null; dimmed: boolean; calm: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ focus, dimmed, curtains });
  live.current = { focus, dimmed, curtains };

  useEffect(() => {
    if (calm) return;
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let w = 0, h = 0, dpr = 1;
    // Per-curtain brightness, eased toward its target each frame rather than
    // set outright, so focusing a section is a swell and not a switch.
    const lit: number[] = [];

    function resize() {
      if (!cv) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = Math.max(1, Math.floor(w * dpr));
      cv.height = Math.max(1, Math.floor(h * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const t0 = performance.now();
    function frame(now: number) {
      const t = (now - t0) / 1000;
      const { focus: f, dimmed: d, curtains: n } = live.current;

      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "lighter";

      const horizon = h * (d ? 0.82 : 0.74);
      const cols = Math.max(26, Math.min(64, Math.round(w / 7)));

      for (let c = 0; c < n; c++) {
        // Curtains overlap deliberately: the sky is not a bar chart, and the
        // sum where two cross is the most convincing thing on screen.
        const centre = ((c + 0.5) / n) * w;
        const width = (w / n) * 2.05;
        const want = d ? 0.20 : f === null ? 0.62 : f === c ? 1 : 0.24;
        lit[c] = lit[c] === undefined ? want : lit[c] + (want - lit[c]) * 0.09;
        const gain = lit[c];
        if (gain < 0.02) continue;

        const phase = c * 2.4;
        // Three periods that do not divide into each other, so the curtain
        // never visibly repeats.
        const drift = Math.sin(t * 0.11 + phase) * (w / n) * 0.30;
        const breathe = 0.72 + 0.24 * Math.sin(t * 0.29 + phase * 1.7);

        for (let i = 0; i < cols; i++) {
          const u = i / (cols - 1);
          // Envelope: dies at the curtain's edges rather than being cut off.
          const env = Math.pow(Math.sin(Math.PI * u), 0.75);
          if (env < 0.01) continue;

          // Ray structure. Real curtains are made of discrete rays of very
          // different brightness; without this the columns read as a printing
          // artefact rather than as the aurora's own filamentary structure.
          const ray = 0.55 + 0.45 * Math.abs(Math.sin(u * 41.7 + phase * 3.1 + t * 0.13))
                    * (0.6 + 0.4 * Math.sin(u * 13.3 - t * 0.21 + phase));

          const ripple = Math.sin(t * 1.35 + u * 7.5 + phase) * 13
                       + Math.sin(t * 0.61 + u * 3.1 + phase * 2) * 22;
          const x = centre + (u - 0.5) * width + ripple + drift;

          const tall = (d ? 0.20 : 0.62) * breathe
                     * (0.72 + 0.34 * Math.sin(t * 0.47 + u * 4.3 + phase));
          const top = horizon - h * tall;

          const g = ctx!.createLinearGradient(0, top, 0, horizon);
          // Top: nitrogen violet, faint. Bottom: oxygen green, bright, and cut
          // off hard at the ridge because that is where the atmosphere ends.
          for (let s = 0; s <= 5; s++) {
            const p = s / 5;
            const [r, gg, b] = rampAt(1 - p);
            // Fade in at the top (the curtain has no edge up there) and back
            // off again in the last few percent, so the base is a lit band
            // rather than a line cut off at the ridge.
            const head = p < 0.08 ? p / 0.08 : 1;
            const foot = p > 0.94 ? (1 - p) / 0.06 : 1;
            const a = env * gain * ray * head * foot * (0.05 + 0.27 * Math.pow(p, 1.6));
            g.addColorStop(p, `rgba(${r | 0},${gg | 0},${b | 0},${a.toFixed(4)})`);
          }
          ctx!.fillStyle = g;
          ctx!.fillRect(x, top, (width / cols) * 3.4, horizon - top);
        }
      }

      ctx!.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, [calm]);

  if (calm) {
    // A still band with the same ramp, so calm looks deliberate rather than broken.
    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            `linear-gradient(180deg, transparent 22%, rgba(198,118,255,0.10) 40%,` +
            ` rgba(78,232,214,0.14) 58%, rgba(92,255,168,0.22) 70%, transparent 71%)`,
        }}
        aria-hidden
      />
    );
  }
  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden />;
}

/** The ridge. Two layers, near darker than far, with a lit snow line. */
function Ridge({ dimmed }: { dimmed: boolean }) {
  const y = dimmed ? 82 : 74;
  return (
    <svg
      className="absolute inset-x-0 bottom-0 w-full pointer-events-none"
      style={{ height: `${100 - y + 2}%` }}
      viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden
    >
      {/* Far range. Lighter than the near one and holding the snow line that
          catches the aurora — the only reason the ridge reads as lit at all. */}
      <path
        d="M0 10 L7 6 L13 9 L21 2 L28 7 L36 4 L44 10 L52 5 L60 8 L69 1.5 L77 7 L85 4 L93 8 L100 5 L100 26 L0 26 Z"
        fill="#060a16" opacity={0.96}
      />
      <path
        d="M0 10 L7 6 L13 9 L21 2 L28 7 L36 4 L44 10 L52 5 L60 8 L69 1.5 L77 7 L85 4 L93 8 L100 5"
        fill="none" stroke="rgba(140,230,205,0.45)" strokeWidth={0.3}
      />
      {/* Near range, close behind it: two ridges an inch apart read as depth,
          two ridges a mile apart read as two pictures. */}
      <path
        d="M0 14 L11 9.5 L19 13 L30 8 L41 12 L50 9 L62 14 L72 10 L83 13 L92 9 L100 12 L100 26 L0 26 Z"
        fill="#05060f"
      />
    </svg>
  );
}

/** A module's constellation position, derived from the section name. */
function constellation(seed: string, n: number) {
  const r = rng(hash(seed));
  const pts: { x: number; y: number; mag: number }[] = [];
  for (let i = 0; i < n; i++) {
    // Laid out on a jittered ring so the figure is spread rather than clumped,
    // which is also how a real asterism reads.
    const a = (i / n) * Math.PI * 2 + r() * 0.7 - 0.35;
    const rad = 0.30 + r() * 0.20;
    // A star is a point but its NAME is about a quarter of the screen wide, and
    // the name is the part that has to be readable. Spreading the figure to the
    // full width put stars at 94% and hung their labels off the edge — "SPC
    // Outlook" arrived as "SPC Outloo". The figure is drawn inside a band that
    // leaves room for the label on either side, and clamped so a jittered
    // angle cannot push a star back out of it.
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    pts.push({
      x: clamp(50 + Math.cos(a) * rad * 62, 18, 82),
      y: clamp(50 + Math.sin(a) * rad * 74, 8, 92),
      mag: 0.55 + r() * 0.45,
    });
  }
  return pts;
}

/**
 * Room kept clear at the foot of the panel for the floating toggle.
 *
 * 56px of button, a 22px inset, and a little air — plus whatever the phone's
 * home indicator claims, which is why it is a `calc` and not a number.
 */
const TOGGLE_LANE = "calc(88px + env(safe-area-inset-bottom, 0px))";

export function AuroraMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, toggle, close, openSection, back, calm, containerRef } = nav;
  const entries = entriesFor(nav);
  const [focus, setFocus] = useState<number | null>(null);

  useEffect(() => { if (!open) setFocus(null); }, [open]);

  const stars = useMemo(
    () => (current ? constellation(current.label, current.items.length) : []),
    [current],
  );

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0 overflow-hidden"
        style={{
          background: `linear-gradient(180deg, #01010a 0%, #04061a 42%, #060a22 72%, #03040e 100%)`,
          backgroundColor: "#01010a",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.45 }}
        onClick={close}
        aria-hidden={!open}
      >
        {open && <StarField calm={calm} />}
        {open && <Sky curtains={nav.sections.length} focus={focus} dimmed={section !== null} calm={calm} />}
        {open && <Ridge dimmed={section !== null} />}
      </motion.div>

      <AnimatePresence>
        {open && (
          <motion.nav
            className="absolute inset-0 flex flex-col"
            // The toggle floats bottom-right at 56px plus a 22px inset, and the
            // content ran underneath it: the last curtain's label and the
            // bottom row of a section both disappeared behind the button. The
            // column keeps that lane clear instead of drawing into it.
            style={{ pointerEvents: "auto", paddingBottom: TOGGLE_LANE }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.2 } }}
            aria-label="Navigation"
          >
            <div className="pt-10 px-6 text-center shrink-0">
              <div className="text-[9px] uppercase tracking-[0.46em]" style={{ color: "rgba(140,230,205,0.9)" }}>
                {current ? "Asterism" : "StormSync"}
              </div>
              <div className="text-[18px] font-semibold mt-1.5 leading-none"
                   style={{ color: "#eaf6ff", fontFamily: HEADING, letterSpacing: "0.03em",
                            textShadow: "0 0 22px rgba(92,255,168,0.35)" }}>
                {current ? current.label : "Navigate"}
              </div>
              <div className="text-[10px] mt-1.5 tabular-nums" style={{ color: "rgba(190,214,255,0.55)" }}>
                {current
                  ? `${entries.length} star${entries.length === 1 ? "" : "s"} in this figure`
                  : `${entries.length} curtains · ${moduleCount(nav)} modules`}
              </div>
            </div>

            {current ? (
              /* ── the constellation ─────────────────────────────────────── */
              <div className="flex-1 relative min-h-0 mx-5 my-3">
                <svg className="absolute inset-0 w-full h-full pointer-events-none"
                     viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                  {stars.slice(1).map((p, i) => (
                    <motion.line
                      key={i}
                      x1={stars[i].x} y1={stars[i].y} x2={p.x} y2={p.y}
                      stroke="rgba(150,220,255,0.4)" strokeWidth={1} vectorEffect="non-scaling-stroke"
                      initial={calm ? false : { pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={calm ? { duration: 0 } : { duration: 0.4, delay: 0.12 + i * 0.06, ease: EASE }}
                    />
                  ))}
                </svg>

                {current.items.map((it, i) => {
                  const p = stars[i];
                  const Icon = it.icon;
                  const r = 5 + p.mag * 7;
                  return (
                    <motion.div
                      key={it.path}
                      className="absolute"
                      style={{ left: `${p.x}%`, top: `${p.y}%`, transform: "translate(-50%,-50%)" }}
                      initial={calm ? false : { opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={calm ? { duration: 0 } : {
                        type: "spring", stiffness: 300, damping: 22, delay: 0.1 + i * 0.05,
                      }}
                    >
                      <Link
                        href={it.path}
                        onClick={close}
                        className="flex flex-col items-center gap-1.5"
                        aria-label={it.label}
                      >
                        <motion.span
                          className="rounded-full block"
                          style={{
                            width: r, height: r,
                            background: "radial-gradient(circle, #ffffff 0%, #cfe8ff 45%, rgba(140,220,255,0) 72%)",
                            boxShadow: `0 0 ${r * 1.6}px ${r * 0.4}px rgba(150,225,255,0.55)`,
                          }}
                          animate={calm ? {} : { opacity: [0.72, 1, 0.72] }}
                          transition={calm ? { duration: 0 } : {
                            duration: 2.4 + (i % 4) * 0.7, repeat: Infinity, ease: EASE,
                          }}
                        />
                        <span className="flex items-center gap-1 max-w-[104px]">
                          <Icon className="w-[9px] h-[9px] shrink-0" style={{ color: "rgba(140,230,205,0.9)" }} />
                          <span className="text-[9.5px] leading-tight text-center"
                                style={{ color: "#eaf6ff", textShadow: "0 1px 8px #000" }}>
                            {it.label}
                          </span>
                          {it.locked && <Lock className="w-2.5 h-2.5 shrink-0" style={{ color: "rgba(190,214,255,0.6)" }} />}
                        </span>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              /* ── the curtains ──────────────────────────────────────────── */
              <div className="flex-1 flex items-end min-h-0">
                {/*
                  THE NAMES SIT ABOVE THE RIDGE, not on it.
                  At 9% they were inside the ridge band — `Ridge` occupies the
                  bottom 28% of the panel and its highest peak reaches within a
                  couple of percent of the top of that — so every section name
                  was printed over a black silhouette with a snow line running
                  through it. Legible in a screenshot of the sky, not legible on
                  a phone.
                  30% clears the tallest peak with room to spare, which puts the
                  name in the dark sky directly beneath its own curtain: the
                  light above it is unmistakably the thing being named, which is
                  what the label was always for.
                */}
                <div className="w-full flex" style={{ paddingBottom: "30%" }}>
                  {entries.map((e, i) => {
                    const Icon = e.icon;
                    return (
                      <button
                        key={e.key}
                        onClick={() => openSection(e.index)}
                        onPointerEnter={() => setFocus(i)}
                        onPointerLeave={() => setFocus(null)}
                        onFocus={() => setFocus(i)}
                        onBlur={() => setFocus(null)}
                        className="flex-1 min-w-0 flex flex-col items-center justify-end gap-1.5 h-full pb-1"
                        aria-label={e.label}
                      >
                        <motion.span
                          className="w-full min-w-0 flex flex-col items-center gap-1 px-0.5"
                          initial={calm ? false : { opacity: 0, y: 14 }}
                          animate={{ opacity: focus === null || focus === i ? 1 : 0.45, y: 0 }}
                          transition={calm ? { duration: 0 } : { duration: 0.4, delay: 0.15 + i * 0.06, ease: EASE }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color: "rgba(140,230,205,0.95)" }} />
                          <span
                            className="w-full text-center leading-[1.15] overflow-hidden break-words"
                            style={{
                              fontSize: 9.5, color: "#eaf6ff", textShadow: "0 1px 8px #000",
                              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
                            }}
                          >
                            {e.label}
                          </span>
                          <span className="text-[8.5px] tabular-nums" style={{ color: "rgba(190,214,255,0.5)" }}>
                            {e.count}
                          </span>
                        </motion.span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {section !== null && (
              <div className="shrink-0 px-5 pb-5">
                <button
                  onClick={back}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
                  style={{
                    color: "rgba(140,230,205,0.95)",
                    border: "1px solid rgba(140,230,205,0.35)",
                    background: "rgba(4,8,20,0.6)",
                  }}
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to the sky
                </button>
              </div>
            )}
          </motion.nav>
        )}
      </AnimatePresence>

      {/* The trigger: a fragment of curtain in a disc, so the closed control is
          made of the same light as the thing it opens. */}
      <button
        onClick={toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-full overflow-hidden"
        style={{
          right: 22, bottom: "calc(22px + env(safe-area-inset-bottom, 0px))",
          width: 56, height: 56, zIndex: 80, pointerEvents: "auto",
          background: "rgba(4,6,18,0.94)",
          border: `1px solid ${open ? "rgba(198,118,255,0.6)" : "rgba(92,255,168,0.45)"}`,
          boxShadow: open
            ? "0 0 22px -4px rgba(198,118,255,0.8)"
            : "0 0 22px -4px rgba(92,255,168,0.7)",
        }}
      >
        {!calm && [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute"
            style={{
              width: 7, bottom: 8, left: 16 + i * 10, borderRadius: 4,
              background: `linear-gradient(180deg, rgba(198,118,255,0), rgba(78,232,214,0.7) 45%, rgba(92,255,168,0.95))`,
            }}
            animate={{ height: [16, 30, 20, 34, 16], opacity: [0.6, 1, 0.8, 1, 0.6] }}
            transition={{ duration: 3.2 + i * 0.7, repeat: Infinity, ease: EASE, delay: i * 0.3 }}
            aria-hidden
          />
        ))}
        <motion.span
          className="relative block rounded-full"
          style={{ width: 8, height: 8, background: "#eaf6ff", boxShadow: "0 0 14px 3px rgba(150,225,255,0.85)" }}
          initial={false}
          animate={{ scale: open ? 0.6 : 1, opacity: open ? 0.7 : 1 }}
          transition={{ duration: calm ? 0 : 0.3 }}
          aria-hidden
        />
      </button>
    </div>
  );
}

/** Fixed stars. Positions are deterministic so nothing twitches between renders. */
function StarField({ calm }: { calm: boolean }) {
  const stars = useMemo(() => {
    const r = rng(9176);
    return Array.from({ length: 110 }, () => ({
      x: r() * 100, y: r() * 66, s: 0.5 + r() * 1.4, d: r() * 4,
    }));
  }, []);
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {stars.map((st, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, background: "#dfeaff" }}
          animate={calm ? { opacity: 0.5 } : { opacity: [0.18, 0.75, 0.18] }}
          transition={calm ? { duration: 0 } : { duration: 3 + st.d, repeat: Infinity, delay: st.d }}
        />
      ))}
    </div>
  );
}
