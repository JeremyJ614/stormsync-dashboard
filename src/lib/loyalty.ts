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

export interface EarnRule {
  /** Stored as `loyalty_events.kind`. */
  key: string;
  label: string;
  points: number;
}

export interface LoyaltyRules {
  /** Fully admin-editable list of ways to earn points (referrals, renewals, anything). */
  earn_rules: EarnRule[];
  // Forecast Game placement points (the Storm Engine reads these by key at month rollup).
  game_win_1st: number;
  game_win_2nd: number;
  game_win_3rd: number;
  game_win_4th: number;
  prizes: { points: number; prize: string }[];
}

export const DEFAULT_RULES: LoyaltyRules = {
  earn_rules: [
    { key: "referral", label: "Referral converted", points: 100 },
    { key: "renewal", label: "Membership renewal", points: 50 },
    { key: "bonus", label: "Bonus", points: 0 },
    { key: "adjustment", label: "Manual adjustment", points: 0 },
  ],
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

// Game-win events (engine-written) + a humanized fallback. Custom earn-rule
// kinds resolve via the rules' earn_rules list (pass `rules` to look them up).
const STATIC_KIND_LABELS: Record<string, string> = {
  game_win: "Forecast Game win",
  game_win_1st: "Forecast Game — 1st place", game_win_2nd: "Forecast Game — 2nd place",
  game_win_3rd: "Forecast Game — 3rd place", game_win_4th: "Forecast Game — 4th place",
};
export function loyaltyKindLabel(kind: string, rules?: LoyaltyRules): string {
  const r = rules?.earn_rules.find((e) => e.key === kind);
  if (r) return r.label;
  return STATIC_KIND_LABELS[kind] ?? kind.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Slugify a label into a stable earn-rule key. */
export function slugifyEarnKey(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "rule";
}

export async function getLoyaltyRules(): Promise<LoyaltyRules> {
  if (!isSupabaseConfigured) return DEFAULT_RULES;
  const { data, error } = await supabase.from("app_config").select("value").eq("key", "loyalty_rules").maybeSingle();
  if (error || !data?.value) return DEFAULT_RULES;
  const v = data.value as Partial<LoyaltyRules>;
  return {
    ...DEFAULT_RULES,
    ...v,
    earn_rules: Array.isArray(v.earn_rules) && v.earn_rules.length ? v.earn_rules : DEFAULT_RULES.earn_rules,
    prizes: Array.isArray(v.prizes) ? v.prizes : DEFAULT_RULES.prizes,
  };
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
