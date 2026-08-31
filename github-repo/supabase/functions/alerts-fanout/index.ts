// StormSync VIP — Alert fan-out. Cron-driven multi-channel dispatcher.
//
// For every member with saved locations it checks active NWS warnings + watches,
// the SPC Day-1 outlook and the NWS winter grid against those points, then fans
// out per the ALERT LEVEL LADDER (see 20260827010000_alert_levels.sql), not per
// tier:
//   • level 1 — in-app inbox                → public.notifications
//   • level 2 — web push, app closed or not → web-push, deduped via push_sent
//   • level 3 — email and/or text           → Resend, and SMS (see sendText)
//   • level 4 — SPC severe and NWS winter outlooks at the start of the day
//   • level 5 — nothing automatic: the direct line is a person, and the manual
//               mode below is how that person reaches them
// Levels come from alert_levels_for(), so a free-tier member who bought level 3
// gets email and a VIP who never set a contact address does not.
//
// This replaced a tier ramp that skipped tier 1 entirely, which meant free
// members received nothing at all even though level 1 has always been free.
// De-duplicated via notifications(user_id, dedup_key). Per-type opt-outs honored.
//
// MODES
//   (default)          the scheduled sweep described above
//   { mode: "manual" } an admin sending a personal alert to chosen members,
//                      which is what makes level 5 a real thing rather than a
//                      promise. Admin JWT only — the cron secret cannot send it.
//
// AUTH: x-engine-secret header (cron) or admin Bearer JWT.
// SECRETS: RESEND_API_KEY   — email, and SMS via carrier gateway (optional)
//          VAPID_PRIVATE_KEY — web push (optional)
//          TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM — real SMS
//                              (optional; without it SMS uses the free gateway)
// Every channel degrades on its own: no key means that channel is skipped and
// the rest still go out.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RELAY_FROM = Deno.env.get("RELAY_FROM") ?? "StormSync Alerts <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://stormsync-dashboard.vercel.app";
const VAPID_PUBLIC = "BPQVDL8EAh58PxE8ZB6Wz-6coY_4MtJ0EiZf_tSMxgBdUlkSsUe6GgmzH4P3rtYTBn1wvB6KcgRCgxIFJ4nXwYo";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@stormsync.media";
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM = Deno.env.get("TWILIO_FROM") ?? "";
const UA = "StormSyncVIP/1.0 (contact: admin@stormsync.media)";
const NWS = "https://api.weather.gov";
const SPC = "https://www.spc.noaa.gov";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-engine-secret",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/** True when the caller proved they are an admin, as opposed to the cron secret. */
async function isAdminCaller(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: authHeader } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return false;
  const { data: prof } = await admin.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
  return Boolean(prof?.is_admin);
}

async function authorize(req: Request): Promise<boolean | Response> {
  const secret = req.headers.get("x-engine-secret");
  if (secret) {
    const { data } = await admin.from("app_config").select("value").eq("key", "storm_engine_secret").maybeSingle();
    const expected = (data?.value as { secret?: string } | null)?.secret;
    if (expected && secret === expected) return true;
    return json({ ok: false, error: "Invalid engine secret" }, 401);
  }
  if (await isAdminCaller(req)) return true;
  return json({ ok: false, error: "Unauthorized" }, 401);
}

interface Loc { user_id: string; id: string; lat: number; lon: number; name: string; is_primary: boolean }
type Scope = "state" | "location" | "multiple" | "all";
interface Prof { id: string; email: string; name: string; tier: number }
interface Prefs {
  inapp_enabled: boolean; push_enabled: boolean; warnings: boolean; watches: boolean; outlook: boolean;
  email_optin: boolean; alert_email: string | null;
  text_optin: boolean; alert_phone: string | null; alert_carrier: string | null;
  alert_scope: Scope; alert_location_ids: string[] | null;
}
const DEFAULT_PREFS: Prefs = {
  inapp_enabled: true, push_enabled: true, warnings: true, watches: true, outlook: true,
  email_optin: false, alert_email: null,
  text_optin: false, alert_phone: null, alert_carrier: null,
  alert_scope: "state", alert_location_ids: [],
};

