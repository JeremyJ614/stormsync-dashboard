import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue,
} from "framer-motion";
import { ChevronLeft, ChevronRight, Layers, Lock, X } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * Strata.
 *
 * Sections as a core sample: slabs compressed into one pile, which decompresses
 * when the menu opens. Each slab has its own depth, so the pile separates along
 * z as well as y and you see it come apart rather than merely spread out.
 *
 * It was the calm one and it stays the calm one — full-width rows, real labels,
 * real counts, the fastest of the set to read and the only one comfortable at 37
 * modules with no paging, arcs or search. What it did not have was any reason to
 * look at it. Three things fix that without costing it any of its legibility:
 *
 *   1. The stack is genuinely three-dimensional and it knows where you are.
 *      Pointer position drives a sprung rotateX/rotateY on the whole core, and
 *      each slab carries its own z, so moving the cursor parallaxes the pile —
 *      the near layers travel further than the deep ones, which is the entire
 *      difference between a picture of depth and depth.
 *   2. A core light sweeps down the pile as it decompresses, and each slab's
 *      specular band tracks the tilt. A flat panel with a moving highlight reads
 *      as a lit surface; that is what makes the material look like anything.
 *   3. Choosing a section shears the other slabs out of the core in depth rather
 *      than cross-fading them, so the modules arrive from inside the layer that
 *      was holding them.
 *
 * Under calm every one of those is off and the menu is a plain list, which is
 * the point of calm.
 */
const SLAB_H = 62;
const GAP = 9;
/** How far apart in z consecutive slabs sit. Sets how strong the parallax is. */
const Z_STEP = 26;

