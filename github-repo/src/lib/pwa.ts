/**
 * PWA bootstrap: service-worker registration, update handling, and the
 * browser's install prompt.
 *
 * Two things matter about updates and they pull in opposite directions. A
 * member must never be stuck on an old build — but the screen must never blink
 * out from under someone reading a warning. So: check often, hand over
 * silently when they are not looking, and ask when they are.
 */
import { hasUnsavedWork, noteEditableInput } from "./unsavedWork";
import { logger } from "./logger";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// ── update state ─────────────────────────────────────────────────────────────
let waitingWorker: ServiceWorker | null = null;
const updateListeners = new Set<() => void>();
const emitUpdate = () => updateListeners.forEach((l) => l());

/** True when a newer build is installed and waiting for the page to hand over. */
export const updateReady = (): boolean => waitingWorker !== null;

export function subscribeUpdate(cb: () => void): () => void {
  updateListeners.add(cb);
  return () => updateListeners.delete(cb);
}

/** Take the new build now. Reloads once, via the controllerchange handler. */
export function applyUpdate(): void {
  waitingWorker?.postMessage("SKIP_WAITING");
}

/**
 * Whether it is safe to swap builds without asking.
 *
 * "Not looking" is the honest test: the tab is hidden, or nothing has been
 * typed or tapped for a while and no form is part-filled. Anything else and we
 * offer the refresh instead of taking it.
 */
let lastInteraction = Date.now();
const IDLE_MS = 60_000;

/**
 * Fields the member has actually typed into, held weakly so a field that gets
 * unmounted stops counting on its own.
 *
 * Scanning every input on the page instead was the obvious version and the
 * wrong one: the app keeps a location box populated at all times, so "some
 * input has a value" is true on essentially every screen. That would have
 * pinned the app to `busy` forever and turned the silent hand-over — the whole
 * point of this — into a refresh chip nobody asked for.
 */
const edited = new WeakSet<Element>();

function hasPartFilledForm(): boolean {
  return Array.from(document.querySelectorAll("input, textarea, select")).some((el) => {
    if (!edited.has(el)) return false;
    const f = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (f.disabled) return false;
    if (f.type === "checkbox" || f.type === "radio") return (f as HTMLInputElement).checked;
    return typeof f.value === "string" && f.value.trim().length > 0;
  });
}

function pageIsBusy(): boolean {
  // Unsaved work outranks everything: a reload here costs real work, even if
  // they stepped away mid-form. `hasUnsavedWork` covers both the surfaces that
  // declare themselves — the News editor does — and typed-into rich-text
  // regions, which a scan of form elements cannot see at all.
  if (hasUnsavedWork()) return true;
  if (hasPartFilledForm()) return true;
  if (document.visibilityState === "hidden") return false;
  return Date.now() - lastInteraction <= IDLE_MS;
}

