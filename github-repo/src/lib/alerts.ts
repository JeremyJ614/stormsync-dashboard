/**
 * The five-level alert ladder.
 *
 * Alerts used to be a handful of booleans on `notification_prefs` plus a tier
 * check buried in the fan-out function. That could not answer either of the two
 * questions this feature exists for: what is this member entitled to, and what
 * would more cost them. So alerts are a product now, priced and sold the way
 * modules already are.
 *
 * What each level *is* lives here in code, because it is the product definition
 * and it is the same for everybody. What each level *costs* lives in the
 * database, because that is a decision the admin makes and changes.
 */
import { supabase } from "./supabase";
import { logger } from "./logger";
import type { Tier } from "../hooks/useAuth";

export type AlertScope = "state" | "location" | "multiple" | "all";
export type LevelSource = "tier" | "purchased" | "granted";

export interface AlertLevelDef {
  level: 1 | 2 | 3 | 4 | 5;
  name: string;
  tagline: string;
  /** The tier at which this level stops costing extra. */
  includedFrom: Tier;
  /** What you get, in the order it matters. */
  gives: string[];
  /** The one thing this level adds over the one below it. */
  newHere: string;
  /** Whether the member gets to choose a scope at this level. */
  scoped: boolean;
  color: string;
}

export const ALERT_LEVELS: AlertLevelDef[] = [
  {
    level: 1,
    name: "In-App Alerts",
    tagline: "Severe weather for your state, waiting when you open the app.",
    includedFrom: 1,
    newHere: "Your notification inbox starts filling up.",
    scoped: false,
    color: "#5fd9a8",
    gives: [
      "Every severe thunderstorm and tornado warning affecting your state",
      "Watches too, so you see it coming rather than only when it lands",
      "Lands in your in-app notification inbox",
      "Nothing to install and nothing to opt into",
    ],
  },
  {
    level: 2,
    name: "Push Alerts",
    tagline: "It reaches your phone even when the app is closed.",
    includedFrom: 1,
    newHere: "The phone buzzes. You do not have to be looking.",
    scoped: true,
    color: "#89cff0",
    gives: [
      "Everything in In-App Alerts",
      "Pushed to your phone, app open or not",
      "You choose the scope: your state, one saved location, several, or all of them",
      "Works on an installed home-screen app as well as the browser",
    ],
  },
  {
    level: 3,
    name: "Contact Alerts",
    tagline: "It reaches a real person, not just a device.",
    includedFrom: 2,
    newHere: "Email or text, so it finds you with your phone face down.",
    scoped: true,
    color: "#d9b775",
    gives: [
      "Everything in Push Alerts",
      "Sent to your email address, your phone as a text, or both",
      "Same scope choice: state, one location, several, or all",
      "The contact details are yours to set and change any time",
    ],
  },
  {
    level: 4,
    name: "Outlook & Vault",
    tagline: "You know about the day before the day starts.",
    includedFrom: 3,
    newHere: "Morning outlooks, and the key to the Emergency Contact vault.",
    scoped: true,
    color: "#ff8a3d",
    gives: [
      "Everything in Contact Alerts",
      "A morning heads-up when you are inside an SPC severe weather outlook",
      "The same for winter storm and snow outlooks",
      "The Emergency Contact PIN, so you can open a direct line to us whenever a day is getting to you",
    ],
  },
  {
    level: 5,
    name: "Direct Line",
    tagline: "We come to you.",
    includedFrom: 4,
    newHere: "A person watching your locations, who contacts you first.",
    scoped: true,
    color: "#ff4d55",
    gives: [
      "Everything in Outlook & Vault",
      "We watch your saved locations ourselves",
      "When we see something troubling we contact you, before you have to ask",
      "A standing direct line rather than a PIN you have to remember to use",
      "Tell us how you would rather be reached and we use that",
    ],
  },
];

export const TIER_NAME: Record<number, string> = {
  1: "Free", 2: "Basic", 3: "VIP", 4: "Advanced",
};

export const SCOPE_LABEL: Record<AlertScope, string> = {
  state: "My whole state",
  location: "One saved location",
  multiple: "Several saved locations",
  all: "Everywhere I have saved",
};

export const SCOPE_BLURB: Record<AlertScope, string> = {
  state: "Anything affecting the state your primary location sits in.",
  location: "Just the one place. The quietest option.",
  multiple: "Pick exactly which of your saved locations count.",
  all: "Every location on your list, plus the state each one is in.",
};

// ─── prices ──────────────────────────────────────────────────────────────────
export interface AlertPriceRow {
  level: number;
  label: string;
  blurb: string;
  free_price: number | null;
  basic_price: number | null;
  vip_price: number | null;
}

export async function fetchAlertPrices(): Promise<AlertPriceRow[]> {
  const { data, error } = await supabase
    .from("alert_level_prices")
    .select("level,label,blurb,free_price,basic_price,vip_price")
    .order("level");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    free_price: r.free_price == null ? null : Number(r.free_price),
    basic_price: r.basic_price == null ? null : Number(r.basic_price),
    vip_price: r.vip_price == null ? null : Number(r.vip_price),
  })) as AlertPriceRow[];
}