/**
 * Which of a member's locations count, given the scope they chose.
 *
 * "state" and "all" both mean every saved point: we have no state polygon to
 * test against here, and the member's own locations are the honest stand-in for
 * "my state" — every one of them is somewhere they told us they care about.
 * The two narrower scopes are the ones that actually reduce noise, and those we
 * can honour exactly.
 */
function scopedLocations(all: Loc[], prefs: Prefs): Loc[] {
  const chosen = prefs.alert_location_ids ?? [];
  if (prefs.alert_scope === "location") {
    const one = all.find((l) => chosen.includes(l.id)) ?? all.find((l) => l.is_primary) ?? all[0];
    return one ? [one] : [];
  }
  if (prefs.alert_scope === "multiple") {
    const picked = all.filter((l) => chosen.includes(l.id));
    // An empty pick is a member who chose "several" and never chose any. Falling
    // back to everything is the safe direction to be wrong in for a warning.
    return picked.length ? picked : all;
  }
  return all;
}
interface Alert { id: string; kind: "warning" | "watch"; event: string; headline: string; area: string; severity: string }

async function alertsForPoint(lat: number, lon: number): Promise<Alert[]> {
  try {
    const r = await fetch(`${NWS}/alerts/active?status=actual&point=${lat.toFixed(4)},${lon.toFixed(4)}`, { headers: { "User-Agent": UA, Accept: "application/geo+json" } });
    if (!r.ok) return [];
    const data = await r.json() as { features?: { id?: string; properties?: Record<string, unknown> }[] };
    const out: Alert[] = [];
    for (const f of data.features ?? []) {
      const p = f.properties ?? {};
      const event = String(p.event ?? "");
      const isWarning = /warning$/i.test(event), isWatch = /watch$/i.test(event);
      if (!isWarning && !isWatch) continue;
      const sev = String(p.severity ?? "");
      const severity = /tornado/i.test(event) && isWarning ? "extreme" : isWarning || sev === "Extreme" ? "severe" : "moderate";
      out.push({ id: String(p.id ?? f.id ?? `${event}-${p.onset ?? ""}`), kind: isWarning ? "warning" : "watch", event, headline: String(p.headline ?? p.areaDesc ?? event), area: String(p.areaDesc ?? "").split(";")[0], severity });
    }
    return out;
  } catch { return []; }
}

// SPC Day-1 categorical polygons for outlook escalations.
const CAT_RANK: Record<string, number> = { TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5 };
const CAT_NAME: Record<number, string> = { 3: "Enhanced", 4: "Moderate", 5: "High" };
interface RiskPoly { rings: number[][][]; rank: number }
async function fetchSpc(): Promise<RiskPoly[]> {
  for (const url of [`${SPC}/products/outlook/day1otlk_cat.nolyr.geojson`, `${SPC}/products/outlook/day1otlk_cat.lyr.geojson`]) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) continue;
      const d = await r.json();
      const out: RiskPoly[] = [];
      for (const f of d.features ?? []) {
        const rank = CAT_RANK[String(f.properties?.LABEL ?? "").toUpperCase()] ?? 0;
        const g = f.geometry;
        const polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
        for (const poly of polys) out.push({ rings: poly, rank });
      }
      return out;
    } catch { /* next */ }
  }
  return [];
}
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function spcRankAt(lon: number, lat: number, polys: RiskPoly[]): number {
  let best = 0;
  for (const p of polys) if (p.rank > best && p.rings.length && pointInRing(lon, lat, p.rings[0])) best = p.rank;
  return best;
}

// ── the winter half of level 4 ───────────────────────────────────────────────
/**
 * Snow and ice expected at a point over the next 24 hours.
 *
 * The severe half of level 4 rides on SPC's categorical polygons; winter has no
 * equivalent point-queryable polygon product — WPC publishes its winter guidance
 * as images and ArcGIS map services, which is why the Winter Center renders them
 * as pictures. What *is* point-queryable, official and free is the NWS forecast
 * grid, which carries `snowfallAmount` and `iceAccumulation` in millimetres. So
 * the winter outlook is the member's own gridpoint rather than a national
 * polygon, which is if anything the more useful answer: it is the forecast for
 * where they actually are.
 *
 * Two requests per point, and the first (the grid lookup) is stable enough to
 * cache for the life of the run.
 */
