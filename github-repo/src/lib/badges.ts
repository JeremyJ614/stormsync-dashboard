/**
 * Badge definitions, backed by the `badge_defs` table (U-27).
 *
 * Everyone can read badge defs (RLS `using true`); only admins can create,
 * update or delete them. Deleting goes through the `admin_delete_badge` RPC so
 * the badge id is also removed from every user's `badges` array in one step.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";
import type { BadgeDef } from "../hooks/useAuth";
import type { MutationResult } from "./userAdmin";

/** Mirrors the seeded rows — used only when the backend is unreachable. */
export const FALLBACK_BADGES: BadgeDef[] = [
  { id: "sswx-member", label: "SSWX Member", color: "#7B8FD9", description: "Verified StormSync community member.", group: "Role" },
  { id: "sswx-dept-head", label: "Department Head", color: "#22d3ee", description: "Leads a department within StormSync Media.", group: "Role" },
  { id: "sswx-exec-board", label: "Executive Board", color: "#fde047", description: "Member of the SSWX Executive Board.", group: "Role" },
  { id: "tier-1", label: "Tier 1", color: "#94a3b8", description: "Tier 1 subscriber.", group: "Tier" },
  { id: "tier-2", label: "Tier 2", color: "#22d3ee", description: "Tier 2 subscriber.", group: "Tier" },
  { id: "tier-3", label: "Tier 3", color: "#a855f7", description: "Tier 3 subscriber.", group: "Tier" },
  { id: "tier-4", label: "Tier 4 Elite", color: "#fde047", description: "Tier 4 elite subscriber with emergency line access.", group: "Tier" },
  { id: "founder", label: "Founder", color: "#fb923c", description: "Founding member of StormSync Media.", group: "Achievement" },
  { id: "storm-chaser", label: "Storm Chaser", color: "#ef4444", description: "Active field storm chaser.", group: "Achievement" },
  { id: "spotter", label: "Trained Spotter", color: "#4ade80", description: "Skywarn trained severe weather spotter.", group: "Achievement" },
];

interface BadgeRow {
  id: string;
  label: string;
  color: string;
  description: string;
  badge_group: string;
  icon: string | null;
  rarity: string | null;
}

const RARITIES = ["common", "rare", "epic", "legendary"] as const;

function rowToBadge(r: BadgeRow): BadgeDef {
  const group = (["Role", "Tier", "Achievement"].includes(r.badge_group) ? r.badge_group : "Achievement") as BadgeDef["group"];
  const rarity = (RARITIES as readonly string[]).includes(r.rarity ?? "")
    ? (r.rarity as BadgeDef["rarity"]) : "common";
  return { id: r.id, label: r.label, color: r.color, description: r.description, group, icon: r.icon, rarity };
}

export async function listBadgeDefs(): Promise<BadgeDef[]> {
  if (!isSupabaseConfigured) return FALLBACK_BADGES;
  const { data, error } = await supabase.from("badge_defs").select("*").order("badge_group").order("label");
  if (error) {
    logger.error("Failed to list badge defs", { scope: "badges", error });
    return FALLBACK_BADGES;
  }
  return (data as BadgeRow[]).map(rowToBadge);
}

