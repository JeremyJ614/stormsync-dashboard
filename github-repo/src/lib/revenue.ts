/**
 * What money is actually happening.
 *
 * The billing tab sets prices; this reads the ledger. The distinction that
 * matters most here — and the one a naive "tier count × tier price" dashboard
 * gets wrong — is between an account that is *paying* and an account that is
 * merely *on* a tier. Founding members, comped accounts and admins all sit on
 * Advanced without a card attached. Multiplying them by the list price produces
 * a confident, flattering, entirely fictional MRR.
 *
 * So revenue here means a subscription that is active and billed. Everything
 * else is reported next to it under its own honest heading: lifetime purchases
 * are one-time and never annualised into recurring, and comped accounts are
 * shown as forgone list value, clearly labelled as not income.
 */
import { supabase } from "./supabase";
import {
  getTierPricing, getLifetimeDeals, listModuleAddonPrices, listCoupons, type TierKey,
} from "./billingAdmin";

export interface BillingRow {
  id: string;
  name: string;
  email: string;
  tier: number;
  isAdmin: boolean;
  stripeCustomerId: string | null;
  billingType: string | null;
  subscriptionStatus: string | null;
  addonModules: string[];
  joinedAt: string;
}

interface Row {
  id: string; name: string; email: string; tier: number; is_admin: boolean;
  stripe_customer_id: string | null; billing_type: string | null;
  subscription_status: string | null; addon_modules: string[] | null; joined_at: string;
}

const TIER_KEY: Record<number, TierKey> = { 1: "free", 2: "basic", 3: "vip", 4: "advanced" };
// Capitalising the key gives "Vip", which looks like a typo rather than a tier.
const TIER_LABEL: Record<TierKey, string> = { free: "Free", basic: "Basic", vip: "VIP", advanced: "Advanced" };

export async function listBilling(): Promise<BillingRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,name,email,tier,is_admin,stripe_customer_id,billing_type,subscription_status,addon_modules,joined_at")
    .order("joined_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map((r) => ({
    id: r.id, name: r.name, email: r.email, tier: r.tier, isAdmin: r.is_admin,
    stripeCustomerId: r.stripe_customer_id,
    billingType: r.billing_type,
    subscriptionStatus: r.subscription_status,
    addonModules: r.addon_modules ?? [],
    joinedAt: r.joined_at,
  }));
}

export interface TierSlice {
  key: TierKey;
  label: string;
  members: number;
  paying: number;
  comped: number;
  monthly: number;      // recurring revenue from this tier, normalised to a month
  forgone: number;      // list value of the comped accounts on this tier
}

export interface RevenueSummary {
  members: number;
  /** Subscriptions that are active *and* billed. */
  payingMembers: number;
  /** Paid a one-off lifetime price. Counted once, never annualised. */
  lifetimeMembers: number;
  /** On a paid tier with nothing to bill — founders, comps, admins. */
  compedMembers: number;
  /** Recurring revenue, normalised to a month. Yearly plans divide by 12. */
  mrr: number;
  /** The same figure over a year. Still recurring only. */
  arr: number;
  /** One-time lifetime revenue booked to date. */
  lifetimeTotal: number;
  /** Monthly list value of everything given away. Not income. */
  forgoneMonthly: number;
  /** Recurring revenue from module add-ons, normalised to a month. */
  addonMonthly: number;
  tiers: TierSlice[];
  /** Members who joined in the last 30 days. */
  newThisMonth: number;
  coupons: { code: string; kind: string; used: number; max: number | null; active: boolean }[];
}

const YEARLY = new Set(["yearly", "annual", "year"]);
const MONTHLY = new Set(["monthly", "month"]);
const LIFETIME = new Set(["lifetime", "founding", "one_time", "onetime"]);

/** An account only counts as revenue when something is genuinely being billed. */
function isPaying(r: BillingRow): boolean {
  const t = (r.billingType ?? "").toLowerCase();
  return r.subscriptionStatus === "active" && (MONTHLY.has(t) || YEARLY.has(t));
}

function isLifetime(r: BillingRow): boolean {
  return LIFETIME.has((r.billingType ?? "").toLowerCase());
}

export async function revenueSummary(): Promise<RevenueSummary> {
  const [rows, pricing, deals, addons, coupons] = await Promise.all([
    listBilling(),
    getTierPricing(),
    getLifetimeDeals(),
    listModuleAddonPrices(),
    listCoupons().catch(() => []),
  ]);

  const addonPrice = new Map(addons.map((a) => [a.moduleId, a]));
  const slices = new Map<TierKey, TierSlice>();
  for (const [, key] of Object.entries(TIER_KEY)) {
    slices.set(key, {
      key,
      label: TIER_LABEL[key],
      members: 0, paying: 0, comped: 0, monthly: 0, forgone: 0,
    });
  }

  let mrr = 0, lifetimeTotal = 0, forgoneMonthly = 0, addonMonthly = 0;
  let payingMembers = 0, lifetimeMembers = 0, compedMembers = 0, newThisMonth = 0;

  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (const r of rows) {
    const key = TIER_KEY[r.tier] ?? "free";
    const slice = slices.get(key)!;
    slice.members++;
    if (new Date(r.joinedAt).getTime() >= monthAgo) newThisMonth++;

    const price = pricing[key] ?? { monthly: 0, yearly: 0 };
    const billed = (MONTHLY.has((r.billingType ?? "").toLowerCase()) ? price.monthly : price.yearly / 12) || 0;

    if (isPaying(r)) {
      payingMembers++;
      slice.paying++;
      slice.monthly += billed;
      mrr += billed;
    } else if (isLifetime(r)) {
      lifetimeMembers++;
      // Booked once, at the price of the deal their tier corresponds to.
      // Deliberately not amortised into MRR: spreading a one-off over a guessed
      // lifespan is a forecast wearing a fact's clothes, and it would make the
      // recurring number stop meaning "what renews next month".
      lifetimeTotal += (r.tier >= 3 ? deals.advanced_lifetime.price : deals.basic_lifetime.price) || 0;
    } else if (key !== "free") {
      compedMembers++;
      slice.comped++;
      slice.forgone += price.monthly;
      forgoneMonthly += price.monthly;
    }

    for (const m of r.addonModules) {
      const a = addonPrice.get(m);
      if (!a) continue;
      const p = key === "free" ? a.freePrice : key === "basic" ? a.basicPrice : a.vipPrice;
      if (isPaying(r)) addonMonthly += p || 0;
    }
  }

  return {
    members: rows.length,
    payingMembers, lifetimeMembers, compedMembers,
    mrr, arr: mrr * 12,
    lifetimeTotal,
    forgoneMonthly, addonMonthly,
    newThisMonth,
    tiers: [...slices.values()].reverse(),
    coupons: coupons.map((c) => ({
      code: c.code, kind: c.kind, used: c.usedCount ?? 0,
      max: c.maxUses ?? null, active: c.active,
    })),
  };
}

export const money = (n: number): string =>
  n === 0 ? "$0" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
