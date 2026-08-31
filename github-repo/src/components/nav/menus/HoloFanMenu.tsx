import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Lock, Layers as LayersIcon, X } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL, HEADING, EASE } from "../../../lib/royal";

/**
 * The Holographic Fan.
 *
 * Glass cards fanned from a pivot below the screen, like a hand you are holding.
 *
 * The pitch between cards is fixed rather than divided among however many there
 * are, and the hand scrolls under the viewport instead of compressing to fit.
 * Squeezing eleven cards into one 132° spread was tried first and it is exactly
 * the failure the spiral menu had: at 13° apart a 112px card leaves 45px of its
 * neighbour showing, which is not enough for a name. At a fixed 24° every card
 * keeps 81px of clear left edge no matter how large the section is, and drag
 * riffles through the rest — six on screen, the hand as long as it needs to be.
 *
 * The card nearest centre is scaled up and lifted, so riffling to the one you
 * want is a single gesture, and its name is repeated in the header where there
 * is room for all of it.
 *
 * What makes it holographic rather than merely glassy: every card carries an
 * iridescent sheen whose angle is a function of how far it has rotated from
 * centre, so the whole hand shifts hue together as you riffle it, the way a foil
 * card does when you tilt it. The focused card additionally gets a champagne rim
 * and a slow specular band travelling down its face. All of it is ornament, so
 * `calm` takes the lot away and leaves a legible hand of cards.
 *
 * Card geometry is set by legibility, not by taste.
 *
 * Cards fan clockwise and each one covers the top-right of the one before it,
 * so the strip guaranteed to stay exposed is the top-*left*. That is where the
 * label goes, left-aligned — a centred label puts half its text under the next
 * card. STEP then follows from the width: 24° at this radius is an 81px pitch,
 * which leaves a 112px card most of its left half clear.
 */
const CARD_W = 112;
const CARD_H = 176;
const RADIUS = 196;
const STEP = 24;      // degrees between neighbouring cards, whatever the count
const ARC = 66;       // cards past this angle are off the hand and not drawn
                      // (±66° is the widest the outermost card still fits a 390px screen)

