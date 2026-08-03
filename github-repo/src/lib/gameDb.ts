/**
 * Supabase-backed Forecast Game store (U-20).
 *
 * Guesses live in `public.game_guesses` (one per user per day, enforced by a
 * UNIQUE constraint). The Storm Engine scores yesterday's guesses nightly
 * (writes `points`) and rolls up `public.game_winners` at month end. The client
 * only inserts its own guess and reads aggregates.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export interface GameGuess { lat: number; lon: number; label: string; points: number | null }
export interface LeaderRow { userId: string; name: string; points: number; games: number }
export interface WinnerRow { month: string; userName: string; points: number }

/** The signed-in user's guess for a date, or null. */
export async function getMyGuess(userId: string, date: string): Promise<GameGuess | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from("game_guesses")
    .select("lat,lon,city_label,points")
    .eq("user_id", userId)
    .eq("guess_date", date)
    .maybeSingle();
  if (error) { logger.error("getMyGuess failed", { scope: "game", error }); return null; }
  if (!data) return null;
  return { lat: data.lat, lon: data.lon, label: data.city_label, points: data.points };
}

/** Lock in today's guess. Returns an error string on failure (e.g. already locked). */
export async function lockGuess(args: { userId: string; userName: string; lat: number; lon: number; label: string; date: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("game_guesses").insert({
    user_id: args.userId, user_name: args.userName,
    lat: args.lat, lon: args.lon, city_label: args.label, guess_date: args.date,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "You already locked in today's guess." };
    logger.error("lockGuess failed", { scope: "game", error });
    return { ok: false, error: "Could not save your guess. Try again." };
  }
  return { ok: true };
}

/** Month-to-date leaderboard (scored points only), descending. `yyyymm` = "2026-06". */
export async function monthlyLeaderboard(yyyymm: string): Promise<LeaderRow[]> {
  if (!isSupabaseConfigured) return [];
  const start = `${yyyymm}-01`;
  const [y, m] = yyyymm.split("-").map(Number);
  const end = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  const { data, error } = await supabase
    .from("game_guesses")
    .select("user_id,user_name,points")
    .gte("guess_date", start)
    .lt("guess_date", end)
    .not("points", "is", null);
  if (error) { logger.error("leaderboard failed", { scope: "game", error }); return []; }
  const tally = new Map<string, LeaderRow>();
  for (const r of (data ?? []) as { user_id: string; user_name: string; points: number }[]) {
    const cur = tally.get(r.user_id) ?? { userId: r.user_id, name: r.user_name, points: 0, games: 0 };
    cur.points += r.points ?? 0; cur.games += 1; tally.set(r.user_id, cur);
  }
  return [...tally.values()].sort((a, b) => b.points - a.points);
}

/** Past monthly winners, newest first. */
export async function getWinners(): Promise<WinnerRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("game_winners")
    .select("month,user_name,points")
    .order("month", { ascending: false });
  if (error) { logger.error("winners failed", { scope: "game", error }); return []; }
  return (data ?? []).map((w: { month: string; user_name: string; points: number }) => ({ month: w.month, userName: w.user_name, points: w.points }));
}
