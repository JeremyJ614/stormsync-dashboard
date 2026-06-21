/**
 * In-app broadcasts (Phase 7) — backed by `public.broadcasts` + `broadcast_seen`.
 * RLS: admins read/write all; members read global + their own targeted ones, and
 * own their `broadcast_seen` rows. Replaces the browser-local broadcastStore so
 * notices and their read state persist across devices.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type BroadcastLevel = "info" | "warning" | "alert";
export interface Broadcast {
  id: string;
  message: string;
  level: BroadcastLevel;
  createdAt: string;
  targetUserId: string | null;
}

interface Row { id: string; message: string; level: BroadcastLevel; created_at: string; target_user_id: string | null }
const toBroadcast = (r: Row): Broadcast => ({ id: r.id, message: r.message, level: r.level, createdAt: r.created_at, targetUserId: r.target_user_id });

/** All broadcasts visible to the caller (admins: everything; members: global + own). */
export async function listBroadcasts(): Promise<Broadcast[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("broadcasts").select("*").order("created_at", { ascending: false });
  if (error) { logger.error("listBroadcasts failed", { scope: "broadcasts", error }); throw error; }
  return (data ?? []).map((r) => toBroadcast(r as Row));
}

export async function createBroadcast(b: { message: string; level: BroadcastLevel; targetUserId: string | null }): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("broadcasts").insert({ message: b.message, level: b.level, target_user_id: b.targetUserId });
  if (error) { logger.error("createBroadcast failed", { scope: "broadcasts", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function deleteBroadcast(id: string): Promise<void> {
  const { error } = await supabase.from("broadcasts").delete().eq("id", id);
  if (error) logger.error("deleteBroadcast failed", { scope: "broadcasts", error });
}

/** Unseen notices for the signed-in user (RLS already scopes to global + own). */
export async function getUnseenBroadcasts(userId: string): Promise<Broadcast[]> {
  if (!isSupabaseConfigured) return [];
  const [bRes, sRes] = await Promise.all([
    supabase.from("broadcasts").select("*").order("created_at", { ascending: false }),
    supabase.from("broadcast_seen").select("broadcast_id"),
  ]);
  if (bRes.error) { logger.error("getUnseenBroadcasts failed", { scope: "broadcasts", error: bRes.error }); return []; }
  const seen = new Set((sRes.data ?? []).map((r: { broadcast_id: string }) => r.broadcast_id));
  return (bRes.data ?? [])
    .map((r) => toBroadcast(r as Row))
    // Admins can read everyone's targeted notices — only surface ones meant for this user.
    .filter((b) => !seen.has(b.id) && (!b.targetUserId || b.targetUserId === userId));
}

export async function markBroadcastSeen(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from("broadcast_seen").upsert({ user_id: userId, broadcast_id: id }, { onConflict: "user_id,broadcast_id" });
  if (error && error.code !== "23505") logger.error("markBroadcastSeen failed", { scope: "broadcasts", error });
}
