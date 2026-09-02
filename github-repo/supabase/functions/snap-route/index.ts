// StormSync VIP — road snapping for chase routes.
//
// An admin draws a handful of points along the road they drove; this returns
// the actual road geometry between them. It runs once, when a chase is saved,
// and the result is stored — so nobody looking at the map ever calls a routing
// service, and the map costs nothing to view no matter how many people open it.
//
// Valhalla on the FOSSGIS public server does the work: free, no key, and its
// routing endpoint takes the drawn points as through-waypoints and returns the
// road between them.
//
// Two map-*matching* services were tried first and both are the wrong tool for
// hand-placed points. OSRM's matcher returns NoMatch; Valhalla's trace_route
// refuses outright with "exceeded breakage distance for all pairs: 10000
// meters". Both are correct — a matcher expects a dense GPS trace, and clicks
// forty miles apart are not one. Routing through them is.
//
// If MAPBOX_TOKEN is ever set it is used first, purely for the SLA. Nothing
// requires it.
//
// AUTH: admin Bearer JWT. Snapping is a write-path tool, not a public one.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MAPBOX_TOKEN = Deno.env.get("MAPBOX_TOKEN") ?? "";

const VALHALLA = "https://valhalla1.openstreetmap.de/route";
/**
 * Upstream deadline.
 *
 * Both routers are somebody else's free service, and a socket that is accepted
 * but never answered is the failure mode that hurts: the function sits on it,
 * the admin's Snap button spins, and the drawn route looks lost. A timeout
 * turns that into the fallback this function was already written to take.
 */
const UPSTREAM_TIMEOUT_MS = 12_000;
/** The public server is a shared resource; a chase never needs more than this. */
const MAX_POINTS = 50;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type LngLat = [number, number];

/** Valhalla returns polyline6. */
function decodePolyline(str: string, precision = 6): LngLat[] {
  const factor = Math.pow(10, precision);
  const out: LngLat[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < str.length) {
    let shift = 0, result = 0, byte: number;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = str.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    out.push([lng / factor, lat / factor]);
  }
  return out;
}

/** Great-circle length of a line, in miles. */
function lineMiles(coords: LngLat[]): number {
  const R = 3958.7613;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lo1, la1] = coords[i - 1], [lo2, la2] = coords[i];
    const p1 = (la1 * Math.PI) / 180, p2 = (la2 * Math.PI) / 180;
    const dp = p2 - p1, dl = ((lo2 - lo1) * Math.PI) / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return total;
}

async function viaValhalla(points: LngLat[]): Promise<{ coords: LngLat[]; miles: number } | null> {
  // Everything between the ends is a `through`, so the route passes each drawn
  // point rather than treating it as a stop it may re-route around.
  const body = {
    locations: points.map(([lon, lat], i) => ({
      lat, lon, type: i === 0 || i === points.length - 1 ? "break" : "through",
    })),
    costing: "auto",
    units: "miles",
  };
  const r = await fetch(VALHALLA, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!r.ok) return null;
  const d = await r.json();
  const legs = d?.trip?.legs ?? [];
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const out: LngLat[] = [];
  for (const leg of legs) {
    const part = decodePolyline(String(leg.shape ?? ""));
    // Legs share an endpoint; dropping the duplicate keeps the line clean.
    out.push(...(out.length ? part.slice(1) : part));
  }
  if (out.length < 2) return null;
  const reported = Number(d?.trip?.summary?.length);
  return { coords: out, miles: Number.isFinite(reported) ? reported : lineMiles(out) };
}

async function viaMapbox(points: LngLat[]): Promise<{ coords: LngLat[]; miles: number } | null> {
  if (!MAPBOX_TOKEN) return null;
  const coords = points.map(([lo, la]) => `${lo},${la}`).join(";");
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?geometries=geojson&overview=full&access_token=${encodeURIComponent(MAPBOX_TOKEN)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!r.ok) return null;
  const d = await r.json();
  const c = d?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const metres = Number(d?.routes?.[0]?.distance);
  return { coords: c as LngLat[], miles: Number.isFinite(metres) ? metres / 1609.344 : lineMiles(c as LngLat[]) };
}

async function authorize(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return false;
  const { data: prof } = await admin.from("profiles").select("is_admin").eq("id", u.user.id).maybeSingle();
  return prof?.is_admin === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!(await authorize(req))) return json({ ok: false, error: "Unauthorized" }, 401);

  let points: LngLat[] = [];
  try {
    const body = await req.json();
    points = (body?.points ?? []) as LngLat[];
  } catch { /* handled below */ }

  const clean = points
    .filter((p) => Array.isArray(p) && p.length === 2 &&
      Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
      Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)
    .slice(0, MAX_POINTS);

  if (clean.length < 2) return json({ ok: false, error: "Need at least two points" }, 400);

  try {
    const attempt = async (fn: (p: LngLat[]) => Promise<{ coords: LngLat[]; miles: number } | null>) => {
      try { return await fn(clean); } catch { return null; }
    };
    const snapped = (await attempt(viaMapbox)) ?? (await attempt(viaValhalla));
    if (!snapped) {
      // Better a straight line the map admits is a straight line than an error
      // that loses the admin's drawing.
      return json({ ok: true, snapped: false, coords: clean, miles: Number(lineMiles(clean).toFixed(1)) });
    }
    return json({ ok: true, snapped: true, coords: snapped.coords, miles: Number(snapped.miles.toFixed(1)) });
  } catch (e) {
    return json({ ok: true, snapped: false, coords: clean, miles: Number(lineMiles(clean).toFixed(1)), note: String(e).slice(0, 120) });
  }
});
