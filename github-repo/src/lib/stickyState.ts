import { useCallback, useState } from "react";

/**
 * A piece of UI state that survives leaving the page and closing the browser.
 *
 * The admin panel is the reason this exists. Every section was plain component
 * state, so opening a member's profile, following a link, or shutting the
 * laptop and coming back tomorrow all landed you on the first tab again — with
 * whatever you had been reading three tabs away. Work in there is long and
 * interrupted by design: you look something up, you come back. Coming back to
 * where you were is the difference between a tool and a form.
 *
 * `localStorage` rather than `sessionStorage` because "close my browser and
 * come back" is exactly the case that has to work, and per-device rather than
 * per-account because this is where you left a window, not a preference worth
 * syncing.
 *
 * Reads are validated. A stored value is old data written by an older build:
 * a tab that has since been renamed or removed would otherwise put the panel
 * into a state with no content in it, and the person would have no way to tell
 * why the page was blank.
 */
const NS = "sswx.ui.";

export function useSticky<T>(
  key: string,
  initial: T,
  isValid?: (v: unknown) => v is T,
): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = read(key);
    if (stored === undefined) return initial;
    if (isValid && !isValid(stored)) return initial;
    return stored as T;
  });

  const set = useCallback((v: T) => {
    setValue(v);
    write(key, v);
  }, [key]);

  return [value, set];
}

/**
 * Storage that cannot throw.
 *
 * Private windows, a browser set to block site data, and an iOS home-screen app
 * whose storage has been evicted all make these throw rather than return null,
 * and a throw here would take down the page that was merely trying to remember
 * a tab. Failing to remember is the correct outcome; failing to render is not.
 */
function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {
    /* nothing to do — the state still works for this session */
  }
}

/** Read one value outside React, for code that runs before a component mounts. */
export function readSticky<T>(key: string, fallback: T, isValid?: (v: unknown) => v is T): T {
  const stored = read(key);
  if (stored === undefined) return fallback;
  if (isValid && !isValid(stored)) return fallback;
  return stored as T;
}

export function writeSticky(key: string, value: unknown): void {
  write(key, value);
}
