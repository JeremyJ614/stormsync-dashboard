import { Link } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, Lock } from "lucide-react";
import type { MenuEntry } from "../entries";
import type { MenuNav } from "../useMenuNav";
import { ROYAL, HEADING } from "../../../../lib/royal";

/**
 * The parts every Portal Lab menu needs, in one place.
 *
 * The lab drew each menu against a flat list of eight links. This app's
 * navigation is two levels — sections, then the modules inside the one you
 * picked — so every ported menu has to drive `entriesFor(nav)` rather than a
 * fixed array, and every one needs the same three things: a way to act on an
 * entry, a way to step back up a level, and a scrim that closes.
 *
 * Writing those twelve times would mean twelve slightly different answers to
 * "what happens when you tap a locked module". They live here so the menus can
 * be about how they look, which is the only reason there are twelve of them.
 *
 * The lab's palette does not come with them. These are ROYAL: ink ground,
 * champagne hairline, periwinkle for interactive state. A menu that does not
 * match the page it opens over reads as a different product.
 */

/** The lab's ease, kept so the ported motion matches what was approved. */
export const LAB_EASE = [0.22, 1, 0.36, 1] as const;
export const LAB_SPRING = { type: "spring", stiffness: 340, damping: 26 } as const;

/** Per-item entrance delay, in seconds. Flat 0 when the viewer wants calm. */
export function delay(i: number, calm: boolean, base = 0.12, step = 0.045): number {
  return calm ? 0 : base + i * step;
}

/**
 * Act on one entry.
 *
 * A module navigates and closes; a section drills in. That asymmetry is the
 * whole two-level traversal, and it is the one thing no menu may get wrong, so
 * no menu implements it.
 */
