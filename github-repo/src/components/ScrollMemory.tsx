import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { readSticky, writeSticky } from "../lib/stickyState";

/**
 * Where you were on each page.
 *
 * There was no scroll handling at all: opening a module from halfway down the
 * dashboard dropped you halfway down the module, and going back put you at the
 * top of the page you had just been reading. On a phone, where every page is
 * several screens tall, that is the difference between an app and a website.
 *
 * Two things it now does that it did not.
 *
 * IT SURVIVES THE BROWSER CLOSING. Positions used to live in a ref, so they
 * lasted exactly as long as the tab. Closing the app and coming back is not an
 * unusual thing to do — on a phone it is the only thing you do — and it put you
 * back at the top of everything.
 *
 * IT KNOWS ABOUT SECTIONS. Some pages are really several pages behind one URL;
 * the admin panel is twenty of them. Remembering one position for `/admin`
 * means switching sections restores you to an offset that belonged to a
 * different section's content. A page with internal sections calls
 * `setScrollVariant` and gets a position per section instead.
 *
 * Restoring is retried for a beat rather than done once: routes are lazy and
 * their data arrives after the first paint, so the document is usually still
 * one screen tall at the moment the route changes. The retry stops the instant
 * the scroll lands, and the moment anyone touches the page.
 */
const RESTORE_MS = 700;

/** How many positions to keep. Enough for every page anybody actually revisits. */
const KEEP = 40;

/* ── the section a page is currently showing ──────────────────────────────── */

let variant: string | null = null;
const listeners = new Set<() => void>();

/**
 * Tell the scroll memory which section of the current page is open.
 *
 * Called by pages whose URL does not change when the content does. Pass `null`
 * on unmount so the page's plain path is used again.
 */
export function setScrollVariant(v: string | null): void {
  if (v === variant) return;
  variant = v;
  for (const l of listeners) l();
}
function subscribeVariant(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
const getVariant = () => variant;
const getServerVariant = () => null;

/* ── the store ───────────────────────────────────────────────────────────── */

const KEY = "scroll";
type Positions = Record<string, number>;

function isPositions(v: unknown): v is Positions {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function ScrollMemory() {
  const [path] = useLocation();
  const section = useSyncExternalStore(subscribeVariant, getVariant, getServerVariant);
  const key = section ? `${path}|${section}` : path;

  const positions = useRef<Positions | null>(null);
  if (positions.current === null) {
    positions.current = readSticky<Positions>(KEY, {}, isPositions);
  }
  const previous = useRef<string | null>(null);

  useEffect(() => {
    // The browser's own restoration fights this one and loses badly on an SPA,
    // where it fires before the route's chunk has even been fetched.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);

  useEffect(() => {
    const store = positions.current!;
    const from = previous.current;
    if (from !== null) remember(store, from, window.scrollY);
    previous.current = key;

    const want = store[key] ?? 0;
    if (want === 0) { window.scrollTo(0, 0); return; }

    let stop = false;
    const done = () => { stop = true; };
    // Any deliberate movement wins over the restore.
    window.addEventListener("wheel", done, { passive: true, once: true });
    window.addEventListener("touchstart", done, { passive: true, once: true });

    const started = performance.now();
    const tick = () => {
      if (stop) return;
      window.scrollTo(0, want);
      if (Math.abs(window.scrollY - want) < 2) return;      // landed
      if (performance.now() - started > RESTORE_MS) return; // page is shorter now
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    return () => {
      stop = true;
      window.removeEventListener("wheel", done);
      window.removeEventListener("touchstart", done);
    };
  }, [key]);

  // Leaving the tab mid-page should not lose the position either. `pagehide`
  // rather than `beforeunload`: it is the one iOS actually fires when an app is
  // swiped away, which is the case that matters most here.
  useEffect(() => {
    const save = () => remember(positions.current!, key, window.scrollY);
    window.addEventListener("pagehide", save);
    return () => { save(); window.removeEventListener("pagehide", save); };
  }, [key]);

  return null;
}

/**
 * Record one position and write the set back.
 *
 * Zero is deleted rather than stored: the top of a page is the default, and
 * keeping it would fill the quota with rows that say nothing. Oldest entries
 * go first once the set is full, which by insertion order is the page you have
 * least recently been on.
 */
function remember(store: Positions, key: string, y: number): void {
  if (y < 2) delete store[key];
  else {
    delete store[key];        // re-insert so it counts as the most recent
    store[key] = Math.round(y);
  }
  const keys = Object.keys(store);
  if (keys.length > KEEP) for (const k of keys.slice(0, keys.length - KEEP)) delete store[k];
  writeSticky(KEY, store);
}

export default ScrollMemory;
