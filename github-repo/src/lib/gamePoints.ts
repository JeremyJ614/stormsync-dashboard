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

// ── Admin adjustments ────────────────────────────────────────────────────────
/**
 * Grant or deduct points for a member.
 *
 * An adjustment is a new ledger row with source `admin`, never an edit to an
 * existing award — so a correction is visible in the history rather than
 * rewriting it, and a mistaken adjustment can itself be reversed.
 * `points` may be negative.
 */
export async function adjustPoints(params: {
  userId: string; userName: string; points: number; reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const pts = Math.trunc(params.points);
  if (!Number.isFinite(pts) || pts === 0) return { ok: false, error: "Enter a non-zero whole number." };
  if (Math.abs(pts) > 100000) return { ok: false, error: "That adjustment looks like a typo — keep it under 100,000." };
  const { error } = await supabase.from("game_points").insert({
    user_id: params.userId,
    user_name: params.userName,
    source: "admin",
    points: pts,
    earned_on: new Date().toISOString().slice(0, 10),
    detail: { reason: params.reason.trim().slice(0, 300) || "Manual adjustment" },
  });
  if (error) { logger.error("adjustPoints failed", { scope: "game", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export interface LedgerRow {
  id: string; userId: string; userName: string; source: string;
  points: number; earnedOn: string; reason: string | null; createdAt: string;
}

/** One member's full points history, newest first. */
export async function getMemberLedger(userId: string, limit = 60): Promise<LedgerRow[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("game_points")
    .select("id,user_id,user_name,source,points,earned_on,detail,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) { logger.error("getMemberLedger failed", { scope: "game", error }); return []; }
  return (data ?? []).map((r: {
    id: string; user_id: string; user_name: string | null; source: string;
    points: number; earned_on: string; detail: { reason?: string } | null; created_at: string;
  }) => ({
    id: r.id, userId: r.user_id, userName: r.user_name ?? "Member", source: r.source,
    points: Number(r.points) || 0, earnedOn: r.earned_on,
    reason: r.detail?.reason ?? null, createdAt: r.created_at,
  }));
}

/** Career total across every source, for the admin points panel. */
export async function getMemberTotals(): Promise<Map<string, { points: number; entries: number }>> {
  if (!isSupabaseConfigured) return new Map();
  const { data, error } = await supabase.from("game_points").select("user_id,points");
  if (error) { logger.error("getMemberTotals failed", { scope: "game", error }); return new Map(); }
  const out = new Map<string, { points: number; entries: number }>();
  for (const r of (data ?? []) as { user_id: string; points: number }[]) {
    const cur = out.get(r.user_id) ?? { points: 0, entries: 0 };
    cur.points += Number(r.points) || 0;
    cur.entries += 1;
    out.set(r.user_id, cur);
  }
  return out;
}
