/**
 * Module usage analytics.
 *
 * Storage is one counter per member per module per day, not a row per page
 * view, which bounds the table at members × modules × days instead of growing
 * with traffic. That is enough to answer the questions worth asking — which
 * modules earn their place, which are dead weight, how many distinct people
 * actually open a thing — without keeping a per-click trail on anybody.
 *
 * Writes go through `record_module_view`, a security-definer function, so a
 * client can only ever increment its own counter and cannot forge another
 * member's activity. Aggregates come back from the database already grouped;
 * the admin panel never pulls raw rows.
 */
import { supabase } from "./supabase";
import { logger } from "./logger";
import { ALL_MODULES } from "../hooks/useAuth";

/** Modules whose view counts would be noise: shells, not destinations. */
const NOT_WORTH_COUNTING = new Set(["/login", "/join", "/logout"]);

// One record per module per session. A member flipping between two tabs should
// not out-rank a member who actually sat and read something.
const seenThisSession = new Set<string>();

export function recordModuleView(path: string): void {
  if (!path || NOT_WORTH_COUNTING.has(path)) return;
  if (seenThisSession.has(path)) return;
  seenThisSession.add(path);
  void supabase.rpc("record_module_view", { p_module: path }).then(({ error }) => {
    if (error) logger.warn("usage write failed", { scope: "admin", path, error });
  });
}

export interface ModuleUsage {
  moduleId: string;
  label: string;
  views: number;
  uniques: number;
  lastSeen: string | null;
}

export interface UsageDay {
  day: string;
  views: number;
  uniques: number;
}

const labelFor = (id: string) => ALL_MODULES.find((m) => m.id === id)?.label ?? id;

export async function moduleUsage(days = 30): Promise<ModuleUsage[]> {
  const { data, error } = await supabase.rpc("admin_module_usage", { p_days: days });
  if (error) throw error;
  const rows = (data ?? []) as { module_id: string; views: number; uniques: number; last_seen: string | null }[];
  return rows.map((r) => ({
    moduleId: r.module_id,
    label: labelFor(r.module_id),
    views: Number(r.views),
    uniques: Number(r.uniques),
    lastSeen: r.last_seen,
  }));
}

export async function usageByDay(days = 30): Promise<UsageDay[]> {
  const { data, error } = await supabase.rpc("admin_usage_by_day", { p_days: days });
  if (error) throw error;
  const rows = (data ?? []) as { day: string; views: number; uniques: number }[];
  return rows.map((r) => ({ day: r.day, views: Number(r.views), uniques: Number(r.uniques) }));
}

/**
 * Modules with no recorded views in the window.
 *
 * Worth its own list: a module nobody opened is the one piece of information
 * this whole table exists to surface, and it is the one thing a "top modules"
 * chart structurally cannot show.
 */
export function unusedModules(usage: ModuleUsage[]): { id: string; label: string }[] {
  const seen = new Set(usage.map((u) => u.moduleId));
  return ALL_MODULES
    .filter((m) => !seen.has(m.id) && !NOT_WORTH_COUNTING.has(m.id))
    .map((m) => ({ id: m.id, label: m.label }));
}

/**
 * Who opened a module, and how often.
 *
 * The aggregate answers "does this module earn its place"; this answers the
 * question that always comes next. It is a grouping of counters that already
 * existed rather than any new collection — still one row per member per module
 * per day, still no per-click trail.
 */
export interface ModuleViewer {
  userId: string;
  name: string;
  email: string;
  tier: number;
  views: number;
  daysSeen: number;
  lastSeen: string | null;
}

export async function moduleViewers(moduleId: string, days = 30): Promise<ModuleViewer[]> {
  const { data, error } = await supabase.rpc("admin_module_viewers", { p_module: moduleId, p_days: days });
  if (error) throw error;
  const rows = (data ?? []) as {
    user_id: string; name: string | null; email: string | null; tier: number | null;
    views: number; days_seen: number; last_seen: string | null;
  }[];
  return rows.map((r) => ({
    userId: r.user_id,
    name: r.name ?? "",
    email: r.email ?? "",
    tier: Number(r.tier ?? 1),
    views: Number(r.views),
    daysSeen: Number(r.days_seen),
    lastSeen: r.last_seen,
  }));
}

/** The same rows on the other axis: everything one member has opened. */
export interface MemberModule { moduleId: string; label: string; views: number; daysSeen: number; lastSeen: string | null }

export async function memberModules(userId: string, days = 30): Promise<MemberModule[]> {
  const { data, error } = await supabase.rpc("admin_member_modules", { p_user: userId, p_days: days });
  if (error) throw error;
  const rows = (data ?? []) as { module_id: string; views: number; days_seen: number; last_seen: string | null }[];
  return rows.map((r) => ({
    moduleId: r.module_id,
    label: labelFor(r.module_id),
    views: Number(r.views),
    daysSeen: Number(r.days_seen),
    lastSeen: r.last_seen,
  }));
}
