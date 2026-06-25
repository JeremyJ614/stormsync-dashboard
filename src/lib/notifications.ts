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
}
export const DEFAULT_PREFS: NotifPrefs = {
  inapp_enabled: true, push_enabled: true, email_alerts: true, email_digest: true,
  warnings: true, watches: true, outlook: true,
};

export async function getPrefs(userId: string): Promise<NotifPrefs> {
  const { data } = await supabase.from("notification_prefs").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return { ...DEFAULT_PREFS };
  return {
    inapp_enabled: data.inapp_enabled, push_enabled: data.push_enabled, email_alerts: data.email_alerts,
    email_digest: data.email_digest, warnings: data.warnings, watches: data.watches, outlook: data.outlook,
  };
}
export async function savePrefs(userId: string, prefs: NotifPrefs): Promise<void> {
  await supabase.from("notification_prefs").upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() });
}
