/**
 * Stripe Billing Portal session (member self-service).
 *
 * Members could not previously see, change or cancel their own subscription —
 * every billing question became an email. This hands them Stripe's own portal,
 * which covers cancel, payment method, plan change and invoice history.
 *
 * There is no `subscriptions` table in this project: `stripe-checkout` grants
 * modules through the webhook but never records a customer id. So the customer
 * is resolved by the member's e-mail, read from their authenticated JWT — never
 * from the request body, so one member can never open another's portal.
 *
 * Three modes:
 *   portal            — a Stripe billing-portal session
 *   status            — a summary of the live subscription, for the panel
 *   drop_alert_level  — give up one rung of the alert ladder
 *
 * On that last one. Buying an alert level has always been one tap; giving one
 * back was "open the billing portal, find the right subscription, cancel it",
 * which is not a downgrade path, it is a scavenger hunt. A level bought through
 * Stripe has its own subscription and its id is on the entitlement row, so the
 * app can cancel exactly that one and nothing else. A level an admin granted has
 * no subscription and is simply removed. A level that comes with the member's
 * plan is not removable here at all, and says so — taking it away would be
 * removing something they are still paying for through their tier.
 *
 * AUTH: Bearer JWT of the member. SECRETS: STRIPE_SECRET_KEY,
 * SUPABASE_SERVICE_ROLE_KEY (for the entitlement row — a member cannot write
 * their own).
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SITE = Deno.env.get("APP_URL") ?? Deno.env.get("SITE_URL") ?? "https://vip.sswx.space";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function stripe(
  path: string, body?: Record<string, string>, method?: "GET" | "POST" | "DELETE",
): Promise<Record<string, unknown>> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message ?? `stripe ${r.status}`);
  return d;
}

/** The signed-in member, straight from Supabase Auth. Never from the body. */
async function userFromJwt(jwt: string): Promise<{ id: string; email: string } | null> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: ANON },
  });
  if (!r.ok) return null;
  const u = await r.json();
  const email = typeof u?.email === "string" ? u.email.trim().toLowerCase() : "";
  const id = typeof u?.id === "string" ? u.id : "";
  return id ? { id, email } : null;
}

/** PostgREST under the service role — the only way to touch an entitlement. */
async function rest(path: string, init?: RequestInit): Promise<Response> {
  return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!STRIPE_KEY) return json({ ok: false, error: "Billing is not configured." }, 500);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ ok: false, error: "Sign in first." }, 401);

  const me = await userFromJwt(jwt);
  if (!me) return json({ ok: false, error: "Could not verify your account." }, 401);
  const email = me.email;

  let mode = "portal";
  let level = 0;
  try {
    const body = await req.json();
    if (body?.mode === "status") mode = "status";
    if (body?.mode === "drop_alert_level") {
      mode = "drop_alert_level";
      level = Math.trunc(Number(body?.level));
    }
  } catch { /* default */ }

  // ── giving a rung back ──────────────────────────────────────────────────────
  if (mode === "drop_alert_level") {
    if (!(level >= 1 && level <= 5)) return json({ ok: false, error: "Not a valid alert level." }, 400);
    if (!SERVICE_ROLE) return json({ ok: false, error: "Alert changes are not configured." }, 500);
    try {
      const q = await rest(
        `alert_entitlements?user_id=eq.${me.id}&level=eq.${level}&select=level,source,stripe_subscription_id`,
      );
      const rows = q.ok ? await q.json() : [];
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) {
        // Tier-included levels are computed, never stored, so "no row" means
        // either they do not hold it or their plan gives it to them.
        return json({
          ok: false,
          error: "That level comes with your plan rather than being bought on its own — change your plan to change it.",
        }, 409);
      }

      const subId = typeof row.stripe_subscription_id === "string" ? row.stripe_subscription_id : "";
      if (subId) {
        // Cancel exactly this subscription. The webhook removes the entitlement
        // on `customer.subscription.deleted`; the delete below is so the member
        // sees it go now rather than whenever the webhook lands.
        await stripe(`subscriptions/${subId}`, undefined, "DELETE");
      }
      await rest(`alert_entitlements?user_id=eq.${me.id}&level=eq.${level}`, { method: "DELETE" });

      return json({
        ok: true,
        level,
        cancelled: Boolean(subId),
        message: subId
          ? "That level is cancelled and the billing for it has stopped."
          : "That level has been removed from your account.",
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : "Could not change that level." }, 502);
    }
  }

  try {
    const found = await stripe(`customers?email=${encodeURIComponent(email)}&limit=1`);
    const customer = (found.data as { id: string }[] | undefined)?.[0];

    if (mode === "status") {
      if (!customer) return json({ ok: true, hasBilling: false, subscription: null });
      const subs = await stripe(`subscriptions?customer=${customer.id}&status=all&limit=10`);
      const rows = (subs.data ?? []) as {
        id: string; status: string; cancel_at_period_end: boolean;
        current_period_end: number; created: number;
        items?: { data?: { price?: { unit_amount?: number; recurring?: { interval?: string } } }[] };
      }[];
      // Prefer a live subscription; otherwise report the most recent one so a
      // cancelled member still sees what happened rather than a blank panel.
      const live = rows.find((s) => s.status === "active" || s.status === "trialing" || s.status === "past_due");
      const s = live ?? rows.sort((a, b) => b.created - a.created)[0];
      if (!s) return json({ ok: true, hasBilling: true, subscription: null });
      const price = s.items?.data?.[0]?.price;
      return json({
        ok: true,
        hasBilling: true,
        subscription: {
          status: s.status,
          cancelAtPeriodEnd: !!s.cancel_at_period_end,
          currentPeriodEnd: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null,
          amount: typeof price?.unit_amount === "number" ? price.unit_amount / 100 : null,
          interval: price?.recurring?.interval ?? null,
        },
      });
    }

    if (!customer) {
      return json({ ok: false, error: "No billing history found for this account yet." }, 404);
    }
    const session = await stripe("billing_portal/sessions", {
      customer: customer.id,
      return_url: `${SITE}/subscription`,
    });
    return json({ ok: true, url: session.url as string });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : "Billing is unavailable right now." }, 502);
  }
});