export function EntryAction({
  entry, nav, className, style, children, ariaLabel,
}: {
  entry: MenuEntry;
  nav: MenuNav;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  const label = ariaLabel ?? entry.label;
  if (entry.to) {
    return (
      <Link href={entry.to} onClick={nav.close} aria-label={label} className={className} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={() => nav.openSection(entry.index)} aria-label={label} className={className} style={style}>
      {children}
    </button>
  );
}

/** The padlock a gated module carries. Drawn once so it sits the same everywhere. */
export function LockMark({ size = 12 }: { size?: number }) {
  return <Lock style={{ width: size, height: size, color: ROYAL.dim, flex: "none" }} aria-hidden />;
}

/**
 * How much ground a menu takes off the page behind it.
 *
 * `full` is for menus that own the screen; `light` dims but keeps the page
 * legible, for sidebars and panels beside content; `none` is a bare
 * click-catcher for the pills, which exist precisely so you can keep reading.
 */
export type ScrimWeight = "full" | "light" | "none";

/**
 * The ground behind an open menu. Tapping it closes.
 *
 * THIS WAS OPAQUE AND IT SHOULD NEVER HAVE BEEN. The first version set a
 * `background` gradient and then `backgroundColor: ROYAL.ink` after it — and in
 * a style object the later key wins, so every menu blanked the page behind it
 * to solid ink. On a sidebar that read as heavy-handed; on the pills, whose
 * entire purpose is to float over content you are still reading, it looked like
 * the app had crashed. There is one background declaration here now, and its
 * alpha is in the value.
 */
export function Scrim({ nav, weight = "full" }: { nav: MenuNav; weight?: ScrimWeight }) {
  const fill =
    weight === "none" ? "transparent"
    : weight === "light" ? "rgba(4, 4, 11, 0.52)"
    : "rgba(4, 4, 11, 0.78)";
  return (
    <motion.div
      className="absolute inset-0"
      style={{
        background: fill,
        backdropFilter: weight === "full" ? "blur(14px) saturate(1.15)" : "none",
        WebkitBackdropFilter: weight === "full" ? "blur(14px) saturate(1.15)" : "none",
        pointerEvents: nav.open ? "auto" : "none",
      }}
      initial={false}
      animate={{ opacity: nav.open ? 1 : 0 }}
      transition={{ duration: nav.calm ? 0 : 0.26 }}
      onClick={nav.close}
      aria-hidden
    />
  );
}

/**
 * A drawn chevron rather than an icon-font one.
 *
 * Lucide's chevron is a uniform stroke, which at 12px against champagne reads
 * as a grey tick. This is a filled arrowhead with a lit leading edge and a
 * shadowed trailing one, so it catches the light the same way the rest of the
 * champagne furniture does.
 */
export function GoldArrow({ size = 13, open = false, calm = false }: { size?: number; open?: boolean; calm?: boolean }) {
  return (
    <motion.svg
      width={size} height={size} viewBox="0 0 12 12" aria-hidden
      style={{ flex: "none", overflow: "visible" }}
      initial={false}
      animate={{ rotate: open ? 90 : 0 }}
      transition={calm ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 20 }}
    >
      <defs>
        <linearGradient id={`ga-${size}-${open ? "o" : "c"}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f0d9a8" />
          <stop offset="55%" stopColor={ROYAL.gold} />
          <stop offset="100%" stopColor="#9c7734" />
        </linearGradient>
      </defs>
      <path d="M3.4 1.2 L9.2 6 L3.4 10.8 Z" fill={`url(#ga-${size}-${open ? "o" : "c"})`} />
      <path d="M3.4 1.2 L9.2 6" stroke="rgba(255,255,255,0.55)" strokeWidth="0.7" strokeLinecap="round" fill="none" />
    </motion.svg>
  );
}

/** "All sections" — shown only once you have drilled into one. */
export function BackRow({ nav, className, style }: { nav: MenuNav; className?: string; style?: React.CSSProperties }) {
  if (nav.section === null) return null;
  return (
    <button
      onClick={nav.back}
      className={className ?? "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px]"}
      style={style ?? {
        color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(255,255,255,0.03)",
      }}
    >
      <ChevronLeft className="w-3.5 h-3.5" /> All sections
    </button>
  );
}

/** Wordmark, as the lab drew it: STORM in text, SYNC in the accent. */
export function Wordmark({ size = 13 }: { size?: number }) {
  return (
    <span style={{ fontFamily: HEADING, fontSize: size, fontWeight: 800, letterSpacing: "-0.03em", color: ROYAL.text }}>
      STORM<span style={{ color: ROYAL.gold }}>SYNC</span>
    </span>
  );
}

/**
 * What the current level is called.
 *
 * At the top it is the app; inside a section it is that section, and the
 * subtitle carries the count so a panel never shows a bare list with no idea
 * how much of it there is.
 */
export function levelTitle(nav: MenuNav, entries: MenuEntry[]): { title: string; sub: string } {
  return nav.current
    ? { title: nav.current.label, sub: `${entries.length} module${entries.length === 1 ? "" : "s"}` }
    : { title: "Navigate", sub: `${entries.length} sections` };
}

/** A section's subtitle in the lab's "Services · five apps" shape. */
export function entrySub(e: MenuEntry): string {
  if (e.to) return e.locked ? "Members" : "Open";
  return `${e.count} module${e.count === 1 ? "" : "s"}`;
}

/** The trigger every menu that needs one shares, so the hit target never moves. */
export function Trigger({
  nav, children, style, label,
}: {
  nav: MenuNav;
  children: React.ReactNode;
  style?: React.CSSProperties;
  label?: string;
}) {
  return (
    <button
      onClick={nav.toggle}
      aria-label={label ?? (nav.open ? "Close the menu" : "Open the menu")}
      aria-expanded={nav.open}
      className="absolute grid place-items-center"
      style={{
        right: 20, bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
        width: 56, height: 56, zIndex: 80, pointerEvents: "auto",
        background: "none", border: "none", ...style,
      }}
    >
      {children}
    </button>
  );
}
