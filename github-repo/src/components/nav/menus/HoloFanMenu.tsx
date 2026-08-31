import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Lock, Layers as LayersIcon } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL } from "../../../lib/royal";

/**
 * The Holographic Fan — PARKED.
 *
 * Deliberately not wired into the menu system: it is being kept for a different
 * surface. It still compiles and still works against MenuNav, so bringing it
 * back is a one-line case in MenuHost. Do not delete it on the grounds that
 * nothing imports it.
 *
 * Glass cards fanned from a pivot below the screen, like a hand you are holding.
 * The spread widens with the count instead of the cards shrinking: three cards
 * sit 26° apart and nine sit 13° apart, so a big section reads as a fuller hand
 * rather than a smaller one. Labels ride at the top of each card because that is
 * the strip that stays visible once cards overlap.
 *
 * Dragging left or right rotates the whole fan, which is what makes a nine-card
 * hand usable — the card nearest the centre is scaled up and lifted, so riffling
 * to the one you want is a single gesture.
 */
const CARD_W = 132;
const CARD_H = 184;
const RADIUS = 196;

export function HoloFanMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;
  const [spin, setSpin] = useState(0);

  const entries = current
    ? current.items.map((it) => ({ key: it.path, label: it.label, icon: it.icon, to: it.path as string | null, locked: it.locked, index: -1 }))
    : sections.map((s, i) => ({ key: s.label, label: s.label, icon: s.icon, to: null as string | null, locked: false, index: i, count: s.items.length }));

  // Reset the riffle whenever the hand changes, or the fan opens facing sideways.
  useEffect(() => { setSpin(0); }, [section, open]);

  const n = entries.length;
  const step = n <= 1 ? 0 : Math.min(26, 132 / (n - 1));
  const centre = ((n - 1) * step) / 2;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{ background: "rgba(4,6,16,0.74)", backdropFilter: "blur(14px)", pointerEvents: open ? "auto" : "none" }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.35 }}
        onClick={close}
        aria-hidden={!open}
      />

      {open && (
        <div className="absolute inset-x-0 top-16 text-center pointer-events-none">
          <div className="text-[10px] uppercase tracking-[0.35em]" style={{ color: ROYAL.dim }}>
            {current ? current.label : "Sections"}
          </div>
          <div className="text-xs mt-1" style={{ color: ROYAL.dim }}>
            {n > 5 ? "Drag to riffle" : "Tap a card"}
          </div>
        </div>
      )}

      {/* The pivot sits below the screen edge, so the cards arc up into view. */}
      <motion.div
        className="absolute"
        style={{ left: "50%", bottom: 4, width: 0, height: 0, pointerEvents: open ? "auto" : "none" }}
        drag={open && n > 3 && !calm ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.55}
        onDrag={(_, info) => setSpin(info.offset.x * 0.16)}
        onDragEnd={() => setSpin(0)}
      >
        {entries.map((e, i) => {
          const angle = i * step - centre + spin;
          // How close this card is to facing the viewer, 1 at dead centre.
          const focus = Math.max(0, 1 - Math.abs(angle) / 34);
          const Icon = e.icon;
          const body = (
            <>
              <div className="px-2 pt-3 text-center text-[11px] font-semibold leading-tight"
                   style={{ color: ROYAL.text, textShadow: "0 1px 6px rgba(0,0,0,.7)" }}>
                {e.label}
              </div>
              <div className="flex-1 grid place-items-center">
                {Icon ? <Icon style={{ width: 34, height: 34, color: ROYAL.gold }} /> : <LayersIcon style={{ width: 34, height: 34, color: ROYAL.gold }} />}
              </div>
              <div className="pb-3 text-center text-[10px]" style={{ color: ROYAL.dim }}>
                {"count" in e ? `${e.count} modules` : e.locked ? "Locked" : ""}
              </div>
              {e.locked && <Lock className="absolute top-2 right-2 w-3 h-3" style={{ color: ROYAL.dim }} />}
            </>
          );
          return (
            <motion.div
              key={e.key}
              className="absolute flex flex-col overflow-hidden"
              style={{
                width: CARD_W, height: CARD_H,
                left: -CARD_W / 2, bottom: 0,
                transformOrigin: "bottom center",
                borderRadius: 20,
                background: "linear-gradient(135deg, rgba(255,255,255,0.20), rgba(255,255,255,0.02))",
                backdropFilter: "blur(25px)",
                border: `1px solid rgba(255,255,255,${0.22 + focus * 0.3})`,
                boxShadow: `0 ${12 + focus * 14}px ${28 + focus * 18}px rgba(0,0,0,.55)`,
                zIndex: 10 + Math.round(focus * 40),
                pointerEvents: "none",
              }}
              initial={false}
              animate={open
                ? { rotate: angle, y: -RADIUS - focus * 12, scale: 0.93 + focus * 0.1, opacity: 1 }
                : { rotate: 0, y: 0, scale: 0.6, opacity: 0 }}
              transition={calm ? { duration: 0 } : { type: "spring", stiffness: 210, damping: 24, delay: open ? i * 0.035 : 0 }}
            >
              <div className="w-full h-full flex flex-col">{body}</div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Cards in a fan overlap by design, which means a card's middle can sit
          under its neighbour and become untappable. So the cards are visual only
          and the tap targets live out here, spaced along the arc at the height
          where the fan splays widest — far enough apart that every entry is
          reachable however tight the hand gets. */}
      {open && (
        <div className="absolute" style={{ left: "50%", bottom: 4, width: 0, height: 0 }}>
          {entries.map((e, i) => {
            const angle = i * step - centre + spin;
            const rad = ((angle - 90) * Math.PI) / 180;
            const r = RADIUS + CARD_H * 0.58;
            const hit = n > 6 ? 74 : 92;
            const common = {
              className: "absolute rounded-full",
              style: {
                left: r * Math.cos(rad) - hit / 2,
                bottom: -(r * Math.sin(rad)) - hit / 2,
                width: hit, height: hit,
                pointerEvents: "auto" as const,
                zIndex: 75,
              },
              "aria-label": e.label,
            };
            return e.to
              ? <Link key={`h-${e.key}`} href={e.to} onClick={close} {...common} />
              : <button key={`h-${e.key}`} onClick={() => openSection(e.index)} {...common} />;
          })}
        </div>
      )}

      <button
        onClick={() => (section !== null ? back() : toggle())}
        aria-label={section !== null ? "Back to sections" : open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-full"
        style={{
          left: "50%", bottom: 26, marginLeft: -34, width: 68, height: 68, zIndex: 80,
          background: open ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.12)",
          border: `1px solid rgba(255,255,255,${open ? 0.5 : 0.3})`,
          backdropFilter: "blur(10px)",
          color: ROYAL.text,
          pointerEvents: "auto",
          transition: calm ? "none" : "all .3s ease",
        }}
      >
        {section !== null ? <ChevronLeft className="w-6 h-6" /> : <LayersIcon className="w-6 h-6" />}
      </button>
    </div>
  );
}
