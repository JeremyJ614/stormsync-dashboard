// StormSync VIP — public weather data proxy (replaces the dead Render backend).
//
// Deployed to Supabase Edge Functions as `weather`. verify_jwt is intentionally
// DISABLED: this only proxies PUBLIC NOAA/NWS/SPC data and writes to a
// service-role-only cache. No user data is read or written.
//
// Routes (all under /functions/v1/weather):
//   GET /nws/points?lat=&lon=
//   GET /nws/alerts?point=lat,lon   | (no point => all active alerts)
//   GET /nws/forecast?url=<api.weather.gov url>
//   GET /spc/storm-reports
//   GET /spc/outlook-geojson?product=day1otlk_cat | day1probotlk_torn | ...
//   GET /news/weather?topic=<query>   (Google News RSS, parsed to JSON)
//
// Redeploy: via the Supabase MCP `deploy_edge_function`, or `supabase functions deploy weather`.
import { createClient } from "jsr:@supabase/supabase-js@2";

const UA = "StormSyncVIP/1.0 (contact: admin@stormsync.media)";
const NWS = "https://api.weather.gov";
const SPC = "https://www.spc.noaa.gov";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200, maxAge = 300): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` },
  });
}

// Best-effort cache. Never throws — a cache miss/failure must not break the proxy.
async function cacheGet(key: string, ttlSec: number): Promise<unknown | null> {
  try {
    const { data } = await admin.from("weather_cache").select("data, fetched_at").eq("key", key).maybeSingle();
    if (!data) return null;
    if (Date.now() - new Date(data.fetched_at as string).getTime() > ttlSec * 1000) return null;
    return data.data;
  } catch { return null; }
}
async function cacheSet(key: string, value: unknown): Promise<void> {
  try { await admin.from("weather_cache").upsert({ key, data: value, fetched_at: new Date().toISOString() }); }
  catch { /* ignore */ }
}

async function fetchJSON(url: string): Promise<Response> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/geo+json, application/json" } });
  if (!r.ok) throw new Error(`upstream ${r.status} for ${url}`);
  return r;
}

async function countCsvRows(url: string): Promise<number> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return 0;
    const text = await r.text();
    const lines = text.trim().split(/\r?\n/).filter((l) => l.length > 0);
    // First line is the CSV header.
    return Math.max(0, lines.length - 1);
  } catch { return 0; }
}

// ---- RSS parsing (Google News) ------------------------------------------------
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}
function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}
interface RssItem { title: string; link: string; description: string; source: string; pubDate: string }
function parseRssItems(xml: string): RssItem[] {
  const out: RssItem[] = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/item>/i)[0];
    const rawTitle = pick(block, "title");
    const link = pick(block, "link");
    if (!rawTitle || !link) continue;
    const source = pick(block, "source") || (rawTitle.includes(" - ") ? rawTitle.split(" - ").pop()! : "Google News");
    // Google News prefixes the title with the headline and " - Source"; trim the source suffix.
    const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
    const description = pick(block, "description").replace(/<[^>]+>/g, "").slice(0, 200);
    const pubDate = pick(block, "pubDate");
    out.push({ title, link, description, source, pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString() });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  // Strip the function mount prefix to get the logical route.
  const route = url.pathname.replace(/^\/functions\/v1\/weather/, "").replace(/^\/weather/, "") || "/";

  try {
    // ---- NWS points -------------------------------------------------------
    if (route === "/nws/points") {
      const lat = url.searchParams.get("lat");
      const lon = url.searchParams.get("lon");
      if (!lat || !lon) return json({ error: "lat and lon required" }, 400);
      const r = await fetchJSON(`${NWS}/points/${lat},${lon}`);
      return json(await r.json(), 200, 3600);
    }

    // ---- NWS alerts -------------------------------------------------------
    if (route === "/nws/alerts") {
      const point = url.searchParams.get("point");
      const q = point
        ? `${NWS}/alerts/active?status=actual&point=${encodeURIComponent(point)}`
        : `${NWS}/alerts/active?status=actual`;
      const r = await fetchJSON(q);
      return json(await r.json(), 200, 120);
    }

    // ---- NWS forecast / generic product passthrough (SSRF-guarded) --------
    if (route === "/nws/forecast") {
      const target = url.searchParams.get("url");
      if (!target || !target.startsWith(`${NWS}/`)) return json({ error: "invalid url" }, 400);
      const r = await fetchJSON(target);
      return json(await r.json(), 200, 300);
    }

    // ---- SPC storm reports (counts) --------------------------------------
    if (route === "/spc/storm-reports") {
      const cached = await cacheGet("spc:storm-reports", 600);
      if (cached) return json(cached, 200, 600);
      const [tT, tH, tW, yT, yH, yW] = await Promise.all([
        countCsvRows(`${SPC}/climo/reports/today_torn.csv`),
        countCsvRows(`${SPC}/climo/reports/today_hail.csv`),
        countCsvRows(`${SPC}/climo/reports/today_wind.csv`),
        countCsvRows(`${SPC}/climo/reports/yesterday_torn.csv`),
        countCsvRows(`${SPC}/climo/reports/yesterday_hail.csv`),
        countCsvRows(`${SPC}/climo/reports/yesterday_wind.csv`),
      ]);
      const out = {
        today: { tornado: tT, hail: tH, wind: tW },
        yesterday: { tornado: yT, hail: yH, wind: yW },
      };
      await cacheSet("spc:storm-reports", out);
      return json(out, 200, 600);
    }

    // ---- SPC outlook GeoJSON (Day 1-3 detailed + Day 4-8 any-severe) -----
    if (route === "/spc/outlook-geojson") {
      const product = url.searchParams.get("product") ?? "";
      const isExt = /^day[4-8]prob$/.test(product); // Day 4-8 combined "any severe" outlook
      if (!/^day[1-3](otlk|probotlk)_[a-z]+$/.test(product) && !isExt) return json({ error: "invalid product" }, 400);
      const key = `spc:geojson:${product}`;
      const cached = await cacheGet(key, 900);
      if (cached) return json(cached, 200, 900);
      // Day 4-8 outlooks live under exper/day4-8 (layered has the probability features);
      // Day 1-3 under products/outlook (non-layered preferred).
      const base = isExt ? `${SPC}/products/exper/day4-8/${product}` : `${SPC}/products/outlook/${product}`;
      const candidates = isExt
        ? [`${base}.lyr.geojson`, `${base}.nolyr.geojson`]
        : [`${base}.nolyr.geojson`, `${base}.lyr.geojson`];
      let geo: unknown | null = null;
      for (const c of candidates) {
        try { const r = await fetchJSON(c); geo = await r.json(); break; } catch { /* try next */ }
      }
      if (!geo) return json({ type: "FeatureCollection", features: [] }, 200, 300);
      await cacheSet(key, geo);
      return json(geo, 200, 900);
    }

    // ---- Weather news (Google News RSS, parsed server-side) ---------------
    if (route === "/news/weather") {
      const topic = url.searchParams.get("topic") ?? "severe weather OR tornado OR hurricane OR storm";
      const key = `news:${topic}`;
      const cached = await cacheGet(key, 600);
      if (cached) return json(cached, 200, 600);
      const feed = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
      try {
        const r = await fetch(feed, { headers: { "User-Agent": UA } });
        if (!r.ok) return json({ items: [] }, 200, 120);
        const xml = await r.text();
        const items = parseRssItems(xml).slice(0, 12);
        const out = { items };
        if (items.length) await cacheSet(key, out);
        return json(out, 200, 600);
      } catch {
        return json({ items: [] }, 200, 120);
      }
    }

    return json({ error: "not found", route }, 404);
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 502);
  }
});
