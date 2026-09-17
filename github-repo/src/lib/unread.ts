/**
 * What this person has not seen yet.
 *
 * Deliberately per-device and in local storage rather than on the profile.
 * "Unread" is a property of a screen someone was sitting in front of, not of
 * an account — marking a post read on a phone because it was opened on a
 * laptop is the wrong answer, and the cost of getting it wrong is somebody
 * missing a post. It also means no round trip before the badge can render, so
 * the news tabs do not flash a count in a second after they paint.
 *
 * Stored as the timestamp of the newest item that was on screen when the
 * section was last opened, not as a set of ids. A list of ids grows for ever,
 * needs pruning, and cannot answer "is there anything new" without being
 * loaded first; a single ISO string answers it with one comparison and never
 * grows.
 */
const PREFIX = "stormsync_seen_";

/** Sections that can carry an unread mark. */
export type UnreadKey = "sswx-news" | "chases";

function read(key: UnreadKey): number {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return 0;
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  } catch { return 0; }
}

/**
 * How many of these are newer than the last look.
 *
 * A member who has never opened the section is NOT shown every post ever
 * written as unread — that is a badge saying "47" on a first run, which
 * teaches people to ignore the badge. With nothing stored, the section is
 * treated as caught up and the mark starts from the next thing published.
 */
export function unreadCount(key: UnreadKey, dates: (string | null | undefined)[]): number {
  const since = read(key);
  if (!since) return 0;
  let n = 0;
  for (const d of dates) {
    if (!d) continue;
    const t = Date.parse(d);
    if (Number.isFinite(t) && t > since) n++;
  }
  return n;
}

/** True for an item published since the last look. */
export function isUnread(key: UnreadKey, date: string | null | undefined): boolean {
  const since = read(key);
  if (!since || !date) return false;
  const t = Date.parse(date);
  return Number.isFinite(t) && t > since;
}

/**
 * Mark everything up to `newest` as seen.
 *
 * Called when the section is actually opened and looked at. Never moves
 * backwards: opening an old view should not un-see newer things.
 */
export function markSeen(key: UnreadKey, newest: string | null | undefined): void {
  try {
    const t = newest ? Date.parse(newest) : Date.now();
    const at = Number.isFinite(t) ? Math.max(t, read(key)) : Date.now();
    localStorage.setItem(PREFIX + key, new Date(at).toISOString());
  } catch { /* private mode; a missing mark must never break the page */ }
}

/** First run: start the clock without claiming a backlog was read. */
export function primeSeen(key: UnreadKey, newest: string | null | undefined): void {
  try {
    if (localStorage.getItem(PREFIX + key)) return;
    markSeen(key, newest);
  } catch { /* ignore */ }
}
