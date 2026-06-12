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
}

function rowToBadge(r: BadgeRow): BadgeDef {
  const group = (["Role", "Tier", "Achievement"].includes(r.badge_group) ? r.badge_group : "Achievement") as BadgeDef["group"];
  return { id: r.id, label: r.label, color: r.color, description: r.description, group };
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
    id, label: input.label.trim(), color: input.color, description: input.description.trim(), badge_group: input.group,
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
    label: patch.label.trim(), color: patch.color, description: patch.description.trim(), badge_group: patch.group,
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