interface Winter { snowIn: number; iceIn: number }
const gridUrlCache = new Map<string, string | null>();
async function gridUrlFor(lat: number, lon: number): Promise<string | null> {
  const k = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  if (gridUrlCache.has(k)) return gridUrlCache.get(k)!;
  let url: string | null = null;
  try {
    const r = await fetch(`${NWS}/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers: { "User-Agent": UA } });
    if (r.ok) {
      const d = await r.json() as { properties?: { forecastGridData?: string } };
      url = d.properties?.forecastGridData ?? null;
    }
  } catch { /* leave null */ }
  gridUrlCache.set(k, url);
  return url;
}
/** Total of a gridpoint series over the next `hours`, in the series' own units. */
function sumWithin(series: { validTime: string; value: number | null }[] | undefined, hours: number): number {
  if (!series) return 0;
  const now = Date.now();
  const until = now + hours * 3600_000;
  let total = 0;
  for (const s of series) {
    const start = Date.parse(String(s.validTime).split("/")[0]);
    if (!Number.isFinite(start) || start > until) continue;
    // Anything that already ended is not a forecast any more; the API keeps the
    // current period in the list, so allow a little slack behind `now`.
    if (start < now - 6 * 3600_000) continue;
    total += Number(s.value ?? 0);
  }
  return total;
}
async function winterAt(lat: number, lon: number): Promise<Winter> {
  try {
    const url = await gridUrlFor(lat, lon);
    if (!url) return { snowIn: 0, iceIn: 0 };
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return { snowIn: 0, iceIn: 0 };
    const p = (await r.json() as { properties?: Record<string, { values?: { validTime: string; value: number | null }[] }> }).properties ?? {};
    const mmToIn = (mm: number) => mm / 25.4;
    return {
      snowIn: mmToIn(sumWithin(p.snowfallAmount?.values, 24)),
      iceIn: mmToIn(sumWithin(p.iceAccumulation?.values, 24)),
    };
  } catch { return { snowIn: 0, iceIn: 0 }; }
}

// ── channels ─────────────────────────────────────────────────────────────────
function emailHtml(title: string, body: string): string {
  return `<div style="background:#0a0e1a;padding:24px;font-family:system-ui,Arial,sans-serif;color:#e5e7eb"><div style="max-width:520px;margin:0 auto;background:#111726;border:1px solid #1f2937;border-radius:16px;overflow:hidden"><div style="background:linear-gradient(135deg,#1e1b4b,#0a0e1a);padding:18px 22px"><div style="font-size:18px;font-weight:800;color:#fff">StormSync <span style="color:#a78bfa">WX</span></div></div><div style="padding:22px"><h1 style="font-size:18px;margin:0 0 10px;color:#fff">${title}</h1><p style="font-size:14px;line-height:1.6;color:#cbd5e1;margin:0 0 18px">${body}</p><a href="${APP_URL}/warnings" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:700;font-size:14px">Open StormSync</a><p style="font-size:11px;color:#64748b;margin:18px 0 0">Always defer to official NWS warnings. Manage alert preferences in the app.</p></div></div></div>`;
}
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY || !to) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: RELAY_FROM, to: [to], subject, html }) });
    return r.ok;
  } catch { return false; }
}

/**
 * Carrier email-to-SMS gateways.
 *
 * There is no free SMS API worth building on — every provider that will send an
 * arbitrary text to an arbitrary US number charges per message, and the ones
 * advertising a free tier cap it at a message a day or expire it with a trial.
 * The gateways are the one genuinely free route: the carrier accepts an email
 * addressed to the subscriber's number and delivers it as a text, at no cost to
 * either side and with no account to open.
 *
 * They are best-effort by nature. Carriers filter aggressively, an MVNO rides
 * whichever network it resells so its gateway can change under it, and nobody
 * publishes a delivery receipt. That is the honest trade for free, and it is why
 * TWILIO_* is checked first: set those three and every text goes out through a
 * paid provider that actually confirms delivery instead.
 */
