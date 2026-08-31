/**
 * Promotions.
 *
 * Every offer is a row in `promos` with its own switch, rather than a table of
 * its own — so "what is running right now?" is one query and one screen, and
 * adding a fourth offer does not mean adding a fourth place to look.
 *
 * A promo's `config` is deliberately loose jsonb: what a referral ladder needs
 * to describe itself has nothing in common with what a "first 25 signups"
 * counter needs, and forcing both into one column shape would flatten both.
 * The typed accessors below are the contract each promo's own code relies on.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";
import type { MutationResult } from "./userAdmin";

export type PromoKey = "free_advanced_25" | "addon_duo" | "paid_25" | "referral_ladder";

export interface Promo {
  key: string;
  label: string;
  blurb: string | null;
  active: boolean;
  config: Record<string, unknown>;
}

/** A rung of the referral ladder. Editable in the admin panel, so read defensively. */
export interface ReferralRung {
  rank: number;
  label: string;
  percentOff: number;
  addons: number;
  addonMonths: number;
  freeMonths: number;
  tier: string | null;
}

export async function listPromos(): Promise<Promo[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("promos").select("key,label,blurb,active,config").order("key");
  if (error) { logger.error("listPromos failed", { scope: "promos", error }); return []; }
  return (data ?? []) as Promo[];
}

export async function savePromo(p: Promo): Promise<MutationResult> {
  const { error } = await supabase.from("promos").update({
    label: p.label, blurb: p.blurb, active: p.active, config: p.config,
    updated_at: new Date().toISOString(),
  }).eq("key", p.key);
  if (error) { logger.error("savePromo failed", { scope: "promos", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

/** Just the switch — the common case, and worth not making the caller round-trip the whole row. */
export async function setPromoActive(key: string, active: boolean): Promise<MutationResult> {
  const { error } = await supabase.from("promos").update({ active, updated_at: new Date().toISOString() }).eq("key", key);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export function rungsOf(p: Promo | undefined): ReferralRung[] {
  return parseRungs(p?.config?.rungs);
}

/** The ladder is admin-editable jsonb, so every field is read defensively. */
function parseRungs(raw: unknown): ReferralRung[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      rank: Number(o.rank ?? 0),
      label: String(o.label ?? ""),
      percentOff: Number(o.percentOff ?? 0),
      addons: Number(o.addons ?? 0),
      addonMonths: Number(o.addonMonths ?? 0),
      freeMonths: Number(o.freeMonths ?? 0),
      tier: (o.tier as string | null) ?? null,
    };
  }).sort((a, b) => a.rank - b.rank);
}

// ─── referrals, for the member ───────────────────────────────────────────────
export interface ReferralSummary {
  ok: boolean;
  active: boolean;
  code: string | null;
  pending: number;
  converted: number;
  rungs: ReferralRung[];
  referredBy: string | null;
  rewards: { rank: number; reward: ReferralRung | null; fulfilled: boolean }[];
}

const EMPTY_SUMMARY: ReferralSummary = {
  ok: false, active: false, code: null, pending: 0, converted: 0,
  rungs: [], referredBy: null, rewards: [],
};

export async function myReferralSummary(): Promise<ReferralSummary> {
  if (!isSupabaseConfigured) return EMPTY_SUMMARY;
  const { data, error } = await supabase.rpc("my_referral_summary");
  if (error || !data) return EMPTY_SUMMARY;
  const d = data as Record<string, unknown>;
  return {
    ok: Boolean(d.ok),
    active: Boolean(d.active),
    code: (d.code as string | null) ?? null,
    pending: Number(d.pending ?? 0),
    converted: Number(d.converted ?? 0),
    rungs: parseRungs(d.rungs),
    referredBy: (d.referred_by as string | null) ?? null,
    rewards: Array.isArray(d.rewards)
      ? (d.rewards as Record<string, unknown>[]).map((r) => ({
          rank: Number(r.rank ?? 0),
          reward: (r.reward as ReferralRung | null) ?? null,
          fulfilled: Boolean(r.fulfilled),
        }))
      : [],
  };
}

/** Mint this member's code, or return the one they already have. */
export async function myReferralCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_referral_code");
  if (error) { logger.error("myReferralCode failed", { scope: "promos", error }); return null; }
  return (data as string | null) ?? null;
}

export async function redeemReferralCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("redeem_referral_code", { p_code: code.trim() });
  if (error) return { ok: false, error: error.message };
  const d = (data ?? {}) as { ok?: boolean; error?: string };
  return d.ok ? { ok: true } : { ok: false, error: d.error ?? "Could not use that code." };
}

// ─── referrals, for the owner ────────────────────────────────────────────────
export interface ReferralOverviewRow {
  referrerId: string; name: string; email: string;
  pending: number; converted: number; unfulfilled: number;
}

export async function adminReferralOverview(): Promise<ReferralOverviewRow[]> {
  const { data, error } = await supabase.rpc("admin_referral_overview");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    referrerId: String(r.referrer_id),
    name: (r.name as string) ?? "",
    email: (r.email as string) ?? "",
    pending: Number(r.pending ?? 0),
    converted: Number(r.converted ?? 0),
    unfulfilled: Number(r.unfulfilled ?? 0),
  }));
}

export interface ReferralRow {
  id: string; referrerId: string; refereeId: string; code: string;
  createdAt: string; convertedAt: string | null; rank: number | null;
  reward: ReferralRung | null; fulfilledAt: string | null;
}

/** Every referral, newest first. Admin-readable by policy. */
export async function adminReferrals(): Promise<ReferralRow[]> {
  const { data, error } = await supabase
    .from("referral_redemptions")
    .select("id,referrer_id,referee_id,code,created_at,converted_at,rank,reward,fulfilled_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    referrerId: String(r.referrer_id),
    refereeId: String(r.referee_id),
    code: String(r.code),
    createdAt: String(r.created_at),
    convertedAt: (r.converted_at as string | null) ?? null,
    rank: r.rank == null ? null : Number(r.rank),
    reward: (r.reward as ReferralRung | null) ?? null,
    fulfilledAt: (r.fulfilled_at as string | null) ?? null,
  }));
}

export async function fulfilReferral(id: string, note?: string): Promise<MutationResult> {
  const { error } = await supabase.rpc("admin_fulfil_referral", { p_id: id, p_note: note ?? null });
  return error ? { ok: false, error: error.message } : { ok: true };
}
