/**
 * The wall of names.
 *
 * Several raffle prizes are an engraving, and one of them is THE engraving — a
 * single slot at the top that only ever holds one person, so winning it
 * displaces whoever was there. The displaced name is not deleted: they did win
 * it, so they drop to the roll below.
 *
 * Names are denormalised on purpose (see the table comment). A wall is a
 * monument; somebody who leaves does not get chiselled off it.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type WallSlot = "blessed" | "engraved";

export interface WallName {
  id: string;
  userId: string | null;
  display: string;
  slot: WallSlot;
  note: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

function toName(r: Record<string, unknown>): WallName {
  return {
    id: String(r.id),
    userId: (r.user_id as string | null) ?? null,
    display: String(r.display ?? ""),
    slot: (r.slot as WallSlot) ?? "engraved",
    note: (r.note as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    active: r.active !== false,
    createdAt: String(r.created_at),
  };
}

/** Everything on the wall, blessed first. Readable by anyone. */
export async function listWall(includeHidden = false): Promise<WallName[]> {
  if (!isSupabaseConfigured) return [];
  let q = supabase
    .from("wall_names")
    .select("*")
    .order("slot", { ascending: true })       // 'blessed' sorts before 'engraved'
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!includeHidden) q = q.eq("active", true);
  const { data, error } = await q;
  if (error) { logger.error("listWall failed", { scope: "wall", error }); return []; }
  return ((data ?? []) as Record<string, unknown>[]).map(toName);
}

export interface WallInput {
  display: string;
  slot: WallSlot;
  note?: string | null;
  sortOrder?: number;
  active?: boolean;
}

export async function addWallName(input: WallInput): Promise<{ ok: boolean; error?: string }> {
  // Only one blessed name can be live at a time — a partial unique index
  // enforces it — so putting somebody in that slot has to retire the incumbent
  // first, exactly as winning it does.
  if (input.slot === "blessed") {
    const { error: demote } = await supabase
      .from("wall_names")
      .update({ slot: "engraved" })
      .eq("slot", "blessed").eq("active", true);
    if (demote) return { ok: false, error: demote.message };
  }
  const { error } = await supabase.from("wall_names").insert({
    display: input.display.trim(),
    slot: input.slot,
    note: input.note?.trim() || null,
    sort_order: input.sortOrder ?? 0,
    active: input.active ?? true,
    source: "admin",
  });
  if (error) { logger.error("addWallName failed", { scope: "wall", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function updateWallName(
  id: string, patch: Partial<WallInput>,
): Promise<{ ok: boolean; error?: string }> {
  if (patch.slot === "blessed") {
    const { error: demote } = await supabase
      .from("wall_names")
      .update({ slot: "engraved" })
      .eq("slot", "blessed").eq("active", true).neq("id", id);
    if (demote) return { ok: false, error: demote.message };
  }
  const row: Record<string, unknown> = {};
  if (patch.display !== undefined) row.display = patch.display.trim();
  if (patch.slot !== undefined) row.slot = patch.slot;
  if (patch.note !== undefined) row.note = patch.note?.trim() || null;
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.active !== undefined) row.active = patch.active;
  const { error } = await supabase.from("wall_names").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeWallName(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("wall_names").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
