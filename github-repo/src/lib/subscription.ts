/**
 * Member-facing subscription state.
 *
 * There is no `subscriptions` table in this project — checkout grants modules
 * through the Stripe webhook but records no customer id. Status and the portal
 * link therefore come from Stripe itself, resolved by the member's e-mail
 * inside the `stripe-portal` edge function (never from anything the browser
 * sends), so this module can show a real renewal date and a real cancel link
 * without a schema migration.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";
import { NUMBER_TO_TIER, type TierKey, type ModuleAddonPrice } from "./billingAdmin";
import type { Tier } from "../hooks/useAuth";

export interface BillingStatus {
  hasBilling: boolean;
  subscription: {
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    amount: number | null;
    interval: string | null;
  } | null;
}

export async function getBillingStatus(): Promise<BillingStatus> {
  if (!isSupabaseConfigured) return { hasBilling: false, subscription: null };
  const { data, error } = await supabase.functions.invoke("stripe-portal", { body: { mode: "status" } });
  if (error || !data?.ok) {
    // A member who has never paid has no Stripe customer; that is not an error.
    return { hasBilling: false, subscription: null };
  }
  return { hasBilling: !!data.hasBilling, subscription: data.subscription ?? null };
}

/** Opens Stripe's own portal: cancel, payment method, invoices, plan change. */
export async function openBillingPortal(): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: "Not available right now" };
  const { data, error } = await supabase.functions.invoke("stripe-portal", { body: { mode: "portal" } });
  if (error) {
    logger.error("openBillingPortal failed", { scope: "subscription", error });
    return { ok: false, error: "Could not open billing — try again." };
  }
  if (!data?.ok || !data.url) {
    return { ok: false, error: data?.error ?? "No billing history found for this account yet." };
  }
  window.location.href = data.url as string;
  return { ok: true };
}

export const tierKeyOf = (tier: Tier): TierKey => NUMBER_TO_TIER[tier];

/** What one module costs this member right now, as an add-on. */
export function addonPriceFor(m: ModuleAddonPrice, tier: TierKey): number {
  if (tier === "advanced") return 0;
  if (tier === "vip") return m.vipPrice;
  if (tier === "basic") return m.basicPrice;
  return m.freePrice;
}

export type ModuleState = "included" | "owned" | "available";

/**
 * How a member relates to one module.
 *  • `included` — always on, or the tier grants everything;
 *  • `owned`    — in their enabled set;
 *  • `available`— purchasable, at `addonPriceFor`.
 */
export function moduleStateFor(
  moduleId: string, tier: TierKey, enabled: string[], alwaysOn: boolean,
): ModuleState {
  if (alwaysOn) return "included";
  if (tier === "advanced") return "included";
  return enabled.includes(moduleId) ? "owned" : "available";
}
