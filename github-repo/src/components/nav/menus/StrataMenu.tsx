import { useEffect, useState } from "react";
import { Link } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
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
 * This is the calm one. Everything is a full-width row with a real label and a
 * count, which makes it the fastest of the set to read and the only one that
 * stays comfortable at 37 modules without paging, arcs or search. The theatre is
 * all in the transition; the resting state is a plain, quick list.
 *
 * Picking a section drops the other slabs out of the core and the modules
 * beneath deposit in sequence, finest last.
 */
const SLAB_H = 58;
const GAP = 9;

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
            StormSync
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
              : `${sections.length} layers · ${sections.reduce((t, s) => t + s.items.length, 0)} modules`}
          </div>
          <div className="mt-3 h-px" style={{ background: `linear-gradient(90deg, ${ROYAL.gold}, transparent)` }} />
        </motion.div>

        <div className="flex-1 min-h-0 px-5 overflow-hidden">
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
                  className="space-y-[9px] pt-4 pb-7 my-auto w-full"
                  style={{ perspective: 900 }}
                  initial={calm ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={calm ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.14 } }}
                >
                  {current.items.map((it, i) => {
                    const Icon = it.icon;
                    return (
                      <motion.div
                        key={it.path}
                        initial={calm ? false : { opacity: 0, y: -(i * 6) - 18, z: 120, rotateX: -34 }}
                        animate={{ opacity: 1, y: 0, z: 0, rotateX: 0 }}
                        transition={calm ? { duration: 0 } : {
                          type: "spring", stiffness: 320, damping: 28, delay: 0.03 * i,
                        }}
                      >
                        <Link
                          href={it.path}
                          onClick={close}
                          className="flex items-center gap-3 rounded-xl px-3.5"
                          style={{
                            height: 52,
                            background: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))",
                            border: `1px solid ${ROYAL.hairline}`,
                            boxShadow: `0 1px 0 0 rgba(217,183,117,0.14) inset`,
                          }}
                        >
                          <span
                            className="grid place-items-center rounded-lg shrink-0"
                            style={{ width: 32, height: 32, background: ROYAL.goldFaint, color: ROYAL.gold }}
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          <span
                            className="flex-1 min-w-0 truncate text-[13.5px] font-medium"
                            style={{ color: ROYAL.text }}
                          >
                            {it.label}
                          </span>
                          {it.locked
                            ? <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />
                            : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: ROYAL.dim }} />}
                        </Link>
                      </motion.div>
                    );
                  })}
                </motion.div>
              ) : (
                <motion.div
                  key="top"
                  className="pt-4 pb-7 my-auto w-full"
                  style={{ perspective: 900 }}
                  initial={calm ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={calm ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.14 } }}
                >
                  {sections.map((s, i) => {
                    const Icon = s.icon;
                    // Deeper layers start further back and lower in the pile, so
                    // the stack decompresses from the top down.
                    return (
                      <motion.button
                        key={s.label}
                        onClick={() => openSection(i)}
                        className="w-full flex items-center gap-3 rounded-2xl px-4 text-left"
                        style={{
                          height: SLAB_H, marginBottom: GAP,
                          background:
                            `linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.02)),` +
                            `repeating-linear-gradient(180deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 7px)`,
                          border: `1px solid ${ROYAL.hairline}`,
                          borderLeft: `2px solid rgba(217,183,117,${0.55 - i * 0.07})`,
                          boxShadow: `0 1px 0 0 rgba(217,183,117,0.20) inset, 0 14px 26px -18px rgba(0,0,0,0.9)`,
                        }}
                        initial={calm ? false : {
                          opacity: 0,
                          y: -(i * (SLAB_H + GAP)) + i * 5,
                          z: -70 * i,
                          rotateX: 46,
                          scale: 0.9,
                        }}
                        animate={{ opacity: 1, y: 0, z: 0, rotateX: 0, scale: 1 }}
                        transition={calm ? { duration: 0 } : {
                          type: "spring", stiffness: 190, damping: 24, delay: 0.055 * i,
                        }}
                        whileTap={calm ? undefined : { scale: 0.985 }}
                      >
                        <span
                          className="grid place-items-center rounded-xl shrink-0"
                          style={{
                            width: 36, height: 36,
                            background: ROYAL.goldFaint,
                            border: `1px solid ${ROYAL.goldSoft}`,
                            color: ROYAL.gold,
                          }}
                        >
                          <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
                        </span>
                        <span className="flex-1 min-w-0">
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
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: ROYAL.gold, opacity: 0.75 }} />
                      </motion.button>
                    );
                  })}
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
