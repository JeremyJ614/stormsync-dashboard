// StormSync VIP — road snapping for chase routes.
//
// An admin draws a handful of points along the road they drove; this returns
// the actual road geometry between them. It runs once, when a chase is saved,
// and the result is stored — so nobody looking at the map ever calls a routing
// service, and the map costs nothing to view no matter how many people open it.
//
// ROUTING, AND WHY IT CHANGED. This used Valhalla on the FOSSGIS public server,
// and that is why the Snap button spun for ever: `valhalla1.openstreetmap.de` no
// longer answers. Not slow — dead. DNS resolves in 136 ms and then the TLS
// handshake hangs until the client gives up, measured both from here and from
// Supabase's own network (a 20-second pg_net probe: "TCP/SSL handshake time:
// 19865 ms, HTTP request/response time: 0"). `valhalla.openstreetmap.de` is the
// same. No timeout could have saved it; it needed a router that exists.
//
// OSRM does, on two public deployments that both answer in under 0.7 s:
// FOSSGIS's `routing.openstreetmap.de/routed-car` first, then the OSRM demo
// server. Its `/route/v1/driving` endpoint takes the drawn points as waypoints
// and returns the road through them, which is exactly what is wanted here.
// Valhalla is kept as a last resort in case it comes back.
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
// This function also geocodes, on `mode: "geocode"` — an address or a town name
// in, a point out, and a point in, a place name out. It lives here rather than
// in its own function because it is the same admin tool doing the same job
// (turning what somebody knows into a waypoint) behind the same admin check.
//
// AUTH: admin Bearer JWT. Snapping is a write-path tool, not a public one.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MAPBOX_TOKEN = Deno.env.get("MAPBOX_TOKEN") ?? "";

const VALHALLA = "https://valhalla1.openstreetmap.de/route";
/** OSRM deployments, in the order they are tried. Both are free and keyless. */
const OSRM_HOSTS = [
  "https://routing.openstreetmap.de/routed-car",
  "https://router.project-osrm.org",
];
const NOMINATIM = "https://nominatim.openstreetmap.org";
/** Nominatim's usage policy requires a real identifying User-Agent. */
const UA = "StormSyncVIP/1.0 (+https://vip.sswx.space)";
/**
 * Upstream deadline.
 *
 * Both routers are somebody else's free service, and a socket that is accepted
 * but never answered is the failure mode that hurts: the function sits on it,
 * the admin's Snap button spins, and the drawn route looks lost. A timeout
 * turns that into the fallback this function was already written to take.
 */
const UPSTREAM_TIMEOUT_MS = 12_000;
/**
 * The public routers are shared resources, and a URL has a length limit, so a
 * freehand-drawn route of several hundred points cannot be sent as-is.
 *
 * It is DOWNSAMPLED to this many rather than truncated. Truncating kept the
 * first fifty points and threw the rest of the drive away, which is how a
 * 635-mile route came back reporting a fraction of a mile: the length was
 * measured on the stub. Downsampling keeps the first point, the last point, and
 * an even spread between, so the shape and the distance both survive.
 */
const MAX_POINTS = 50;

/** Even sample that always keeps both ends. */
function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  const step = (items.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * step)]);
  return out;
}

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

/**
 * OSRM. Waypoints in the path, the road out.
 *
 * `overview=full` with `geometries=polyline6` is what keeps the reply small
 * enough to be worth having: a full-resolution GeoJSON line for a 600-mile
 * route is megabytes, the same line as polyline6 is tens of kilobytes, and this
 * function already has a decoder for it.
 */
async function viaOsrm(points: LngLat[]): Promise<{ coords: LngLat[]; miles: number } | null> {
  const path = points.map(([lo, la]) => `${lo.toFixed(6)},${la.toFixed(6)}`).join(";");
  for (const host of OSRM_HOSTS) {
    try {
      const url = `${host}/route/v1/driving/${path}?overview=full&geometries=polyline6&continue_straight=false`;
      const r = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d?.code !== "Ok") continue;
      const route = d?.routes?.[0];
      const coords = decodePolyline(String(route?.geometry ?? ""));
      if (coords.length < 2) continue;
      const metres = Number(route?.distance);
      return { coords, miles: Number.isFinite(metres) ? metres / 1609.344 : lineMiles(coords) };
    } catch {
      // Try the next deployment. A dead host is exactly why there are two.
      continue;
    }
  }
  return null;
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

