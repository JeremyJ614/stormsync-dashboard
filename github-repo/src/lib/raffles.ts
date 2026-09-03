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
  kind: "points" | "coupon_percent" | "badge" | "module" | "alert_level" | "manual" | "effects";
  config: Record<string, unknown>;
  active: boolean;
  /**
   * Relative chance of being drawn, within its draw type. Not a percentage:
   * percentages have to sum to 100, so adding one prize would mean editing
   * every other one. The odds are computed from these and shown as percentages
   * where they are edited.
   */
  weight: number;
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
  // `my_raffle_tickets` is granted to `authenticated` and not to `anon`, and
  // the Raffles page is deliberately readable signed out — every draw and every
  // prize, ticket or no ticket. Asking anyway would answer 401 and log an error
  // on a page that is working exactly as intended. Nobody signed out holds a
  // ticket, so the honest answer is an empty list without the round trip.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
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
    weight: Number(r.weight ?? 1),
  }));
}

/** What each prize's chance actually is, computed by the same code the draw uses. */
export interface PrizeOdds { id: string; label: string; rank: number; weight: number; odds: number }

export async function prizeOdds(drawType: DrawType): Promise<PrizeOdds[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc("raffle_prize_odds", { p_draw_type: drawType });
  if (error) { logger.error("prizeOdds failed", { scope: "raffle", error }); return []; }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), label: String(r.label), rank: Number(r.rank ?? 0),
    weight: Number(r.weight ?? 0), odds: Number(r.odds ?? 0),
  }));
}

export async function setPrizeWeight(id: string, weight: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("admin_set_prize_weight", { p_id: id, p_weight: weight });
  return error ? { ok: false, error: error.message } : { ok: true };
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

/**
 * Run a draw.
 *
 * `prizeId` is optional and normally omitted: the server draws the prize by
 * weight as well as the winner, so nobody — the owner included — knows what is
 * coming out. Naming one is still allowed for "draw the grand prize now".
 */
export async function runRaffle(
  drawType: DrawType, prizeId?: string | null, note?: string,
): Promise<{ ok: boolean; drawId?: string; error?: string }> {
  const { data, error } = await supabase.rpc("admin_run_raffle", {
    p_draw_type: drawType, p_prize: prizeId ?? null, p_note: note?.trim() || null,
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


// ─── the catalogue, the ledger, and the claiming ─────────────────────────────

/**
 * One prize as the members-facing module shows it.
 *
 * `odds` arrives already worked out, because the percentage of a prize depends
 * on every other prize in its draw and computing that on the client would mean
 * the number moving about as rows arrive.
 */
export interface CatalogueEntry {
  drawType: DrawType;
  rank: number;
  label: string;
  description: string | null;
  effects: RewardEffect[];
  weight: number;
  odds: number;
}

/** One thing a prize does. `else` is what to try when it cannot be given. */
export interface RewardEffect {
  t: string;
  n?: number;
  percent?: number;
  months?: number | null;
  months_from_membership?: boolean;
  ids?: string[];
  levels?: number[];
  steps?: number[];
  tier?: number;
  id?: string;
  each?: number;
  from_top?: number;
  below_rank?: number;
  slot?: string;
  draws?: string[];
  detail?: string;
  monthly?: number;
  yearly?: number;
  random?: number;
  blessed?: number;
  else?: RewardEffect;
}

export async function raffleCatalogue(): Promise<CatalogueEntry[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc("raffle_catalogue");
  if (error) { logger.error("raffleCatalogue failed", { scope: "raffles", error }); return []; }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    drawType: r.draw_type as DrawType,
    rank: Number(r.rank),
    label: String(r.label),
    description: (r.description as string | null) ?? null,
    effects: (((r.config as Record<string, unknown>)?.effects) as RewardEffect[]) ?? [],
    weight: Number(r.weight ?? 0),
    odds: Number(r.odds ?? 0),
  }));
}

/** Something a member has been given that is still playing out, or still theirs to take. */
export interface Benefit {
  id: string;
  kind: string;
  label: string;
  detail: string | null;
  config: Record<string, unknown>;
  status: "pending" | "active" | "claimable" | "spent" | "revoked";
  monthsTotal: number | null;
  monthsUsed: number;
  perpetual: boolean;
  couponCode: string | null;
  createdAt: string;
}

export async function myBenefits(): Promise<Benefit[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc("my_benefits");
  if (error) { logger.error("myBenefits failed", { scope: "raffles", error }); return []; }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    label: String(r.label),
    detail: (r.detail as string | null) ?? null,
    config: (r.config as Record<string, unknown>) ?? {},
    status: r.status as Benefit["status"],
    monthsTotal: r.months_total == null ? null : Number(r.months_total),
    monthsUsed: Number(r.months_used ?? 0),
    perpetual: r.perpetual === true,
    couponCode: (r.coupon_code as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}

export interface Leader { userId: string; display: string; points: number }

export async function pointsLeaders(top = 3): Promise<Leader[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc("points_leaders", { p_top: top });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: String(r.user_id), display: String(r.display), points: Number(r.points ?? 0),
  }));
}

