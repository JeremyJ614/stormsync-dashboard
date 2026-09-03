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

      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
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