export function slugifyBadgeId(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validateBadge(b: Omit<BadgeDef, "id">): string | null {
  if (!b.label.trim()) return "Label required";
  if (!HEX_RE.test(b.color)) return "Color must be a hex value like #22d3ee";
  if (!["Role", "Tier", "Achievement"].includes(b.group)) return "Invalid group";
  return null;
}

export async function createBadge(input: Omit<BadgeDef, "id"> & { id?: string }): Promise<MutationResult> {
  const invalid = validateBadge(input);
  if (invalid) return { ok: false, error: invalid };
  const id = (input.id?.trim() || slugifyBadgeId(input.label));
  if (!id) return { ok: false, error: "Could not derive a badge id from the label" };
  const { error } = await supabase.from("badge_defs").insert({
    id, label: input.label.trim(), color: input.color, description: input.description.trim(),
    badge_group: input.group, icon: input.icon ?? null, rarity: input.rarity ?? "common",
  });
  if (error) {
    const msg = error.code === "23505" ? `A badge with id "${id}" already exists` : error.message;
    logger.error("Failed to create badge", { scope: "badges", error });
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function updateBadge(id: string, patch: Omit<BadgeDef, "id">): Promise<MutationResult> {
  const invalid = validateBadge(patch);
  if (invalid) return { ok: false, error: invalid };
  const { error } = await supabase.from("badge_defs").update({
    label: patch.label.trim(), color: patch.color, description: patch.description.trim(),
    badge_group: patch.group, icon: patch.icon ?? null, rarity: patch.rarity ?? "common",
  }).eq("id", id);
  if (error) {
    logger.error("Failed to update badge", { scope: "badges", error });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function deleteBadge(id: string): Promise<MutationResult> {
  const { error } = await supabase.rpc("admin_delete_badge", { badge_id: id });
  if (error) {
    logger.error("Failed to delete badge", { scope: "badges", error });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ─── automation rules ────────────────────────────────────────────────────────
/**
 * What a badge can be earned for.
 *
 * These are the kinds the database evaluator understands; adding one here
 * without adding it to `award_badges_for` gives you a rule that silently never
 * fires, so the two lists are meant to be edited together. `region` is the odd
 * one out: it is not a threshold, it matches the region a member's first saved
 * location sits in.
 */
export const BADGE_KINDS: { kind: string; label: string; unit: string }[] = [
  { kind: "points_total",      label: "Total points",              unit: "points" },
  { kind: "points_day_best",   label: "Best single day",           unit: "points in a day" },
  { kind: "referrals",         label: "Referrals",                 unit: "referrals" },
  { kind: "modules_owned",     label: "Modules unlocked",          unit: "modules" },
  { kind: "modules_explored",  label: "Distinct modules opened",   unit: "modules" },
  { kind: "active_days",       label: "Days active",               unit: "days" },
  { kind: "days_member",       label: "Days since joining",        unit: "days" },
  { kind: "trivia_correct",    label: "Trivia answered correctly", unit: "correct" },
  { kind: "trivia_answered",   label: "Trivia attempted",          unit: "answers" },
  { kind: "game_plays",        label: "Forecast rounds played",    unit: "rounds" },
  { kind: "game_wins",         label: "Forecast rounds won",       unit: "wins" },
  { kind: "warnings_received", label: "Warnings received",         unit: "warnings" },
  { kind: "locations_saved",   label: "Saved locations",           unit: "locations" },
  { kind: "badges_earned",     label: "Badges earned",             unit: "badges" },
  { kind: "alert_level",       label: "Alert level held",          unit: "level" },
  { kind: "tier_at_least",     label: "Tier",                      unit: "tier" },
  { kind: "region",            label: "Region of first location",  unit: "region" },
];

/** The regions `state_region()` can return, for the region-badge picker. */
export const BADGE_REGIONS: { key: string; label: string }[] = [
  { key: "lake-effect",  label: "Great Lakes" },
  { key: "heartland",    label: "Upper Midwest" },
  { key: "alley",        label: "Tornado Alley" },
  { key: "dixie",        label: "Deep South" },
  { key: "gulf",         label: "Gulf & Southeast" },
  { key: "noreaster",    label: "Northeast" },
  { key: "blue-ridge",   label: "Mid-Atlantic & Appalachians" },
  { key: "high-country", label: "Rockies" },
  { key: "dryline",      label: "Desert Southwest" },
  { key: "pineapple",    label: "Pacific Northwest" },
  { key: "golden",       label: "California" },
  { key: "frontier",     label: "Alaska" },
  { key: "island",       label: "Hawaii" },
];

export interface BadgeRule {
  badgeId: string;
  kind: string;
  threshold: number;
  param: string | null;
  enabled: boolean;
}

export async function listBadgeRules(): Promise<Record<string, BadgeRule>> {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await supabase.from("badge_rules").select("badge_id,kind,threshold,param,enabled");
  if (error) { logger.error("Failed to list badge rules", { scope: "badges", error }); return {}; }
  const out: Record<string, BadgeRule> = {};
  for (const r of data as { badge_id: string; kind: string; threshold: number; param: string | null; enabled: boolean }[]) {
    out[r.badge_id] = {
      badgeId: r.badge_id, kind: r.kind, threshold: Number(r.threshold),
      param: r.param, enabled: r.enabled,
    };
  }
  return out;
}

/** Attach or update the rule that earns a badge. */
export async function saveBadgeRule(rule: BadgeRule): Promise<MutationResult> {
  if (!BADGE_KINDS.some((k) => k.kind === rule.kind)) return { ok: false, error: "Unknown rule kind" };
  if (rule.kind === "region" && !rule.param) return { ok: false, error: "Pick a region" };
  if (rule.kind !== "region" && !(rule.threshold > 0)) return { ok: false, error: "Threshold must be above zero" };
  const { error } = await supabase.from("badge_rules").upsert({
    badge_id: rule.badgeId,
    kind: rule.kind,
    threshold: rule.kind === "region" ? 1 : rule.threshold,
    param: rule.kind === "region" ? rule.param : null,
    enabled: rule.enabled,
    updated_at: new Date().toISOString(),
  }, { onConflict: "badge_id" });
  if (error) { logger.error("Failed to save badge rule", { scope: "badges", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

/** Make a badge manual again. The badge and everyone who has it are untouched. */
export async function deleteBadgeRule(badgeId: string): Promise<MutationResult> {
  const { error } = await supabase.from("badge_rules").delete().eq("badge_id", badgeId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Re-run every rule against every member.
 *
 * The member-facing evaluator only ever runs for its caller, which is right and
 * also means a newly added badge reaches nobody until they next sign in. This
 * is the admin's way to close that gap; it is bounded by the member count and
 * writes one summary notification each rather than one per badge.
 */
export async function backfillBadges(): Promise<{ ok: boolean; members?: number; awarded?: number; error?: string }> {
  const { data, error } = await supabase.rpc("admin_backfill_badges");
  if (error) { logger.error("Badge backfill failed", { scope: "badges", error }); return { ok: false, error: error.message }; }
  const rows = (data ?? []) as { user_id: string; awarded: number }[];
  return {
    ok: true,
    members: rows.filter((r) => Number(r.awarded) > 0).length,
    awarded: rows.reduce((n, r) => n + Number(r.awarded), 0),
  };
}
