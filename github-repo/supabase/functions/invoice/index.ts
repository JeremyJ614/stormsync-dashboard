/**
 * Invoices — render and send.
 *
 * Members previously had no record of what they paid for beyond Stripe's own
 * receipt, and the business had no way to put its own name on one. This renders
 * an invoice from an admin-editable template and e-mails it through Resend.
 *
 * Three ways in:
 *   POST {mode:"preview", invoice?}  → HTML, for the admin editor's live preview
 *   POST {mode:"test", to}           → sends a sample to one address (admin only)
 *   POST (Stripe-signed webhook)     → sends the real thing on a completed sale
 *
 * The Stripe path is a *separate* webhook endpoint from `stripe-webhook`, which
 * keeps granting modules exactly as before — nothing about entitlement changes
 * here, and a failure to send an invoice can never block a purchase.
 *
 * AUTH: admin Bearer JWT for preview/test; Stripe signature for the webhook.
 * SECRETS: RESEND_API_KEY, RELAY_FROM, STRIPE_WEBHOOK_SECRET_INVOICE (optional),
 *          SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RELAY_FROM = Deno.env.get("RELAY_FROM") ?? "StormSync <billing@sswx.space>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://vip.sswx.space";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// ── template ────────────────────────────────────────────────────────────────
export interface InvoiceSettings {
  businessName: string;
  tagline: string;
  addressLines: string[];
  supportEmail: string;
  logoUrl: string;
  accent: string;
  footerNote: string;
  terms: string;
  emailSubject: string;   // {{number}} and {{business}} are substituted
  numberPrefix: string;
  sendAutomatically: boolean;
}

const DEFAULTS: InvoiceSettings = {
  businessName: "StormSync Media",
  tagline: "Severe weather intelligence",
  addressLines: [],
  supportEmail: "jaywx@yahoo.com",
  logoUrl: `${APP_URL}/img/logo.webp`,
  accent: "#d9b775",
  footerNote: "Thank you for supporting independent weather coverage.",
  terms: "Charges are billed by Stripe. Manage or cancel any time from Subscription inside the app.",
  emailSubject: "Your {{business}} invoice {{number}}",
  numberPrefix: "SSWX",
  sendAutomatically: true,
};

async function loadSettings(): Promise<InvoiceSettings> {
  const { data } = await admin.from("billing_config").select("value").eq("key", "invoice_settings").maybeSingle();
  return { ...DEFAULTS, ...((data?.value ?? {}) as Partial<InvoiceSettings>) };
}

export interface InvoiceLine { label: string; detail?: string; amount: number }
export interface InvoiceData {
  number: string;
  issuedAt: string;
  customerName: string;
  customerEmail: string;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  periodLabel: string;
  paid: boolean;
}

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = (n: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(n);

/**
 * The invoice itself. Table-based and inline-styled because that is what mail
 * clients render reliably — Gmail strips <style>, Outlook ignores flexbox.
 */
