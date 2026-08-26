/**
 * Admin audit log.
 *
 * Every privileged action an admin takes gets a row here: who did it, to whom,
 * and what changed. The table has SELECT and INSERT policies and deliberately
 * no UPDATE or DELETE — an audit log its own subjects can edit is not an audit
 * log, so append-only is enforced in the database rather than by convention.
 *
 * Writes are fire-and-forget. A failed audit write must never block or reverse
 * the action it was describing: losing one log line is bad, but refusing to fix
 * a member's tier because the logger is down is worse.
 */
import { supabase } from "./supabase";
import { logger } from "./logger";

export type AuditAction =
  | "user.create" | "user.delete" | "user.tier" | "user.modules" | "user.badges"
  | "user.pin" | "user.referrals" | "user.viewas"
  | "points.grant" | "points.deduct"
  | "billing.prices" | "billing.coupon"
  | "nav.reorder" | "nav.groups"
  | "badge.create" | "badge.update" | "badge.delete"
  | "news.publish" | "news.delete"
  | "broadcast.send"
  | "faq.change"
  | "trivia.change"
  | "alert.grant" | "alert.revoke" | "alert.price"
  | "alert.request.approve" | "alert.request.decline"
  | "settings.change";

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: AuditAction | string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

const toEntry = (r: AuditRow): AuditEntry => ({
  id: r.id,
  actorId: r.actor_id,
  actorEmail: r.actor_email,
  action: r.action,
  targetType: r.target_type,
  targetId: r.target_id,
  targetLabel: r.target_label,
  detail: r.detail ?? {},
  createdAt: r.created_at,
});

/**
 * Record one admin action. Never throws.
 *
 * `detail` is for the shape of the change — `{ from: 2, to: 4 }` — not for the
 * whole record. Keep secrets out of it: this is readable by every admin.
 */
export async function audit(
  action: AuditAction,
  target: { type?: string; id?: string; label?: string } = {},
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const actor = auth?.user;
    if (!actor) return;
    await supabase.from("admin_audit").insert({
      actor_id: actor.id,
      actor_email: actor.email ?? null,
      action,
      target_type: target.type ?? null,
      target_id: target.id ?? null,
      target_label: target.label ?? null,
      detail,
    });
  } catch (error) {
    // Deliberately swallowed — see the note at the top of this file.
    logger.warn("audit write failed", { scope: "admin", action, error });
  }
}

export interface AuditFilter {
  action?: string;
  actorId?: string;
  targetId?: string;
  search?: string;
  limit?: number;
}

export async function listAudit(filter: AuditFilter = {}): Promise<AuditEntry[]> {
  let q = supabase
    .from("admin_audit")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 200);

  if (filter.action) q = q.eq("action", filter.action);
  if (filter.actorId) q = q.eq("actor_id", filter.actorId);
  if (filter.targetId) q = q.eq("target_id", filter.targetId);
  if (filter.search) {
    const t = `%${filter.search}%`;
    q = q.or(`actor_email.ilike.${t},target_label.ilike.${t},action.ilike.${t}`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data as AuditRow[]).map(toEntry);
}

/** Distinct actions present in the log, for the filter dropdown. */
export async function auditActions(): Promise<string[]> {
  const { data, error } = await supabase
    .from("admin_audit")
    .select("action")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return [];
  return [...new Set((data as { action: string }[]).map((r) => r.action))].sort();
}

/** Human phrasing for the log rows. Unknown actions fall back to the raw key. */
export const ACTION_LABEL: Record<string, string> = {
  "user.create": "Created account",
  "user.delete": "Deleted account",
  "user.tier": "Changed tier",
  "user.modules": "Changed module access",
  "user.badges": "Changed badges",
  "user.pin": "Reset PIN",
  "user.referrals": "Adjusted referrals",
  "user.viewas": "Viewed app as member",
  "points.grant": "Granted points",
  "points.deduct": "Deducted points",
  "billing.prices": "Changed pricing",
  "billing.coupon": "Changed a coupon",
  "nav.reorder": "Reordered navigation",
  "nav.groups": "Changed admin groups",
  "badge.create": "Created badge",
  "badge.update": "Edited badge",
  "badge.delete": "Deleted badge",
  "news.publish": "Published news",
  "news.delete": "Deleted news",
  "broadcast.send": "Sent a broadcast",
  "faq.change": "Edited the FAQ",
  "trivia.change": "Edited trivia",
  "alert.grant": "Granted an alert level",
  "alert.revoke": "Revoked an alert level",
  "alert.price": "Changed alert pricing",
  "alert.request.approve": "Approved an alert request",
  "alert.request.decline": "Declined an alert request",
  "settings.change": "Changed settings",
};
