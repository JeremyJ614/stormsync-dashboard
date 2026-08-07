/**
 * Shared points ledger + leaderboards (Phase 5).
 *
 * Both the Forecast Game and Trivia write into `public.game_points`, so the
 * weekly / monthly / yearly boards total them together instead of maintaining
 * two parallel scoring systems that would inevitably drift.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type Period = "week" | "month" | "year";
export type PointSource = "forecast_game" | "trivia";

export interface LeaderRow {
  userId: string;
  userName: string;
  points: number;
  entries: number;
  rank: number;
}

export const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
  { id: "year", label: "This Year" },
];

/** Combined standings for a period, ranked. */
export async function getLeaderboard(period: Period): Promise<LeaderRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc("leaderboard", { period });
  if (error) { logger.error("leaderboard failed", { scope: "game", error }); return []; }
  return (data ?? []).map((r: { user_id: string; user_name: string; points: number; entries: number }, i: number) => ({
    userId: r.user_id,
    userName: r.user_name || "Member",
    points: Number(r.points) || 0,
    entries: Number(r.entries) || 0,
    rank: i + 1,
  }));
}

/** A single member's totals across all three periods. */
export async function getMyTotals(userId: string): Promise<Record<Period, number>> {
  const out: Record<Period, number> = { week: 0, month: 0, year: 0 };
  if (!isSupabaseConfigured || !userId) return out;
  await Promise.all(PERIODS.map(async (p) => {
    const rows = await getLeaderboard(p.id);
    out[p.id] = rows.find((r) => r.userId === userId)?.points ?? 0;
  }));
  return out;
}

/** Award points. Idempotency is enforced upstream (unique per day / per question). */
export async function awardPoints(input: {
  userId: string; userName: string; source: PointSource;
  points: number; earnedOn: string; detail?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("game_points").insert({
    user_id: input.userId,
    user_name: input.userName,
    source: input.source,
    points: input.points,
    earned_on: input.earnedOn,
    detail: input.detail ?? {},
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Podium styling for the top three. */
export const PODIUM = [
  { ring: "#fbbf24", glow: "rgba(251,191,36,.55)", label: "GOLD",   grad: "linear-gradient(135deg,#fde68a,#f59e0b,#b45309)" },
  { ring: "#cbd5e1", glow: "rgba(203,213,225,.5)", label: "SILVER", grad: "linear-gradient(135deg,#f1f5f9,#94a3b8,#64748b)" },
  { ring: "#d97706", glow: "rgba(217,119,6,.5)",   label: "BRONZE", grad: "linear-gradient(135deg,#fcd9b6,#c2762f,#7c4a12)" },
];