const CARRIER_GATEWAY: Record<string, string> = {
  verizon: "vtext.com",
  att: "txt.att.net",
  tmobile: "tmomail.net",
  uscellular: "email.uscc.net",
  cricket: "sms.cricketwireless.net",
  boost: "sms.myboostmobile.com",
  metropcs: "mymetropcs.com",
  googlefi: "msg.fi.google.com",
  // MVNOs, resolved to the network they resell.
  visible: "vtext.com",
  xfinity: "vtext.com",
  mint: "tmomail.net",
  consumercellular: "mailmymobile.net",
};
/** Ten digits, or null if this is not a US number we can address. */
function digits10(phone: string | null): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 10) return d;
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return null;
}
/**
 * One text. Twilio when it is configured, the carrier gateway otherwise.
 *
 * The body is deliberately short and carries no HTML: a gateway message is
 * truncated hard by the carrier, so the first line has to be the whole point.
 */
async function sendText(phone: string | null, carrier: string | null, body: string): Promise<boolean> {
  const num = digits10(phone);
  if (!num) return false;
  const text = body.length > 300 ? `${body.slice(0, 297)}...` : body;
  if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
    try {
      const form = new URLSearchParams({ To: `+1${num}`, From: TWILIO_FROM, Body: text });
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      return r.ok;
    } catch { return false; }
  }
  const domain = CARRIER_GATEWAY[(carrier ?? "").toLowerCase()];
  if (!domain || !RESEND_API_KEY) return false;
  try {
    // No subject line: carriers prepend it to the body, so a subject just eats
    // characters the alert needs.
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RELAY_FROM, to: [`${num}@${domain}`], subject: "", text }),
    });
    return r.ok;
  } catch { return false; }
}

/**
 * Push to every device a member has registered, once per dedup key.
 *
 * push_sent is keyed by endpoint, so a member reading the alert on their phone
 * still gets it on their tablet, and a re-run of the cron sends neither again.
 */
let vapidReady = false;
async function pushToUser(userId: string, dedupKey: string, payload: { title: string; body: string; url: string; severe?: boolean }): Promise<number> {
  if (!VAPID_PRIVATE) return 0;
  if (!vapidReady) { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); vapidReady = true; }
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint,keys").eq("user_id", userId);
  let sent = 0;
  for (const s of (subs ?? []) as { endpoint: string; keys: { p256dh: string; auth: string } }[]) {
    const { data: already } = await admin.from("push_sent").select("alert_id").eq("endpoint", s.endpoint).eq("alert_id", dedupKey).maybeSingle();
    if (already) continue;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ ...payload, tag: dedupKey }));
      await admin.from("push_sent").insert({ endpoint: s.endpoint, alert_id: dedupKey });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }
  return sent;
}

// Insert a notification if one with this dedup_key doesn't already exist for the user.
async function insertNotif(userId: string, n: { kind: string; severity: string; title: string; body: string; link: string; dedupKey: string }): Promise<boolean> {
  const { data: existing } = await admin.from("notifications").select("id").eq("user_id", userId).eq("dedup_key", n.dedupKey).maybeSingle();
  if (existing) return false;
  const { error } = await admin.from("notifications").insert({ user_id: userId, kind: n.kind, severity: n.severity, title: n.title, body: n.body, link: n.link, dedup_key: n.dedupKey, emailed_at: null });
  return !error;
}

// ── manual sends ─────────────────────────────────────────────────────────────
interface ManualBody {
  mode: "manual";
  userIds?: string[];
  /** Send to everyone holding at least this level, when no ids are given. */
  minLevel?: number;
  title: string;
  body: string;
  link?: string;
  severity?: string;
  channels?: { inapp?: boolean; push?: boolean; email?: boolean; text?: boolean };
}

/**
 * A personal alert, sent by a person.
 *
 * Level 5 is "we come to you", which no cron can satisfy: it is a promise that
 * somebody is watching and will make contact. This is the tool that keeps it —
 * and it doubles as the general-purpose broadcast for anything the automated
 * sweep would never think to send.
 *
 * Entitlements are still respected. An admin cannot text somebody who has not
 * bought a level that includes text, or who never opted in, because the point of
 * selling the ladder is that the ladder means something.
 */
