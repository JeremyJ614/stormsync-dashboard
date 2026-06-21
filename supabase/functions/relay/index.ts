// StormSync VIP — Emergency Storm Contact relay (U-23).
//
// Deployed as the `relay` Edge Function. verify_jwt is DISABLED: the emergency
// channel is authorized by the 4-digit emergency PIN (checked server-side
// against `app_config.emergency_pin`), so Tier-4 members can reach it without a
// session if needed.
//
// On a valid emergency submission it (1) stores a row in `contact_submissions`
// (the durable record) and (2) relays the message — via Resend — to every
// configured admin email AND every carrier email-to-SMS gateway in
// `app_config.emergency_recipients`. Email/SMS sending needs the RESEND_API_KEY
// secret; without it the message is still stored and the caller is told email
// is not yet configured (no dead UI).
//
// Secrets / env:
//   RESEND_API_KEY  — https://resend.com (free tier). Required to actually send.
//   RELAY_FROM      — verified sender, e.g. "StormSync Alerts <alerts@yourdomain>".
//                     Defaults to Resend's shared test sender.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RELAY_FROM = Deno.env.get("RELAY_FROM") ?? "StormSync Alerts <onboarding@resend.dev>";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

interface Recipients { emails: string[]; sms_gateways: string[] }
async function getRecipients(): Promise<Recipients> {
  const { data } = await admin.from("app_config").select("value").eq("key", "emergency_recipients").maybeSingle();
  const v = (data?.value ?? {}) as Partial<Recipients>;
  return { emails: v.emails ?? [], sms_gateways: v.sms_gateways ?? [] };
}
async function getEmergencyPin(): Promise<string | null> {
  const { data } = await admin.from("app_config").select("value").eq("key", "emergency_pin").maybeSingle();
  return (data?.value as { pin?: string } | null)?.pin ?? null;
}

async function sendResend(to: string[], subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) return { ok: false, error: "no_key" };
  if (to.length === 0) return { ok: false, error: "no_recipients" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RELAY_FROM, to, subject, text }),
    });
    if (!r.ok) return { ok: false, error: `resend ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid body" }, 400); }
  const kind = (body.kind ?? "emergency").toString();
  const name = (body.name ?? "").toString().trim();
  const email = (body.email ?? "").toString().trim();
  const phone = (body.phone ?? "").toString().trim();
  const location = (body.location ?? "").toString().trim();
  const situation = (body.message ?? body.situation ?? "").toString().trim();

  if (kind !== "emergency") return json({ ok: false, error: "Unsupported channel" }, 400);
  if (!name || !situation) return json({ ok: false, error: "Name and situation are required" }, 400);

  // PIN gate (server-side).
  const expected = await getEmergencyPin();
  if (!expected || body.pin?.toString() !== expected) return json({ ok: false, error: "Invalid emergency PIN" }, 401);

  const message = `URGENT — EMERGENCY STORM CONTACT\nLocation: ${location}\nCaller phone: ${phone}\nCaller email: ${email}\n\nSituation:\n${situation}`;

  // 1) Durable record.
  let stored = true;
  try {
    await admin.from("contact_submissions").insert({ kind: "emergency", name, email, phone, message });
  } catch { stored = false; }

  // 2) Relay to admin emails + carrier SMS gateways.
  const { emails, sms_gateways } = await getRecipients();
  const to = [...emails, ...sms_gateways];
  const subject = `🚨 URGENT — Emergency Storm Contact from ${name}`;
  const smsText = `URGENT StormSync: ${name} @ ${location || "unknown"} — ${situation.slice(0, 200)} (ph ${phone})`;
  // Email recipients get the full body; SMS gateways get a short text. Send in one
  // call when only emails exist, otherwise tailor.
  let emailed = false; let relayError: string | undefined;
  if (to.length > 0) {
    const res = sms_gateways.length > 0
      ? await (async () => {
          const a = await sendResend(emails, subject, message);
          const b = await sendResend(sms_gateways, "StormSync URGENT", smsText);
          return { ok: a.ok || b.ok, error: a.error ?? b.error };
        })()
      : await sendResend(emails, subject, message);
    emailed = res.ok;
    if (!res.ok) relayError = res.error;
  }

  return json({
    ok: true,
    stored,
    emailed,
    note: emailed
      ? "Emergency dispatched to the StormSync admin team."
      : relayError === "no_key"
        ? "Logged for the admin team. (Live email/SMS relay isn't configured yet.)"
        : "Logged for the admin team. Relay delivery is degraded — they will also see it in the admin inbox.",
  });
});
