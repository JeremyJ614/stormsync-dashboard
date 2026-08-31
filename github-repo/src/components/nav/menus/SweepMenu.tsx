import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Lock, Radar, X } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL, EASE } from "../../../lib/royal";

/**
 * Radar Sweep.
 *
 * A PPI scope. The sweep rotates and paints each entry onto the range rings as
 * it passes — sections first, then the modules inside whichever one you pick.
 * Of everything here this is the only menu that could not belong to another
 * product: it is the same instrument the app is about.
 *
 * The reveal is timed off the sweep rather than off a plain stagger. An entry's
 * angle *is* its delay, so a blip lights the instant the beam crosses it and the
 * two never drift apart. Once painted a blip stays lit — a menu whose targets
 * fade in and out on a 2.4s cycle would be miserable to actually use, so the
 * sweep is the entrance and the resting state is a stable, fully-legible dial.
 *
 * The centre is the control, not a hole: it reads back the level you are on and
 * takes you up one when tapped.
 */
const PERIOD = 2.4;          // seconds for one full rotation
const BLIP = 46;

export function SweepMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;

  // The scope is sized from the live viewport: the ring radius plus a blip
  // radius plus its label has to fit inside the shorter axis.
  const [vp, setVp] = useState(() => ({
    w: typeof window === "undefined" ? 390 : window.innerWidth,
    h: typeof window === "undefined" ? 780 : window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const entries = current
    ? current.items.map((it) => ({
        key: it.path, label: it.label, icon: it.icon,
        to: it.path as string | null, locked: Boolean(it.locked), index: -1, count: 0,
      }))
    : sections.map((s, i) => ({
        key: s.label, label: s.label, icon: s.icon,
        to: null as string | null, locked: false, index: i, count: s.items.length,
      }));

  const n = Math.max(1, entries.length);

  // 56 of vertical room goes to the level caption, 84 to the close control.
  const R = Math.max(104, Math.min(
    190,
    Math.min(vp.w / 2 - 58, (vp.h - 140) / 2 - 58),
  ));
  const box = (R + 58) * 2;

  // Labels may not be wider than the arc between two neighbouring blips.
  const labelW = Math.max(58, Math.min(84, (2 * Math.PI * R) / n - 8));

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(58% 42% at 50% 46%, rgba(217,183,117,0.09), transparent 70%),` +
            `radial-gradient(120% 90% at 50% 50%, #05050e 30%, #02020a 100%)`,
          backdropFilter: "blur(14px)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.32 }}
        onClick={close}
        aria-hidden={!open}
      />

      {open && (
        <div className="absolute inset-x-0 top-9 text-center pointer-events-none px-6">
          <div className="text-[9.5px] uppercase tracking-[0.42em]" style={{ color: ROYAL.gold }}>
            {current ? "Scanning section" : "Scanning"}
          </div>
          <div className="text-[15px] font-semibold mt-1" style={{ color: ROYAL.text }}>
            {current ? current.label : "All sections"}
          </div>
          <div className="text-[10.5px] mt-0.5" style={{ color: ROYAL.dim }}>
            {n} contact{n === 1 ? "" : "s"}
          </div>
        </div>
      )}

      {/* ── the scope ─────────────────────────────────────────────────────── */}
      <div className="absolute inset-0 grid place-items-center" style={{ pointerEvents: "none" }}>
        <motion.div
          className="relative"
          style={{
            width: box, height: box,
            pointerEvents: open ? "auto" : "none",
            // Collapse toward the hub rather than the top-left corner.
            transformOrigin: `${box / 2}px ${box / 2}px`,
          }}
          initial={false}
          animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.86 }}
          transition={calm ? { duration: 0 } : { duration: 0.4, ease: EASE }}
          aria-hidden={!open}
        >
          {/* Range rings, at the blip radius and either side of it. */}
          {[0.42, 0.72, 1].map((f, i) => (
            <div
              key={f}
              className="absolute rounded-full"
              style={{
                left: box / 2 - R * f, top: box / 2 - R * f,
                width: R * f * 2, height: R * f * 2,
                border: `1px solid ${i === 2 ? ROYAL.goldSoft : "rgba(204,204,255,0.10)"}`,
              }}
            />
          ))}

          {/* Bearing ticks every 30°, longer on the cardinals. */}
          {Array.from({ length: 12 }, (_, i) => i * 30).map((deg) => (
            <div
              key={deg}
              className="absolute"
              style={{
                left: box / 2, top: box / 2, width: 1,
                height: R + (deg % 90 === 0 ? 16 : 8),
                marginTop: -(R + (deg % 90 === 0 ? 16 : 8)),
                transformOrigin: "bottom center",
                transform: `rotate(${deg}deg)`,
                background: `linear-gradient(180deg, ${deg % 90 === 0 ? ROYAL.goldSoft : "rgba(204,204,255,0.16)"}, transparent 62%)`,
              }}
            />
          ))}

          {/* The beam. A conic wedge trailing behind a bright leading edge. */}
          {open && (
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                left: box / 2 - R - 18, top: box / 2 - R - 18,
                width: (R + 18) * 2, height: (R + 18) * 2,
                background:
                  `conic-gradient(from 0deg,` +
                  ` transparent 0deg, transparent 268deg,` +
                  ` rgba(217,183,117,0.04) 268deg,` +
                  ` rgba(217,183,117,0.13) 338deg,` +
                  ` rgba(217,183,117,0.30) 360deg)`,
                maskImage: "radial-gradient(circle, #000 62%, transparent 100%)",
                WebkitMaskImage: "radial-gradient(circle, #000 62%, transparent 100%)",
              }}
              animate={calm ? { rotate: 0, opacity: 0 } : { rotate: 360 }}
              transition={calm ? { duration: 0 } : { duration: PERIOD, repeat: Infinity, ease: "linear" }}
            />
          )}
          {open && !calm && (
            <motion.div
              className="absolute pointer-events-none"
              style={{ left: box / 2, top: box / 2, width: 0, height: 0 }}
              animate={{ rotate: 360 }}
              transition={{ duration: PERIOD, repeat: Infinity, ease: "linear" }}
            >
              <div
                style={{
                  position: "absolute", left: -0.5, bottom: 0, width: 1.5, height: R + 18,
                  background: `linear-gradient(0deg, transparent, ${ROYAL.gold})`,
                  boxShadow: `0 0 10px 1px ${ROYAL.goldSoft}`,
                }}
              />
            </motion.div>
          )}

          {/* Contacts. The angle sets the position and the delay alike, so a
              blip lights exactly as the beam reaches it. */}
          {entries.map((e, i) => {
            const frac = i / n;                       // 0 at 12 o'clock, clockwise
            const deg = frac * 360 - 90;
            const rad = (deg * Math.PI) / 180;
            const x = box / 2 + R * Math.cos(rad);
            const y = box / 2 + R * Math.sin(rad);
            const Icon = e.icon;
            const delay = calm ? 0 : 0.18 + frac * PERIOD;

            // Labels sit on the far side of the blip from the hub: above it in
            // the top arc, below it in the bottom. Keeping them all below made
            // the upper ones point inward, where two long two-line names on
            // neighbouring blips ran into each other.
            const above = Math.sin(rad) < -0.25;

            const caption = (
              <span className="block" style={{ width: labelW }}>
                <span
                  className="block text-center leading-[1.15] overflow-hidden"
                  style={{
                    fontSize: 9.5, color: ROYAL.text,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    textShadow: "0 1px 5px rgba(0,0,0,.85)",
                  }}
                >
                  {e.label}
                </span>
                {e.count > 0 && (
                  <span className="block text-center" style={{ fontSize: 8.5, color: ROYAL.dim }}>
                    {e.count}
                  </span>
                )}
              </span>
            );

            const face = (
              <>
                <motion.span
                  className="grid place-items-center rounded-full relative"
                  style={{
                    width: BLIP, height: BLIP,
                    background: "radial-gradient(circle at 34% 28%, rgba(217,183,117,0.26), rgba(10,10,22,0.94) 70%)",
                    border: `1px solid ${ROYAL.goldSoft}`,
                    color: ROYAL.gold,
                    boxShadow: `0 0 0 1px rgba(0,0,0,0.5), 0 6px 18px rgba(0,0,0,0.55)`,
                  }}
                  whileTap={calm ? undefined : { scale: 0.9 }}
                >
                  {Icon ? <Icon style={{ width: 20, height: 20 }} /> : <Radar style={{ width: 20, height: 20 }} />}
                  {e.locked && (
                    <Lock className="absolute -top-0.5 -right-0.5 w-3 h-3" style={{ color: ROYAL.dim }} />
                  )}
                </motion.span>
              </>
            );

            // Reserve the caption's room and let flex pack the blip against the
            // hub-facing edge, so the blip lands exactly on its ring whichever
            // way the caption goes. Anchoring the box by `bottom` was tried and
            // is wrong: the wrapper it sits in is zero-height, so `bottom`
            // measured from the scope's top-left and threw the whole top arc off
            // screen.
            const capH = 28 + (e.count > 0 ? 11 : 0);
            const common = {
              className: "absolute flex items-center",
              style: {
                left: x - labelW / 2,
                top: above ? y - BLIP / 2 - capH : y - BLIP / 2,
                width: labelW,
                height: BLIP + capH,
                flexDirection: (above ? "column-reverse" : "column") as "column" | "column-reverse",
                justifyContent: "flex-start" as const,
                pointerEvents: open ? ("auto" as const) : ("none" as const),
              },
              "aria-label": e.label,
            };

            return (
              <motion.div
                key={e.key}
                className="absolute"
                style={{ left: 0, top: 0, width: 0, height: 0, transformOrigin: `${box / 2 - x}px ${box / 2 - y}px` }}
                initial={false}
                animate={open ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
                transition={calm ? { duration: 0 } : { duration: 0.34, delay: open ? delay : 0, ease: EASE }}
              >
                {e.to
                  ? <Link href={e.to} onClick={close} {...common}>
                      {face}
                      <span style={{ marginTop: above ? 0 : 6, marginBottom: above ? 6 : 0 }}>{caption}</span>
                    </Link>
                  : <button onClick={() => openSection(e.index)} {...common}>
                      {face}
                      <span style={{ marginTop: above ? 0 : 6, marginBottom: above ? 6 : 0 }}>{caption}</span>
                    </button>}
              </motion.div>
            );
          })}

          {/* The hub. Reads back the level and steps up one. */}
          <button
            onClick={() => (section !== null ? back() : close())}
            aria-label={section !== null ? "Back to all sections" : "Close the menu"}
            className="absolute grid place-items-center rounded-full"
            style={{
              left: box / 2 - 44, top: box / 2 - 44, width: 88, height: 88,
              background: "radial-gradient(circle at 40% 32%, rgba(217,183,117,0.20), rgba(6,6,16,0.96) 68%)",
              border: `1px solid ${ROYAL.goldSoft}`,
              pointerEvents: open ? "auto" : "none",
            }}
          >
            {section !== null ? (
              <>
                <ChevronLeft className="w-5 h-5" style={{ color: ROYAL.gold }} />
                <span className="text-[8.5px] uppercase tracking-[0.2em] mt-0.5" style={{ color: ROYAL.dim }}>
                  Back
                </span>
              </>
            ) : (
              <>
                <span className="text-[19px] font-semibold leading-none" style={{ color: ROYAL.gold }}>
                  {sections.reduce((t, s) => t + s.items.length, 0)}
                </span>
                <span className="text-[8.5px] uppercase tracking-[0.2em] mt-1" style={{ color: ROYAL.dim }}>
                  Modules
                </span>
              </>
            )}
          </button>
        </motion.div>
      </div>

      {/* ── the trigger ───────────────────────────────────────────────────── */}
      <button
        onClick={() => toggle()}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-full overflow-hidden"
        style={{
          right: 22, bottom: 22, width: 56, height: 56, zIndex: 80,
          background: open ? "rgba(180,69,31,0.92)" : "rgba(8,8,18,0.92)",
          border: `1px solid ${open ? "rgba(255,255,255,0.35)" : ROYAL.goldSoft}`,
          color: open ? "#fff" : ROYAL.gold,
          boxShadow: `0 10px 26px rgba(0,0,0,.55)`,
          pointerEvents: "auto",
          transition: calm ? "none" : "background .25s ease, border-color .25s ease",
        }}
      >
        {/* A miniature of the sweep, so the closed control says what it opens. */}
        {!open && !calm && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, transparent 288deg, rgba(217,183,117,0.42) 360deg)`,
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: PERIOD, repeat: Infinity, ease: "linear" }}
          />
        )}
        {open ? <X className="w-5 h-5 relative" /> : <Radar className="w-5 h-5 relative" />}
      </button>
    </div>
  );
}
