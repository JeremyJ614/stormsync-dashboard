// StormSync VIP — owner notifications.
//
// Drains `public.owner_events` and pushes each one to every admin's registered
// devices. This is the half of the push system that points at the owner rather
// than at the membership: signups, contact-form messages, anything that earns
// money, and — if it is switched on — general member activity.
//
// Why a queue and not a direct send: Postgres cannot speak Web Push, and an
// outbound HTTP call inside a trigger would let a slow push endpoint hold up
// somebody's signup. The triggers write rows; this drains them. If this is down
// the events wait rather than being lost.
//
// Events are marked dispatched even when every push fails. A queue that retries
// a device that has been uninstalled for a month is a queue that only ever
// grows, and the same information is in the admin panel either way — the push
// is a convenience, not the record.
//
// AUTH: x-engine-secret header (cron) or an admin Bearer JWT (manual trigger).
// SECRET: VAPID_PRIVATE_KEY. Without it the function no-ops rather than
//         draining the queue, so nothing is silently thrown away.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const VAPID_PUBLIC = "BPQVDL8EAh58PxE8ZB6Wz-6coY_4MtJ0EiZf_tSMxgBdUlkSsUe6GgmzH4P3rtYTBn1wvB6KcgRCgxIFJ4nXwYo";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@stormsync.media";

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

interface OwnerEvent {
  id: string; category: string; title: string; body: string; link: string | null;
}
interface Sub { endpoint: string; keys: { p256dh: string; auth: string }; user_id: string }

/** The emoji is the whole message on a lock screen, so it does some work. */
const MARK: Record<string, string> = {
  signup: "👋", contact: "✉️", money: "💷", activity: "📍",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const auth = await authorize(req);
  if (auth instanceof Response) return auth;

  let body: { test?: boolean; limit?: number } = {};
  try { body = await req.json(); } catch { /* the cron sends none */ }

  if (!VAPID_PRIVATE) return json({ ok: true, skipped: "no_vapid_key" });
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  // Every admin's devices. Owner notifications go to whoever runs the place,
  // which may be more than one person.
  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  const adminIds = (admins ?? []).map((a) => a.id as string);
  if (adminIds.length === 0) return json({ ok: true, admins: 0, sent: 0 });

  const { data: subsData } = await admin
    .from("push_subscriptions").select("endpoint,keys,user_id").in("user_id", adminIds);
  const subs = (subsData ?? []) as Sub[];

  async function pushAll(payload: Record<string, unknown>): Promise<{ sent: number; removed: number }> {
    let sent = 0, removed = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload));
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          removed++;
        }
      }
    }
    return { sent, removed };
  }

  // A one-off, to prove the chain works without waiting for somebody to sign up.
  if (body.test) {
    const r = await pushAll({
      title: "✅ Owner notifications are on",
      body: "This is what a signup, a message or a sale will look like.",
      url: "/admin", tag: "owner-test",
    });
    return json({ ok: true, test: true, admins: adminIds.length, devices: subs.length, ...r });
  }

  const { data: pending, error } = await admin.rpc("owner_events_pending", { p_limit: body.limit ?? 40 });
  if (error) return json({ ok: false, error: error.message }, 500);
  const events = (pending ?? []) as OwnerEvent[];
  if (events.length === 0) return json({ ok: true, admins: adminIds.length, devices: subs.length, events: 0, sent: 0 });

  let sent = 0, removed = 0;
  const done: string[] = [];
  for (const e of events) {
    if (subs.length > 0) {
      const r = await pushAll({
        title: `${MARK[e.category] ?? "🔔"} ${e.title}`,
        body: e.body,
        url: e.link ?? "/admin",
        tag: `owner-${e.id}`,
      });
      sent += r.sent; removed += r.removed;
    }
    // Marked done regardless — see the note at the top of the file.
    done.push(e.id);
  }
  if (done.length) {
    await admin.from("owner_events").update({ dispatched_at: new Date().toISOString() }).in("id", done);
  }

  return json({ ok: true, admins: adminIds.length, devices: subs.length, events: events.length, sent, removed_stale: removed });
});
