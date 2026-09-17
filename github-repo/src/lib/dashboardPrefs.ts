/**
 * The member's own dashboard arrangement.
 *
 * The wall used to be arrangeable and that was taken away when it was rebuilt,
 * which was a mistake: a dashboard is the one page whose whole job is to put
 * what THIS person looks at where they look first, and no default ordering can
 * know that. Chasers want CAPE and rotation at the top; a homeowner wants
 * alerts and the forecast and would rather not see a model comparator at all.
 *
 * WHAT IS STORED, AND WHERE
 * Two lists: an order and a hidden set, both by module path, in localStorage
 * and keyed by the member's id so a shared device does not hand one person's
 * arrangement to another. Per-device rather than per-account is deliberate and
 * is what the old layout did too — it needs no schema change, no round trip
 * before first paint, and nothing to go wrong while somebody is dragging.
 *
 * THE TWO RULES THAT KEEP IT FROM GOING STALE
 *   · A path in the saved order that no longer exists is dropped on read, so a
 *     retired module cannot leave a hole.
 *   · A tile that is NOT in the saved order is appended in its default place
 *     rather than being treated as hidden. That is the difference between
 *     shipping a new module and silently shipping it to nobody: every member
 *     who arranged their wall a year ago still picks it up.
 */

export interface DashboardPrefs {
  /** Module paths, in the order the member put them. */
  order: string[];
  /** Module paths the member has taken off the wall. */
  hidden: string[];
}

const EMPTY: DashboardPrefs = { order: [], hidden: [] };
const KEY = (userId: string | null) => `stormsync_dash_v2_${userId ?? "guest"}`;

export function loadPrefs(userId: string | null): DashboardPrefs {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return EMPTY;
    const v = JSON.parse(raw) as Partial<DashboardPrefs>;
    return {
      order: Array.isArray(v.order) ? v.order.filter((s) => typeof s === "string") : [],
      hidden: Array.isArray(v.hidden) ? v.hidden.filter((s) => typeof s === "string") : [],
    };
  } catch {
    // Private mode, blocked storage, or something else wrote over the key.
    // A dashboard that will not render because it cannot read a preference is
    // a worse outcome than a dashboard in its default order.
    return EMPTY;
  }
}

export function savePrefs(userId: string | null, p: DashboardPrefs): void {
  try { localStorage.setItem(KEY(userId), JSON.stringify(p)); } catch { /* nothing to do */ }
}

export function clearPrefs(userId: string | null): void {
  try { localStorage.removeItem(KEY(userId)); } catch { /* nothing to do */ }
}

/**
 * Apply an arrangement to the tiles that exist.
 *
 * `defaults` arrives in the app's own order. Anything the member has placed
 * comes first, in their order; anything they have not seen keeps its default
 * position relative to the rest and is appended after.
 */
export function arrange<T extends { path: string }>(
  defaults: T[], prefs: DashboardPrefs,
): { shown: T[]; hidden: T[] } {
  const by = new Map(defaults.map((t) => [t.path, t]));
  const placed: T[] = [];
  const seen = new Set<string>();
  for (const path of prefs.order) {
    const t = by.get(path);
    if (t && !seen.has(path)) { placed.push(t); seen.add(path); }
  }
  for (const t of defaults) if (!seen.has(t.path)) placed.push(t);

  const off = new Set(prefs.hidden);
  return {
    shown: placed.filter((t) => !off.has(t.path)),
    hidden: placed.filter((t) => off.has(t.path)),
  };
}

/** Move one path earlier (-1) or later (+1) in an arrangement. */
export function move(order: string[], path: string, delta: number): string[] {
  const i = order.indexOf(path);
  if (i < 0) return order;
  const j = Math.max(0, Math.min(order.length - 1, i + delta));
  if (i === j) return order;
  const next = order.slice();
  next.splice(j, 0, next.splice(i, 1)[0]);
  return next;
}