interface ClaimResult { ok: boolean; error?: string; taken?: number; picked?: string[] }

function claimed(data: unknown, error: { message: string } | null): ClaimResult {
  if (error) return { ok: false, error: error.message };
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    ok: d.ok === true,
    error: (d.error as string) ?? undefined,
    taken: d.taken == null ? undefined : Number(d.taken),
    picked: (d.picked as string[]) ?? undefined,
  };
}

export async function claimModuleCredit(benefitId: string, modules: string[]): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_module_credit",
    { p_benefit: benefitId, p_modules: modules });
  return claimed(data, error);
}

export async function claimPointsSteal(benefitId: string): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_points_steal", { p_benefit: benefitId });
  return claimed(data, error);
}

export async function claimPointsWipe(benefitId: string): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_points_wipe", { p_benefit: benefitId });
  return claimed(data, error);
}

export interface SimEntrant { name: string; tickets: number }
export interface SimResult {
  ok: boolean;
  error?: string;
  runs: number;
  ticketsTotal: number;
  first: { winner: string; prize: string } | null;
  winners: Record<string, number>;
  prizes: Record<string, number>;
}

/** A draw that changes nothing — for seeing what the odds actually do. */
export async function simulateRaffle(
  drawType: DrawType, entrants: SimEntrant[], runs: number,
): Promise<SimResult> {
  const empty: SimResult = { ok: false, runs: 0, ticketsTotal: 0, first: null, winners: {}, prizes: {} };
  const { data, error } = await supabase.rpc("admin_simulate_raffle",
    { p_draw_type: drawType, p_entrants: entrants, p_runs: runs });
  if (error) return { ...empty, error: error.message };
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok !== true) return { ...empty, error: (d.error as string) ?? "Could not run it." };
  return {
    ok: true,
    runs: Number(d.runs ?? 0),
    ticketsTotal: Number(d.tickets_total ?? 0),
    first: (d.first as SimResult["first"]) ?? null,
    winners: (d.winners as Record<string, number>) ?? {},
    prizes: (d.prizes as Record<string, number>) ?? {},
  };
}

/**
 * What an effect promises, in a sentence.
 *
 * The member-facing module shows this rather than the raw JSON, and the profile
 * shows it against what they hold. Written once so the two never disagree about
 * what a prize was.
 */
export function describeEffect(e: RewardEffect): string {
  const forHowLong = (m?: number | null) =>
    m == null ? "for life" : m === 1 ? "for one month" : `for ${m} months`;
  const tail = e.else ? ` — or, if you already have it, ${describeEffect(e.else)}` : "";

  switch (e.t) {
    case "points":       return `${(e.n ?? 0).toLocaleString()} points${tail}`;
    case "points_monthly":
      return `${(e.n ?? 0).toLocaleString()} points at the start of each of ${e.months} months${tail}`;
    case "tickets": {
      const bits = (["monthly", "yearly", "random", "blessed"] as const)
        .filter((k) => (e[k] ?? 0) > 0)
        .map((k) => `${e[k]} ${k}`);
      return `${bits.join(", ")} ticket${bits.length === 1 && e[bits[0].split(" ")[1] as "monthly"] === 1 ? "" : "s"}${tail}`;
    }
    case "discount":
      return e.months_from_membership
        ? `${e.percent}% off for every month you have been a member${tail}`
        : `${e.percent}% off ${forHowLong(e.months)}${tail}`;
    case "free_months":
      return e.months == null ? `free, for life${tail}`
        : e.months === 1 ? `one month free${tail}` : `${e.months} months free${tail}`;
    case "ladder":
      return `${e.steps?.[0]}% off, stepping down each month over ${e.steps?.length} months${tail}`;
    case "tier":
      return `Advanced tier ${forHowLong(e.months)}${tail}`;
    case "modules":
      return `${(e.ids ?? []).length} named module${(e.ids ?? []).length === 1 ? "" : "s"} ${forHowLong(e.months)}${tail}`;
    case "module_credit":
      return `${e.n} module${e.n === 1 ? "" : "s"} of your choosing, ${forHowLong(e.months)}${tail}`;
    case "alert_levels":
      return `alert level${(e.levels ?? []).length === 1 ? "" : "s"} ${(e.levels ?? []).join(" and ")}${tail}`;
    case "badge":         return `an ultra-rare badge${tail}`;
    case "points_steal":  return `take ${e.each?.toLocaleString()} points from each of the top ${e.from_top}${tail}`;
    case "points_wipe":   return `clear everyone ranked ${e.below_rank} and below, and take the lot${tail}`;
    case "engraving":     return e.slot === "blessed"
      ? "the one blessed name at the top of the wall" : "your name engraved on the wall";
    case "beta_access":   return `early access to everything we launch ${forHowLong(e.months)}${tail}`;
    case "referral_gift": return e.detail ?? "a referral code that gifts the same thing";
    case "extra_draw":    return "you draw the prizes yourself";
    case "manual":        return e.detail ?? "handed over personally";
    default:              return e.t;
  }
}