function renderInvoice(s: InvoiceSettings, d: InvoiceData): string {
  const ink = "#0d0d1a", panel = "#14142a", hair = "#2a2a45", dim = "#a3a3cc", text = "#f1f4ff";
  const row = (l: InvoiceLine) => `
    <tr>
      <td style="padding:11px 0;border-bottom:1px solid ${hair};color:${text};font-size:14px;">
        ${esc(l.label)}
        ${l.detail ? `<div style="color:${dim};font-size:11.5px;margin-top:2px;">${esc(l.detail)}</div>` : ""}
      </td>
      <td style="padding:11px 0;border-bottom:1px solid ${hair};color:${text};font-size:14px;text-align:right;white-space:nowrap;">
        ${money(l.amount, d.currency)}
      </td>
    </tr>`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:${ink};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ink};padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${panel};border:1px solid ${hair};border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

  <tr><td style="height:3px;background:linear-gradient(90deg,transparent,${s.accent},transparent);"></td></tr>

  <tr><td style="padding:26px 26px 6px;">
    <table role="presentation" width="100%"><tr>
      <td style="vertical-align:top;">
        ${s.logoUrl ? `<img src="${esc(s.logoUrl)}" width="44" height="44" alt="" style="border-radius:9px;display:block;margin-bottom:10px;">` : ""}
        <div style="color:${text};font-size:17px;font-weight:700;letter-spacing:.2px;">${esc(s.businessName)}</div>
        ${s.tagline ? `<div style="color:${dim};font-size:11.5px;margin-top:2px;">${esc(s.tagline)}</div>` : ""}
      </td>
      <td style="vertical-align:top;text-align:right;">
        <div style="color:${s.accent};font-size:10px;letter-spacing:2.4px;text-transform:uppercase;font-weight:700;">
          ${d.paid ? "Receipt" : "Invoice"}
        </div>
        <div style="color:${text};font-size:15px;font-weight:600;margin-top:4px;">${esc(d.number)}</div>
        <div style="color:${dim};font-size:11.5px;margin-top:2px;">
          ${new Date(d.issuedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </div>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:16px 26px 0;">
    <div style="color:${dim};font-size:10px;letter-spacing:2px;text-transform:uppercase;">Billed to</div>
    <div style="color:${text};font-size:14px;margin-top:4px;">${esc(d.customerName || d.customerEmail)}</div>
    <div style="color:${dim};font-size:12px;">${esc(d.customerEmail)}</div>
    ${d.periodLabel ? `<div style="color:${dim};font-size:11.5px;margin-top:6px;">${esc(d.periodLabel)}</div>` : ""}
  </td></tr>

  <tr><td style="padding:20px 26px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-bottom:8px;border-bottom:1px solid ${hair};color:${s.accent};font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Description</td>
        <td style="padding-bottom:8px;border-bottom:1px solid ${hair};color:${s.accent};font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:700;text-align:right;">Amount</td>
      </tr>
      ${d.lines.map(row).join("")}
      ${d.discount > 0 ? `<tr>
        <td style="padding:11px 0;border-bottom:1px solid ${hair};color:${s.accent};font-size:14px;">Discount</td>
        <td style="padding:11px 0;border-bottom:1px solid ${hair};color:${s.accent};font-size:14px;text-align:right;">-${money(d.discount, d.currency)}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:16px 0 0;color:${text};font-size:15px;font-weight:700;">${d.paid ? "Paid" : "Due"}</td>
        <td style="padding:16px 0 0;color:${s.accent};font-size:22px;font-weight:700;text-align:right;">${money(d.total, d.currency)}</td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding:22px 26px 0;">
    <a href="${APP_URL}/subscription" style="display:inline-block;background:${s.accent};color:#17141f;text-decoration:none;font-size:13px;font-weight:700;padding:11px 20px;border-radius:9px;">Manage your subscription</a>
  </td></tr>

  <tr><td style="padding:22px 26px 26px;">
    <div style="border-top:1px solid ${hair};padding-top:14px;color:${dim};font-size:11.5px;line-height:1.65;">
      ${s.terms ? `<div>${esc(s.terms)}</div>` : ""}
      ${s.addressLines.filter(Boolean).length ? `<div style="margin-top:8px;">${s.addressLines.filter(Boolean).map(esc).join("<br>")}</div>` : ""}
      ${s.supportEmail ? `<div style="margin-top:8px;">Questions: <a href="mailto:${esc(s.supportEmail)}" style="color:${s.accent};text-decoration:none;">${esc(s.supportEmail)}</a></div>` : ""}
      ${s.footerNote ? `<div style="margin-top:10px;color:${text};">${esc(s.footerNote)}</div>` : ""}
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

function sampleInvoice(s: InvoiceSettings): InvoiceData {
  return {
    number: `${s.numberPrefix}-2026-0148`,
    issuedAt: new Date().toISOString(),
    customerName: "Sample Member",
    customerEmail: "member@example.com",
    lines: [
      { label: "VIP — Monthly", detail: "Bundle plus 16 module picks", amount: 3.99 },
      { label: "Moon & Astronomy", detail: "Add-on, billed monthly", amount: 0.3 },
    ],
    subtotal: 4.29, discount: 0, total: 4.29, currency: "usd",
    periodLabel: "Billing period 1 Sep 2026 – 1 Oct 2026",
    paid: true,
  };
}

async function sendMail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_KEY) return { ok: false, error: "E-mail is not configured (RESEND_API_KEY missing)." };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RELAY_FROM, to: [to], subject, html }),
  });
  if (!r.ok) return { ok: false, error: `Resend ${r.status}: ${(await r.text()).slice(0, 180)}` };
  return { ok: true };
}

async function isAdminJwt(jwt: string): Promise<boolean> {
  if (!jwt) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${jwt}`, apikey: ANON } });
  if (!r.ok) return false;
  const u = await r.json();
  if (!u?.id) return false;
  const { data } = await admin.from("profiles").select("is_admin").eq("id", u.id).maybeSingle();
  return data?.is_admin === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const raw = await req.text();
  let body: Record<string, unknown> = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* Stripe payloads parse below */ }

  const settings = await loadSettings();
  const mode = String(body.mode ?? "");

  // ── admin: live preview ──────────────────────────────────────────────────
  if (mode === "preview") {
    const s = { ...settings, ...((body.settings ?? {}) as Partial<InvoiceSettings>) };
    return new Response(renderInvoice(s, sampleInvoice(s)), {
      headers: { ...CORS, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // ── admin: send a sample ─────────────────────────────────────────────────
  if (mode === "test") {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!(await isAdminJwt(jwt))) return json({ ok: false, error: "Admins only." }, 403);
    const to = String(body.to ?? "").trim();
    if (!/.+@.+\..+/.test(to)) return json({ ok: false, error: "Enter a valid e-mail address." }, 400);
    const s = { ...settings, ...((body.settings ?? {}) as Partial<InvoiceSettings>) };
    const inv = sampleInvoice(s);
    const subject = s.emailSubject.replace(/\{\{business\}\}/g, s.businessName).replace(/\{\{number\}\}/g, inv.number);
    const sent = await sendMail(to, subject, renderInvoice(s, inv));
    return json(sent.ok ? { ok: true } : { ok: false, error: sent.error }, sent.ok ? 200 : 502);
  }

  // ── Stripe webhook: a real sale ──────────────────────────────────────────
  // Signature verification is intentionally strict: without a configured
  // secret this path does nothing rather than accepting unsigned calls.
  const sig = req.headers.get("stripe-signature");
  if (sig) {
    const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET_INVOICE") ?? "";
    if (!secret) return json({ ok: false, error: "Invoice webhook secret not configured." }, 400);
    if (!(await verifyStripe(raw, sig, secret))) return json({ ok: false, error: "Bad signature" }, 400);
    if (!settings.sendAutomatically) return json({ ok: true, skipped: "automatic sending is off" });

    const evt = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
    const inv = invoiceFromStripe(evt, settings);
    if (!inv) return json({ ok: true, skipped: evt.type });

    const subject = settings.emailSubject
      .replace(/\{\{business\}\}/g, settings.businessName)
      .replace(/\{\{number\}\}/g, inv.number);
    const sent = await sendMail(inv.customerEmail, subject, renderInvoice(settings, inv));
    // An invoice that fails to send must never look like a failed purchase.
    return json({ ok: true, emailed: sent.ok, error: sent.error });
  }

  return json({ ok: false, error: "Unknown request" }, 400);
});

/** Stripe's `t=...,v1=...` scheme, verified with WebCrypto. */
async function verifyStripe(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  // Reject anything older than five minutes — replay protection.
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // Constant-time compare.
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

function invoiceFromStripe(
  evt: { type: string; data: { object: Record<string, unknown> } }, s: InvoiceSettings,
): InvoiceData | null {
  const o = evt.data.object;
  const cur = String(o.currency ?? "usd");
  const email = String(
    (o.customer_email as string) ??
    ((o.customer_details as { email?: string } | undefined)?.email) ?? "",
  );
  if (!email) return null;
  const name = String(((o.customer_details as { name?: string } | undefined)?.name) ?? o.customer_name ?? "");

  if (evt.type === "checkout.session.completed") {
    const total = Number(o.amount_total ?? 0) / 100;
    const sub = Number(o.amount_subtotal ?? o.amount_total ?? 0) / 100;
    return {
      number: `${s.numberPrefix}-${new Date().getFullYear()}-${String(o.id ?? "").slice(-6).toUpperCase()}`,
      issuedAt: new Date().toISOString(),
      customerName: name, customerEmail: email,
      lines: [{ label: "StormSync VIP subscription", detail: "Charged at checkout", amount: sub }],
      subtotal: sub, discount: Math.max(0, sub - total), total, currency: cur,
      periodLabel: "", paid: true,
    };
  }

  if (evt.type === "invoice.paid" || evt.type === "invoice.payment_succeeded") {
    const lines = ((o.lines as { data?: Record<string, unknown>[] } | undefined)?.data ?? []).map((l) => ({
      label: String(l.description ?? "Subscription"),
      detail: undefined,
      amount: Number(l.amount ?? 0) / 100,
    }));
    const total = Number(o.amount_paid ?? o.total ?? 0) / 100;
    const start = (o.period_start as number) ?? 0, end = (o.period_end as number) ?? 0;
    return {
      number: String(o.number ?? `${s.numberPrefix}-${String(o.id ?? "").slice(-6).toUpperCase()}`),
      issuedAt: new Date(Number(o.created ?? Date.now() / 1000) * 1000).toISOString(),
      customerName: name, customerEmail: email,
      lines: lines.length ? lines : [{ label: "StormSync VIP subscription", amount: total }],
      subtotal: Number(o.subtotal ?? total) / 100 || total,
      discount: Math.max(0, Number(o.total_discount_amounts ? 0 : 0)),
      total, currency: cur,
      periodLabel: start && end
        ? `Billing period ${new Date(start * 1000).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })} – ${new Date(end * 1000).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`
        : "",
      paid: true,
    };
  }
  return null;
}
