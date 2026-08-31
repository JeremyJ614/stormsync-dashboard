/**
 * Billing / monetization admin data layer (Phase A).
 *
 * Config that's "one row per setting" (tier prices, lifetime deals, tier
 * bundles/choosable counts) lives in `billing_config` (key/value, public-read,
 * admin-write) — same pattern as `app_config.loyalty_rules`.
 *
 * Module add-on prices and coupons are real tables with full CRUD, gated by
 * `private.is_admin()` RLS. Coupons are never publicly selectable — shoppers
 * validate a code through the `validate_coupon` RPC, which only ever returns
 * the discount info for a code that is actually valid right now.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";
import type { MutationResult } from "./userAdmin";

export type TierKey = "free" | "basic" | "vip" | "advanced";
export const TIER_KEYS: TierKey[] = ["free", "basic", "vip", "advanced"];

/** profiles.tier is stored as 1|2|3|4 (see hooks/useAuth.ts `Tier`). */
export const TIER_TO_NUMBER: Record<TierKey, 1 | 2 | 3 | 4> = { free: 1, basic: 2, vip: 3, advanced: 4 };
export const NUMBER_TO_TIER: Record<1 | 2 | 3 | 4, TierKey> = { 1: "free", 2: "basic", 3: "vip", 4: "advanced" };

// ── Tier pricing ─────────────────────────────────────────────────────────────
export interface TierPrice { monthly: number; yearly: number }
export type TierPricing = Record<TierKey, TierPrice>;

export const DEFAULT_TIER_PRICING: TierPricing = {
  free: { monthly: 0, yearly: 0 },
  basic: { monthly: 2.99, yearly: 24.99 },
  vip: { monthly: 4.99, yearly: 39.99 },
  advanced: { monthly: 7.99, yearly: 50.0 },
};

// ── Lifetime deals ───────────────────────────────────────────────────────────
export interface LifetimeDeal { price: number; label: string; active: boolean; choosableCount?: number }
export interface LifetimeDeals { basic_lifetime: LifetimeDeal; vip_lifetime: LifetimeDeal; advanced_lifetime: LifetimeDeal }

export const DEFAULT_LIFETIME_DEALS: LifetimeDeals = {
  basic_lifetime: { price: 29.99, label: "Basic Lifetime — the Basic free bundle + 10 modules of your choice, forever", active: true, choosableCount: 10 },
  vip_lifetime: { price: 49.99, label: "VIP Lifetime — the VIP bundle + 20 modules of your choice, forever", active: false, choosableCount: 20 },
  advanced_lifetime: { price: 44.99, label: "Advanced Lifetime — every module ever made, plus early access to anything new, forever", active: true, choosableCount: 0 },
};

// ── Tier module config (bundled-free lists + choosable counts) ──────────────
export interface TierModuleConfig {
  choosableCount: Record<TierKey, number>;
  /** Fixed bundled-free module ids, per sellable tier.
   *  Free is in here now: it always had a bundle in the database — /dashboard —
   *  but the admin panel could not see or change it, so the one tier every new
   *  member lands on was the one tier nobody could configure.
   *  Advanced gets literally everything, so it isn't tracked here. */
  bundledModules: { free: string[]; basic: string[]; vip: string[] };
}

export const DEFAULT_TIER_MODULE_CONFIG: TierModuleConfig = {
  choosableCount: { free: 1, basic: 6, vip: 15, advanced: 0 },
  bundledModules: {
    free: ["/dashboard"],
    basic: ["/dashboard", "/forecast", "/discussion", "/spc", "/warnings", "/timing"],
    vip: ["/dashboard", "/forecast", "/discussion", "/spc", "/warnings", "/timing", "/ingredients", "/swti", "/comparator", "/thunder", "/rotation"],
  },
};

// ── generic billing_config key/value helpers ─────────────────────────────────
async function getConfigValue<T>(key: string, fallback: T): Promise<T> {
  if (!isSupabaseConfigured) return fallback;
  const { data, error } = await supabase.from("billing_config").select("value").eq("key", key).maybeSingle();
  if (error || !data?.value) return fallback;
  return data.value as T;
}

