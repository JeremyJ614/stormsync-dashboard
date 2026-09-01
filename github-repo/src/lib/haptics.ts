/**
 * Haptics.
 *
 * A phone app that never buzzes feels like a website. This is the whole of it:
 * four short patterns, a stored on/off preference, and silence everywhere the
 * API does not exist — which includes iOS Safari, where `navigator.vibrate` is
 * simply absent. Nothing here is load-bearing; if it does nothing, nothing is
 * lost.
 */
export type Haptic = "tick" | "select" | "success" | "warn";

const PATTERN: Record<Haptic, number | number[]> = {
  tick: 8,              // a control moved
  select: 14,           // a choice landed
  success: [10, 45, 16],// something completed
  warn: [24, 55, 24],   // something needs attention
};

const KEY = "stormsync_haptics";
let on = true;
try { on = localStorage.getItem(KEY) !== "off"; } catch { /* private mode */ }

export const hapticsEnabled = (): boolean => on;

export function setHaptics(next: boolean): void {
  on = next;
  try { localStorage.setItem(KEY, next ? "on" : "off"); } catch { /* private mode */ }
  if (next) haptic("select");
}

export function haptic(kind: Haptic = "tick"): void {
  if (!on) return;
  const v = typeof navigator !== "undefined" ? navigator.vibrate?.bind(navigator) : undefined;
  if (!v) return;
  try { v(PATTERN[kind]); } catch { /* some browsers throw without a user gesture */ }
}
