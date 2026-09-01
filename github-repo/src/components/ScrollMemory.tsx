import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Where you were on each page.
 *
 * There was no scroll handling at all: opening a module from halfway down the
 * dashboard dropped you halfway down the module, and going back put you at the
 * top of the page you had just been reading. On a phone, where every page is
 * several screens tall, that is the difference between an app and a website.
 *
 * A page's position is remembered per path for the life of the tab, so Back
 * returns you to the row you tapped and a page you have not seen starts at the
 * top.
 *
 * Restoring is retried for a beat rather than done once: routes are lazy and
 * their data arrives after the first paint, so the document is usually still
 * one screen tall at the moment the route changes. The retry stops the instant
 * the scroll lands, and the moment anyone touches the page.
 */
const RESTORE_MS = 700;

export function ScrollMemory() {
  const [path] = useLocation();
  const positions = useRef(new Map<string, number>());
  const previous = useRef<string | null>(null);

  useEffect(() => {
    // The browser's own restoration fights this one and loses badly on an SPA,
    // where it fires before the route's chunk has even been fetched.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  }, []);

  useEffect(() => {
    const from = previous.current;
    if (from !== null) positions.current.set(from, window.scrollY);
    previous.current = path;

    const want = positions.current.get(path) ?? 0;
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
  }, [path]);

  // Leaving the tab mid-page should not lose the position either.
  useEffect(() => {
    const save = () => positions.current.set(path, window.scrollY);
    window.addEventListener("pagehide", save);
    return () => { save(); window.removeEventListener("pagehide", save); };
  }, [path]);

  return null;
}

export default ScrollMemory;
