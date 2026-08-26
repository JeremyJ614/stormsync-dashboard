/**
 * "View as this member" — an admin's read-only lens on someone else's app.
 *
 * What this is: a client-side override of the profile that drives module
 * gating, tier limits and navigation, so an admin can see exactly the app a
 * given member sees without asking them for their PIN.
 *
 * What this is not: an authentication switch. The Supabase session, and
 * therefore every row-level-security decision on every read and write, stays
 * the admin's own. Nothing here can grant access the admin did not already
 * have — the lens can only ever take capability away, never add it.
 *
 * Two properties make that safe rather than merely intended:
 *
 *  1. The lens always reports `isAdmin: false`. An admin looking through it
 *     sees the member's navigation, not their own, and the admin panel is out
 *     of reach until they exit — which is what "view as" has to mean to be
 *     worth anything.
 *  2. It lives in sessionStorage, so it dies with the tab. Nobody comes back
 *     tomorrow still wearing someone else's account.
 */
import type { User } from "../hooks/useAuth";

const KEY = "sswx_view_as";

let target: User | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load(): User | null {
  if (loaded) return target;
  loaded = true;
  try {
    const raw = sessionStorage.getItem(KEY);
    target = raw ? (JSON.parse(raw) as User) : null;
  } catch {
    target = null;
  }
  return target;
}

/** The member being viewed, or null. Always reports `isAdmin: false`. */
export function viewingAs(): User | null {
  return load();
}

export function startViewingAs(u: User): void {
  // Stripped of admin rights on the way in, not on the way out — so no code
  // path anywhere can read this object and conclude the viewer is an admin.
  target = { ...u, isAdmin: false };
  loaded = true;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(target));
  } catch {
    /* private mode — the lens still works for this page's lifetime */
  }
  emit();
}

export function stopViewingAs(): void {
  target = null;
  loaded = true;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  emit();
}

export function subscribeViewAs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
