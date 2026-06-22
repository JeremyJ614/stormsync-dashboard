// StormSync VIP — NHC tropical proxy (Phase 10 Hurricane Tracker).
// verify_jwt DISABLED: proxies PUBLIC NOAA/NHC data only. Adds CORS + caching
// (NHC sends no CORS header, so the browser can't fetch it directly).
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = "StormSyncVIP/1.0 (contact: admin@stormsync.media)";
const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200, maxAge = 300) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` } });

async function cacheGet(key: string, ttl: number): Promise<unknown | null> {
  try {
    const { data } = await admin.from("weather_cache").select("data, fetched_at").eq("key", key).maybeSingle();
    if (!data) return null;
    if (Date.now() - new Date(data.fetched_at as string).getTime() > ttl * 1000) return null;
    return data.data;
  } catch { return null; }
}
async function cacheStale(key: string): Promise<unknown | null> {
  try { const { data } = await admin.from("weather_cache").select("data").eq("key", key).maybeSingle(); return data?.data ?? null; } catch { return null; }
}
async function cacheSet(key: string, value: unknown) {
  try { await admin.from("weather_cache").upsert({ key, data: value, fetched_at: new Date().toISOString() }); } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/functions\/v1\/nhc/, "").replace(/^\/nhc/, "") || "/";

  if (route === "/active") {
    const key = "nhc:active";
    const cached = await cacheGet(key, 300);
    if (cached) return json(cached, 200, 300);
    try {
      const r = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.ok) { const data = await r.json(); await cacheSet(key, data); return json(data, 200, 300); }
    } catch { /* fall through */ }
    const stale = await cacheStale(key);
    return json(stale ?? { activeStorms: [] }, 200, 120);
  }
  return json({ error: "not found", route }, 404);
});
