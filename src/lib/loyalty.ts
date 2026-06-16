/**
 * Loyalty economy (U-21).
 *
 * Points are a real ledger: each award is a row in `public.loyalty_events`
 * (members read their own; admins write). The point values and prize ladder are
 * admin-configurable in `app_config.loyalty_rules` (public-readable). A member's
 * balance is the sum of their ledger rows.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export interface LoyaltyRules {
  referral_converted: number;
  membership_renewal: number;
  game_win_1st: number;
  game_win_2nd: number;
  game_win_3rd: number;
  game_win_4th: number;
  prizes: { points: number; prize: string }[];
}

export const DEFAULT_RULES: LoyaltyRules = {
  referral_converted: 100,
  membership_renewal: 50,
  game_win_1st: 35, game_win_2nd: 25, game_win_3rd: 15, game_win_4th: 10,
  prizes: [
    { points: 500, prize: "10% off one month" },
    { points: 1200, prize: "25% off one month" },
    { points: 2500, prize: "50% off one month" },
    { points: 5000, prize: "One free month" },
  ],
};

export interface LoyaltyEvent {
  id: string;
  kind: string;
  points: number;
  note: string | null;
  createdAt: string;
}

const KIND_LABELS: Record<string, string> = {
  referral: "Referral converted",
  referral_converted: "Referral converted",
  renewal: "Membership renewal",
  membership_renewal: "Membership renewal",
  game_win: "Forecast Game win",
  bonus: "Bonus",
  adjustment: "Adjustment",
};
export const loyaltyKindLabel = (kind: string) => KIND_LABELS[kind] ?? kind.replace(/[_-]+/g, " ");

export async function getLoyaltyRules(): Promise<LoyaltyRules> {
  if (!isSupabaseConfigured) return DEFAULT_RULES;
  const { data, error } = await supabase.from("app_config").select("value").eq("key", "loyalty_rules").maybeSingle();
  if (error || !data?.value) return DEFAULT_RULES;
  return { ...DEFAULT_RULES, ...(data.value as Partial<LoyaltyRules>) };
}

export async function getMyLoyalty(): Promise<{ points: number; events: LoyaltyEvent[] }> {
  if (!isSupabaseConfigured) return { points: 0, events: [] };
  const { data, error } = await supabase
    .from("loyalty_events")
    .select("id,kind,points,note,created_at")
    .order("created_at", { ascending: false });
  if (error) { logger.error("getMyLoyalty failed", { scope: "loyalty", error }); return { points: 0, events: [] }; }
  const events = (data ?? []).map((r: { id: string; kind: string; points: number; note: string | null; created_at: string }) =>
    ({ id: r.id, kind: r.kind, points: r.points, note: r.note, createdAt: r.created_at }));
  return { points: events.reduce((s, e) => s + (e.points ?? 0), 0), events };
}

// ── Admin ───────────────────────────────────────────────────────────────────────
export async function saveLoyaltyRules(rules: LoyaltyRules): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("app_config").update({ value: rules }).eq("key", "loyalty_rules");
  if (error) { logger.error("saveLoyaltyRules failed", { scope: "loyalty", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function awardLoyaltyPoints(userId: string, kind: string, points: number, note?: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("loyalty_events").insert({ user_id: userId, kind, points, note: note ?? null });
  if (error) { logger.error("awardLoyaltyPoints failed", { scope: "loyalty", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

/** Total ledger points for an arbitrary user (admin view). */
export async function getUserLoyaltyTotal(userId: string): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const { data, error } = await supabase.from("loyalty_events").select("points").eq("user_id", userId);
  if (error) return 0;
  return (data ?? []).reduce((s: number, r: { points: number }) => s + (r.points ?? 0), 0);
}
