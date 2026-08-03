/**
 * Member-facing plan selection.
 *
 * Reads (pricing, lifetime deals, tier bundles, module add-on prices, promo
 * counter) are the exact same public-read getters used by the admin Billing
 * tab -- one source of truth, no duplication.
 *
 * Writes here are intentionally narrow: the only two actions that change a
 * user's tier are `selectFreeTier` and `claimAdvancedPromo`, and both go
 * through SECURITY DEFINER database functions that only ever complete when
 * the price really is $0 (Free tier, or a still-available promo spot).
 * Anything with a nonzero price goes through Stripe Checkout instead (next
 * phase) -- nothing here can grant a paid tier for free.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type {
  TierKey, TierPrice, TierPricing, LifetimeDeal, LifetimeDeals,
  TierModuleConfig, ModuleAddonPrice, Coupon, CouponKind, PromoCounter,
} from "./billingAdmin";

export {
  TIER_KEYS, TIER_TO_NUMBER, NUMBER_TO_TIER,
  getTierPricing, getLifetimeDeals, getTierModuleConfig, listModuleAddonPrices, getPromoCounter,
  COUPON_KIND_LABELS,
} from "./billingAdmin";

export interface CouponCheck {
  valid: boolean;
  error?: string;
  kind?: "percent_off" | "flat_off" | "first_month_percent_off" | "first_month_flat_off";
  value?: number;
  code?: string;
}

export async function checkCoupon(code: string, tier: string): Promise<CouponCheck> {
  if (!code.trim()) return { valid: false, error: "Enter a code" };
  if (!isSupabaseConfigured) return { valid: false, error: "Not available right now" };
  const { data, error } = await supabase.rpc("validate_coupon", { p_code: code.trim(), p_tier: tier });
  if (error) {
    logger.error("checkCoupon failed", { scope: "plans", error });
    return { valid: false, error: "Something went wrong checking that code" };
  }
  return data as CouponCheck;
}

export interface ActionResult { ok: boolean; error?: string }

/** Free tier: pick exactly 1 module, completes instantly, no payment involved. */
export async function selectFreeTier(chosenModuleId: string): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Not available right now" };
  const { data, error } = await supabase.rpc("self_select_free_tier", { p_chosen_module: chosenModuleId });
  if (error) {
    logger.error("selectFreeTier failed", { scope: "plans", error });
    return { ok: false, error: error.message };
  }
  return data as ActionResult;
}

/** Claims one of the launch-promo free Advanced spots, if any remain. */
export async function claimAdvancedPromo(): Promise<ActionResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Not available right now" };
  const { data, error } = await supabase.rpc("claim_free_advanced_promo");
  if (error) {
    logger.error("claimAdvancedPromo failed", { scope: "plans", error });
    return { ok: false, error: error.message };
  }
  return data as ActionResult;
}

export interface CheckoutResult { ok: boolean; url?: string; error?: string }

/** Starts a real Stripe Checkout session for a paid plan/add-ons combo. Prices
 *  are recomputed server-side from the DB -- nothing here is trusted as-is. */
export async function startCheckout(params: {
  tier: string; period: string; chosenModuleIds: string[]; addonModuleIds: string[]; couponCode?: string;
}): Promise<CheckoutResult> {
  if (!isSupabaseConfigured) return { ok: false, error: "Not available right now" };
  const { data, error } = await supabase.functions.invoke("stripe-checkout", { body: params });
  if (error) {
    logger.error("startCheckout failed", { scope: "plans", error });
    return { ok: false, error: "Could not start checkout — try again." };
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? "Could not start checkout." };
  return { ok: true, url: data.url };
}