export function HoloFanMenu({ nav }: { nav: MenuNav }) {
  const { open, section, current, sections, toggle, close, openSection, back, calm, containerRef } = nav;
  const entries = current
    ? current.items.map((it) => ({ key: it.path, label: it.label, icon: it.icon, to: it.path as string | null, locked: it.locked, index: -1 }))
    : sections.map((s, i) => ({ key: s.label, label: s.label, icon: s.icon, to: null as string | null, locked: false, index: i, count: s.items.length }));

  const n = entries.length;

  // Which card is facing the viewer. A float while a drag is in flight, so the
  // hand tracks the finger; snapped back to a whole card when it is let go.
  const home = (n - 1) / 2;
  const [pos, setPos] = useState(home);
  const [rest, setRest] = useState(home);

  // A new hand opens centred on itself.
  useEffect(() => { const h = (n - 1) / 2; setPos(h); setRest(h); }, [section, open, n]);

  const visible = entries
    .map((e, i) => ({ e, i, angle: (i - pos) * STEP }))
    .filter((c) => Math.abs(c.angle) <= ARC);

  const focusedLabel = entries[Math.max(0, Math.min(n - 1, Math.round(pos)))]?.label ?? "";

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(70% 46% at 50% 96%, rgba(217,183,117,0.13), transparent 68%),` +
            `radial-gradient(120% 90% at 50% 100%, #05050f 30%, #02020a 100%)`,
          backdropFilter: "blur(14px)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.35 }}
        onClick={close}
        aria-hidden={!open}
      />

      {open && (
        <div className="absolute inset-x-0 top-12 text-center pointer-events-none px-6">
          <div className="text-[9.5px] uppercase tracking-[0.42em]" style={{ color: ROYAL.gold }}>
            {current ? "Section" : "StormSync"}
          </div>
          <div className="text-[19px] font-semibold mt-1 leading-none"
               style={{ color: ROYAL.text, fontFamily: HEADING }}>
            {current ? current.label : "Pick a card"}
          </div>
          <div className="text-[10.5px] mt-1.5" style={{ color: ROYAL.dim }}>
            {n > 6
              ? <>Drag to riffle · <span style={{ color: ROYAL.gold }}>{focusedLabel}</span> · {Math.round(pos) + 1} of {n}</>
              : "Tap a card to open it"}
          </div>
        </div>
      )}

      {/* The pivot sits below the screen edge, so the cards arc up into view. */}
      <motion.div
        className="absolute"
        style={{ left: "50%", bottom: 96, width: 0, height: 0, pointerEvents: open ? "auto" : "none" }}
        drag={open && n > 3 && !calm ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.55}
        onDrag={(_, info) => {
          // 0.16° of swing per pixel, converted into card widths. A little
          // overshoot past either end is allowed so the hand feels sprung.
          const next = rest - (info.offset.x * 0.16) / STEP;
          setPos(Math.max(-0.6, Math.min(n - 0.4, next)));
        }}
        onDragEnd={() => {
          const snapped = Math.max(0, Math.min(n - 1, Math.round(pos)));
          setPos(snapped); setRest(snapped);
        }}
      >
        {visible.map(({ e, i, angle }) => {
          // How close this card is to facing the viewer, 1 at dead centre.
          const focus = Math.max(0, 1 - Math.abs(angle) / (STEP * 1.3));
          // Cards fade out as they leave the hand rather than vanishing.
          const edge = Math.max(0, Math.min(1, (ARC - Math.abs(angle)) / 22));
          // The foil angle tracks the card's own rotation, so the hue shifts as
          // the hand turns rather than sitting still on each face.
          const foil = 118 + angle * 2.4;
          // The card nearer the centre is drawn on top, so a card left of centre
          // is covered on its right and one right of centre is covered on its
          // left. Put each label on the edge that survives.
          const outward = angle > 0.5;
          const Icon = e.icon;
          const body = (
            <>
              <div className="pt-3 text-[11px] font-semibold leading-tight"
                   style={{
                     color: ROYAL.text, fontFamily: HEADING,
                     textShadow: "0 1px 6px rgba(0,0,0,.9)",
                     textAlign: outward ? "right" : "left",
                     paddingLeft: outward ? 12 : 10, paddingRight: outward ? 10 : 12,
                   }}>
                {e.label}
              </div>
              <div
                className="mt-1.5 h-px"
                style={{
                  width: 34,
                  marginLeft: outward ? "auto" : 10, marginRight: outward ? 10 : "auto",
                  background: `linear-gradient(${outward ? 270 : 90}deg, ${ROYAL.gold}, transparent)`,
                  opacity: 0.4 + focus * 0.5,
                }}
              />
              <div className="flex-1 grid place-items-center">
                <span
                  className="grid place-items-center rounded-full"
                  style={{
                    width: 46, height: 46,
                    background: `radial-gradient(circle at 34% 28%, rgba(217,183,117,${0.10 + focus * 0.16}), rgba(255,255,255,0.03) 70%)`,
                    border: `1px solid rgba(217,183,117,${0.16 + focus * 0.3})`,
                  }}
                >
                  {Icon
                    ? <Icon style={{ width: 22, height: 22, color: ROYAL.gold }} />
                    : <LayersIcon style={{ width: 22, height: 22, color: ROYAL.gold }} />}
                </span>
              </div>
              <div className="pb-3 text-[9px] uppercase tracking-[0.14em]"
                   style={{ color: ROYAL.dim, textAlign: outward ? "right" : "left", paddingLeft: 10, paddingRight: 10 }}>
                {"count" in e ? `${e.count} modules` : e.locked ? "Locked" : "Open"}
              </div>
              {e.locked && (
                <Lock
                  className="absolute top-2.5 w-3 h-3"
                  style={{ color: ROYAL.dim, left: outward ? 10 : undefined, right: outward ? undefined : 10 }}
                />
              )}
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
                background:
                  // Glass first, then the foil, then a champagne wash that only
                  // the focused card really shows.
                  `linear-gradient(${foil}deg,` +
                  ` rgba(255,120,220,${0.05 + focus * 0.09}) 0%,` +
                  ` rgba(120,200,255,${0.05 + focus * 0.09}) 32%,` +
                  ` rgba(150,255,205,${0.04 + focus * 0.07}) 58%,` +
                  ` rgba(255,215,140,${0.05 + focus * 0.10}) 84%),` +
                  `linear-gradient(150deg, rgba(255,255,255,0.20), rgba(255,255,255,0.02)),` +
                  `linear-gradient(180deg, rgba(7,7,19,${0.80 + focus * 0.12}), rgba(7,7,19,${0.90 + focus * 0.08}))`,
                backdropFilter: "blur(25px)",
                border: `1px solid rgba(217,183,117,${0.14 + focus * 0.5})`,
                boxShadow:
                  `0 ${10 + focus * 12}px ${26 + focus * 18}px rgba(0,0,0,.62),` +
                  ` 0 0 ${focus * 28}px -6px rgba(217,183,117,${focus * 0.5}),` +
                  ` inset 0 1px 0 0 rgba(255,255,255,${0.12 + focus * 0.2})`,
                zIndex: 10 + Math.round(focus * 40),
                pointerEvents: "none",
              }}
              initial={false}
              animate={open
                ? { rotate: angle, y: -RADIUS - focus * 7, scale: 0.95 + focus * 0.06, opacity: edge }
                : { rotate: 0, y: -12, scale: 0.6, opacity: 0 }}
              transition={calm ? { duration: 0 } : { type: "spring", stiffness: 210, damping: 24, delay: open ? i * 0.045 : 0 }}
            >
              {/* Specular band. Travels down the face of whichever card is in
                  focus, which is what sells the surface as foil rather than
                  frosted plastic. */}
              {!calm && focus > 0.45 && (
                <motion.span
                  aria-hidden
                  className="absolute inset-x-0 pointer-events-none"
                  style={{
                    height: 74, top: -74,
                    background: `linear-gradient(180deg, transparent, rgba(255,255,255,${0.10 + focus * 0.12}), transparent)`,
                  }}
                  animate={{ y: [0, CARD_H + 74] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: EASE, repeatDelay: 1.4 }}
                />
              )}
              <div className="w-full h-full flex flex-col relative">{body}</div>
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
        <div className="absolute" style={{ left: "50%", bottom: 96, width: 0, height: 0 }}>
          {visible.map(({ e, angle }) => {
            const rad = ((angle - 90) * Math.PI) / 180;
            const r = RADIUS + CARD_H * 0.58;
            const hit = 88;
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

      {open && n > 6 && (
        <>
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              onClick={() => {
                const next = Math.max(0, Math.min(n - 1, Math.round(pos) + dir));
                setPos(next); setRest(next);
              }}
              disabled={dir < 0 ? Math.round(pos) <= 0 : Math.round(pos) >= n - 1}
              aria-label={dir < 0 ? "Previous card" : "Next card"}
              className="absolute grid place-items-center rounded-full disabled:opacity-25"
              style={{
                left: "50%", bottom: 30, marginLeft: dir < 0 ? -104 : 60, width: 44, height: 44, zIndex: 80,
                background: "rgba(8,8,18,0.9)",
                border: `1px solid ${ROYAL.goldSoft}`,
                color: ROYAL.gold,
                pointerEvents: "auto",
              }}
            >
              <ChevronLeft className="w-5 h-5" style={{ transform: dir > 0 ? "rotate(180deg)" : undefined }} />
            </button>
          ))}
        </>
      )}

      <button
        onClick={() => (section !== null ? back() : toggle())}
        aria-label={section !== null ? "Back to sections" : open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-full"
        style={{
          left: "50%", bottom: 22, marginLeft: -30, width: 60, height: 60, zIndex: 80,
          background: open ? "rgba(180,69,31,0.92)" : "rgba(8,8,18,0.92)",
          border: `1px solid ${open ? "rgba(255,255,255,0.35)" : ROYAL.goldSoft}`,
          backdropFilter: "blur(10px)",
          color: open ? "#fff" : ROYAL.gold,
          boxShadow: "0 10px 26px rgba(0,0,0,.55)",
          pointerEvents: "auto",
          transition: calm ? "none" : "background .25s ease, border-color .25s ease",
        }}
      >
        {section !== null
          ? <ChevronLeft className="w-6 h-6" />
          : open
            ? <X className="w-5 h-5" />
            : <FanGlyph calm={calm} />}
      </button>
    </div>
  );
}

/**
 * Three cards dealing into a fan and settling back — the closed control doing in
 * miniature what the menu does at full size.
 */
function FanGlyph({ calm }: { calm: boolean }) {
  if (calm) return <LayersIcon className="w-5 h-5" />;
  return (
    <span className="relative block" style={{ width: 22, height: 22 }} aria-hidden>
      {[-1, 0, 1].map((k, i) => (
        <motion.span
          key={k}
          className="absolute rounded-[2px]"
          style={{
            left: 7, bottom: 2, width: 8, height: 13,
            border: `1px solid ${ROYAL.gold}`,
            background: "rgba(217,183,117,0.12)",
            transformOrigin: "bottom center",
          }}
          animate={{ rotate: [0, k * 30, k * 30, 0] }}
          transition={{
            duration: 3, repeat: Infinity, ease: EASE,
            times: [0, 0.3, 0.75, 1], delay: i * 0.05,
          }}
        />
      ))}
    </span>
  );
}
