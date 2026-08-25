/**
 * Route chunk pre-warming.
 *
 * Every module is a lazy import, so tapping one in the sidebar starts a network
 * request and *then* renders. Starting that request on hover (desktop) or
 * touch-start (phone) buys 100-300 ms — enough that navigation reads as instant
 * rather than as a spinner.
 *
 * Each chunk is fetched at most once, and a failure is swallowed: this is a
 * head start, never a dependency. If the warm fetch fails the real import runs
 * normally and handles its own error.
 */
type Factory = () => Promise<unknown>;

const factories = new Map<string, Factory>();
const warmed = new Set<string>();

/** Called by `lazyRoute` as each route is declared. */
export function registerPrefetch(path: string, factory: Factory): void {
  factories.set(path, factory);
}

/** Start loading a route's chunk. Safe to call repeatedly and on every hover. */
export function prefetchRoute(path: string): void {
  if (warmed.has(path)) return;
  const f = factories.get(path);
  if (!f) return;
  warmed.add(path);
  // A slow connection or an explicit data-saver setting means the member is
  // paying for every byte — do not spend theirs on a guess.
  const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType))) return;
  void f().catch(() => { /* a head start is never a dependency */ });
}
