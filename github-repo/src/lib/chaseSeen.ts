import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Which chases this person has already looked at.
 *
 * "New" has to mean "appeared since you last looked", and the only honest way
 * to know that without a per-member table is to remember, on this device, the
 * set of chases that existed the last time the page was open. Anything not in
 * that set is new; opening it puts it in.
 *
 * The first visit is the case that matters. Seeding an empty store with every
 * chase currently published — rather than treating them all as new — is what
 * stops somebody's first ever visit lighting up like a slot machine. They have
 * not missed anything; they have just arrived.
 *
 * This is deliberately per-device and not synced. It is a courtesy marker, not
 * a fact about the account, and a member who opens the app on a laptop after
 * reading on a phone would rather see the marker twice than not at all.
 */
const KEY = "stormsync_chases_seen_v1";

function read(): Set<string> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return Array.isArray(v) ? new Set(v.map(String)) : null;
  } catch {
    // Private mode, or a value from an older shape. Treat as "never seen".
    return null;
  }
}

function write(ids: Set<string>) {
  try { localStorage.setItem(KEY, JSON.stringify([...ids])); } catch { /* nothing to do */ }
}

export interface ChaseSeen {
  /** True for a chase that has appeared since this device last looked. */
  isNew: (id: string) => boolean;
  /** Called when a card is expanded. Clears that chase's marker. */
  markSeen: (id: string) => void;
  /** How many are still unseen — for the count at the top of the page. */
  newCount: number;
  /** Clear every marker at once. */
  markAllSeen: () => void;
}

export function useChaseSeen(ids: string[]): ChaseSeen {
  const [seen, setSeen] = useState<Set<string> | null>(() => read());

  // Seed on first ever visit, once the list is actually known. Seeding with an
  // empty list would mark everything new the moment the data arrived.
  useEffect(() => {
    if (seen !== null || ids.length === 0) return;
    const all = new Set(ids);
    write(all);
    setSeen(all);
  }, [seen, ids]);

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) return prev ?? next;
      next.add(id);
      write(next);
      return next;
    });
  }, []);

  const markAllSeen = useCallback(() => {
    setSeen(() => {
      const next = new Set(ids);
      write(next);
      return next;
    });
  }, [ids]);

  const isNew = useCallback(
    // Before the store is seeded nothing is new: the seeding effect runs on the
    // same tick the ids arrive, and flashing every card for one frame is worse
    // than showing the marker a frame late.
    (id: string) => (seen === null ? false : !seen.has(id)),
    [seen],
  );

  const newCount = useMemo(
    () => (seen === null ? 0 : ids.reduce((n, id) => n + (seen.has(id) ? 0 : 1), 0)),
    [seen, ids],
  );

  return { isNew, markSeen, newCount, markAllSeen };
}
