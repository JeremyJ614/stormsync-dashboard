/**
 * Owner notifications.
 *
 * The push system already reached members; this is the half that points the
 * other way — signups, contact-form messages, anything that earns money, and
 * optionally the general hum of people using the app.
 *
 * Events are queued by database triggers rather than sent inline, so a slow
 * push endpoint can never hold up the signup that caused it. An edge function
 * drains the queue every two minutes and pushes to every admin's devices.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type OwnerCategory = "signup" | "contact" | "money" | "activity";

export const OWNER_CATEGORIES: { key: OwnerCategory; label: string; blurb: string }[] = [
  { key: "signup",   label: "New members",     blurb: "Someone creates an account." },
  { key: "contact",  label: "Contact messages", blurb: "Anything through the contact form, emergencies included." },
  { key: "money",    label: "Money",            blurb: "A tier upgrade, a lifetime deal, or an alert level bought." },
  { key: "activity", label: "General activity", blurb: "Members setting up locations and using the app. Noisy — off by default." },
];

export type OwnerNotifyPrefs = Record<OwnerCategory, boolean>;

const FALLBACK: OwnerNotifyPrefs = { signup: true, contact: true, money: true, activity: false };

export async function getOwnerNotifyPrefs(): Promise<OwnerNotifyPrefs> {
  if (!isSupabaseConfigured) return FALLBACK;
  const { data, error } = await supabase.from("app_config").select("value").eq("key", "owner_notify").maybeSingle();
  if (error || !data?.value) return FALLBACK;
  const v = data.value as Partial<OwnerNotifyPrefs>;
  return {
    signup: v.signup ?? FALLBACK.signup,
    contact: v.contact ?? FALLBACK.contact,
    money: v.money ?? FALLBACK.money,
    activity: v.activity ?? FALLBACK.activity,
  };
}

export async function saveOwnerNotifyPrefs(p: OwnerNotifyPrefs): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("app_config").update({ value: p }).eq("key", "owner_notify");
  if (error) { logger.error("saveOwnerNotifyPrefs failed", { scope: "owner", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export interface OwnerEvent {
  id: string;
  category: OwnerCategory;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  dispatchedAt: string | null;
}

export async function recentOwnerEvents(limit = 25): Promise<OwnerEvent[]> {
  const { data, error } = await supabase
    .from("owner_events")
    .select("id,category,title,body,link,created_at,dispatched_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    category: r.category as OwnerCategory,
    title: String(r.title),
    body: String(r.body),
    link: (r.link as string | null) ?? null,
    createdAt: String(r.created_at),
    dispatchedAt: (r.dispatched_at as string | null) ?? null,
  }));
}

/**
 * Push one test notification to every admin device, right now.
 *
 * `sent` counts what the push service *accepted*, which is not the same as
 * what arrived — a push service returns 201 for any subscription it still
 * recognises, including one belonging to a browser profile that was wiped
 * months ago. Delivery is proven separately, by the device acknowledging the
 * push through `push-ack`; the card polls `last_ack_at` after calling this.
 */
export async function sendOwnerTestPush(): Promise<{ ok: boolean; devices?: number; sent?: number; failed?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke("owner-dispatch", { body: { test: true } });
  if (error) return { ok: false, error: "Could not reach the notifier." };
  if (!data?.ok) return { ok: false, error: data?.error ?? "The notifier refused." };
  return {
    ok: true,
    devices: Number(data.devices ?? 0),
    sent: Number(data.sent ?? 0),
    failed: Number(data.failed ?? 0),
  };
}

/** Drain the queue immediately rather than waiting for the two-minute cron. */
export async function drainOwnerEvents(): Promise<{ ok: boolean; events?: number; sent?: number; error?: string }> {
  const { data, error } = await supabase.functions.invoke("owner-dispatch", { body: {} });
  if (error) return { ok: false, error: "Could not reach the notifier." };
  if (!data?.ok) return { ok: false, error: data?.error ?? "The notifier refused." };
  return { ok: true, events: Number(data.events ?? 0), sent: Number(data.sent ?? 0) };
}
