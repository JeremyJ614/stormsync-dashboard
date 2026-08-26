// StormSync VIP — Alert fan-out (P-19). Cron-driven multi-channel dispatcher.
//
// For every member with saved locations it checks active NWS warnings + watches
// and the SPC Day-1 outlook against those points, then fans out per the ALERT
// LEVEL LADDER (see 20260827010000_alert_levels.sql), not per tier:
//   • level 1 — in-app inbox              → insert into public.notifications
//   • level 3 — email to their contact     → Resend
//   • level 4 — SPC / winter outlook at the start of the day
// Levels come from alert_levels_for(), so a free-tier member who bought level 3
// gets email and a VIP who never set a contact address does not.
//
// This replaced a tier ramp that skipped tier 1 entirely, which meant free
// members received nothing at all even though level 1 has always been free.
// De-duplicated via notifications(user_id, dedup_key). Per-type opt-outs honored.
//
// AUTH: x-engine-secret header (cron) or admin Bearer JWT. SECRET: RESEND_API_KEY
// (optional — without it in-app still works, email is skipped).
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RELAY_FROM = Deno.env.get("RELAY_FROM") ?? "StormSync Alerts <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_URL") ?? "https://stormsync-dashboard.vercel.app";
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
    if (u?.user) {
      const { data: prof } = await admin.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
      if (prof?.is_admin) return true;
    }
  }
  return json({ ok: false, error: "Unauthorized" }, 401);
}

interface Loc { user_id: string; id: string; lat: number; lon: number; name: string; is_primary: boolean }
type Scope = "state" | "location" | "multiple" | "all";
interface Prof { id: string; email: string; name: string; tier: number }
interface Prefs {
  inapp_enabled: boolean; warnings: boolean; watches: boolean; outlook: boolean;
  email_optin: boolean; alert_email: string | null;
  alert_scope: Scope; alert_location_ids: string[] | null;
}
const DEFAULT_PREFS: Prefs = {
  inapp_enabled: true, warnings: true, watches: true, outlook: true,
  email_optin: false, alert_email: null, alert_scope: "state", alert_location_ids: [],
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

// Insert a notification if one with this dedup_key doesn't already exist for the user.
async function insertNotif(userId: string, n: { kind: string; severity: string; title: string; body: string; link: string; dedupKey: string }): Promise<boolean> {
  const { data: existing } = await admin.from("notifications").select("id").eq("user_id", userId).eq("dedup_key", n.dedupKey).maybeSingle();
  if (existing) return false;
  const { error } = await admin.from("notifications").insert({ user_id: userId, kind: n.kind, severity: n.severity, title: n.title, body: n.body, link: n.link, dedup_key: n.dedupKey, emailed_at: null });
  return !error;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  const { data: locsData } = await admin.from("saved_locations").select("user_id,id,lat,lon,name,is_primary");
  const locs = (locsData ?? []) as Loc[];
  if (locs.length === 0) return json({ ok: true, users: 0, inapp: 0, emails: 0 });
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

  let inapp = 0, emails = 0;
  for (const uid of userIds) {
    const prof = profById.get(uid);
    const levels = levelsById.get(uid) ?? new Set<number>();
    // Level 1 is the in-app inbox and is free to everyone, so in practice this
    // only skips somebody whose profile row is missing.
    if (!levels.has(1)) continue;
    const prefs = prefsById.get(uid) ?? DEFAULT_PREFS;
    if (!prefs.inapp_enabled) continue;
    // Email is level 3, and still an opt-in on top: holding the level means we
    // may write to them, not that they asked us to.
    const emailOk = levels.has(3) && prefs.email_optin;
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
      if (emailOk && emailTo) {
        const ok = await sendEmail(emailTo, `⚠️ ${title}`, emailHtml(title, body));
        if (ok) { emails++; await admin.from("notifications").update({ emailed_at: new Date().toISOString() }).eq("user_id", uid).eq("dedup_key", a.id); }
      }
    }

    // SPC Day-1 outlook escalation (ENH+). Level 4 is defined as knowing about
    // the day before the day starts, so this is the line that makes it real.
    if (levels.has(4) && prefs.outlook && spc.length) {
      let maxRank = 0, where = "";
      for (const l of myLocs) { const r = spcRankAt(l.lon, l.lat, spc); if (r > maxRank) { maxRank = r; where = l.name; } }
      if (maxRank >= 3) {
        const name = CAT_NAME[maxRank] ?? "Elevated";
        const near = where ? ` for ${where.split(",")[0]}` : "";
        const created = await insertNotif(uid, { kind: "outlook", severity: maxRank >= 5 ? "extreme" : maxRank >= 4 ? "severe" : "moderate", title: `SPC ${name} Risk${near}`, body: `Your area is in a Day 1 ${name} (level ${maxRank}/5) severe-weather risk. Stay weather-aware.`, link: "/spc", dedupKey: `outlook-day1-${ymd}-${maxRank}-${uid}` });
        if (created) {
          inapp++;
          if (emailOk && emailTo) {
            const ok = await sendEmail(emailTo, `⚠️ SPC ${name} Risk${near}`, emailHtml(`SPC ${name} Risk${near}`, `Your area is in a Day 1 ${name} (level ${maxRank}/5) severe-weather risk today. Stay weather-aware and review your plan.`));
            if (ok) emails++;
          }
        }
      }
    }
  }

  return json({ ok: true, users: userIds.length, inapp, emails });
});
