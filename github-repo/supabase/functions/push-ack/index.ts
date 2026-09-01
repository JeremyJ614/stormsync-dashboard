// StormSync VIP — push delivery receipts.
//
// A web push service returns 201 for any subscription it still recognises,
// including one belonging to a browser profile that was wiped months ago. So
// "sent" has never meant "arrived", and the admin panel could honestly report
// `sent: 1` for a push nobody would ever see.
//
// This is the other half. The service worker calls it when a push actually
// lands, and the row gets a timestamp. A device that accepts but never
// acknowledges is a dead registration and now shows as one.
//
// AUTH: none, deliberately. The only thing you can do here is stamp a row you
// already hold the endpoint for, and an endpoint is a bearer secret known only
// to that device and to us. Requiring a JWT would break the one caller that
// matters: a service worker handling a push while the app is closed and no
// session is in memory.
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  let endpoint = "";
  try {
    const body = await req.json();
    endpoint = String(body?.endpoint ?? "");
  } catch { /* fall through to the length check */ }

  // A push endpoint is a long https URL. Anything else is noise.
  if (!endpoint.startsWith("https://") || endpoint.length < 40 || endpoint.length > 2048) {
    return new Response(JSON.stringify({ ok: false }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const { data, error } = await admin.rpc("record_push_ack", { p_endpoint: endpoint });
  if (error) {
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  // `matched: false` for an endpoint we do not hold — not an error, and not
  // something to say more about than that.
  return new Response(JSON.stringify({ ok: true, matched: data === true }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