/**
 * What this level costs a member of this tier.
 *
 * `null` means it is already included and cannot be sold to them, which is a
 * different thing from costing nothing, and the UI says so differently.
 */
export function priceFor(row: AlertPriceRow | undefined, tier: Tier, def: AlertLevelDef): number | null {
  if (tier >= def.includedFrom) return null;
  if (!row) return null;
  if (tier === 1) return row.free_price;
  if (tier === 2) return row.basic_price;
  if (tier === 3) return row.vip_price;
  return null;
}

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

// ─── entitlements ────────────────────────────────────────────────────────────
export interface HeldLevel { level: number; source: LevelSource }

export async function fetchMyLevels(): Promise<HeldLevel[]> {
  const { data, error } = await supabase.rpc("my_alert_levels");
  if (error) throw error;
  // Levels are cumulative: the RPC returns 1..N for the highest level held, so
  // the list is already exactly what they have and needs no filtering.
  return ((data ?? []) as { level: number; source: string }[])
    .map((r) => ({ level: r.level, source: r.source as LevelSource }))
    .sort((a, b) => a.level - b.level);
}

/**
 * The Emergency Contact PIN, for the members entitled to it.
 *
 * Returns null both when the member does not hold level 4 and when nothing is
 * configured. That is deliberate: distinguishing the two would tell an
 * unentitled caller that there is a PIN worth guessing.
 */
export async function fetchMyEmergencyPin(): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_emergency_pin");
  if (error) return null;
  return (data as string | null) || null;
}

/** What the member would see if they were on a given tier, for the signup page. */
export function levelsIncludedAt(tier: Tier): number[] {
  return ALERT_LEVELS.filter((l) => tier >= l.includedFrom).map((l) => l.level);
}

// ─── preferences ─────────────────────────────────────────────────────────────
export interface AlertPrefs {
  scope: AlertScope;
  locationIds: string[];
  state: string | null;
  email: string | null;
  phone: string | null;
  /** Carrier key for the email-to-SMS gateway. See CARRIERS. */
  carrier: string | null;
  emailOptin: boolean;
  textOptin: boolean;
  directLineNote: string | null;
}

/**
 * Carriers we can text, and how.
 *
 * Texts go out through the carrier's own email-to-SMS gateway, which is free and
 * needs no account, but has to be addressed to the right domain — so the member
 * tells us who they are with. If the owner ever wires up a paid SMS provider on
 * the edge function this becomes irrelevant and every number just works.
 */
export const CARRIERS: { key: string; label: string; note?: string }[] = [
  { key: "verizon", label: "Verizon" },
  { key: "att", label: "AT&T" },
  { key: "tmobile", label: "T-Mobile" },
  { key: "uscellular", label: "US Cellular" },
  { key: "cricket", label: "Cricket" },
  { key: "boost", label: "Boost Mobile" },
  { key: "metropcs", label: "Metro by T-Mobile" },
  { key: "googlefi", label: "Google Fi" },
  { key: "visible", label: "Visible", note: "on Verizon" },
  { key: "xfinity", label: "Xfinity Mobile", note: "on Verizon" },
  { key: "mint", label: "Mint Mobile", note: "on T-Mobile" },
  { key: "consumercellular", label: "Consumer Cellular" },
];

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  scope: "state", locationIds: [], state: null,
  email: null, phone: null, carrier: null, emailOptin: false, textOptin: false, directLineNote: null,
};

export async function fetchAlertPrefs(): Promise<AlertPrefs> {
  // Filter by user_id explicitly. An admin can read every row of
  // notification_prefs by policy, so an unfiltered maybeSingle() matches more
  // than one row for them and errors — which reads on screen as settings that
  // refuse to save. See getDigestPrefs for the same bug and the same fix.
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return DEFAULT_ALERT_PREFS;
  const { data } = await supabase
    .from("notification_prefs")
    .select("alert_scope,alert_location_ids,alert_state,alert_email,alert_phone,alert_carrier,email_optin,text_optin,direct_line_note")
    .eq("user_id", uid)
    .maybeSingle();
  if (!data) return DEFAULT_ALERT_PREFS;
  return {
    scope: (data.alert_scope as AlertScope) ?? "state",
    locationIds: (data.alert_location_ids as string[] | null) ?? [],
    state: data.alert_state ?? null,
    email: data.alert_email ?? null,
    phone: data.alert_phone ?? null,
    carrier: data.alert_carrier ?? null,
    emailOptin: !!data.email_optin,
    textOptin: !!data.text_optin,
    directLineNote: data.direct_line_note ?? null,
  };
}

