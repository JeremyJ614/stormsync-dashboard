import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Lock, MoreHorizontal, Plus } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL, EASE } from "../../../lib/royal";

/**
 * The Gooey Orb.
 *
 * One orb that stretches into arcs of blobs. The SVG filter is what sells it:
 * blur the group hard, then crank alpha contrast back up, so blobs leaving the
 * orb appear to pull away from it like liquid rather than simply translating.
 *
 * Everything arcs out of the bottom-right, which is the part of a phone a thumb
 * reaches without the hand moving.
 *
 * Holding an arbitrary number of items
 * ------------------------------------
 * One arc, and it pages. A second, wider arc was tried and thrown away: at the
 * radius needed to clear the first, its labels ran off the left edge of the
 * phone and the blobs stopped reading as one arc. Paging keeps the radius, the
 * blob size and the label room fixed, so a section of five and a section of
 * fifty look and behave identically. The last slot becomes a pager showing how
 * many remain.
 */
const RING = 185;
const PER_PAGE = 6;
const BLOB = 44;

/**
 * Position i of n along the arc.
 *
 * The sweep stops at 68° rather than running to vertical on purpose: toward the
 * top of a circular arc sin flattens out, so the last two blobs end up at almost
 * the same height and their labels sit on top of each other. Cutting it short
 * keeps at least 20px of vertical daylight between every pair, and the radius is
 * then set so adjacent blobs are about their own diameter apart — close enough
 * that the filter still webs them together in flight, far enough that they never
 * fuse into one shape.
 */
function arc(i: number, n: number, r: number) {
  const from = 5, to = 68;
  const deg = n === 1 ? 40 : from + ((to - from) * i) / (n - 1);
  const rad = (deg * Math.PI) / 180;
  return { dx: -r * Math.cos(rad), dy: -r * Math.sin(rad) };
}

const CORNER = 26;   // the orb anchor's inset from the right and bottom