// ── geocoding ────────────────────────────────────────────────────────────────
/**
 * Nominatim, forwards and backwards.
 *
 * Server-side rather than from the browser for two reasons that both matter:
 * Nominatim's usage policy asks for an identifying User-Agent, which a browser
 * will not let a page set, and going through here means one admin-only entry
 * point rather than every editor session hitting a public service directly.
 */
interface Place { label: string; lon: number; lat: number }

function placeLabel(r: Record<string, unknown>): string {
  const a = (r.address ?? {}) as Record<string, string>;
  const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.county ?? "";
  const state = a.state_code ?? a.state ?? "";

  // A street, if there is one. Searching an address and getting back the name of
  // the city is not an answer — three motel car parks on the same edge of town
  // all reduce to "Woodward, Oklahoma" and the list becomes unusable.
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const named = street || (r.category === "amenity" || r.category === "tourism" ? String(r.name ?? "") : "");

  const tail = town && state ? `${town}, ${state}` : town || state;
  if (named && tail) return `${named}, ${tail}`;
  if (tail) return tail;

  // Nominatim's display_name is the full postal chain; the first two parts are
  // the part a chaser would actually say out loud.
  const display = String(r.display_name ?? "");
  return display.split(",").slice(0, 2).map((x) => x.trim()).filter(Boolean).join(", ") || display;
}

async function geocode(query: string): Promise<Place[]> {
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(query)}&format=jsonv2` +
    `&addressdetails=1&limit=6&countrycodes=us,ca`;
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!r.ok) return [];
  const rows = await r.json();
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row: Record<string, unknown>) => {
    const lat = Number(row.lat), lon = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return [{ label: placeLabel(row), lon, lat }];
  });
}

async function reverse(lon: number, lat: number): Promise<Place | null> {
  const url = `${NOMINATIM}/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1&zoom=12`;
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  if (!r.ok) return null;
  const row = await r.json();
  if (!row || row.error) return null;
  return { label: placeLabel(row), lon, lat };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!(await authorize(req))) return json({ ok: false, error: "Unauthorized" }, 401);

  let points: LngLat[] = [];
  let mode = "snap";
  let query = "";
  let at: LngLat | null = null;
  try {
    const body = await req.json();
    points = (body?.points ?? []) as LngLat[];
    if (typeof body?.mode === "string") mode = body.mode;
    if (typeof body?.query === "string") query = body.query.trim();
    if (Array.isArray(body?.at) && body.at.length === 2) at = [Number(body.at[0]), Number(body.at[1])];
  } catch { /* handled below */ }

  if (mode === "geocode") {
    try {
      if (at && Number.isFinite(at[0]) && Number.isFinite(at[1])) {
        const place = await reverse(at[0], at[1]);
        return json({ ok: true, places: place ? [place] : [] });
      }
      if (query.length < 2) return json({ ok: true, places: [] });
      return json({ ok: true, places: await geocode(query) });
    } catch (e) {
      return json({ ok: false, error: String(e).slice(0, 140) }, 502);
    }
  }

  const clean = points.filter((p) => Array.isArray(p) && p.length === 2 &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);

  if (clean.length < 2) return json({ ok: false, error: "Need at least two points" }, 400);

  // What goes to the router, versus what the fallback measures. These were the
  // same list, and that is the bug: the truncated stub was being measured.
  const asked = downsample(clean, MAX_POINTS);
  const drawnMiles = Number(lineMiles(clean).toFixed(1));

  try {
    const attempt = async (fn: (p: LngLat[]) => Promise<{ coords: LngLat[]; miles: number } | null>) => {
      try { return await fn(asked); } catch { return null; }
    };
    const snapped = (await attempt(viaMapbox))
      ?? (await attempt(viaOsrm))
      ?? (await attempt(viaValhalla));
    if (!snapped) {
      // Better a straight line the map admits is a straight line than an error
      // that loses the admin's drawing — and the line handed back is everything
      // they drew, not the sample that was sent to the router.
      return json({ ok: true, snapped: false, coords: clean, miles: drawnMiles });
    }
    return json({ ok: true, snapped: true, coords: snapped.coords, miles: Number(snapped.miles.toFixed(1)) });
  } catch (e) {
    return json({ ok: true, snapped: false, coords: clean, miles: drawnMiles, note: String(e).slice(0, 120) });
  }
});