export async function saveAlertPrefs(p: AlertPrefs): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return { ok: false, error: "Not signed in." };
  const { error } = await supabase.from("notification_prefs").upsert({
    user_id: uid,
    alert_scope: p.scope,
    alert_location_ids: p.locationIds,
    alert_state: p.state,
    alert_email: p.email,
    alert_phone: p.phone,
    alert_carrier: p.carrier,
    email_optin: p.emailOptin,
    text_optin: p.textOptin,
    direct_line_note: p.directLineNote,
  }, { onConflict: "user_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ─── admin ───────────────────────────────────────────────────────────────────
export interface AlertRosterRow {
  user_id: string; name: string; email: string; tier: number;
  levels: number[]; purchased: number[]; scope: AlertScope;
  alert_email: string | null; alert_phone: string | null;
  locations: number; direct_note: string | null;
  /** Primary saved location, so the admin panel can check it for live alerts. */
  lat: number | null; lon: number | null; place: string | null;
}

export async function adminAlertRoster(): Promise<AlertRosterRow[]> {
  const { data, error } = await supabase.rpc("admin_alert_roster");
  if (error) throw error;
  return ((data ?? []) as AlertRosterRow[]).map((r) => ({
    ...r, levels: r.levels ?? [], purchased: r.purchased ?? [],
  }));
}

export async function adminSetAlertLevel(
  userId: string, level: number, on: boolean, note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("admin_set_alert_level", {
    p_user: userId, p_level: level, p_on: on, p_note: note ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function adminSaveAlertPrice(
  level: number, patch: { free_price?: number | null; basic_price?: number | null; vip_price?: number | null; label?: string; blurb?: string },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("alert_level_prices")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("level", level);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ─── buying a level ──────────────────────────────────────────────────────────
/**
 * Buying a level, with a card.
 *
 * This used to file a request for an admin to approve by hand, because the
 * `stripe-checkout` source had been deployed but never committed and so could
 * not be extended. The source is recovered and in the repo now, so this opens a
 * real Stripe Checkout session: the price is read server-side from
 * `alert_level_prices` against the member's current tier, and the entitlement is
 * written by the webhook — never by the client.
 *
 * Cancelling the resulting subscription removes that level and nothing else.
 */
export async function startAlertLevelCheckout(level: number): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("stripe-checkout", {
    body: { kind: "alert_level", level },
  });
  if (error) return { ok: false, error: "Could not start checkout — try again." };
  if (!data?.ok) return { ok: false, error: data?.error ?? "Could not start checkout." };
  return { ok: true, url: data.url as string };
}

// ─── legacy requests ─────────────────────────────────────────────────────────
// Nothing files new requests any more, but rows already in the table still have
// to be visible and dismissable — both to the member who filed one and to the
// admin looking at the queue.
export async function withdrawAlertRequest(level: number): Promise<boolean> {
  const { error } = await supabase.rpc("withdraw_alert_request", { p_level: level });
  return !error;
}

export interface MyRequest { level: number; quoted_price: number | null; created_at: string }

export async function fetchMyAlertRequests(): Promise<MyRequest[]> {
  const { data, error } = await supabase.rpc("my_alert_requests");
  if (error) return [];
  return ((data ?? []) as MyRequest[]).map((r) => ({
    ...r, quoted_price: r.quoted_price == null ? null : Number(r.quoted_price),
  }));
}

export interface AdminRequest {
  id: string; user_id: string; name: string; email: string; tier: number;
  level: number; quoted_price: number | null; created_at: string;
}

export async function adminAlertRequests(): Promise<AdminRequest[]> {
  const { data, error } = await supabase.rpc("admin_alert_requests");
  if (error) throw error;
  return ((data ?? []) as AdminRequest[]).map((r) => ({
    ...r, quoted_price: r.quoted_price == null ? null : Number(r.quoted_price),
  }));
}

export async function adminHandleAlertRequest(
  id: string, approve: boolean, note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("admin_handle_alert_request", {
    p_id: id, p_approve: approve, p_note: note ?? null,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ─── manual alerts ───────────────────────────────────────────────────────────
/**
 * A personal alert, sent by a person.
 *
 * Level 5 promises somebody is watching and will make contact; a cron cannot
 * keep that promise, so this is how it is kept. It doubles as the general
 * broadcast for anything the automated sweep would never think to send.
 *
 * Entitlements still apply on the server: a member who has not bought a level
 * that includes text will not be texted, however this is called.
 */
export interface ManualAlert {
  userIds?: string[];
  /** Send to everyone holding at least this level, when no ids are given. */
  minLevel?: number;
  title: string;
  body: string;
  link?: string;
  severity?: "moderate" | "severe" | "extreme";
  channels?: { inapp?: boolean; push?: boolean; email?: boolean; text?: boolean };
}
export interface ManualResult {
  ok: boolean; error?: string;
  recipients?: number; inapp?: number; push?: number; emails?: number; texts?: number;
}

export async function sendManualAlert(a: ManualAlert): Promise<ManualResult> {
  const { data, error } = await supabase.functions.invoke("alerts-fanout", {
    body: { mode: "manual", ...a },
  });
  if (error) {
    logger.error("sendManualAlert failed", { scope: "alerts", error });
    return { ok: false, error: "Could not send that alert." };
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? "Could not send that alert." };
  return data as ManualResult;
}
