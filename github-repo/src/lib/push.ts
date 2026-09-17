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
export const VAPID_PUBLIC_KEY = "BPQVDL8EAh58PxE8ZB6Wz-6coY_4MtJ0EiZf_tSMxgBdUlkSsUe6GgmzH4P3rtYTBn1wvB6KcgRCgxIFJ4nXwYo";

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
    // The user agent is stored so a device list reads as "Chrome on Android"
    // rather than as a row of identical hostnames.
    const { error } = await supabase.from("push_subscriptions").upsert(
      { user_id: userId, endpoint: json.endpoint, keys: json.keys, user_agent: navigator.userAgent.slice(0, 300) },
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


// ── devices ──────────────────────────────────────────────────────────────────

export interface PushDevice {
  id: string;
  /** The push service host. Never the token — the endpoint is a bearer secret. */
  host: string;
  /** Last few characters of the endpoint: enough to recognise, useless to use. */
  tail: string;
  userAgent: string | null;
  createdAt: string;
  lastPushAt: string | null;
  /** When this device last *proved* it received a push. Null means never. */
  lastAckAt: string | null;
  /** True when this is the browser you are reading the list in. */
  isThisDevice?: boolean;
}

/** A readable name for a device, from its user-agent string. */
export function describeDevice(d: PushDevice): string {
  const ua = d.userAgent ?? "";
  const browser =
    /EdgA?\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Firefox\//.test(ua) ? "Firefox" :
    /SamsungBrowser\//.test(ua) ? "Samsung Internet" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) ? "Safari" : "";
  const os =
    /iPhone/.test(ua) ? "iPhone" :
    /iPad/.test(ua) ? "iPad" :
    /Android/.test(ua) ? "Android" :
    /Macintosh/.test(ua) ? "Mac" :
    /Windows/.test(ua) ? "Windows" :
    /Linux/.test(ua) ? "Linux" : "";
  if (browser && os) return `${browser} on ${os}`;
  if (browser || os) return browser || os;
  // Nothing was recorded — every subscription made before this shipped.
  return d.host.includes("apple") ? "An Apple device" : d.host.includes("mozilla") ? "A Firefox browser" : "An unnamed device";
}

/** Every device signed up for push on this account. */
export async function listMyPushDevices(): Promise<PushDevice[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc("my_push_devices");
  if (error) { logger.error("my_push_devices failed", { scope: "push", error }); return []; }
  const here = await currentEndpoint();
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    host: String(r.host ?? ""),
    tail: String(r.tail ?? ""),
    userAgent: (r.user_agent as string | null) ?? null,
    createdAt: String(r.created_at),
    lastPushAt: (r.last_push_at as string | null) ?? null,
    lastAckAt: (r.last_ack_at as string | null) ?? null,
    isThisDevice: here !== null && here.tail === String(r.tail ?? ""),
  }));
}

/**
 * What this browser is subscribed as, if anything.
 *
 * The endpoint itself never leaves the device — the list is matched on its last
 * twelve characters, which is enough to recognise your own row and nowhere near
 * enough to push to it.
 */
async function currentEndpoint(): Promise<{ tail: string } | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return null;
    return { tail: sub.endpoint.slice(-12) };
  } catch { return null; }
}

/** True when this browser holds a subscription the server also knows about. */
export async function thisDeviceRegistered(): Promise<boolean> {
  const here = await currentEndpoint();
  if (!here) return false;
  return (await listMyPushDevices()).some((d) => d.tail === here.tail);
}

export async function forgetPushDevice(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("forget_push_device", { p_id: id });
  if (error) { logger.error("forget_push_device failed", { scope: "push", error }); return false; }
  return data === true;
}
