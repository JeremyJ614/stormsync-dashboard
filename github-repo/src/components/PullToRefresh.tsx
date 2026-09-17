import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ROYAL, prefersReducedMotion } from "../lib/royal";
import { haptic } from "../lib/haptics";

/**
 * Pull down to refresh.
 *
 * The single gesture every phone user tries first on a weather app, and the
 * app did not have it — the only way to get new data was the browser's own
 * reload, which throws away the whole SPA and re-downloads the shell.
 *
 * This refetches the queries that are actually on screen. TanStack already
 * knows which those are, so a pull on the radar refreshes the radar and a pull
 * on the dashboard refreshes the dashboard, without either page knowing this
 * component exists. A `sswx:refresh` event goes out too, for the handful of
 * screens that hold state outside the query cache.
 *
 * The indicator is drawn rather than animated with a library: it is on screen
 * for a few hundred milliseconds during a gesture the finger is already
 * driving, and a spring would only add lag to it.
 *
 * It stays out of the way of everything that scrolls or drags on its own —
 * maps, carousels, any scrolled-down container, and anything marked
 * `data-no-pull`.
 */
const THRESHOLD = 72;   // how far to commit
const MAX = 110;        // where the rubber band stops giving
const RESIST = 0.55;

export function PullToRefresh() {
  const qc = useQueryClient();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const armed = useRef(false);
  const startY = useRef(0);
  const startX = useRef(0);
  /** null until the finger has committed to an axis. */
  const vertical = useRef<boolean | null>(null);
  const fired = useRef(false);
  const still = prefersReducedMotion();

  const run = useCallback(async () => {
    setBusy(true);
    haptic("success");
    window.dispatchEvent(new CustomEvent("sswx:refresh"));
    // A floor on the spinner, so a refetch that resolves from cache in 30ms
    // reads as "refreshed" rather than as "nothing happened" — and a ceiling,
    // because one slow endpoint must not pin a spinner to the screen. The
    // refetch keeps going either way; only the indicator gives up.
    const floor = new Promise((r) => setTimeout(r, 520));
    const ceiling = new Promise((r) => setTimeout(r, 6000));
    await Promise.all([
      Promise.race([qc.refetchQueries({ type: "active" }).catch(() => {}), ceiling]),
      floor,
    ]);
    setBusy(false);
    setPull(0);
  }, [qc]);

  useEffect(() => {
    if (still) return;

    /** Anything that owns the vertical gesture itself. */
    function blocked(target: EventTarget | null): boolean {
      let el = target instanceof Element ? target : null;
      while (el && el !== document.body) {
        if (el.hasAttribute?.("data-no-pull")) return true;
        if (el.classList?.contains("maplibregl-map")) return true;
        // A container the member has already scrolled down inside: the pull
        // belongs to it, not to the page.
        if (el.scrollHeight > el.clientHeight + 2 && el.scrollTop > 0) return true;
        el = el.parentElement;
      }
      return false;
    }

    function onStart(e: TouchEvent) {
      if (busy || e.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      if (blocked(e.target)) return;
      armed.current = true;
      fired.current = false;
      vertical.current = null;
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
    }

    function onMove(e: TouchEvent) {
      if (!armed.current) return;
      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;

      // Decide once, at 8px, whether this gesture is ours. Without the lock a
      // horizontal swipe near the top of the page — a carousel, a chart scrub —
      // would be cancelled by the first pixel of vertical drift in it.
      if (vertical.current === null) {
        if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
        vertical.current = Math.abs(dy) > Math.abs(dx);
      }
      if (!vertical.current) { armed.current = false; return; }

      if (dy <= 0) { if (pull) setPull(0); armed.current = window.scrollY <= 0; return; }
      // Once committed, the page must not also scroll — otherwise the content
      // slides up behind a spinner that is pulling down.
      if (e.cancelable) e.preventDefault();
      const d = Math.min(MAX, dy * RESIST);
      if (!fired.current && d >= THRESHOLD) { fired.current = true; haptic("tick"); }
      setPull(d);
    }

    function onEnd() {
      if (!armed.current) return;
      armed.current = false;
      if (fired.current) void run();
      else setPull(0);
    }

    // `touchmove` must be non-passive so the pull can cancel the page scroll.
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [busy, pull, run, still]);

  if (still) return null;
  const shown = busy ? THRESHOLD : pull;
  if (shown <= 0) return null;

  const t = Math.min(1, shown / THRESHOLD);
  const ready = t >= 1;

  return (
    <div
      aria-hidden
      className="fixed left-0 right-0 z-[55] flex justify-center pointer-events-none"
      style={{
        top: `calc(env(safe-area-inset-top, 0px) + ${shown - 42}px)`,
        transition: busy || pull === 0 ? "top .28s cubic-bezier(.22,1,.36,1)" : "none",
      }}
    >
      <div
        className="grid place-items-center rounded-full"
        style={{
          width: 34, height: 34,
          background: "rgba(10,10,22,0.94)",
          border: `1px solid ${ready ? ROYAL.gold : ROYAL.hairline}`,
          boxShadow: "0 8px 22px rgba(0,0,0,.6)",
          transform: `scale(${0.7 + t * 0.3})`,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" style={{ transform: `rotate(${busy ? 0 : t * 300}deg)` }}>
          <circle cx="9" cy="9" r="7" fill="none" stroke={ROYAL.hairline} strokeWidth="2" />
          <circle
            cx="9" cy="9" r="7" fill="none"
            stroke={ready ? ROYAL.gold : ROYAL.dim}
            strokeWidth="2" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 7}
            strokeDashoffset={2 * Math.PI * 7 * (1 - (busy ? 0.28 : t))}
            transform="rotate(-90 9 9)"
            style={busy ? { animation: "sswx-ptr-spin .8s linear infinite", transformOrigin: "9px 9px" } : undefined}
          />
        </svg>
      </div>
    </div>
  );
}

export default PullToRefresh;
