// StormSync VIP — the flooding outlook.
//
// WPC's Excessive Rainfall Outlook, as GeoJSON. WPC publishes it only as
// zipped shapefiles on their FTP mirror, so this fetches the newest file for
// each day, unzips it, reads the geometry and the attributes, and hands the
// browser something it can draw. Five days: 94e is day 1, 98e day 2, 99e day 3,
// then d4 and d5 — one more day than the severe outlook covers.
//
// Everything is cached for an hour in `weather_cache`. WPC issues day 1 three
// times a day and the rest once, so an hour is fresher than the source.
//
// AUTH: none. It is a public forecast product, and the module that draws it is
// gated on the client the same way every other module is.
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const DIR = "https://ftp-wpc.ncep.noaa.gov/shapefiles/qpf/excessive/";
const DAYS = [
  { day: 1, prefix: "94e", label: "Day 1" },
  { day: 2, prefix: "98e", label: "Day 2" },
  { day: 3, prefix: "99e", label: "Day 3" },
  { day: 4, prefix: "d4",  label: "Day 4" },
  { day: 5, prefix: "d5",  label: "Day 5" },
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200, maxAge = 900) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": `public, max-age=${maxAge}` },
  });

// ── zip ──────────────────────────────────────────────────────────────────────
/**
 * Read the entries of a zip.
 *
 * Via the central directory rather than by scanning for local headers: a local
 * header is allowed to carry zeroes for the sizes and put the real ones in a
 * trailing descriptor, and guessing which it is has no upside.
 */
async function unzip(buf: Uint8Array): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End of central directory: 0x06054b50, within the last 64KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);

  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    // The local header's own name/extra lengths give the true data offset.
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);

    if (method === 0) { out.set(name, raw); continue; }
    if (method !== 8) continue;  // only stored and deflate appear here
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    out.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return out;
}

// ── shapefile ────────────────────────────────────────────────────────────────
type Ring = [number, number][];

/** Signed area. Shapefile winds an outer ring clockwise and a hole the other way. */
function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  }
  return a / 2;
}

/** Polygon records (type 5) out of a .shp. */
function readShp(buf: Uint8Array): Ring[][] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const shapes: Ring[][] = [];
  let p = 100;  // file header
  while (p + 8 <= buf.length) {
    const contentWords = dv.getInt32(p + 4, false);
    const body = p + 8;
    const type = dv.getInt32(body, true);
    if (type === 5) {
      const numParts = dv.getInt32(body + 36, true);
      const numPoints = dv.getInt32(body + 40, true);
      const partsAt = body + 44;
      const pointsAt = partsAt + numParts * 4;
      const parts: number[] = [];
      for (let i = 0; i < numParts; i++) parts.push(dv.getInt32(partsAt + i * 4, true));
      parts.push(numPoints);

      const rings: Ring[] = [];
      for (let i = 0; i < numParts; i++) {
        const ring: Ring = [];
        for (let k = parts[i]; k < parts[i + 1]; k++) {
          ring.push([
            Math.round(dv.getFloat64(pointsAt + k * 16, true) * 1e4) / 1e4,
            Math.round(dv.getFloat64(pointsAt + k * 16 + 8, true) * 1e4) / 1e4,
          ]);
        }
        if (ring.length > 3) rings.push(ring);
      }
      shapes.push(rings);
    } else {
      shapes.push([]);
    }
    p = body + contentWords * 2;
  }
  return shapes;
}

/** Attribute rows out of a .dbf. */
function readDbf(buf: Uint8Array): Record<string, string>[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const nrec = dv.getUint32(4, true);
  const hdrLen = dv.getUint16(8, true);
  const recLen = dv.getUint16(10, true);
  const fields: { name: string; len: number }[] = [];
  let off = 32;
  const dec = new TextDecoder("latin1");
  while (buf[off] !== 0x0d && off < hdrLen) {
    const name = dec.decode(buf.subarray(off, off + 11)).replace(/\0.*$/, "");
    fields.push({ name, len: buf[off + 16] });
    off += 32;
  }
  const rows: Record<string, string>[] = [];
  let p = hdrLen;
  for (let i = 0; i < nrec; i++) {
    const rec = buf.subarray(p, p + recLen);
    p += recLen;
    let o = 1;  // the deletion flag
    const row: Record<string, string> = {};
    for (const f of fields) {
      row[f.name] = dec.decode(rec.subarray(o, o + f.len)).trim();
      o += f.len;
    }
    rows.push(row);
  }
  return rows;
}

