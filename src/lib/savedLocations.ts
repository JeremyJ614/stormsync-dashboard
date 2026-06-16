/**
 * "My Locations" (L1) — save/switch multiple places per member.
 *
 * Backed by `public.saved_locations` (RLS: a user sees/edits only their own
 * rows). Anonymous users get an empty list; the feature lights up on sign-in.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export interface SavedLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isPrimary: boolean;
}

export async function listSavedLocations(): Promise<SavedLocation[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("saved_locations")
    .select("id,name,lat,lon,is_primary")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) { logger.error("listSavedLocations failed", { scope: "locations", error }); return []; }
  return (data ?? []).map((r: { id: string; name: string; lat: number; lon: number; is_primary: boolean }) =>
    ({ id: r.id, name: r.name, lat: r.lat, lon: r.lon, isPrimary: r.is_primary }));
}

export async function addSavedLocation(userId: string, loc: { name: string; lat: number; lon: number }, makePrimary = false):
  Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  if (makePrimary) await supabase.from("saved_locations").update({ is_primary: false }).eq("user_id", userId);
  const { error } = await supabase.from("saved_locations").insert({
    user_id: userId, name: loc.name, lat: loc.lat, lon: loc.lon, is_primary: makePrimary,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That location is already saved." };
    logger.error("addSavedLocation failed", { scope: "locations", error });
    return { ok: false, error: "Could not save location." };
  }
  return { ok: true };
}

export async function removeSavedLocation(id: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from("saved_locations").delete().eq("id", id);
  if (error) logger.error("removeSavedLocation failed", { scope: "locations", error });
}

export async function setPrimaryLocation(userId: string, id: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  await supabase.from("saved_locations").update({ is_primary: false }).eq("user_id", userId);
  const { error } = await supabase.from("saved_locations").update({ is_primary: true }).eq("id", id);
  if (error) logger.error("setPrimaryLocation failed", { scope: "locations", error });
}
