import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Lock, Plus } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL } from "../../../lib/royal";

/**
 * The Gooey Orb.
 *
 * One orb that stretches into an arc of blobs. The SVG filter is what sells it:
 * blur the group hard, then crank alpha contrast back up, and blobs leaving the
 * orb appear to pull away from it like liquid rather than simply translating.
 *
 * The arc is a quarter circle in the bottom-right, which is exactly the part of
 * a phone a thumb reaches without the hand moving. Six sections fit one ring at
 * 118px; a section with more modules than a ring holds opens a second ring at
 * 196px rather than cramming the first, because blobs closer than their own
 * diameter stop reading as separate targets.
 */
const RING_1 = 185;
const RING_2 = 262;
const PER_RING = 6;
const BLOB = 44;

/**
 * Position i of n along the arc.
 *
 * The sweep stops at 74° rather than running to vertical on purpose. Toward the
 * top of a circular arc sin flattens out, so the last two blobs end up at almost
 * the same height and their labels sit on top of each other; cutting the sweep
 * short keeps at least 20px of vertical daylight between every pair. The radius
 * is then set so adjacent blobs are about their own diameter apart — close
 * enough that the goo filter still webs them together as they travel, far
 * enough that they never fuse into one shape.
 */
function arc(i: number, n: number, r: number) {
  const from = 5, to = 68;
  const deg = n === 1 ? 40 : from + ((to - from) * i) / (n - 1);
  const rad = (deg * Math.PI) / 180;
  return { dx: -r * Math.cos(rad), dy: -r * Math.sin(rad) };
}

export function GooeyFabMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;

  const entries = current
    ? current.items.map((it) => ({ key: it.path, label: it.label, icon: it.icon, to: it.path as string | null, locked: it.locked, index: -1 }))
    : sections.map((s, i) => ({ key: s.label, label: s.label, icon: s.items[0]?.icon, to: null as string | null, locked: false, index: i }));

  // Room for a label shrinks as the arc sweeps left, so the longest names take
  // the slots nearest the orb where there is most of it. Without this the widest
  // label lands on the narrowest slot and gets cut in half.
  const ordered = [...entries].sort((a, b) => a.label.length - b.label.length);

  const placed = ordered.map((e, i) => {
    const ring = i < PER_RING ? 1 : 2;
    const idx = ring === 1 ? i : i - PER_RING;
    const n = ring === 1 ? Math.min(entries.length, PER_RING) : entries.length - PER_RING;
    return { ...e, ...arc(idx, n, ring === 1 ? RING_1 : RING_2), order: i };
  });

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      {/* The filter that makes the blobs behave like a liquid. */}
      <svg width="0" height="0" aria-hidden focusable="false" style={{ position: "absolute" }}>
        <defs>
          <filter id="sswx-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -13" result="goo" />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <motion.div
        className="absolute inset-0"
        style={{ background: "rgba(4,6,16,0.72)", backdropFilter: "blur(10px)", pointerEvents: open ? "auto" : "none" }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.35 }}
        onClick={close}
        aria-hidden={!open}
      />

      {/* Labels sit outside the goo filter: a blurred-then-sharpened label is
          unreadable, so only the blobs go through it. */}
      <div className="absolute pointer-events-none" style={{ right: 26, bottom: 26, width: 0, height: 0 }}>
        {placed.map((e) => (
          // The right-align shift lives on an inner element: framer-motion writes
          // the whole `transform` property when it animates `x`, so a static
          // translateX on the same node is silently thrown away — which is what
          // sent every label sprawling rightwards across its own blob.
          <motion.div
            key={`l-${e.key}`}
            className="absolute"
            style={{ right: 0, bottom: 0, pointerEvents: "none" }}
            initial={false}
            animate={open
              ? { x: e.dx - BLOB / 2 - 10, y: e.dy - 11, opacity: 1 }
              : { x: 0, y: 0, opacity: 0 }}
            transition={calm ? { duration: 0 } : { duration: 0.45, delay: 0.05 * e.order + 0.12 }}
          >
            <div
              title={e.label}
              className="whitespace-nowrap overflow-hidden text-ellipsis rounded-full px-2.5 py-0.5 text-[10.5px] font-medium"
              style={{
                transform: "translateX(-100%)",
                // The label's right edge lands at (viewport - 26 + dx - 32); cap
                // its width so the left edge cannot cross the screen edge.
                maxWidth: Math.max(96, 324 + e.dx),
                color: ROYAL.text,
                background: "rgba(10,10,18,0.94)",
                border: `1px solid ${ROYAL.hairline}`,
              }}
            >
              {e.label}
            </div>
          </motion.div>
        ))}
      </div>

      <div
        className="absolute"
        style={{ right: 26, bottom: 26, filter: "url(#sswx-goo)", pointerEvents: "none" }}
      >
        {placed.map((e) => {
          const Icon = e.icon;
          const inner = (
            <>
              {Icon ? <Icon className="w-5 h-5" /> : <span className="text-xs font-bold">{e.label.slice(0, 2)}</span>}
              {e.locked && <Lock className="absolute top-1 right-1 w-2.5 h-2.5 opacity-70" />}
            </>
          );
          return (
            <motion.div
              key={e.key}
              className="absolute grid place-items-center rounded-full"
              style={{
                width: BLOB, height: BLOB, right: 0, bottom: 0,
                background: `linear-gradient(140deg, ${ROYAL.gold}, #b98f3d)`,
                color: "#0b0b12",
                pointerEvents: open ? "auto" : "none",
              }}
              initial={false}
              animate={open ? { x: e.dx, y: e.dy, scale: 1, opacity: 1 } : { x: 0, y: 0, scale: 0.4, opacity: 0 }}
              transition={calm ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 22, delay: 0.04 * e.order }}
            >
              {e.to ? (
                <Link href={e.to} onClick={close} aria-label={e.label} className="w-full h-full grid place-items-center rounded-full">
                  {inner}
                </Link>
              ) : (
                <button onClick={() => openSection(e.index)} aria-label={e.label} className="w-full h-full grid place-items-center rounded-full">
                  {inner}
                </button>
              )}
            </motion.div>
          );
        })}

        {/* The orb itself. Rotates into a back/close affordance when open. */}
        <motion.button
          onClick={() => (section !== null ? back() : toggle())}
          aria-label={section !== null ? "Back to sections" : open ? "Close the menu" : "Open the menu"}
          aria-expanded={open}
          className="absolute grid place-items-center rounded-full"
          style={{
            width: 62, height: 62, right: -4, bottom: -4,
            background: open ? "#c2410c" : `linear-gradient(140deg, ${ROYAL.gold}, #b98f3d)`,
            color: open ? "#fff" : "#0b0b12",
            boxShadow: "0 10px 24px rgba(0,0,0,.45)",
            pointerEvents: "auto",
          }}
          animate={calm ? {} : { rotate: open ? 45 : 0 }}
          transition={calm ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 20 }}
        >
          {section !== null
            ? <ChevronLeft className="w-6 h-6" style={{ transform: "rotate(-45deg)" }} />
            : <Plus className="w-6 h-6" />}
        </motion.button>
      </div>
    </div>
  );
}