// ── outlook categories ───────────────────────────────────────────────────────
/** WPC writes them as "Slight (At Least 15%)"; the rank is what a map needs. */
function rank(outlook: string): number {
  const s = outlook.toLowerCase();
  if (s.startsWith("high")) return 4;
  if (s.startsWith("moderate")) return 3;
  if (s.startsWith("slight")) return 2;
  if (s.startsWith("marginal")) return 1;
  return 0;
}

async function newestFor(listing: string, prefix: string): Promise<string | null> {
  const re = new RegExp(`${prefix}_(\\d{10})\\.zip`, "g");
  let best: string | null = null;
  for (const m of listing.matchAll(re)) {
    if (!best || m[0] > best) best = m[0];
  }
  return best;
}

async function buildDay(listing: string, d: typeof DAYS[number]) {
  const file = await newestFor(listing, d.prefix);
  if (!file) return { ...d, available: false, reason: "No outlook published", features: [] };

  const zipRes = await fetch(DIR + file);
  if (!zipRes.ok) return { ...d, available: false, reason: `WPC returned ${zipRes.status}`, features: [] };
  const entries = await unzip(new Uint8Array(await zipRes.arrayBuffer()));

  const shpName = [...entries.keys()].find((k) => k.toLowerCase().endsWith(".shp"));
  const dbfName = [...entries.keys()].find((k) => k.toLowerCase().endsWith(".dbf"));
  if (!shpName || !dbfName) return { ...d, available: false, reason: "Outlook file had no geometry", features: [] };

  const shapes = readShp(entries.get(shpName)!);
  const rows = readDbf(entries.get(dbfName)!);

  const features = shapes.map((rings, i) => {
    const attrs = rows[i] ?? {};
    // Shapefile parts: a clockwise ring opens a polygon, the other way is a
    // hole in the one before it.
    const polys: Ring[][] = [];
    for (const ring of rings) {
      if (signedArea(ring) > 0 || polys.length === 0) polys.push([ring]);
      else polys[polys.length - 1].push(ring);
    }
    return {
      type: "Feature" as const,
      geometry: polys.length === 1
        ? { type: "Polygon" as const, coordinates: polys[0] }
        : { type: "MultiPolygon" as const, coordinates: polys },
      properties: {
        outlook: attrs.OUTLOOK ?? "",
        rank: rank(attrs.OUTLOOK ?? ""),
        product: attrs.PRODUCT ?? "",
        valid: attrs.VALID_TIME ?? "",
        issued: attrs.ISSUE_TIME ?? "",
        start: attrs.START_TIME ?? "",
        end: attrs.END_TIME ?? "",
      },
    };
  }).filter((f) => f.geometry.coordinates.length > 0 && f.properties.rank > 0);

  const top = features.reduce((m, f) => Math.max(m, f.properties.rank), 0);
  return {
    ...d,
    available: true,
    file,
    issued: features[0]?.properties.issued ?? null,
    valid: features[0]?.properties.valid ?? null,
    maxRank: top,
    features,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const KEY = "wpc:ero:v1";
  try {
    const { data: hit } = await admin
      .from("weather_cache").select("data, fetched_at").eq("key", KEY).maybeSingle();
    if (hit?.data && Date.now() - new Date(hit.fetched_at as string).getTime() < 3600_000) {
      return json(hit.data);
    }
  } catch { /* cache is best-effort */ }

  try {
    const listing = await (await fetch(DIR)).text();
    const days = [];
    for (const d of DAYS) {
      try { days.push(await buildDay(listing, d)); }
      catch (e) {
        // One bad day must not cost the other four.
        days.push({ ...d, available: false, reason: String(e).slice(0, 120), features: [] });
      }
    }
    const payload = { days, source: "NOAA/NWS Weather Prediction Center", fetchedAt: new Date().toISOString() };
    try { await admin.from("weather_cache").upsert({ key: KEY, data: payload, fetched_at: new Date().toISOString() }); }
    catch { /* best-effort */ }
    return json(payload);
  } catch (e) {
    // Serve something stale rather than nothing — an old outlook beats a blank
    // page, as long as the page says how old it is.
    const { data: stale } = await admin.from("weather_cache").select("data").eq("key", KEY).maybeSingle();
    if (stale?.data) return json({ ...(stale.data as object), stale: true }, 200, 300);
    return json({ error: String(e).slice(0, 200) }, 502, 60);
  }
});
