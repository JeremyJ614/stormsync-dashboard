/**
 * Raffles.
 *
 * Four draws with separate ticket pools. `monthly` and `yearly` reset with
 * their period; `random` and `blessed` accumulate until they are spent winning.
 *
 * A subscription is worth tickets — basic one monthly, VIP one monthly and one
 * yearly, advanced two of each — and that grant is idempotent per period, so it
 * can be run from a cron and from a button without anybody ending up with two
 * sets.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type DrawType = "random" | "monthly" | "yearly" | "blessed";

export const DRAWS: { key: DrawType; label: string; blurb: string; tint: string }[] = [
  { key: "monthly", label: "Monthly",  blurb: "Drawn once a month. Your plan includes entries.", tint: "#8fb2ff" },
  { key: "yearly",  label: "Yearly",   blurb: "Once a year, for the biggest prizes.",            tint: "#d9b775" },
  { key: "random",  label: "Random",   blurb: "Run whenever there is a reason to.",              tint: "#9adcc0" },
  { key: "blessed", label: "Blessed",  blurb: "Not earned. Given.",                              tint: "#c084fc" },
];

export const drawMeta = (k: DrawType) => DRAWS.find((d) => d.key === k) ?? DRAWS[0];

export interface TicketBalance { drawType: DrawType; periodStart: string | null; tickets: number }

export interface RafflePrize {
  id: string;
  drawType: DrawType;
  rank: number;
  label: string;
  description: string | null;
  kind: "points" | "coupon_percent" | "badge" | "module" | "alert_level" | "manual";
  config: Record<string, unknown>;
  active: boolean;
}

export interface RaffleDraw {
  id: string;
  drawType: DrawType;
  periodStart: string | null;
  prizeLabel: string;
  winnerName: string;
  winnerId: string | null;
  entrants: number;
  ticketsTotal: number;
  winnerTickets: number;
  fulfilment: string | null;
  note: string | null;
  drawnAt: string;
}

export interface TicketHolder {
  userId: string; name: string; email: string | null; tier: number;
  monthly: number; yearly: number; random: number; blessed: number; total: number;
}

export async function myTickets(): Promise<TicketBalance[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc("my_raffle_tickets");
  if (error) { logger.error("myTickets failed", { scope: "raffle", error }); return []; }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    drawType: r.draw_type as DrawType,
    periodStart: (r.period_start as string | null) ?? null,
    tickets: Number(r.tickets ?? 0),
  }));
}

export async function listPrizes(): Promise<RafflePrize[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("raffle_prizes").select("*").order("draw_type").order("rank");
  if (error) { logger.error("listPrizes failed", { scope: "raffle", error }); return []; }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), drawType: r.draw_type as DrawType, rank: Number(r.rank),
    label: String(r.label), description: (r.description as string | null) ?? null,
    kind: r.kind as RafflePrize["kind"],
    config: (r.config as Record<string, unknown>) ?? {},
    active: r.active === true,
  }));
}

export async function listDraws(limit = 25): Promise<RaffleDraw[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("raffle_draws").select("*").order("drawn_at", { ascending: false }).limit(limit);
  if (error) { logger.error("listDraws failed", { scope: "raffle", error }); return []; }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), drawType: r.draw_type as DrawType,
    periodStart: (r.period_start as string | null) ?? null,
    prizeLabel: String(r.prize_label), winnerName: String(r.winner_name),
    winnerId: (r.winner_id as string | null) ?? null,
    entrants: Number(r.entrants ?? 0), ticketsTotal: Number(r.tickets_total ?? 0),
    winnerTickets: Number(r.winner_tickets ?? 0),
    fulfilment: (r.fulfilment as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    drawnAt: String(r.drawn_at),
  }));
}

export async function ticketOverview(): Promise<TicketHolder[]> {
  const { data, error } = await supabase.rpc("admin_raffle_overview");
  if (error) { logger.error("ticketOverview failed", { scope: "raffle", error }); return []; }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: String(r.user_id), name: String(r.name ?? "Member"),
    email: (r.email as string | null) ?? null, tier: Number(r.tier ?? 1),
    monthly: Number(r.monthly ?? 0), yearly: Number(r.yearly ?? 0),
    random: Number(r.random ?? 0), blessed: Number(r.blessed ?? 0),
    total: Number(r.total ?? 0),
  }));
}

export async function grantTickets(
  userIds: string[], drawType: DrawType, qty: number, reason: string,
): Promise<{ ok: boolean; granted?: number; error?: string }> {
  if (userIds.length === 0 || qty === 0) return { ok: true, granted: 0 };
  const { data, error } = await supabase.rpc("admin_grant_tickets", {
    p_users: userIds, p_draw_type: drawType, p_qty: qty, p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, granted: Number(data ?? 0) };
}

/** One draw, by id — how the machine learns who the database picked. */
export async function getDraw(id: string): Promise<RaffleDraw | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.from("raffle_draws").select("*").eq("id", id).maybeSingle();
  if (error || !data) { logger.error("getDraw failed", { scope: "raffle", error }); return null; }
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id), drawType: r.draw_type as DrawType,
    periodStart: (r.period_start as string | null) ?? null,
    prizeLabel: String(r.prize_label), winnerName: String(r.winner_name),
    winnerId: (r.winner_id as string | null) ?? null,
    entrants: Number(r.entrants ?? 0), ticketsTotal: Number(r.tickets_total ?? 0),
    winnerTickets: Number(r.winner_tickets ?? 0),
    fulfilment: (r.fulfilment as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    drawnAt: String(r.drawn_at),
  };
}

export async function runRaffle(
  drawType: DrawType, prizeId: string, note?: string,
): Promise<{ ok: boolean; drawId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("admin_run_raffle", {
    p_draw_type: drawType, p_prize: prizeId, p_note: note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, drawId: String(data) };
}

/** Hand out what everybody's plan owes them for this period. Safe to repeat. */
export async function syncSubscriptionTickets(): Promise<{ ok: boolean; granted?: number; error?: string }> {
  const { data, error } = await supabase.rpc("sync_subscription_tickets");
  if (error) return { ok: false, error: error.message };
  return { ok: true, granted: Number(data ?? 0) };
}

/**
 * The period a draw run *now* would belong to — the client-side twin of the
 * database's `raffle_period()`. Monthly and yearly reset with their period;
 * random and blessed genuinely have no period and accumulate.
 */
export function currentPeriod(drawType: DrawType): string | null {
  const now = new Date();
  if (drawType === "monthly") {
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  if (drawType === "yearly") return `${now.getUTCFullYear()}-01-01`;
  return null;
}

/** "September 2026" / "2026", from a stored period start. */
export function periodLabel(drawType: DrawType, start: string | null): string {
  if (!start) return "Open pool";
  const d = new Date(`${start}T00:00:00Z`);
  return drawType === "yearly"
    ? String(d.getUTCFullYear())
    : d.toLocaleString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}
