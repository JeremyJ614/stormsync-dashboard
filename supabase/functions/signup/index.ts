// StormSync VIP — public self-signup (creates accounts already email-confirmed).
//
// verify_jwt is DISABLED (this IS the pre-auth signup endpoint). It uses the
// service role to create the auth user with `email_confirm: true`, so members
// never need to confirm an email and can log in immediately. Self-signup always
// starts at Tier 1 (the `handle_new_user` trigger ignores any client tier — D-01);
// an admin raises the tier afterward.
//
// If the email already exists but was never confirmed (e.g. a stuck signup from
// before this endpoint), we confirm it + (re)set the PIN so the person can get in.
// If it's already a confirmed account, we tell them to sign in instead.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Must match `pinToPassword` in src/hooks/useAuth.ts exactly, or logins won't match.
const pinToPassword = (pin: string) => `pin_${pin}_sswx`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: { name?: string; email?: string; pin?: string; customAnswers?: Record<string, string> };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid request" }, 400); }

  const email = (body.email ?? "").trim();
  const pin = body.pin ?? "";
  const name = (body.name ?? "").trim();
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) return json({ ok: false, error: "Please enter a valid email." });
  if (!/^\d{4}$/.test(pin)) return json({ ok: false, error: "PIN must be exactly 4 digits." });
  if (!name) return json({ ok: false, error: "Please enter your name." });

  const meta = { name, custom_answers: body.customAnswers ?? {} };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: pinToPassword(pin),
    email_confirm: true,
    user_metadata: meta,
  });

  if (!createErr && created?.user) return json({ ok: true });

  // Email already exists — recover it only if it was never confirmed.
  const { data: prof } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (prof?.id) {
    const { data: existing } = await admin.auth.admin.getUserById(prof.id);
    if (existing?.user?.email_confirmed_at) {
      return json({ ok: false, error: "That email is already registered — please sign in instead." });
    }
    const { error: updErr } = await admin.auth.admin.updateUserById(prof.id, {
      email_confirm: true,
      password: pinToPassword(pin),
      user_metadata: meta,
    });
    if (updErr) return json({ ok: false, error: "Could not finish creating your account. Try again." });
    return json({ ok: true });
  }

  return json({ ok: false, error: createErr?.message ?? "Could not create your account. Try again." });
});
