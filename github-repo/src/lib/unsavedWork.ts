/**
 * Who is holding work a reload would destroy.
 *
 * The service worker decides when to swap builds, and the only question that
 * matters is whether anybody would lose anything by it. That question used to
 * be answered by scanning the DOM for `input`, `textarea` and `select` elements
 * with something typed in them — which misses every editor that is not one of
 * those three. The News writing surface is TipTap, so it is a `contenteditable`
 * div and nothing else; a half-written post registered as an empty page. Add
 * that to an update handler that reloaded the moment the tab went hidden, and
 * stepping away to copy an image URL came back to a blank form.
 *
 * A DOM scan is the wrong instrument anyway: it can only ever guess. A surface
 * that holds unsaved work knows it holds unsaved work, so it says so.
 *
 * `claim` is deliberately keyed. Two editors open at once each hold their own
 * claim, and releasing one does not speak for the other.
 */
const claims = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Declare that `key` is holding unsaved work, or that it no longer is.
 *
 * Safe to call on every keystroke: it only notifies when the answer changes.
 */
export function markUnsaved(key: string, dirty: boolean): void {
  const had = claims.has(key);
  if (dirty === had) return;
  if (dirty) claims.add(key);
  else claims.delete(key);
  emit();
}

/** Drop a claim outright — for a component unmounting, or work that was saved. */
export function releaseUnsaved(key: string): void {
  markUnsaved(key, false);
}

/** True while any surface is holding work that has not been saved. */
export function hasUnsavedWork(): boolean {
  if (claims.size > 0) return true;
  return hasDirtyEditable();
}

/** The keys currently claiming, for diagnostics. */
export function unsavedKeys(): string[] {
  return [...claims];
}

export function subscribeUnsaved(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * The fallback for surfaces that have not been taught to declare themselves.
 *
 * Only counts a `contenteditable` region that has actually been typed into —
 * `editedEditables` is filled by the same capture-phase `input` listener the
 * PWA bootstrap already runs — because a rich-text editor showing a loaded post
 * is not unsaved work, it is a document on screen.
 */
const editedEditables = new WeakSet<Element>();

/** Called by the global `input` listener when the target is a rich-text host. */
export function noteEditableInput(target: EventTarget | null): void {
  if (!(target instanceof Element)) return;
  const host = target.closest?.("[contenteditable='true'], [contenteditable='']");
  if (host) editedEditables.add(host);
}

function hasDirtyEditable(): boolean {
  const hosts = document.querySelectorAll("[contenteditable='true'], [contenteditable='']");
  for (const el of hosts) {
    if (!editedEditables.has(el)) continue;
    if ((el.textContent ?? "").trim().length > 0) return true;
    // An emptied editor still counts: deleting a paragraph is work too, and a
    // reload would undo the deletion as surely as it would undo the typing.
    if (el.querySelector("img, video, iframe")) return true;
  }
  return false;
}