async function saveConfigValue(key: string, value: unknown): Promise<MutationResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Backend not configured" };
  const { error } = await supabase.from("billing_config").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
  if (error) { logger.error(`saveConfigValue(${key}) failed`, { scope: "billingAdmin", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function getTierPricing(): Promise<TierPricing> {
  return getConfigValue("tier_pricing", DEFAULT_TIER_PRICING);
}
export async function saveTierPricing(v: TierPricing): Promise<MutationResult> {
  return saveConfigValue("tier_pricing", v);
}

export async function getLifetimeDeals(): Promise<LifetimeDeals> {
  return getConfigValue("lifetime_deals", DEFAULT_LIFETIME_DEALS);
}
export async function saveLifetimeDeals(v: LifetimeDeals): Promise<MutationResult> {
  return saveConfigValue("lifetime_deals", v);
}

export async function getTierModuleConfig(): Promise<TierModuleConfig> {
  const [choosableCount, bundledModules] = await Promise.all([
    getConfigValue("tier_choosable_count", DEFAULT_TIER_MODULE_CONFIG.choosableCount),
    getConfigValue("tier_bundled_modules", DEFAULT_TIER_MODULE_CONFIG.bundledModules),
  ]);
  return { choosableCount, bundledModules };
}
export async function saveTierModuleConfig(v: TierModuleConfig): Promise<MutationResult> {
  // Merge rather than replace. `tier_bundled_modules` carries an `advanced` key
  // this editor does not show (Advanced gets everything, so there is nothing to
  // choose), and a straight overwrite would delete it.
  const existing = await getConfigValue<Record<string, string[]>>("tier_bundled_modules", {});
  const [r1, r2] = await Promise.all([
    saveConfigValue("tier_choosable_count", v.choosableCount),
    saveConfigValue("tier_bundled_modules", { ...existing, ...v.bundledModules }),
  ]);
  return [r1, r2].find(r => !r.ok) ?? { ok: true };
}

// ── Module add-on prices (real table, full CRUD) ─────────────────────────────
export interface ModuleAddonPrice {
  moduleId: string;
  label: string;
  freePrice: number;
  basicPrice: number;
  vipPrice: number;
}

interface ModuleAddonPriceRow {
  module_id: string; label: string;
  free_price: number; basic_price: number; vip_price: number;
}

function rowToAddon(r: ModuleAddonPriceRow): ModuleAddonPrice {
  return { moduleId: r.module_id, label: r.label, freePrice: Number(r.free_price), basicPrice: Number(r.basic_price), vipPrice: Number(r.vip_price) };
}

export async function listModuleAddonPrices(): Promise<ModuleAddonPrice[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("module_addon_prices").select("module_id,label,free_price,basic_price,vip_price").order("label");
  if (error) { logger.error("listModuleAddonPrices failed", { scope: "billingAdmin", error }); return []; }
  return (data as ModuleAddonPriceRow[]).map(rowToAddon);
}

function validateAddonPrice(p: ModuleAddonPrice): string | null {
  if (!p.moduleId.trim()) return "Module ID required (e.g. /ingredients)";
  if (!p.label.trim()) return "Label required";
  if ([p.freePrice, p.basicPrice, p.vipPrice].some(n => n < 0)) return "Prices can't be negative";
  return null;
}

/** Creates a new priced module, or updates an existing one (by moduleId). */
export async function upsertModuleAddonPrice(p: ModuleAddonPrice): Promise<MutationResult> {
  const invalid = validateAddonPrice(p);
  if (invalid) return { ok: false, error: invalid };
  const { error } = await supabase.from("module_addon_prices").upsert({
    module_id: p.moduleId.trim(),
    label: p.label.trim(),
    free_price: p.freePrice,
    basic_price: p.basicPrice,
    vip_price: p.vipPrice,
    updated_at: new Date().toISOString(),
  });
  if (error) { logger.error("upsertModuleAddonPrice failed", { scope: "billingAdmin", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function deleteModuleAddonPrice(moduleId: string): Promise<MutationResult> {
  const { error } = await supabase.from("module_addon_prices").delete().eq("module_id", moduleId);
  if (error) { logger.error("deleteModuleAddonPrice failed", { scope: "billingAdmin", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

// ── Coupons (real table, full CRUD) ───────────────────────────────────────────
export type CouponKind = "percent_off" | "flat_off" | "first_month_percent_off" | "first_month_flat_off";

export interface Coupon {
  code: string;
  kind: CouponKind;
  value: number;
  active: boolean;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null; // ISO date, or null = never expires
  appliesToTiers: TierKey[]; // recurring tiers only — lifetime deals never discounted
}

interface CouponRow {
  code: string; kind: CouponKind; value: number; active: boolean;
  max_uses: number | null; used_count: number; expires_at: string | null; applies_to_tiers: TierKey[];
}

function rowToCoupon(r: CouponRow): Coupon {
  return { code: r.code, kind: r.kind, value: Number(r.value), active: r.active, maxUses: r.max_uses, usedCount: r.used_count, expiresAt: r.expires_at, appliesToTiers: r.applies_to_tiers };
}

export const COUPON_KIND_LABELS: Record<CouponKind, string> = {
  percent_off: "% off, every billing cycle",
  flat_off: "$ off, every billing cycle",
  first_month_percent_off: "% off first month only",
  first_month_flat_off: "$ off first month only",
};

export async function listCoupons(): Promise<Coupon[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
  if (error) { logger.error("listCoupons failed", { scope: "billingAdmin", error }); return []; }
  return (data as CouponRow[]).map(rowToCoupon);
}

function validateCoupon(c: Omit<Coupon, "usedCount">): string | null {
  if (!c.code.trim()) return "Code required";
  if (c.value <= 0) return "Value must be greater than 0";
  if ((c.kind === "percent_off" || c.kind === "first_month_percent_off") && c.value > 100) return "Percent can't exceed 100";
  if (!c.appliesToTiers.length) return "Pick at least one tier this code applies to";
  if (c.maxUses !== null && c.maxUses <= 0) return "Max uses must be positive (or leave blank for unlimited)";
  return null;
}

export async function createCoupon(c: Omit<Coupon, "usedCount">): Promise<MutationResult> {
  const invalid = validateCoupon(c);
  if (invalid) return { ok: false, error: invalid };
  const { error } = await supabase.from("coupons").insert({
    code: c.code.trim().toUpperCase(), kind: c.kind, value: c.value, active: c.active,
    max_uses: c.maxUses, expires_at: c.expiresAt, applies_to_tiers: c.appliesToTiers,
  });
  if (error) {
    const msg = error.code === "23505" ? `A coupon with code "${c.code.toUpperCase()}" already exists` : error.message;
    logger.error("createCoupon failed", { scope: "billingAdmin", error });
    return { ok: false, error: msg };
  }
  return { ok: true };
}

export async function updateCoupon(code: string, patch: Omit<Coupon, "code" | "usedCount">): Promise<MutationResult> {
  const invalid = validateCoupon({ ...patch, code });
  if (invalid) return { ok: false, error: invalid };
  const { error } = await supabase.from("coupons").update({
    kind: patch.kind, value: patch.value, active: patch.active,
    max_uses: patch.maxUses, expires_at: patch.expiresAt, applies_to_tiers: patch.appliesToTiers,
  }).eq("code", code);
  if (error) { logger.error("updateCoupon failed", { scope: "billingAdmin", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function deleteCoupon(code: string): Promise<MutationResult> {
  const { error } = await supabase.from("coupons").delete().eq("code", code);
  if (error) { logger.error("deleteCoupon failed", { scope: "billingAdmin", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

// ── Promo counter ─────────────────────────────────────────────────────────────
export interface PromoCounter { claimed: number; total: number; active: boolean }

// The counter moved into `promos` when the other three offers arrived, so that
// every promotion has one home and one switch. The old single-row table is left
// in place rather than dropped — it costs nothing and it is the only copy of
// what the numbers were before the move.
export async function getPromoCounter(): Promise<PromoCounter> {
  if (!isSupabaseConfigured) return { claimed: 0, total: 25, active: true };
  const { data, error } = await supabase.from("promos").select("active,config").eq("key", "free_advanced_25").maybeSingle();
  if (error || !data) return { claimed: 0, total: 25, active: true };
  const cfg = (data.config ?? {}) as { claimed?: number; total?: number };
  return { claimed: Number(cfg.claimed ?? 0), total: Number(cfg.total ?? 25), active: Boolean(data.active) };
}

export async function savePromoCounter(v: PromoCounter): Promise<MutationResult> {
  const { error } = await supabase.from("promos")
    .update({ active: v.active, config: { claimed: v.claimed, total: v.total }, updated_at: new Date().toISOString() })
    .eq("key", "free_advanced_25");
  if (error) { logger.error("savePromoCounter failed", { scope: "billingAdmin", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}
