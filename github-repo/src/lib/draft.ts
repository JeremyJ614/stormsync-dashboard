/**
 * Drafts that survive the page going away.
 *
 * Holding the service worker back stops *us* throwing away someone's work, but
 * it cannot stop the operating system. A backgrounded PWA on iOS is evicted
 * whenever the phone wants the memory, and it comes back as a cold load with
 * every piece of React state gone. Nothing in the app can prevent that. The
 * only real protection is for the work not to live solely in memory.
 *
 * So the form writes itself to local storage as it is typed, and on the way
 * back in, an unsaved draft is offered rather than silently reinstated —
 * silently reinstating it would be its own kind of surprise, and would fight
 * with somebody who deliberately started over.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "stormsync_draft_";
/** Long enough to survive a phone call, short enough not to haunt anybody. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Storage is synchronous and on the main thread; do not write on each keystroke. */
const WRITE_DEBOUNCE_MS = 500;

interface Stored<T> { at: number; value: T }

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const box = JSON.parse(raw) as Stored<T>;
    if (!box || typeof box.at !== "number") return null;
    if (Date.now() - box.at > MAX_AGE_MS) { localStorage.removeItem(PREFIX + key); return null; }
    return box.value;
  } catch { return null; }
}

function write<T>(key: string, value: T): void {
  try { localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value } as Stored<T>)); }
  catch { /* private mode, or the quota; a lost draft must never break the form */ }
}

function drop(key: string): void {
  try { localStorage.removeItem(PREFIX + key); } catch { /* as above */ }
}

export interface Draft<T> {
  /** A stored draft from a previous visit, if there is one worth offering. */
  recovered: T | null;
  /** Put the recovered draft back on screen. */
  restore: () => void;
  /** Throw the recovered draft away and carry on with what is on screen. */
  discard: () => void;
  /** Saved for real — forget the draft. Call this after a successful save. */
  clear: () => void;
}

/**
 * Keep `value` in local storage under `key`, and offer back whatever was there
 * when the component mounted.
 *
 * `isEmpty` decides both what is worth storing and what is worth offering, so a
 * form that has only been looked at leaves nothing behind.
 */
export function useDraft<T>(
  key: string,
  value: T,
  apply: (v: T) => void,
  isEmpty: (v: T) => boolean,
): Draft<T> {
  // Read once, on mount, before anything has had a chance to overwrite it.
  const [recovered, setRecovered] = useState<T | null>(() => {
    const found = read<T>(key);
    return found != null && !isEmpty(found) ? found : null;
  });

  // Held in a ref so changing the callback identity does not restart the timer.
  const emptyRef = useRef(isEmpty);
  emptyRef.current = isEmpty;

  // The first render must not write: at that point `value` is the blank form,
  // and writing it would erase the very draft that has just been recovered.
  const primed = useRef(false);

  useEffect(() => {
    if (!primed.current) { primed.current = true; return; }
    const t = setTimeout(() => {
      if (emptyRef.current(value)) drop(key);
      else write(key, value);
    }, WRITE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [key, value]);

  const restore = useCallback(() => {
    setRecovered((r) => { if (r != null) apply(r); return null; });
  }, [apply]);

  const discard = useCallback(() => { drop(key); setRecovered(null); }, [key]);

  const clear = useCallback(() => { drop(key); setRecovered(null); primed.current = false; }, [key]);

  return { recovered, restore, discard, clear };
}
