// StormSync VIP — Stripe webhook. This is the ONLY place a paid tier or a paid
// alert level is ever granted -- the frontend never sets tier/enabled_modules
// or alert entitlements itself, it only asks stripe-checkout to start a
// session. verify_jwt MUST be turned OFF for this function (Stripe calls it
// directly, with no Supabase session) -- the Stripe signature check below is
// what verifies the caller.
//
// Recovered from the deployed bundle and committed, so the next change to
// billing does not have to be reverse-engineered again.
import { createClient } from "jsr:@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});
const TIER_NUMBER = {
  free: 1,
  basic: 2,
  vip: 3,
  advanced: 4
};
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++)diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const p of sigHeader.split(",")){
    const [k, v] = p.split("=");
    if (k && v) parts[k] = v;
  }
  if (!parts.t || !parts.v1) return false;
  const signedPayload = `${parts.t}.${payload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const sigBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sigBytes)).map((b)=>b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, parts.v1);
}
async function grantPaidPlan(meta, stripeCustomerId) {
  const uid = meta.supabase_user_id;
  const tier = meta.tier;
  if (!uid || !tier) return;
  const chosenIds = (meta.chosen_module_ids ?? "").split(",").filter(Boolean);
  const addonIds = (meta.addon_module_ids ?? "").split(",").filter(Boolean);
  const couponCode = meta.coupon_code;
  const period = meta.period ?? "monthly";
  let enabledModules = [];
  if (tier === "advanced") {
    const { data: allMods } = await admin.from("module_addon_prices").select("module_id");
    enabledModules = (allMods ?? []).map((m)=>m.module_id);
  } else {
    const { data: cfgRow } = await admin.from("billing_config").select("value").eq("key", "tier_bundled_modules").maybeSingle();
    const bundled = tier === "basic" ? cfgRow?.value?.basic ?? [] : tier === "vip" ? cfgRow?.value?.vip ?? [] : [];
    enabledModules = Array.from(new Set([
      ...bundled,
      ...chosenIds,
      ...addonIds
    ]));
  }
  const update = {
    tier: TIER_NUMBER[tier] ?? 1,
    enabled_modules: enabledModules,
    billing_type: period === "lifetime" ? "lifetime" : period,
    subscription_status: "active",
    addon_modules: addonIds
  };
  if (stripeCustomerId) update.stripe_customer_id = stripeCustomerId;
  await admin.from("profiles").update(update).eq("id", uid);
  if (couponCode) await admin.rpc("redeem_coupon", {
    p_code: couponCode
  });
}
/**
 * A rung of the alert ladder, bought outright.
 *
 * The entitlement carries the subscription that paid for it, so cancelling that
 * subscription can remove exactly this level and nothing else. Tier-included
 * levels are computed rather than stored, so they are untouched either way.
 */
async function grantAlertLevel(meta, subscriptionId) {
  const uid = meta.supabase_user_id;
  const level = parseInt(meta.alert_level ?? "", 10);
  if (!uid || !Number.isInteger(level) || level < 1 || level > 5) return;
  await admin.from("alert_entitlements").upsert({
    user_id: uid,
    level,
    source: "purchased",
    note: "Bought through Stripe checkout",
    stripe_subscription_id: subscriptionId ?? null
  }, {
    onConflict: "user_id,level"
  });
}
Deno.serve(async (req)=>{
  if (req.method !== "POST") return new Response("Method not allowed", {
    status: 405
  });
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");
  const valid = await verifyStripeSignature(payload, sig, STRIPE_WEBHOOK_SECRET);
  if (!valid) return new Response("Invalid signature", {
    status: 400
  });
  let event;
  try {
    event = JSON.parse(payload);
  } catch  {
    return new Response("Invalid payload", {
      status: 400
    });
  }
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.metadata?.purchase_kind === "alert_level") {
        await grantAlertLevel(session.metadata, session.subscription);
      } else if (session.metadata) {
        await grantPaidPlan(session.metadata, session.customer);
      }
    }
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object;
      const uid = sub.metadata?.supabase_user_id;
      // An alert level is removed on cancellation, unlike a plan: it is a single
      // named line item, so we know exactly what stopped being paid for and can
      // take back that and nothing else.
      if (sub.metadata?.purchase_kind === "alert_level" && uid) {
        await admin.from("alert_entitlements").delete().eq("user_id", uid).eq("stripe_subscription_id", sub.id);
        return new Response("ok", {
          status: 200
        });
      }
      // We deliberately don't strip modules automatically on cancellation --
      // an abrupt access loss from a billing hiccup is worse than a short
      // delay. This just flags the account for you to review in Admin > Users.
      if (uid) await admin.from("profiles").update({
        subscription_status: "canceled"
      }).eq("id", uid);
    }
  } catch (e) {
    console.error("stripe-webhook handling error", e);
  // Still return 200 so Stripe doesn't hammer retries for a bug on our side
  // once we've at least logged it -- but this is exactly the kind of thing
  // to keep an eye on in the Supabase Edge Function logs after launch.
  }
  return new Response("ok", {
    status: 200
  });
});