async function runManual(b: ManualBody) {
  const title = String(b.title ?? "").trim();
  const body = String(b.body ?? "").trim();
  if (!title || !body) return json({ ok: false, error: "A manual alert needs a title and a body." }, 400);

  let userIds = Array.isArray(b.userIds) ? b.userIds.filter((s) => typeof s === "string") : [];
  const minLevel = Number(b.minLevel ?? 0);
  if (userIds.length === 0) {
    if (!minLevel) return json({ ok: false, error: "Choose members, or a level to send to." }, 400);
    const { data: profs } = await admin.from("profiles").select("id");
    const all = (profs ?? []).map((p) => p.id as string);
    const holders: string[] = [];
    await Promise.all(all.map(async (uid) => {
      const { data } = await admin.rpc("alert_levels_for", { p_user: uid });
      const held = ((data ?? []) as { level: number; source: string }[]).filter((r) => r.source !== "none").map((r) => r.level);
      if (held.some((l) => l >= minLevel)) holders.push(uid);
    }));
    userIds = holders;
  }
  if (userIds.length === 0) return json({ ok: true, recipients: 0, inapp: 0, push: 0, emails: 0, texts: 0 });

  const want = { inapp: true, push: true, email: true, text: true, ...(b.channels ?? {}) };
  const link = b.link || "/";
  const severity = b.severity || "moderate";
  // One key per send, so re-sending the same words later is a new alert rather
  // than a silent no-op, but a retry inside the same minute is not a duplicate.
  const stamp = new Date().toISOString().slice(0, 16).replace(/\D/g, "");
  const dedupKey = `manual-${stamp}-${title.slice(0, 40).replace(/\s+/g, "-").toLowerCase()}`;

  const { data: profs } = await admin.from("profiles").select("id,email,name,tier").in("id", userIds);
  const profById = new Map((profs ?? []).map((p) => [p.id as string, p as Prof]));
  const { data: prefRows } = await admin.from("notification_prefs").select("*").in("user_id", userIds);
  const prefsById = new Map((prefRows ?? []).map((p) => [p.user_id as string, p as unknown as Prefs]));

  let inapp = 0, push = 0, emails = 0, texts = 0;
  for (const uid of userIds) {
    const prof = profById.get(uid);
    if (!prof) continue;
    const prefs = { ...DEFAULT_PREFS, ...(prefsById.get(uid) ?? {}) };
    const { data: lv } = await admin.rpc("alert_levels_for", { p_user: uid });
    const levels = new Set(((lv ?? []) as { level: number; source: string }[]).filter((r) => r.source !== "none").map((r) => r.level));

    if (want.inapp && prefs.inapp_enabled) {
      if (await insertNotif(uid, { kind: "personal", severity, title, body, link, dedupKey })) inapp++;
    }
    if (want.push && levels.has(2) && prefs.push_enabled) {
      push += await pushToUser(uid, dedupKey, { title, body, url: link, severe: severity === "extreme" });
    }
    if (want.email && levels.has(3) && prefs.email_optin) {
      const to = prefs.alert_email || prof.email || "";
      if (to && await sendEmail(to, title, emailHtml(title, body))) emails++;
    }
    if (want.text && levels.has(3) && prefs.text_optin) {
      if (await sendText(prefs.alert_phone, prefs.alert_carrier, `StormSync: ${title} — ${body}`)) texts++;
    }
  }
  return json({ ok: true, recipients: userIds.length, inapp, push, emails, texts, dedup_key: dedupKey });
}

