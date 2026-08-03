import { supabase } from "./supabase";

export type NotifKind = "warning" | "watch" | "outlook" | "digest" | "news" | "system";
export type NotifSeverity = "extreme" | "severe" | "moderate" | "info";

export interface AppNotification {
  id: string;
  kind: NotifKind;
  severity: NotifSeverity;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

interface Row {
  id: string; kind: string; severity: string; title: string; body: string | null;
  link: string | null; data: Record<string, unknown> | null; read_at: string | null; created_at: string;
}
const toNotif = (r: Row): AppNotification => ({
  id: r.id, kind: r.kind as NotifKind, severity: r.severity as NotifSeverity, title: r.title,
  body: r.body, link: r.link, data: r.data, readAt: r.read_at, createdAt: r.created_at,
});

export async function listNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return [];
  return (data as Row[]).map(toNotif);
}

export async function unreadCount(): Promise<number> {
  const { count } = await supabase
    .from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
}
export async function markAllRead(): Promise<void> {
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
}
export async function deleteNotification(id: string): Promise<void> {
  await supabase.from("notifications").delete().eq("id", id);
}

export interface NotifPrefs {
  inapp_enabled: boolean; push_enabled: boolean; email_alerts: boolean; email_digest: boolean;
  warnings: boolean; watches: boolean; outlook: boolean;
  // Tier-3 email/text alert opt-in (configured in Profile)
  email_optin: boolean; text_optin: boolean;
  alert_email: string | null; alert_phone: string | null;
  text_location: string | null; text_lat: number | null; text_lon: number | null;
}
export const DEFAULT_PREFS: NotifPrefs = {
  inapp_enabled: true, push_enabled: true, email_alerts: true, email_digest: true,
  warnings: true, watches: true, outlook: true,
  email_optin: false, text_optin: false, alert_email: null, alert_phone: null,
  text_location: null, text_lat: null, text_lon: null,
};

export async function getPrefs(userId: string): Promise<NotifPrefs> {
  const { data } = await supabase.from("notification_prefs").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return { ...DEFAULT_PREFS };
  return { ...DEFAULT_PREFS, ...data } as NotifPrefs;
}
export async function savePrefs(userId: string, prefs: Partial<NotifPrefs>): Promise<void> {
  await supabase.from("notification_prefs").upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() });
}

// Admin view: who has opted into text/email alerts and where.
export interface AlertOptin {
  userId: string; name: string; email: string; tier: number; phone: string | null;
  alertEmail: string | null; emailOptin: boolean; textOptin: boolean;
  textLocation: string | null; textLat: number | null; textLon: number | null;
}
export async function adminListAlertOptins(): Promise<AlertOptin[]> {
  // Admin-readable via RLS policy. Join prefs to profiles for name/tier/email.
  const { data: prefs } = await supabase.from("notification_prefs")
    .select("user_id,alert_email,alert_phone,email_optin,text_optin,text_location,text_lat,text_lon");
  if (!prefs || prefs.length === 0) return [];
  const ids = prefs.map((p) => p.user_id);
  const { data: profs } = await supabase.from("profiles").select("id,name,email,tier").in("id", ids);
  const byId = new Map((profs ?? []).map((p) => [p.id, p]));
  return prefs.map((p) => {
    const prof = byId.get(p.user_id);
    return {
      userId: p.user_id, name: prof?.name ?? "—", email: prof?.email ?? "—", tier: prof?.tier ?? 1,
      phone: p.alert_phone, alertEmail: p.alert_email, emailOptin: p.email_optin, textOptin: p.text_optin,
      textLocation: p.text_location, textLat: p.text_lat, textLon: p.text_lon,
    };
  });
}