export function StrataMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;

  const [vh, setVh] = useState(() => (typeof window === "undefined" ? 780 : window.innerHeight));
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The module list scrolls only when a section genuinely cannot fit; 11 rows
  // clear a phone, so in practice it never does.
  const listMax = Math.max(220, vh - 250);

  // ── pointer parallax ───────────────────────────────────────────────────────
  // Raw pointer position in −1…1, sprung so the core has weight. Touch never
  // fires pointermove without a press, so on a phone this simply rests at zero
  // and the stack is a clean orthographic pile — which is fine, and the reason
  // nothing here depends on it.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 110, damping: 20, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 110, damping: 20, mass: 0.6 });
  const rotY = useTransform(sx, [-1, 1], [7, -7]);
  const rotX = useTransform(sy, [-1, 1], [-5.5, 5.5]);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || calm) return;
    function onMove(e: PointerEvent) {
      const el = stage.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      px.set(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)));
      py.set(Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)));
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [open, calm, px, py]);

  // Reset the tilt whenever the menu closes, so it never reopens mid-lean.
  useEffect(() => { if (!open) { px.set(0); py.set(0); } }, [open, px, py]);

  const totalModules = sections.reduce((t, s) => t + s.items.length, 0);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(90% 55% at 50% 0%, rgba(217,183,117,0.10), transparent 62%),` +
            `linear-gradient(180deg, ${ROYAL.ink2}, #03030c)`,
          backdropFilter: "blur(16px)",
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
      <motion.div
        className="absolute inset-0 flex flex-col"
        style={{ pointerEvents: "auto" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: calm ? 0 : 0.18 } }}
        transition={{ duration: calm ? 0 : 0.2 }}
      >
        {/* Header */}
        <motion.div
          className="px-6 pt-10 pb-4 shrink-0"
          initial={calm ? false : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={calm ? { duration: 0 } : { duration: 0.3, ease: EASE }}
        >
          <div className="text-[9.5px] uppercase tracking-[0.42em]" style={{ color: ROYAL.gold }}>
            {current ? "Core sample · layer" : "Core sample"}
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <div
              className="text-[21px] font-semibold leading-none"
              style={{ color: ROYAL.text, fontFamily: HEADING }}
            >
              {current ? current.label : "Navigate"}
            </div>
          </div>
          <div className="text-[11px] mt-1.5" style={{ color: ROYAL.dim }}>
            {current
              ? `${current.items.length} module${current.items.length === 1 ? "" : "s"} in this layer`
              : `${sections.length} layers · ${totalModules} modules`}
          </div>
          <div className="mt-3 h-px" style={{ background: `linear-gradient(90deg, ${ROYAL.gold}, transparent)` }} />
        </motion.div>

        <div ref={stage} className="flex-1 min-h-0 px-5 overflow-hidden">
          <div
            className="h-full flex flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
              maxHeight: listMax,
              // A soft bottom edge, so a section that runs past the fold looks
              // like it continues rather than like it was cut off.
              maskImage: "linear-gradient(180deg, #000 0, #000 calc(100% - 22px), transparent 100%)",
              WebkitMaskImage: "linear-gradient(180deg, #000 0, #000 calc(100% - 22px), transparent 100%)",
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {current ? (
                <motion.div
                  key={`sec-${section}`}
                  className="pt-4 pb-7 my-auto w-full relative"
                  style={{ perspective: 1100 }}
                  initial={calm ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={calm ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.14 } }}
                >
                  <motion.div
                    className="space-y-[9px]"
                    style={calm ? undefined : { rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" }}
                  >
                    {current.items.map((it, i) => {
                      const Icon = it.icon;
                      return (
                        <motion.div
                          key={it.path}
                          style={calm ? undefined : { transformStyle: "preserve-3d" }}
                          initial={calm ? false : { opacity: 0, y: -(i * 6) - 22, z: 150, rotateX: -38 }}
                          animate={{ opacity: 1, y: 0, z: 0, rotateX: 0 }}
                          transition={calm ? { duration: 0 } : {
                            type: "spring", stiffness: 320, damping: 28, delay: 0.03 * i,
                          }}
                        >
                          <Link
                            href={it.path}
                            onClick={close}
                            className="group relative flex items-center gap-3 rounded-xl px-3.5 overflow-hidden"
                            style={{
                              height: 52,
                              background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))",
                              border: `1px solid ${ROYAL.hairline}`,
                              boxShadow: `0 1px 0 0 rgba(217,183,117,0.14) inset`,
                            }}
                          >
                            {!calm && <Sheen tilt={sx} />}
                            <span
                              className="relative grid place-items-center rounded-lg shrink-0"
                              style={{ width: 32, height: 32, background: ROYAL.goldFaint, color: ROYAL.gold }}
                            >
                              <Icon className="w-4 h-4" />
                            </span>
                            <span
                              className="relative flex-1 min-w-0 truncate text-[13.5px] font-medium"
                              style={{ color: ROYAL.text }}
                            >
                              {it.label}
                            </span>
                            {it.locked
                              ? <Lock className="relative w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />
                              : <ChevronRight className="relative w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                                              style={{ color: ROYAL.dim }} />}
                          </Link>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="top"
                  className="pt-4 pb-7 my-auto w-full relative"
                  style={{ perspective: 1100 }}
                  initial={calm ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={calm ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.14 } }}
                >
                  {/* Depth gutter. Ticks and a depth figure per layer, which is
                      what turns a list of rounded rectangles into a core log —
                      and it costs one absolutely-positioned column. */}
                  {!calm && (
                    <div className="absolute left-0 top-4 bottom-7 w-7 pointer-events-none" aria-hidden>
                      <div className="absolute left-[25px] top-0 bottom-0 w-px"
                           style={{ background: `linear-gradient(180deg, transparent, ${ROYAL.hairline} 12%, ${ROYAL.hairline} 88%, transparent)` }} />
                      {sections.map((s, i) => (
                        <div key={s.label} className="absolute left-0" style={{ top: i * (SLAB_H + GAP) + SLAB_H / 2 - 5 }}>
                          <span className="absolute left-[17px] top-[5px] h-px" style={{ width: 6, background: ROYAL.goldSoft }} />
                          {/* Flush with the scroller's edge, not past it: at
                              -2px the leading digit was clipped by the overflow. */}
                          <span className="absolute left-0 top-0 text-[7.5px] tabular-nums tracking-[0.1em]"
                                style={{ color: ROYAL.dim, opacity: 0.55 }}>
                            {String((i + 1) * 40).padStart(3, "0")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <motion.div
                    className={calm ? "" : "pl-7"}
                    style={calm ? undefined : { rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" }}
                  >
                    {/* The core light: one champagne band travelling down the
                        pile as it decompresses. It is what makes the stack read
                        as being *opened* rather than merely appearing. */}
                    {!calm && (
                      <motion.span
                        className="absolute inset-x-0 pointer-events-none"
                        style={{
                          height: 120, borderRadius: 999,
                          background: `radial-gradient(60% 100% at 50% 50%, rgba(217,183,117,0.16), transparent 72%)`,
                          filter: "blur(6px)",
                        }}
                        initial={{ top: -40, opacity: 0 }}
                        animate={{ top: sections.length * (SLAB_H + GAP), opacity: [0, 1, 1, 0] }}
                        transition={{ duration: 0.72, ease: EASE, times: [0, 0.15, 0.8, 1] }}
                        aria-hidden
                      />
                    )}

                    {sections.map((s, i) => {
                      const Icon = s.icon;
                      // Deeper layers start further back and lower in the pile, so
                      // the stack decompresses from the top down; they also *rest*
                      // further back, which is what the parallax reads off.
                      const restZ = -i * Z_STEP;
                      return (
                        <motion.button
                          key={s.label}
                          onClick={() => openSection(i)}
                          className="group relative w-full flex items-center gap-3 rounded-2xl px-4 text-left overflow-hidden"
                          style={{
                            height: SLAB_H, marginBottom: GAP,
                            transformStyle: calm ? undefined : "preserve-3d",
                            background:
                              `linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.02)),` +
                              // Sediment banding, denser in the deeper layers.
                              `repeating-linear-gradient(180deg, rgba(255,255,255,0.04) 0 1px, transparent 1px ${9 - Math.min(5, i)}px)`,
                            border: `1px solid ${ROYAL.hairline}`,
                            borderLeft: `2px solid rgba(217,183,117,${Math.max(0.18, 0.6 - i * 0.07)})`,
                            boxShadow: `0 1px 0 0 rgba(217,183,117,0.20) inset, 0 18px 30px -20px rgba(0,0,0,0.95)`,
                          }}
                          initial={calm ? false : {
                            opacity: 0,
                            y: -(i * (SLAB_H + GAP)) + i * 5,
                            z: -70 * i,
                            rotateX: 46,
                            scale: 0.9,
                          }}
                          animate={{ opacity: 1, y: 0, z: restZ, rotateX: 0, scale: 1 }}
                          transition={calm ? { duration: 0 } : {
                            type: "spring", stiffness: 190, damping: 24, delay: 0.055 * i,
                          }}
                          whileTap={calm ? undefined : { scale: 0.985 }}
                        >
                          {!calm && <Sheen tilt={sx} />}
                          <span
                            className="relative grid place-items-center rounded-xl shrink-0 transition-colors"
                            style={{
                              width: 36, height: 36,
                              background: ROYAL.goldFaint,
                              border: `1px solid ${ROYAL.goldSoft}`,
                              color: ROYAL.gold,
                            }}
                          >
                            <Icon style={{ width: 18, height: 18 }} />
                          </span>
                          <span className="relative flex-1 min-w-0">
                            <span
                              className="block truncate text-[14px] font-semibold"
                              style={{ color: ROYAL.text, fontFamily: HEADING }}
                            >
                              {s.label}
                            </span>
                            <span className="block text-[10.5px] mt-0.5" style={{ color: ROYAL.dim }}>
                              {s.items.length} module{s.items.length === 1 ? "" : "s"}
                            </span>
                          </span>
                          <ChevronRight
                            className="relative w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                            style={{ color: ROYAL.gold, opacity: 0.75 }}
                          />
                        </motion.button>
                      );
                    })}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Back sits inside the sheet so the trigger always means close. */}
        {section !== null && (
          <div className="shrink-0 px-5 pb-4 pt-1">
            <button
              onClick={back}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"
              style={{ color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(255,255,255,0.03)" }}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> All layers
            </button>
          </div>
        )}
      </motion.div>
      )}
      </AnimatePresence>

      {/* ── the trigger ───────────────────────────────────────────────────── */}
      <button
        onClick={() => toggle()}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-2xl"
        style={{
          right: 22, bottom: "calc(22px + env(safe-area-inset-bottom, 0px))", width: 54, height: 54, zIndex: 80,
          background: open ? "rgba(180,69,31,0.92)" : "rgba(8,8,18,0.92)",
          border: `1px solid ${open ? "rgba(255,255,255,0.35)" : ROYAL.goldSoft}`,
          color: open ? "#fff" : ROYAL.gold,
          boxShadow: "0 10px 26px rgba(0,0,0,.55)",
          pointerEvents: "auto",
        }}
      >
        {open ? <X className="w-5 h-5" /> : <StackGlyph calm={calm} />}
      </button>
    </div>
  );
}

/**
 * A specular band that slides across a slab as the core tilts.
 *
 * This is the whole reason the slabs read as material rather than as filled
 * rectangles: a highlight that moves with the viewing angle is the one cue the
 * eye treats as evidence of a surface. It is driven by the same motion value as
 * the tilt, so it costs no extra work per frame and cannot drift out of sync.
 */
function Sheen({ tilt }: { tilt: MotionValue<number> }) {
  const x = useTransform(tilt, [-1, 1], ["-40%", "140%"]);
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-1/2"
      style={{
        left: 0, x,
        background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.075), transparent)",
      }}
    />
  );
}

/**
 * Three slabs that keep settling into a pile — the closed control performing in
 * miniature what the menu does at full size. Pure transforms, so it costs
 * nothing to run, and calm removes it entirely.
 */
function StackGlyph({ calm }: { calm: boolean }) {
  if (calm) return <Layers className="w-5 h-5" />;
  return (
    <span className="relative block" style={{ width: 22, height: 18 }} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute left-0 rounded-[2px]"
          style={{ width: 22, height: 3, background: ROYAL.gold, top: 3 + i * 6 }}
          animate={{ y: [-3, 0, 0, -3], opacity: [0.35, 1, 1, 0.35] }}
          transition={{
            duration: 2.6, repeat: Infinity, ease: EASE,
            times: [0, 0.28, 0.78, 1], delay: i * 0.16,
          }}
        />
      ))}
    </span>
  );
}
