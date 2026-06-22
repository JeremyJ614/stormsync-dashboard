/**
 * Web Push subscription (Phase 8B). Members opt in to phone notifications that
 * fire when an NWS warning hits one of their saved locations. The subscription
 * (endpoint + keys) is stored in `public.push_subscriptions`; the server-side
 * `push-dispatch` function does the matching + sending.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

// Public VAPID key (safe to ship). The matching private key is the
// VAPID_PRIVATE_KEY Edge Function secret used only by `push-dispatch`.
export const VAPID_PUBLIC_KEY = "BLud2dgGHYNaLNnk9HvlijNKV6cC8AQ2G0C1BBizwGOq8J6FomGWSr2oQf9EUq3T_PJ1hjGN9AkCM5RP39TogD0";

export const isPushSupported = (): boolean =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Whether this device currently has an active push subscription. */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return !!(await reg.pushManager.getSubscription());
  } catch { return false; }
}

export async function subscribePush(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "Notifications aren't supported on this device/browser." };
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, error: "Notifications were not allowed." };
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    const json = sub.toJSON();
    const { error } = await supabase.from("push_subscriptions").upsert(
      { user_id: userId, endpoint: json.endpoint, keys: json.keys },
      { onConflict: "endpoint" },
    );
    if (error) { logger.error("save push sub failed", { scope: "push", error }); return { ok: false, error: "Could not save your subscription." }; }
    return { ok: true };
  } catch (e) {
    logger.error("subscribePush failed", { scope: "push", error: e });
    return { ok: false, error: "Could not enable notifications." };
  }
}

export async function unsubscribePush(): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) {
    logger.error("unsubscribePush failed", { scope: "push", error: e });
  }
}
