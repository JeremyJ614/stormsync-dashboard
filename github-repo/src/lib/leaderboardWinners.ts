/**
 * Champions.
 *
 * The leaderboard was computed live and kept nothing: the day a month ended,
 * its winner ceased to exist. These are the records — sealed automatically the
 * day after a period closes, and overridable by an admin, whose decision always
 * outranks the arithmetic.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type WinnerPeriod = "month" | "year";

export interface Winner {
  id: string;
  period: WinnerPeriod;
  /** First day of the period the title belongs to. */
  periodStart: string;
  userId: string | null;
  userName: string;
  points: number;
  note: string | null;
  /** True when an admin crowned them rather than the standings deciding. */
  manual: boolean;
  awardedAt: string;
}

/** "August 2026" / "2025", from a period start. */
export function periodLabel(period: WinnerPeriod, start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  return period === "year"
    ? String(d.getUTCFullYear())
    : d.toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The first day of a period, as the table stores it. */
export function periodStartOf(period: WinnerPeriod, d: Date): string {
  const y = d.getUTCFullYear();
  const m = period === "year" ? 1 : d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function toWinner(r: Record<string, unknown>): Winner {
  return {
    id: String(r.id),
    period: r.period as WinnerPeriod,
    periodStart: String(r.period_start),
    userId: (r.user_id as string | null) ?? null,
    userName: String(r.user_name ?? "Member"),
    points: Number(r.points ?? 0),
    note: (r.note as string | null) ?? null,
    manual: r.manual === true,
    awardedAt: String(r.awarded_at),
  };
}

export async function listWinners(limit = 24): Promise<Winner[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("leaderboard_winners")
    .select("*")
    .order("period_start", { ascending: false })
    .limit(limit);
  if (error) { logger.error("listWinners failed", { scope: "game", error }); return []; }
  return ((data ?? []) as Record<string, unknown>[]).map(toWinner);
}

/** The standings for one closed period, so an admin can see who actually won. */
export async function standingsFor(period: WinnerPeriod, start: string): Promise<{ userId: string; userName: string; points: number }[]> {
  const d = new Date(`${start}T00:00:00Z`);
  const end = new Date(d);
  if (period === "year") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  const { data, error } = await supabase.rpc("leaderboard_between", {
    p_start: start,
    p_end: end.toISOString().slice(0, 10),
  });
  if (error) { logger.error("leaderboard_between failed", { scope: "game", error }); return []; }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: String(r.user_id),
    userName: String(r.user_name ?? "Member"),
    points: Number(r.points ?? 0),
  }));
}

export async function setWinner(
  period: WinnerPeriod, start: string, userId: string, points?: number, note?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("admin_set_leaderboard_winner", {
    p_period: period, p_start: start, p_user: userId,
    p_points: points ?? null, p_note: note?.trim() || null,
  });
  if (error) { logger.error("setWinner failed", { scope: "game", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function clearWinner(period: WinnerPeriod, start: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("admin_clear_leaderboard_winner", { p_period: period, p_start: start });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Fill in anything that closed while nobody was looking. */
export async function sealDue(): Promise<number> {
  const { data, error } = await supabase.rpc("seal_due_leaderboards");
  if (error) { logger.error("sealDue failed", { scope: "game", error }); return 0; }
  return Number(data ?? 0);
}
