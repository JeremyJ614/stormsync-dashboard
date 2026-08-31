/**
 * Supabase-backed Forecast Game store (U-20, rebuilt in P-5.1).
 *
 * Each member locks TWO pins per day into `public.game_guesses` (one row per
 * user per day, UNIQUE-enforced):
 *   • the ⚡ severe pin — where the day's worst severe weather lands
 *   • the 🌪 tornado pin — where a tornado lands, or an explicit "quiet day" call
 *
 * The Storm Engine scores both pins nightly against SPC storm reports, writes
 * `severe_points` / `tornado_points` / `points`, and mirrors the total into the
 * shared `game_points` ledger so the Forecast Game and Trivia share one
 * week/month/year leaderboard.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";
import { viewingAs } from "./impersonate";

export interface Pin { lat: number; lon: number; label: string }

export interface GameGuess {
  severe: Pin;
  /** null means the member explicitly called a no-tornado day. */
  tornado: Pin | null;
  severePoints: number | null;
  tornadoPoints: number | null;
  points: number | null;
  scoredAt: string | null;
}

export interface LeaderRow { userId: string; name: string; points: number; games: number }
export interface WinnerRow { month: string; userName: string; points: number }

interface Row {
  lat: number; lon: number; city_label: string;
  tor_lat: number | null; tor_lon: number | null; tor_city_label: string | null;
  severe_points: number | null; tornado_points: number | null;
  points: number | null; scored_at: string | null;
}

const SELECT = "lat,lon,city_label,tor_lat,tor_lon,tor_city_label,severe_points,tornado_points,points,scored_at";

function toGuess(r: Row): GameGuess {
  return {
    severe: { lat: r.lat, lon: r.lon, label: r.city_label },
    // tor_lat/tor_lon are NULL for a deliberate quiet-day call.
    tornado: r.tor_lat !== null && r.tor_lon !== null
      ? { lat: r.tor_lat, lon: r.tor_lon, label: r.tor_city_label ?? "" }
      : null,
    severePoints: r.severe_points,
    tornadoPoints: r.tornado_points,
    points: r.points,
    scoredAt: r.scored_at,
  };
}

/** The signed-in member's locked guess for a date, or null. */
export async function getMyGuess(userId: string, date: string): Promise<GameGuess | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from("game_guesses").select(SELECT)
    .eq("user_id", userId).eq("guess_date", date).maybeSingle();
  if (error) { logger.error("getMyGuess failed", { scope: "game", error }); return null; }
  return data ? toGuess(data as Row) : null;
}

/** The member's most recent SCORED round, for the "how you did" recap. */
export async function getLastScored(userId: string, beforeDate: string): Promise<{ date: string; guess: GameGuess } | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from("game_guesses").select(`guess_date,${SELECT}`)
    .eq("user_id", userId).lt("guess_date", beforeDate)
    .not("points", "is", null)
    .order("guess_date", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as Row & { guess_date: string };
  return { date: row.guess_date, guess: toGuess(row) };
}

/** Lock in today's pins. Returns an error string on failure (e.g. already locked). */
export async function lockGuess(args: {
  userId: string; userName: string; date: string;
  severe: Pin; tornado: Pin | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };

  // Through the view-as lens the row belongs to the member being viewed while
  // the session is still the admin's, and the insert policy compares the two —
  // so the write has to go through the audited admin function instead. Members
  // never reach this branch; the lens is admin-only by construction.
  if (viewingAs()) {
    const { data, error } = await supabase.rpc("admin_lock_guess", {
      p_user: args.userId, p_user_name: args.userName, p_date: args.date,
      p_lat: args.severe.lat, p_lon: args.severe.lon, p_city_label: args.severe.label,
      p_tor_lat: args.tornado?.lat ?? null,
      p_tor_lon: args.tornado?.lon ?? null,
      p_tor_city_label: args.tornado?.label ?? null,
    });
    if (error) {
      logger.error("admin_lock_guess failed", { scope: "game", error });
      return { ok: false, error: "Could not save those picks. Try again." };
    }
    if (data === "duplicate") return { ok: false, error: "They already locked in today's picks." };
    return { ok: true };
  }

  const { error } = await supabase.from("game_guesses").insert({
    user_id: args.userId, user_name: args.userName, guess_date: args.date,
    lat: args.severe.lat, lon: args.severe.lon, city_label: args.severe.label,
    tor_lat: args.tornado?.lat ?? null,
    tor_lon: args.tornado?.lon ?? null,
    tor_city_label: args.tornado?.label ?? null,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "You already locked in today's picks." };
    logger.error("lockGuess failed", { scope: "game", error });
    return { ok: false, error: "Could not save your picks. Try again." };
  }
  return { ok: true };
}

/** Month-to-date Forecast-Game-only leaderboard. `yyyymm` = "2026-08". */
export async function monthlyLeaderboard(yyyymm: string): Promise<LeaderRow[]> {
  if (!isSupabaseConfigured) return [];
  const start = `${yyyymm}-01`;
  const [y, m] = yyyymm.split("-").map(Number);
  const end = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  const { data, error } = await supabase
    .from("game_guesses").select("user_id,user_name,points")
    .gte("guess_date", start).lt("guess_date", end)
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
    .from("game_winners").select("month,user_name,points")
    .order("month", { ascending: false });
  if (error) { logger.error("winners failed", { scope: "game", error }); return []; }
  return (data ?? []).map((w: { month: string; user_name: string; points: number }) =>
    ({ month: w.month, userName: w.user_name, points: w.points }));
}

// ── Scoring table ────────────────────────────────────────────────────────────
// Kept here so the page and the Storm Engine describe the SAME numbers; the
// engine holds the authoritative copy (scoring must never be client-trusted),
// and these entries exist purely to render the rules card. If you change one,
// change both — the test at the bottom of the engine's scoreGame comment block
// explains why they are duplicated rather than shared.
export const SEVERE_BANDS: { within: number; points: number; label: string }[] = [
  { within: 25, points: 1000, label: "Bullseye" },
  { within: 50, points: 750, label: "Direct hit" },
  { within: 100, points: 500, label: "Close" },
  { within: 200, points: 250, label: "Near" },
  { within: 400, points: 100, label: "Distant" },
];
export const SEVERE_MISS = 25;

export const TORNADO_BANDS: { within: number; points: number; label: string }[] = [
  { within: 25, points: 1500, label: "Bullseye" },
  { within: 50, points: 1000, label: "Direct hit" },
  { within: 100, points: 600, label: "Close" },
  { within: 200, points: 250, label: "Near" },
];
export const TORNADO_MISS = 0;
/** Awarded when a member calls "no tornadoes" and the day verifies with zero. */
export const QUIET_DAY_BONUS = 400;
