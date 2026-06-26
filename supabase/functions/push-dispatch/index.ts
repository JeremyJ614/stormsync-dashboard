// StormSync VIP — Web Push dispatcher (Phase 8B).
//
// Runs frequently (pg_cron, ~every 10 min). For every push subscriber it checks
// their saved locations against active NWS *warnings* and sends a push for any
// warning it hasn't already notified that device about (deduped via `push_sent`).
//
// AUTH: x-engine-secret header matching app_config.storm_engine_secret (cron),
//       or an admin Bearer JWT (manual trigger).
//
// SECRET: VAPID_PRIVATE_KEY (the private half of the app's VAPID keypair). Until
// it's set the function no-ops gracefully. VAPID_SUBJECT optional (mailto/URL).
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const VAPID_PUBLIC = "BPQVDL8EAh58PxE8ZB6Wz-6coY_4MtJ0EiZf_tSMxgBdUlkSsUe6GgmzH4P3rtYTBn1wvB6KcgRCgxIFJ4nXwYo";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@stormsync.media";

const UA = "StormSyncVIP/1.0 (contact: admin@stormsync.media)";
const NWS = "https://api.weather.gov";

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

interface Sub { id: string; user_id: string; endpoint: string; keys: { p256dh: string; auth: string } }
interface Loc { user_id: string; lat: number; lon: number; name: string }
interface AlertOut { id: string; event: string; headline: string; area: string; severe: boolean }

// Active NWS warnings affecting a point (cached per point within a run).
async function warningsForPoint(lat: number, lon: number): Promise<AlertOut[]> {
  try {
    const r = await fetch(`${NWS}/alerts/active?status=actual&point=${lat.toFixed(4)},${lon.toFixed(4)}`, {
      headers: { "User-Agent": UA, Accept: "application/geo+json" },
    });
    if (!r.ok) return [];
    const data = await r.json() as { features?: { id?: string; properties?: Record<string, unknown> }[] };
    const out: AlertOut[] = [];
    for (const f of data.features ?? []) {
      const p = f.properties ?? {};
      const event = String(p.event ?? "");
      if (!/warning$/i.test(event)) continue; // only Warnings (not watches/advisories)
      const sev = String(p.severity ?? "");
      out.push({
        id: String(p.id ?? f.id ?? `${event}-${p.onset ?? ""}`),
        event,
        headline: String(p.headline ?? p.areaDesc ?? event),
        area: String(p.areaDesc ?? "").split(";")[0],
        severe: /tornado/i.test(event) || sev === "Extreme",
      });
    }
    return out;
  } catch { return []; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  if (!VAPID_PRIVATE) return json({ ok: true, skipped: "no_vapid_key" });
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  // Subscribers + their saved locations.
  const { data: subs } = await admin.from("push_subscriptions").select("id,user_id,endpoint,keys");
  if (!subs || subs.length === 0) return json({ ok: true, sent: 0, subscribers: 0 });
  const userIds = [...new Set((subs as Sub[]).map((s) => s.user_id))];
  const { data: locs } = await admin.from("saved_locations").select("user_id,lat,lon,name").in("user_id", userIds);
  const locsByUser = new Map<string, Loc[]>();
  for (const l of (locs ?? []) as Loc[]) { const a = locsByUser.get(l.user_id) ?? []; a.push(l); locsByUser.set(l.user_id, a); }

  const pointCache = new Map<string, AlertOut[]>();
  async function getWarnings(lat: number, lon: number): Promise<AlertOut[]> {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (!pointCache.has(key)) pointCache.set(key, await warningsForPoint(lat, lon));
    return pointCache.get(key)!;
  }

  let sent = 0, removed = 0;
  for (const s of subs as Sub[]) {
    const myLocs = locsByUser.get(s.user_id) ?? [];
    if (myLocs.length === 0) continue;
    // Collect distinct warnings across this user's locations.
    const seen = new Map<string, { alert: AlertOut; locName: string }>();
    for (const l of myLocs) {
      for (const w of await getWarnings(l.lat, l.lon)) if (!seen.has(w.id)) seen.set(w.id, { alert: w, locName: l.name });
    }
    for (const { alert, locName } of seen.values()) {
      // Dedup: skip if this endpoint was already told about this alert.
      const { data: already } = await admin.from("push_sent").select("alert_id").eq("endpoint", s.endpoint).eq("alert_id", alert.id).maybeSingle();
      if (already) continue;
      const payload = JSON.stringify({
        title: `⚠️ ${alert.event}`,
        body: `${alert.headline || alert.event}${locName ? ` — near ${locName.split(",")[0]}` : ""}`,
        url: "/warnings",
        tag: alert.id,
        severe: alert.severe,
      });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
        await admin.from("push_sent").insert({ endpoint: s.endpoint, alert_id: alert.id });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) { await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint); removed++; break; }
      }
    }
  }

  return json({ ok: true, subscribers: subs.length, sent, removed_stale: removed });
});
