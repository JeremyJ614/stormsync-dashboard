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
 * AUTH: Bearer JWT of the member. SECRET: STRIPE_SECRET_KEY.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SITE = Deno.env.get("APP_URL") ?? Deno.env.get("SITE_URL") ?? "https://vip.sswx.space";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function stripe(path: string, body?: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
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

/** The signed-in member's e-mail, straight from Supabase Auth. */
async function emailFromJwt(jwt: string): Promise<string | null> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${jwt}`, apikey: ANON },
  });
  if (!r.ok) return null;
  const u = await r.json();
  const email = typeof u?.email === "string" ? u.email.trim().toLowerCase() : "";
  return email || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
  if (!STRIPE_KEY) return json({ ok: false, error: "Billing is not configured." }, 500);

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ ok: false, error: "Sign in first." }, 401);

  const email = await emailFromJwt(jwt);
  if (!email) return json({ ok: false, error: "Could not verify your account." }, 401);

  let mode = "portal";
  try {
    const body = await req.json();
    if (body?.mode === "status") mode = "status";
  } catch { /* default */ }

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
