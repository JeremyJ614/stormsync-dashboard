// StormSync VIP — creates a Stripe Checkout Session.
//
// Two kinds of purchase go through here:
//   • a plan   — a tier, a billing period, chosen modules and add-ons
//   • an alert level — one rung of the alert ladder, billed monthly
//
// Prices are ALWAYS read fresh from the DB here, never trusted from the
// client — the frontend receipt is just a preview. Coupons are re-validated
// server-side too. verify_jwt should stay ON (default) for this function —
// we need to know who's checking out.
//
// This file was recovered from the deployed bundle: it had been deployed
// without ever being committed, which is why alert levels used to file a
// request instead of taking a payment. Keep it in the repo.
import { createClient } from "jsr:@supabase/supabase-js@2";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://vip.sswx.space";
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
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json"
    }
  });
}
// Minimal Stripe REST client -- no SDK, just fetch (same approach as the
// one-time stripe-setup.mjs script). Stripe wants form-encoded bodies with
// bracket notation for nested objects/arrays.
async function stripeCall(path, params) {
  const body = new URLSearchParams();
  const flatten = (prefix, val)=>{
    if (val === undefined || val === null) return;
    if (Array.isArray(val)) {
      val.forEach((v, i)=>flatten(`${prefix}[${i}]`, v));
    } else if (typeof val === "object") {
      for (const [k, v] of Object.entries(val))flatten(prefix ? `${prefix}[${k}]` : k, v);
    } else {
      body.append(prefix, String(val));
    }
  };
  for (const [k, v] of Object.entries(params))flatten(k, v);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error on ${path}`);
  return data;
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: CORS
  });
  if (req.method !== "POST") return json({
    ok: false,
    error: "Method not allowed"
  }, 405);
  const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({
    ok: false,
    error: "Not signed in"
  }, 401);
  const user = userData.user;
  let body;
  try {
    body = await req.json();
  } catch  {
    return json({
      ok: false,
      error: "Invalid request"
    }, 400);
  }
  // ── alert levels ───────────────────────────────────────────────────────────
  // A rung of the alert ladder, billed monthly. Priced from
  // alert_level_prices against the member's CURRENT tier, read here rather than
  // sent by the client, and refused outright if their tier already includes it.
  if (body.kind === "alert_level") {
    const level = Number(body.level);
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      return json({ ok: false, error: "Invalid alert level" }, 400);
    }
    try {
      if (!STRIPE_SECRET_KEY) return json({ ok: false, error: "Payments aren't configured yet" }, 500);
      const [{ data: profile }, { data: priceRow }, { data: heldRows }] = await Promise.all([
        admin.from("profiles").select("stripe_customer_id, email, name, tier").eq("id", user.id).maybeSingle(),
        admin.from("alert_level_prices").select("level,label,free_price,basic_price,vip_price").eq("level", level).maybeSingle(),
        admin.from("alert_entitlements").select("level").eq("user_id", user.id).eq("level", level)
      ]);
      const memberTier = Number(profile?.tier ?? 1);
      // The tier at which this level stops costing extra. Mirrors
      // public.alert_level_included_from — the DB is the authority, this is the
      // cheap local copy for a refusal we can make without a round trip.
      const includedFrom = level <= 2 ? 1 : level === 3 ? 2 : level === 4 ? 3 : 4;
      if (memberTier >= includedFrom) {
        return json({ ok: false, error: "Your plan already includes that level" }, 400);
      }
      if ((heldRows ?? []).length > 0) {
        return json({ ok: false, error: "You already have that level" }, 400);
      }
      const raw = memberTier === 1 ? priceRow?.free_price
        : memberTier === 2 ? priceRow?.basic_price
        : memberTier === 3 ? priceRow?.vip_price
        : null;
      const cents = Math.round(Number(raw ?? 0) * 100);
      if (!raw || cents <= 0) return json({ ok: false, error: "That level isn't on sale at your plan yet" }, 400);

      let customerId = profile?.stripe_customer_id;
      if (!customerId) {
        const customer = await stripeCall("customers", {
          email: profile?.email ?? user.email,
          name: profile?.name,
          metadata: { supabase_user_id: user.id }
        });
        customerId = customer.id;
        await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
      }
      const metadata = {
        supabase_user_id: user.id,
        purchase_kind: "alert_level",
        alert_level: String(level)
      };
      const session = await stripeCall("checkout/sessions", {
        mode: "subscription",
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: cents,
              product_data: { name: `Alerts: ${priceRow?.label ?? `Level ${level}`}` },
              recurring: { interval: "month" }
            },
            quantity: 1
          }
        ],
        success_url: `${SITE_URL}/profile?alerts=success`,
        cancel_url: `${SITE_URL}/profile?alerts=cancelled`,
        metadata,
        subscription_data: { metadata }
      });
      return json({ ok: true, url: session.url });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Checkout failed" }, 500);
    }
  }

  const tier = body.tier ?? "";
  const period = body.period ?? "monthly";
  const chosenIds = Array.isArray(body.chosenModuleIds) ? body.chosenModuleIds : [];
  const addonIds = Array.isArray(body.addonModuleIds) ? body.addonModuleIds : [];
  const couponCode = (body.couponCode ?? "").trim();
  if (![
    "basic",
    "vip",
    "advanced"
  ].includes(tier)) return json({
    ok: false,
    error: "Invalid plan"
  }, 400);
  if (![
    "monthly",
    "yearly",
    "lifetime"
  ].includes(period)) return json({
    ok: false,
    error: "Invalid billing period"
  }, 400);
  try {
    if (!STRIPE_SECRET_KEY) return json({
      ok: false,
      error: "Payments aren't configured yet"
    }, 500);
    const [{ data: pricingRow }, { data: lifetimeRow }, { data: addonRows }] = await Promise.all([
      admin.from("billing_config").select("value").eq("key", "tier_pricing").maybeSingle(),
      admin.from("billing_config").select("value").eq("key", "lifetime_deals").maybeSingle(),
      admin.from("module_addon_prices").select("module_id,label,free_price,basic_price,vip_price").in("module_id", addonIds.length ? addonIds : [
        "__none__"
      ])
    ]);
    const tierPricing = pricingRow?.value ?? {};
    const lifetimeDeals = lifetimeRow?.value ?? {};
    let basePriceCents = 0;
    let isOneTime = false;
    let planLabel = `StormSync ${tier}`;
    if (period === "lifetime") {
      const dealKey = tier === "basic" ? "basic_lifetime" : tier === "advanced" ? "advanced_lifetime" : null;
      const deal = dealKey ? lifetimeDeals[dealKey] : null;
      if (!deal?.active) return json({
        ok: false,
        error: "That lifetime deal isn't available right now"
      }, 400);
      basePriceCents = Math.round((deal.price ?? 0) * 100);
      isOneTime = true;
      planLabel = deal.label ?? planLabel;
    } else {
      basePriceCents = Math.round((tierPricing[tier]?.[period] ?? 0) * 100);
      planLabel = `StormSync ${tier[0].toUpperCase()}${tier.slice(1)} (${period})`;
    }
    // Coupon -- recurring tiers only, re-validated server-side, never trusted from the client.
    let stripeCouponId = null;
    if (couponCode && period !== "lifetime") {
      const { data: check } = await admin.rpc("validate_coupon", {
        p_code: couponCode,
        p_tier: tier
      });
      if (check?.valid) {
        const isOnce = String(check.kind).startsWith("first_month");
        const isPercent = String(check.kind).includes("percent");
        const c = await stripeCall("coupons", isPercent ? {
          percent_off: check.value,
          duration: isOnce ? "once" : "forever"
        } : {
          amount_off: Math.round(check.value * 100),
          currency: "usd",
          duration: isOnce ? "once" : "forever"
        });
        stripeCouponId = c.id;
      }
    }
    const { data: profile } = await admin.from("profiles").select("stripe_customer_id, email, name").eq("id", user.id).maybeSingle();
    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeCall("customers", {
        email: profile?.email ?? user.email,
        name: profile?.name,
        metadata: {
          supabase_user_id: user.id
        }
      });
      customerId = customer.id;
      await admin.from("profiles").update({
        stripe_customer_id: customerId
      }).eq("id", user.id);
    }
    const interval = period === "yearly" ? "year" : "month";
    const annualizeAddons = !isOneTime && interval === "year"; // addon prices in the DB are monthly; annualize to keep one subscription cadence
    const lineItems = [];
    if (basePriceCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: basePriceCents,
          product_data: {
            name: planLabel
          },
          ...isOneTime ? {} : {
            recurring: {
              interval
            }
          }
        },
        quantity: 1
      });
    }
    for (const row of addonRows ?? []){
      const price = tier === "free" ? row.free_price : tier === "basic" ? row.basic_price : row.vip_price;
      const cents = Math.round((price ?? 0) * 100);
      if (cents <= 0) continue;
      lineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: annualizeAddons ? cents * 12 : cents,
          product_data: {
            name: `Add-On: ${row.label}`
          },
          recurring: {
            interval
          }
        },
        quantity: 1
      });
    }
    if (lineItems.length === 0) return json({
      ok: false,
      error: "Nothing to charge — this should be free. Refresh and try again."
    }, 400);
    // Lifetime + addons mixes a one-time item into a subscription-mode session
    // (Stripe supports this). Pure lifetime with no add-ons uses payment mode.
    const mode = isOneTime && addonIds.length === 0 ? "payment" : "subscription";
    const metadata = {
      supabase_user_id: user.id,
      tier,
      period,
      chosen_module_ids: chosenIds.join(","),
      addon_module_ids: addonIds.join(","),
      coupon_code: couponCode
    };
    const session = await stripeCall("checkout/sessions", {
      mode,
      customer: customerId,
      line_items: lineItems,
      success_url: `${SITE_URL}/plans?checkout=success`,
      cancel_url: `${SITE_URL}/plans?checkout=cancelled`,
      ...stripeCouponId ? {
        discounts: [
          {
            coupon: stripeCouponId
          }
        ]
      } : {},
      metadata,
      ...mode === "subscription" ? {
        subscription_data: {
          metadata
        }
      } : {
        payment_intent_data: {
          metadata
        }
      }
    });
    return json({
      ok: true,
      url: session.url
    });
  } catch (e) {
    return json({
      ok: false,
      error: e instanceof Error ? e.message : "Checkout failed"
    }, 500);
  }
});