export function GooeyFabMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;
  const [page, setPage] = useState(0);

  // The label cap has to be measured, not assumed. The first version worked out
  // the room from a hardcoded 390px phone, so on any wider screen every label
  // was cut in the wrong place — which is exactly what it looked like on a real
  // handset. Read the viewport instead.
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 390 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // A new level always starts at its first page.
  useEffect(() => { setPage(0); }, [section, open]);

  const all = current
    ? current.items.map((it) => ({ key: it.path, label: it.label, icon: it.icon, to: it.path as string | null, locked: Boolean(it.locked), index: -1 }))
    : sections.map((s, i) => ({ key: s.label, label: s.label, icon: s.icon, to: null as string | null, locked: false, index: i }));

  // Longest names take the slots nearest the orb, where there is most room for
  // a label; without this the widest one lands on the narrowest slot.
  const ordered = [...all].sort((a, b) => a.label.length - b.label.length);

  const pages = Math.max(1, Math.ceil(ordered.length / PER_PAGE));
  const paged = pages > 1;
  const slots = paged ? PER_PAGE - 1 : PER_PAGE;
  const start = page * slots;
  const shown = ordered.slice(start, start + slots);
  const remaining = ordered.length - (start + shown.length);

  type Slot = { key: string; label: string; icon?: typeof all[number]["icon"]; to: string | null; locked: boolean; index: number; pager?: boolean };
  const entries: Slot[] = [...shown];
  if (paged) {
    entries.push({
      key: "__more", label: remaining > 0 ? `${remaining} more` : "Back to start",
      icon: undefined, to: null, locked: false, index: -2, pager: true,
    });
  }

  const placed = entries.map((e, i) => ({ ...e, ...arc(i, entries.length, RING), order: i }));

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
          <radialGradient id="sswx-blob" cx="32%" cy="28%">
            <stop offset="0%" stopColor="#f0dcae" />
            <stop offset="100%" stopColor="#b98f3d" />
          </radialGradient>
        </defs>
      </svg>

      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(85% 60% at 88% 92%, rgba(217,183,117,0.10), ${ROYAL.ink} 55%, #04040c 100%)`,
          backdropFilter: "blur(12px)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.35 }}
        onClick={close}
        aria-hidden={!open}
      />

      {open && (
        <div className="absolute inset-x-0 top-14 text-center pointer-events-none">
          <div className="text-[10px] uppercase tracking-[0.35em]" style={{ color: ROYAL.gold }}>
            {current ? current.label : "Sections"}
          </div>
          {pages > 1 && (
            <div className="text-[11px] mt-1" style={{ color: ROYAL.dim }}>
              Page {page + 1} of {pages}
            </div>
          )}
        </div>
      )}

      {/* Labels sit outside the goo filter: a blurred-then-sharpened label is
          unreadable, so only the blobs go through it. */}
      <div className="absolute pointer-events-none" style={{ right: CORNER, bottom: CORNER, width: 0, height: 0 }}>
        {placed.map((e) => (
          // `right: 0` already right-aligns the pill against the corner anchor,
          // so the travel is the only transform needed. An extra translateX(-100%)
          // lived here for a while and shifted every label left by its own width
          // on top of that, which is what pushed the long ones off-screen.
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
                // The pill's right edge lands at (vw - CORNER + dx - BLOB/2 - 10).
                // Cap the width so its left edge cannot cross the screen, with
                // 10px of margin. Derived from the live viewport, not a guess.
                maxWidth: Math.max(90, vw - CORNER + e.dx - BLOB / 2 - 20),
                color: e.pager ? ROYAL.gold : ROYAL.text,
                background: "rgba(8,8,16,0.94)",
                border: `1px solid ${e.pager ? ROYAL.goldSoft : ROYAL.hairline}`,
              }}
            >
              {e.label}
            </div>
          </motion.div>
        ))}
      </div>

      <div
        className="absolute"
        style={{ right: CORNER, bottom: CORNER, filter: "url(#sswx-goo)", pointerEvents: "none" }}
      >
        {placed.map((e) => {
          const Icon = e.icon;
          const inner = (
            <>
              {e.pager
                ? <MoreHorizontal className="w-5 h-5" />
                : Icon ? <Icon className="w-5 h-5" /> : <span className="text-xs font-bold">{e.label.slice(0, 2)}</span>}
              {e.locked && <Lock className="absolute top-1 right-1 w-2.5 h-2.5 opacity-70" />}
            </>
          );
          const skin = {
            width: BLOB, height: BLOB, right: 0, bottom: 0,
            background: "radial-gradient(circle at 32% 28%, #f0dcae, #b98f3d)",
            color: "#0b0b12",
            pointerEvents: open ? ("auto" as const) : ("none" as const),
          };
          return (
            <motion.div
              key={e.key}
              className="absolute grid place-items-center rounded-full"
              style={skin}
              initial={false}
              animate={open ? { x: e.dx, y: e.dy, scale: 1, opacity: 1 } : { x: 0, y: 0, scale: 0.4, opacity: 0 }}
              transition={calm ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 22, delay: 0.04 * e.order }}
            >
              {e.pager ? (
                <button
                  onClick={() => setPage((p) => (remaining > 0 ? p + 1 : 0))}
                  aria-label={e.label}
                  className="w-full h-full grid place-items-center rounded-full"
                >
                  {inner}
                </button>
              ) : e.to ? (
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

        {/* The orb. Rotates into a back/close affordance when open. */}
        <motion.button
          onClick={() => (section !== null ? back() : toggle())}
          aria-label={section !== null ? "Back to sections" : open ? "Close the menu" : "Open the menu"}
          aria-expanded={open}
          className="absolute grid place-items-center rounded-full"
          style={{
            width: 62, height: 62, right: -4, bottom: -4,
            background: open ? "#b4451f" : "radial-gradient(circle at 32% 28%, #f0dcae, #b98f3d)",
            color: open ? "#fff" : "#0b0b12",
            boxShadow: `0 10px 24px rgba(0,0,0,.5), 0 0 0 1px ${ROYAL.goldSoft}`,
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

      {/* A champagne halo that breathes while the orb is closed — the only hint
          that the corner is interactive. Ornament, so calm removes it. */}
      {!open && !calm && (
        <motion.span
          className="absolute rounded-full pointer-events-none"
          style={{ right: 22, bottom: 22, width: 62, height: 62, border: `1px solid ${ROYAL.gold}` }}
          animate={{ scale: [1, 1.35], opacity: [0.55, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: EASE }}
          aria-hidden
        />
      )}
    </div>
  );
}
