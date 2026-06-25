// StormSync VIP — Morning digest (P-19). Sends the daily brief summary to Tier 2+
// members as an in-app digest notification and (opt-in) a branded email. Runs once
// each morning via pg_cron. AUTH: x-engine-secret or admin Bearer.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RELAY_FROM = Deno.env.get("RELAY_FROM") ?? "StormSync Alerts <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://stormsync-dashboard.vercel.app";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-engine-secret" };
function json(b: unknown, s = 200): Response { return new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } }); }

async function authorize(req: Request): Promise<boolean | Response> {
  const secret = req.headers.get("x-engine-secret");
  if (secret) {
    const { data } = await admin.from("app_config").select("value").eq("key", "storm_engine_secret").maybeSingle();
    const expected = (data?.value as { secret?: string } | null)?.secret;
    if (expected && secret === expected) return true;
    return json({ ok: false, error: "Invalid engine secret" }, 401);
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (u?.user) { const { data: prof } = await admin.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle(); if (prof?.is_admin) return true; }
  }
  return json({ ok: false, error: "Unauthorized" }, 401);
}

function emailHtml(headline: string, body: string): string {
  return `<div style="background:#0a0e1a;padding:24px;font-family:system-ui,Arial,sans-serif;color:#e5e7eb"><div style="max-width:520px;margin:0 auto;background:#111726;border:1px solid #1f2937;border-radius:16px;overflow:hidden"><div style="background:linear-gradient(135deg,#1e1b4b,#0a0e1a);padding:18px 22px"><div style="font-size:18px;font-weight:800;color:#fff">StormSync <span style="color:#a78bfa">WX</span> · Daily Brief</div></div><div style="padding:22px"><h1 style="font-size:18px;margin:0 0 10px;color:#fff">${headline}</h1><p style="font-size:14px;line-height:1.6;color:#cbd5e1;margin:0 0 18px">${body}</p><a href="${APP_URL}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700;font-size:14px">Open StormSync</a><p style="font-size:11px;color:#64748b;margin:18px 0 0">You're getting this because daily digest is on (Tier 2+). Turn it off anytime in the app.</p></div></div></div>`;
}
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY || !to) return false;
  try { const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: RELAY_FROM, to: [to], subject, html }) }); return r.ok; } catch { return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const { data: brief } = await admin.from("daily_brief").select("headline,summary,content,generated_at").order("generated_at", { ascending: false }).limit(1).maybeSingle();
  const headline = (brief?.headline as string) || "Today's StormSync brief";
  const summary = (brief?.summary as string) || (brief?.content as { discussion_plain?: string } | null)?.discussion_plain || "Open StormSync for today's full national severe-weather brief.";
  const ymd = new Date().toISOString().slice(0, 10);

  // Tier 2+ members get the digest; email gated by their email_digest preference.
  const { data: profs } = await admin.from("profiles").select("id,email,tier").gte("tier", 2);
  const ids = (profs ?? []).map((p) => p.id);
  const { data: prefRows } = ids.length ? await admin.from("notification_prefs").select("user_id,email_digest,inapp_enabled").in("user_id", ids) : { data: [] };
  const prefById = new Map((prefRows ?? []).map((p) => [p.user_id as string, p as { email_digest: boolean; inapp_enabled: boolean }]));

  let inapp = 0, emails = 0;
  for (const p of profs ?? []) {
    const pref = prefById.get(p.id) ?? { email_digest: true, inapp_enabled: true };
    if (pref.inapp_enabled !== false) {
      const { data: existing } = await admin.from("notifications").select("id").eq("user_id", p.id).eq("dedup_key", `digest-${ymd}`).maybeSingle();
      if (!existing) { const { error } = await admin.from("notifications").insert({ user_id: p.id, kind: "digest", severity: "info", title: headline, body: summary, link: "/", dedup_key: `digest-${ymd}` }); if (!error) inapp++; }
    }
    if (pref.email_digest !== false) { const ok = await sendEmail(p.email as string, `☀️ StormSync Daily Brief — ${headline}`, emailHtml(headline, summary)); if (ok) emails++; }
  }
  return json({ ok: true, recipients: (profs ?? []).length, inapp, emails });
});