export function initPwa(): void {
  for (const ev of ["pointerdown", "keydown", "scroll"] as const) {
    window.addEventListener(ev, () => { lastInteraction = Date.now(); }, { passive: true });
  }

  // `input` fires for typing and for picker/checkbox changes alike, and only
  // ever from the member — programmatic value writes do not raise it, which is
  // exactly the distinction this needs.
  window.addEventListener("input", (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) {
      edited.add(t);
      lastInteraction = Date.now();
    } else {
      // Everything that is not one of those three: TipTap, and any other
      // rich-text surface. Without this branch the News editor never
      // registered as touched.
      noteEditableInput(t);
      lastInteraction = Date.now();
    }
  }, { passive: true, capture: true });

  // Repair a poisoned asset cache before anything else asks for a chunk.
  void repairPoisonedCaches();

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        const check = () => { reg.update().catch(() => {}); };
        check();

        // An installed app left open for a week previously never re-checked,
        // because the only check ran inside this `load` handler. Now it also
        // checks on a timer and whenever the tab comes back to the foreground.
        const TIMER_MS = 30 * 60 * 1000;
        setInterval(check, TIMER_MS);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });

        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            if (next.state !== "installed" || !navigator.serviceWorker.controller) return;
            if (pageIsBusy()) {
              // Someone is using the app. Offer it; do not take it.
              waitingWorker = next;
              emitUpdate();
            } else {
              next.postMessage("SKIP_WAITING");
            }
          });
        });

        // If they were busy when it arrived, take it the moment they leave —
        // but leaving is not the same as being finished. This handler used to
        // fire on `hidden` alone, so switching apps to fetch a link swapped the
        // build and reloaded the page while nobody was watching; the member came
        // back to an empty form and no explanation. Unsaved work still holds the
        // update, however long they are away.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState !== "hidden") return;
          if (!waitingWorker || pageIsBusy()) return;
          applyUpdate();
        });
      }).catch(() => {});

      /**
       * The hand-over reload — the last thing standing between a member and a
       * blank form, so it is guarded twice.
       *
       * FIRST: a page that had no controller when it loaded is not having the
       * build changed underneath it. That is the first worker ever installing
       * and calling `clients.claim()`, which fires this event on somebody's
       * very first visit. Reloading there is a blink for no reason — the page
       * is already running exactly the code the new worker would serve.
       *
       * SECOND: never reload over someone's work. A controller change means
       * the NEXT navigation gets new assets; it does not mean this page has to
       * stop existing this second. If they are mid-something, hold the reload
       * and take it when they are idle or when they leave. The page keeps
       * working in the meantime — it is the same JavaScript it was a moment
       * ago.
       */
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      const reloadNow = () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded || !hadController) return;
        if (!pageIsBusy()) { reloadNow(); return; }
        // Wait them out. Checked on a slow timer and whenever they leave,
        // because "idle" and "gone" are the two moments this is free.
        const timer = setInterval(() => {
          if (reloaded) { clearInterval(timer); return; }
          if (!pageIsBusy()) { clearInterval(timer); reloadNow(); }
        }, 5_000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden" && !pageIsBusy()) {
            clearInterval(timer); reloadNow();
          }
        });
      });
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => { deferred = null; emit(); });
}

export const canInstall = (): boolean => !!deferred;
export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null; emit();
  return outcome === "accepted";
}

/** True when the app is running as an installed PWA. */
export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
}


/**
 * Delete cache entries that can never answer the request they are filed under.
 *
 * THE BUG THIS REPAIRS
 * A missing file does not 404 on this host — the single-page rewrite answers it
 * with index.html, 200 OK, `text/html`. The service worker's asset strategy
 * only checked `res.ok`, so it stored that HTML *under the asset's own URL*. A
 * cache entry keyed by URL does not care that its body is the wrong media type.
 *
 * Two things then broke, and both were reported as separate faults:
 *
 *   • MapLibre v6's worker was briefly missing from the build, so every client
 *     cached a page of HTML as `/assets/maplibre-gl-worker.mjs`. Tile parsing
 *     lives in that worker, so every map mounted, painted its background and
 *     waited for ever — long after the file was correct on the server.
 *
 *   • Every route in this app is a lazy import. When a deploy changes a chunk
 *     hash, a stale shell asks for the old name, gets HTML, and caches it.
 *     `lazyRoute` reloads once and then rethrows, which the error boundary
 *     renders as a broken page — the "Storm Chasing shows an error page".
 *
 * The service worker no longer creates these entries and no longer serves them,
 * but a fixed worker cannot help a browser that is still being controlled by
 * the old one: this worker deliberately waits for a quiet moment rather than
 * reloading the page out from under whoever is using it. So the page repairs
 * the cache itself, from the window, where `caches` is the same storage the
 * worker writes to and no handover is required.
 *
 * Surgical rather than a purge: only entries whose stored media type cannot
 * serve their own URL are removed, so a healthy cache keeps working offline.
 */
async function repairPoisonedCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  // Anything that must parse as code or decode as an image. A document body
  // under one of these is always wrong; under an HTML URL it is correct.
  const CODE = /\.(m?js|css|json|png|jpe?g|webp|svg|woff2?|mjs)(\?|$)/i;
  try {
    const names = await caches.keys();
    let removed = 0;
    for (const name of names) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        if (!CODE.test(new URL(req.url).pathname)) continue;
        const res = await cache.match(req);
        const type = res?.headers.get("content-type")?.toLowerCase() ?? "";
        if (!type.includes("text/html")) continue;
        await cache.delete(req);
        removed++;
      }
    }
    if (removed > 0) {
      logger.warn("cleared poisoned cache entries", { scope: "pwa", data: { removed } });
    }
  } catch {
    // Storage can be unavailable (private windows, evicted quota). A cache we
    // cannot read is not one we can poison either.
  }
}