// ── the scheduled sweep ──────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  let reqBody: Partial<ManualBody> = {};
  try { reqBody = await req.json(); } catch { /* the cron sends no body */ }

  if (reqBody.mode === "manual") {
    // A personal alert is written by a person, so the cron secret is not enough:
    // whoever sends it has to be a signed-in admin.
    if (!(await isAdminCaller(req))) return json({ ok: false, error: "Manual alerts require an admin session." }, 403);
    return await runManual(reqBody as ManualBody);
  }

  const { data: locsData } = await admin.from("saved_locations").select("user_id,id,lat,lon,name,is_primary");
  const locs = (locsData ?? []) as Loc[];
  if (locs.length === 0) return json({ ok: true, users: 0, inapp: 0, push: 0, emails: 0, texts: 0 });
  const userIds = [...new Set(locs.map((l) => l.user_id))];
  const locsByUser = new Map<string, Loc[]>();
  for (const l of locs) { const a = locsByUser.get(l.user_id) ?? []; a.push(l); locsByUser.set(l.user_id, a); }

  const { data: profs } = await admin.from("profiles").select("id,email,name,tier").in("id", userIds);
  const profById = new Map((profs ?? []).map((p) => [p.id, p as Prof]));
  const { data: prefRows } = await admin.from("notification_prefs").select("*").in("user_id", userIds);
  const prefsById = new Map((prefRows ?? []).map((p) => [p.user_id as string, p as unknown as Prefs]));

  // Entitlements, one round trip per member. The RPC is the single definition of
  // who holds what, so this function can never drift from what the app shows.
  const levelsById = new Map<string, Set<number>>();
  await Promise.all(userIds.map(async (uid) => {
    const { data } = await admin.rpc("alert_levels_for", { p_user: uid });
    const held = new Set<number>();
    for (const r of (data ?? []) as { level: number; source: string }[]) {
      if (r.source !== "none") held.add(r.level);
    }
    levelsById.set(uid, held);
  }));

  const ymd = new Date().toISOString().slice(0, 10);
  const spc = await fetchSpc();
  const pointCache = new Map<string, Alert[]>();
  async function getAlerts(lat: number, lon: number): Promise<Alert[]> {
    const k = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (!pointCache.has(k)) pointCache.set(k, await alertsForPoint(lat, lon));
    return pointCache.get(k)!;
  }
  const winterCache = new Map<string, Winter>();
  async function getWinter(lat: number, lon: number): Promise<Winter> {
    const k = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (!winterCache.has(k)) winterCache.set(k, await winterAt(lat, lon));
    return winterCache.get(k)!;
  }

  let inapp = 0, pushes = 0, emails = 0, texts = 0;
  for (const uid of userIds) {
    const prof = profById.get(uid);
    const levels = levelsById.get(uid) ?? new Set<number>();
    // Level 1 is the in-app inbox and is free to everyone, so in practice this
    // only skips somebody whose profile row is missing.
    if (!levels.has(1)) continue;
    const prefs = { ...DEFAULT_PREFS, ...(prefsById.get(uid) ?? {}) };
    if (!prefs.inapp_enabled) continue;
    // Contact channels are level 3, and each is still an opt-in on top: holding
    // the level means we may reach them that way, not that they asked us to.
    const pushOk = levels.has(2) && prefs.push_enabled;
    const emailOk = levels.has(3) && prefs.email_optin;
    const textOk = levels.has(3) && prefs.text_optin;
    const emailTo = prefs.alert_email || prof?.email || "";
    const myLocs = scopedLocations(locsByUser.get(uid) ?? [], prefs);

    // NWS warnings + watches (distinct across the user's locations).
    const seen = new Map<string, { a: Alert; locName: string }>();
    for (const l of myLocs) for (const a of await getAlerts(l.lat, l.lon)) if (!seen.has(a.id)) seen.set(a.id, { a, locName: l.name });
    for (const { a, locName } of seen.values()) {
      if (a.kind === "warning" && !prefs.warnings) continue;
      if (a.kind === "watch" && !prefs.watches) continue;
      const near = locName ? ` near ${locName.split(",")[0]}` : "";
      const title = `${a.event}${near}`;
      const body = a.headline || a.event;
      const created = await insertNotif(uid, { kind: a.kind, severity: a.severity, title, body, link: "/warnings", dedupKey: a.id });
      if (!created) continue;
      inapp++;
      if (pushOk) pushes += await pushToUser(uid, a.id, { title: `⚠️ ${title}`, body, url: "/warnings", severe: a.severity !== "moderate" });
      if (emailOk && emailTo) {
        const ok = await sendEmail(emailTo, `⚠️ ${title}`, emailHtml(title, body));
        if (ok) { emails++; await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("user_id", uid).eq("dedup_key", a.id); }
      }
      if (textOk && await sendText(prefs.alert_phone, prefs.alert_carrier, `StormSync: ${title}. ${body}`)) texts++;
    }

    // SPC Day-1 outlook escalation (ENH+). Level 4 is defined as knowing about
    // the day before the day starts, so this is the line that makes it real.
    if (levels.has(4) && prefs.outlook && spc.length) {
      let maxRank = 0, where = "";
      for (const l of myLocs) { const r = spcRankAt(l.lon, l.lat, spc); if (r > maxRank) { maxRank = r; where = l.name; } }
      if (maxRank >= 3) {
        const name = CAT_NAME[maxRank] ?? "Elevated";
        const near = where ? ` for ${where.split(",")[0]}` : "";
        const title = `SPC ${name} Risk${near}`;
        const body = `Your area is in a Day 1 ${name} (level ${maxRank}/5) severe-weather risk. Stay weather-aware.`;
        const key = `outlook-day1-${ymd}-${maxRank}-${uid}`;
        const created = await insertNotif(uid, { kind: "outlook", severity: maxRank >= 5 ? "extreme" : maxRank >= 4 ? "severe" : "moderate", title, body, link: "/spc", dedupKey: key });
        if (created) {
          inapp++;
          if (pushOk) pushes += await pushToUser(uid, key, { title: `⚠️ ${title}`, body, url: "/spc", severe: maxRank >= 4 });
          if (emailOk && emailTo && await sendEmail(emailTo, `⚠️ ${title}`, emailHtml(title, `${body} Review your plan.`))) emails++;
          if (textOk && await sendText(prefs.alert_phone, prefs.alert_carrier, `StormSync: ${title}. ${body}`)) texts++;
        }
      }
    }

    // The winter half of the same promise. Two inches of snow or a tenth of ice
    // inside 24 hours is the line where a day starts needing planning around.
    if (levels.has(4) && prefs.outlook) {
      let snow = 0, ice = 0, where = "";
      for (const l of myLocs) {
        const w = await getWinter(l.lat, l.lon);
        if (w.snowIn > snow || w.iceIn > ice) where = l.name;
        snow = Math.max(snow, w.snowIn);
        ice = Math.max(ice, w.iceIn);
      }
      if (snow >= 2 || ice >= 0.1) {
        const near = where ? ` for ${where.split(",")[0]}` : "";
        const parts: string[] = [];
        if (snow >= 0.5) parts.push(`${snow.toFixed(snow >= 10 ? 0 : 1)}" of snow`);
        if (ice >= 0.05) parts.push(`${ice.toFixed(2)}" of ice`);
        const what = parts.join(" and ") || "winter precipitation";
        const severity = snow >= 8 || ice >= 0.25 ? "extreme" : snow >= 4 || ice >= 0.1 ? "severe" : "moderate";
        const title = `Winter Outlook${near}`;
        const body = `The NWS forecast grid has ${what} in the next 24 hours. Plan travel around it.`;
        // Bucketed by inch so a forecast that keeps climbing sends again, but a
        // forecast that wobbles by a tenth does not.
        const key = `winter-${ymd}-${Math.floor(snow)}-${Math.round(ice * 10)}-${uid}`;
        const created = await insertNotif(uid, { kind: "outlook", severity, title, body, link: "/winter", dedupKey: key });
        if (created) {
          inapp++;
          if (pushOk) pushes += await pushToUser(uid, key, { title: `❄️ ${title}`, body, url: "/winter", severe: severity !== "moderate" });
          if (emailOk && emailTo && await sendEmail(emailTo, `❄️ ${title}`, emailHtml(title, body))) emails++;
          if (textOk && await sendText(prefs.alert_phone, prefs.alert_carrier, `StormSync: ${title}. ${body}`)) texts++;
        }
      }
    }
  }

  return json({ ok: true, users: userIds.length, inapp, push: pushes, emails, texts });
});
