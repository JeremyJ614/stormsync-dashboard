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

/**
 * What a reward actually does, in terms the database can carry out.
 *
 * These are the effects `apply_reward_effects` understands. A reward is a
 * composition of them, which is why thirty-odd rewards need no new code: a new
 * one is a new combination, not a new branch.
 */
export interface RewardEffects {
  /** Mints a personal single-use coupon. */
  percentOff?: number;
  flatOff?: number;
  firstMonthOnly?: boolean;
  couponDays?: number;
  /** A 100%-off coupon usable this many times. */
  freeMonths?: number;
  /** N cheapest paid modules they do not already hold. */
  addons?: number;
  /** …or exactly these. */
  addonModules?: string[];
  /** 1-5. Additive with anything already held. */
  alertLevel?: number;
  /** Raised, never lowered. Accepts 1-4 or the tier's name. */
  tier?: number | string;
  points?: number;
  raffleTickets?: number;
  raffleDrawType?: "monthly" | "yearly";
  badge?: string;
  /** Opt out of automation for this rung: record it and leave it for a person. */
  manual?: boolean;
}

/** One reward the ladder can pay. Stored in the promo's own config. */
export interface RewardCatalogEntry {
  key: string;
  label: string;
  group: string;
  effects: RewardEffects;
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
  /** Which catalogue entry this rung was built from, if any. */
  catalog?: string;
  /** What it grants. The rung carries its own copy so editing the catalogue
      cannot silently change what somebody was already promised. */
  effects?: RewardEffects;
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
      catalog: typeof o.catalog === "string" ? o.catalog : undefined,
      effects: (o.effects && typeof o.effects === "object" ? o.effects as RewardEffects : undefined),
    };
  }).sort((a, b) => a.rank - b.rank);
}

/** The reward catalogue, read defensively — it is admin-editable jsonb. */
export function rewardCatalog(p: Promo | undefined): RewardCatalogEntry[] {
  const raw = p?.config?.catalog;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const o = e as Record<string, unknown>;
    const key = String(o.key ?? "");
    if (!key) return [];
    return [{
      key,
      label: String(o.label ?? key),
      group: String(o.group ?? "Other"),
      effects: (o.effects && typeof o.effects === "object" ? o.effects as RewardEffects : {}),
    }];
  });
}

/**
 * Put a catalogue reward on a rung.
 *
 * The rung takes a copy of the reward's effects rather than a reference, so a
 * later edit to the catalogue cannot retroactively change what a rung pays. The
 * legacy `percentOff`/`addons`/`freeMonths`/`tier` fields are kept in step
 * because the member-facing ladder still reads them, and a rung that displayed
 * one thing while granting another would be worse than either.
 */
export function applyCatalogToRung(rung: ReferralRung, entry: RewardCatalogEntry): ReferralRung {
  const e = entry.effects;
  return {
    ...rung,
    label: entry.label,
    catalog: entry.key,
    effects: { ...e },
    percentOff: Number(e.percentOff ?? (e.freeMonths ? 100 : 0)),
    addons: Number(e.addons ?? (Array.isArray(e.addonModules) ? e.addonModules.length : 0)),
    addonMonths: rung.addonMonths || 2,
    freeMonths: Number(e.freeMonths ?? 0),
    tier: e.tier == null ? null : String(e.tier),
  };
}

/** Human summary of what a set of effects does. Used in the picker and the ladder. */
export function describeEffects(e: RewardEffects | undefined): string[] {
  if (!e) return [];
  const out: string[] = [];
  if (e.percentOff) out.push(`${e.percentOff}% off${e.firstMonthOnly ? " a first month" : ""}`);
  if (e.flatOff) out.push(`$${e.flatOff} off`);
  if (e.freeMonths) out.push(`${e.freeMonths} month${e.freeMonths === 1 ? "" : "s"} free`);
  if (Array.isArray(e.addonModules) && e.addonModules.length) out.push(`modules ${e.addonModules.join(", ")}`);
  else if (e.addons) out.push(`${e.addons} add-on${e.addons === 1 ? "" : "s"}`);
  if (e.alertLevel) out.push(`alert level ${e.alertLevel}`);
  if (e.tier) out.push(`tier → ${e.tier}`);
  if (e.points) out.push(`${e.points.toLocaleString()} points`);
  if (e.raffleTickets) out.push(`${e.raffleTickets} ${e.raffleDrawType ?? "monthly"} ticket${e.raffleTickets === 1 ? "" : "s"}`);
  if (e.badge) out.push(`badge ${e.badge}`);
  if (e.manual) out.push("fulfilled by hand");
  return out;
}

/** Save just the ladder's rungs, leaving the rest of the promo config alone. */
export async function saveReferralRungs(promo: Promo, rungs: ReferralRung[]): Promise<MutationResult> {
  const ordered = rungs.map((r, i) => ({ ...r, rank: i + 1 }));
  return savePromo({ ...promo, config: { ...promo.config, rungs: ordered } });
}

/** Save an edited catalogue. */
export async function saveRewardCatalog(promo: Promo, catalog: RewardCatalogEntry[]): Promise<MutationResult> {
  return savePromo({ ...promo, config: { ...promo.config, catalog } });
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
