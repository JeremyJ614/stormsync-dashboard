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
const SWPC = "https://services.swpc.noaa.gov";

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
// Google News double-escapes its descriptions, so `&amp;nbsp;` survives one
// decode pass as a literal `&nbsp;` — which is exactly what was printing in the
// feed. Decoding is table-driven and runs again after tags are stripped.
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", middot: "\u00b7",
};
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[String(name).toLowerCase()] ?? m);
}
function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}
interface RssItem {
  title: string; link: string; description: string; source: string; pubDate: string;
  /** Syndicated article text, when the publisher actually syndicates any. */
  body?: string;
  /** The publisher's own lead image, from the feed's enclosure or media tag. */
  image?: string;
  /** True when `body` is long enough to be worth reading in place. */
  readable?: boolean;
}

/**
 * Where the Weather News tab gets its stories.
 *
 * WHY THERE ARE SEVEN FEEDS AND NOT JUST GOOGLE NEWS
 *
 * The tab used to be Google News alone, and Google News cannot be read in
 * place — not as a design choice but because there is nothing to read. Its RSS
 * `<description>` is the headline repeated inside an anchor plus the publisher
 * name in grey, and nothing else; checked against the live feed, a 386-byte
 * description contains 89 characters of text and all of them are the title.
 * The `<link>` is a `news.google.com/rss/articles/CBMi…` token that does not
 * redirect: fetching it returns a JavaScript page whose canonical URL is
 * itself, so the destination cannot be resolved server-side either. All the
 * `<source url>` gives is the publisher's home page.
 *
 * What Google News is genuinely good at is BREADTH — it aggregates the local
 * outlets that actually cover a tornado in Guernsey County. So it stays, as
 * headlines that link out.
 *
 * Alongside it are feeds published by the people who wrote the articles, where
 * the syndicated text is the point. Measured against the live feeds: NOAA runs
 * to about 5,300 characters an item with images and is a work of the United
 * States government; the National Hurricane Center's tropical outlooks are the
 * full product text; ScienceDaily, Severe Weather Europe and Phys.org run a
 * few hundred characters of real summary. Those are readable in place, which
 * is the whole request, and they are readable because their publishers put
 * them in a feed for exactly this.
 *
 * Nothing here scrapes an article page. A publisher's feed is an offer; their
 * page is not, and the difference is the reason this list exists.
 */
const NEWS_FEEDS: { url: string; source: string; readable: boolean; onTopic?: boolean }[] = [
  // `onTopic` feeds are about weather by definition. The others are general
  // earth-science feeds that happen to carry weather — they are filtered.
  { url: "https://www.noaa.gov/rss.xml", source: "NOAA", readable: true, onTopic: true },
  { url: "https://www.nhc.noaa.gov/index-at.xml", source: "National Hurricane Center", readable: true, onTopic: true },
  { url: "https://www.sciencedaily.com/rss/earth_climate/severe_weather.xml", source: "ScienceDaily", readable: true, onTopic: true },
  { url: "https://www.severe-weather.eu/feed/", source: "Severe Weather Europe", readable: true, onTopic: true },
  { url: "https://phys.org/rss-feed/earth-news/", source: "Phys.org", readable: true },
  { url: "https://yaleclimateconnections.org/feed/", source: "Yale Climate Connections", readable: true },
];

/**
 * Is this story actually about weather?
 *
 * Phys.org and Yale Climate Connections carry excellent long-form text, which
 * is why they are here, but their feeds are earth science broadly: run without
 * this, the readable half of the tab filled up with disposable vapes,
 * microplastics in Switzerland and urban food emissions. All real science, none
 * of it what somebody opened a severe-weather app to read.
 *
 * Deliberately generous — it is a relevance filter, not a taxonomy — and only
 * applied to the feeds that need it.
 */
const WEATHER_WORDS = /\b(weather|storm|storms|stormy|tornado|tornadic|hurricane|typhoon|cyclone|thunderstorm|lightning|hail|blizzard|snow|snowfall|ice storm|flood|flooding|flash flood|drought|heat wave|heatwave|wildfire|monsoon|derecho|squall|supercell|forecast|forecasting|rainfall|downpour|wind gust|gusts|atmospheric river|el ni|la ni|jet stream|nor.easter|tropical (storm|depression|wave)|severe)\b/i;

function onTopic(it: RssItem): boolean {
  return WEATHER_WORDS.test(it.title) || WEATHER_WORDS.test(it.description);
}

/** Strip markup to readable text, keeping paragraph breaks. */
function feedText(html: string): string {
  /*
   * Two kinds of break, because the feeds carry two kinds of document.
   *
   * A closing BLOCK tag becomes a blank line — that is a new paragraph —
   * while a `<br>`, a list item, or a newline already in the source stays a
   * single break. The client splits paragraphs on blank lines and renders what
   * is left as `pre-line`, which is what lets a National Hurricane Center
   * product keep its teletype line breaks while a Phys.org article still reads
   * as prose.
   *
   * Written the other way round first, with every break a paragraph: the
   * hurricane outlook came out as thirty one-line paragraphs, each with a gap
   * after it.
   */
  return decodeEntities(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|h[1-6]|figure|section|ul|ol|blockquote)\s*>/gi, "\n\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n").map((l) => l.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The publisher's lead image, wherever this feed happens to put it. */
function feedImage(block: string): string {
  for (const re of [
    /<enclosure[^>]+url="([^"]+)"[^>]*type="image/i,
    /<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i,
    /<itunes:image[^>]+href="([^"]+)"/i,
  ]) {
    const m = block.match(re);
    if (m) return decodeEntities(m[1]);
  }
  const inline = block.match(/<img[^>]+src="([^"]+)"/i);
  return inline ? decodeEntities(inline[1]) : "";
}

function parseRssItems(xml: string, feedSource = "", canRead = false): RssItem[] {
  const out: RssItem[] = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/item>/i)[0];
    const rawTitle = pick(block, "title");
    const link = pick(block, "link");
    if (!rawTitle || !link) continue;
    const source = feedSource || pick(block, "source") ||
      (rawTitle.includes(" - ") ? rawTitle.split(" - ").pop()! : "Google News");
    // Google News prefixes the title with the headline and " - Source"; trim the source suffix.
    const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;

    // `content:encoded` is where a feed puts the article when it syndicates
    // one; `description` is the summary. Longest wins — some feeds fill only
    // one of them, and a few fill both with the same text.
    const parts = [pick(block, "content:encoded"), pick(block, "description")]
      .map(feedText)
      .sort((a, b) => b.length - a.length);
    const full = parts[0] ?? "";
    const description = full.replace(/\s+/g, " ").trim().slice(0, 240);
    // 320 characters is about a paragraph. Below that, expanding in place shows
    // the reader the same sentence twice and wastes the tap.
    const readable = canRead && full.length >= 320;
    const pubDate = pick(block, "pubDate") || pick(block, "updated") || pick(block, "published");
    const image = feedImage(block);

    out.push({
      title, link, description, source,
      pubDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      ...(readable ? { body: full.slice(0, 9000), readable: true } : {}),
      ...(image ? { image } : {}),
    });
  }
  return out;
}


// ---- KMZ / KML ---------------------------------------------------------------
/**
 * Pull the single KML out of a KMZ. A KMZ is an ordinary ZIP; entries are
 * either stored (method 0) or deflated (method 8), and `DecompressionStream`
 * handles the latter with no dependency.
 */
async function kmlFromKmz(buf: Uint8Array): Promise<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Walk local file headers rather than the central directory — a KMZ holds one
  // meaningful entry and this avoids parsing the whole index.
  let off = 0;
  while (off + 30 <= buf.length) {
    if (dv.getUint32(off, true) !== 0x04034b50) break;
    const method = dv.getUint16(off + 8, true);
    const compSize = dv.getUint32(off + 18, true);
    const nameLen = dv.getUint16(off + 26, true);
    const extraLen = dv.getUint16(off + 28, true);
    const name = new TextDecoder().decode(buf.subarray(off + 30, off + 30 + nameLen));
    const dataStart = off + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compSize);
    if (/\.kml$/i.test(name)) {
      if (method === 0) return new TextDecoder().decode(data);
      const ds = new DecompressionStream("deflate-raw");
      const stream = new Blob([data]).stream().pipeThrough(ds);
      return await new Response(stream).text();
    }
    off = dataStart + compSize;
  }
  throw new Error("no KML inside KMZ");
}

/** KML placemarks to GeoJSON, keeping SPC's own labels and colours. */
function kmlToFeatures(kml: string): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const block of kml.split(/<Placemark[\s>]/i).slice(1)) {
    const body = block.split(/<\/Placemark>/i)[0];
    const props: Record<string, string> = {};
    for (const m of body.matchAll(/<SimpleData name="([^"]+)">([^<]*)<\/SimpleData>/g)) {
      props[m[1]] = m[2];
    }
    const rings: number[][][] = [];
    for (const m of body.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)) {
      const ring = m[1].trim().split(/\s+/).map((pair) => {
        const [lon, lat] = pair.split(",").map(Number);
        return [lon, lat];
      }).filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
      if (ring.length >= 4) rings.push(ring);
    }
    if (rings.length === 0) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: rings },
      properties: {
        label: props.LABEL ?? "",
        label2: props.LABEL2 ?? "",
        stroke: props.stroke ?? "#FF7F00",
        fill: props.fill ?? "#FFBF80",
        valid: props.VALID_ISO ?? null,
        expire: props.EXPIRE_ISO ?? null,
        issue: props.ISSUE_ISO ?? null,
        forecaster: props.FORECASTER ?? "",
      },
    });
  }
  return { type: "FeatureCollection", features };
}


// ─── traffic and hazard cameras ─────────────────────────────────────────────
/**
 * Public camera networks, normalised into one shape.
 *
 * Every network here was probed live and needs no API key. Most state 511
 * systems DO need one — Idaho, Alaska, Pennsylvania and the rest of the CARS
 * vendor family all answer "Invalid Key" — so they are absent rather than
 * half-built. Adding one later is a single entry in NETWORKS.
 *
 * The lists are cached for six hours because a camera roster changes rarely.
 * The pictures are not cached at all: the browser loads those straight from the
 * source so they are always current, which is the whole point of a camera.
 *
 * Requests are answered by bounding box. The full national list is roughly
 * 6,700 cameras and about 1.5 MB normalised, which is not a payload to send to
 * a phone during a storm.
 */
interface Cam {
  id: string;
  net: string;
  name: string;
  lat: number;
  lon: number;
  /** Still image, refreshed by the browser. Absent on video-only networks. */
  img?: string;
  /** HLS stream, where the network publishes one. */
  stream?: string;
  road?: string;
  place?: string;
  dir?: string;
}

const CAM_UA = { "User-Agent": UA, Accept: "application/json" };

async function caltrans(): Promise<Cam[]> {
  const out: Cam[] = [];
  const districts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const pages = await Promise.all(districts.map(async (d) => {
    try {
      const r = await fetch(`https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${String(d).padStart(2, "0")}.json`, { headers: CAM_UA });
      if (!r.ok) return [];
      // deno-lint-ignore no-explicit-any
      return ((await r.json()) as any).data ?? [];
    } catch { return []; }
  }));
  for (const page of pages) {
    // deno-lint-ignore no-explicit-any
    for (const row of page as any[]) {
      const c = row?.cctv;
      const loc = c?.location, img = c?.imageData;
      const lat = Number(loc?.latitude), lon = Number(loc?.longitude);
      const still = img?.static?.currentImageURL;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !still) continue;
      if (lat === 0 && lon === 0) continue;
      if (String(c.inService) === "false") continue;
      out.push({
        id: `ct-${loc.district}-${c.index}`,
        net: "caltrans",
        name: String(loc.locationName ?? "").replace(/^\S+\s*--\s*/, "") || "Caltrans camera",
        lat, lon,
        img: still,
        stream: img?.streamingVideoURL || undefined,
        road: loc.route || undefined,
        place: loc.nearbyPlace || loc.county || undefined,
        dir: loc.direction || undefined,
      });
    }
  }
  return out;
}

async function alertCalifornia(): Promise<Cam[]> {
  try {
    const r = await fetch("https://cameras.alertcalifornia.org/public-camera-data/all_cameras-v3.json", { headers: CAM_UA });
    if (!r.ok) return [];
    // deno-lint-ignore no-explicit-any
    const d = (await r.json()) as any;
    const out: Cam[] = [];
    for (const f of d.features ?? []) {
      const [lon, lat] = f?.geometry?.coordinates ?? [];
      const p = f?.properties ?? {};
      // Roughly half the roster has null coordinates. A camera we cannot place
      // is a camera we cannot show on a map, so it is dropped rather than
      // pinned at zero.
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (!p.id) continue;
      out.push({
        id: `ac-${p.id}`,
        net: "alertca",
        name: String(p.name || p.id),
        lat, lon,
        img: `https://cameras.alertcalifornia.org/public-camera-data/${p.id}/latest-frame.jpg`,
        place: [p.county, p.state].filter(Boolean).join(", ") || undefined,
      });
    }
    return out;
  } catch { return []; }
}

async function michigan(): Promise<Cam[]> {
  try {
    const r = await fetch("https://mdotjboss.state.mi.us/MiDrive/camera/list", { headers: CAM_UA });
    if (!r.ok) return [];
    // deno-lint-ignore no-explicit-any
    const rows = (await r.json()) as any[];
    const out: Cam[] = [];
    for (const row of rows) {
      // MiDrive returns HTML fragments inside its JSON fields. The coordinates
      // live in a link and the picture in an <img> tag, so both are pulled out
      // by pattern. All 806 rows parsed when this was written; if the shape
      // changes the network simply returns nothing rather than bad pins.
      const at = /lat=([-\d.]+)&lon=([-\d.]+)/.exec(String(row?.county ?? ""));
      const img = /src="([^"]+)"/.exec(String(row?.image ?? ""));
      if (!at || !img) continue;
      const lat = Number(at[1]), lon = Number(at[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const county = String(row.county ?? "").replace(/<[^>]*>/g, "").trim();
      // MiDrive links a thumbnail path that 301s to the real file on every
      // request. On a grid of forty cameras that is forty wasted round trips,
      // so the redirect is resolved here once instead.
      const src = img[1].replace("/thumbs/", "/").replace(".flv.jpg", ".jpg");
      out.push({
        id: `mi-${lat.toFixed(5)},${lon.toFixed(5)}`,
        net: "midrive",
        name: `${String(row.route ?? "").trim()} ${String(row.location ?? "").trim()}`.trim() || "MDOT camera",
        lat, lon,
        img: src,
        road: String(row.route ?? "").trim() || undefined,
        place: county || undefined,
        dir: String(row.direction ?? "").replace(/^Traffic closest to camera is traveling /, "").replace(/\.$/, "") || undefined,
      });
    }
    return out;
  } catch { return []; }
}

async function driveBC(): Promise<Cam[]> {
  try {
    const r = await fetch("https://www.drivebc.ca/api/webcams", { headers: CAM_UA, redirect: "follow" });
    if (!r.ok) return [];
    // deno-lint-ignore no-explicit-any
    const rows = (await r.json()) as any[];
    const out: Cam[] = [];
    for (const c of rows) {
      // `location` is GeoJSON Point, so the coordinates are [lon, lat] in that
      // order. Reading it as {latitude, longitude} returned zero cameras.
      const [lon, lat] = c?.location?.coordinates ?? [];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const path = c?.links?.imageDisplay;
      if (!path) continue;
      // The feed marks cameras that are switched off or known stale. A picture
      // from three days ago on a road-conditions map is worse than no picture.
      if (c.is_on === false || c.should_appear === false || c.marked_stale === true) continue;
      out.push({
        id: `bc-${c.id}`,
        net: "drivebc",
        name: String(c.name_override || c.name || `Camera ${c.id}`),
        lat, lon,
        img: path.startsWith("http") ? path : `https://www.drivebc.ca${path}`,
        road: c.highway_display ? `Hwy ${c.highway_display}` : undefined,
        place: c.region_name || undefined,
        dir: c.orientation || undefined,
      });
    }
    return out;
  } catch { return []; }
}

/**
 * New York State 511.
 *
 * Open, no key. About 2,900 sites of which ~1,875 are live and ~1,570 publish an
 * HLS stream; the feed has no still images at all, so these are stream-only and
 * the app renders them as video tiles. Disabled and blocked cameras are dropped
 * rather than shown dark — a camera that is down is not information.
 */
async function ny511(): Promise<Cam[]> {
  try {
    const r = await fetch("https://511ny.org/api/getcameras?format=json", { headers: { "User-Agent": UA } });
    if (!r.ok) return [];
    const rows = await r.json() as Array<Record<string, unknown>>;
    const out: Cam[] = [];
    for (const c of rows) {
      if (c.Disabled === true || c.Blocked === true) continue;
      const stream = typeof c.VideoUrl === "string" ? c.VideoUrl : "";
      if (!stream) continue;                       // nothing to show without one
      const lat = Number(c.Latitude), lon = Number(c.Longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const road = typeof c.RoadwayName === "string" ? c.RoadwayName : undefined;
      const dir = typeof c.DirectionOfTravel === "string" && c.DirectionOfTravel !== "Unknown"
        ? c.DirectionOfTravel : undefined;
      out.push({
        id: `ny-${String(c.ID)}`, net: "ny511",
        name: String(c.Name ?? road ?? "Camera"),
        lat, lon, stream, road, dir,
      });
    }
    return out;
  } catch { return []; }
}

/**
 * Ohio — OHGO (Ohio DOT).
 *
 * Needs a free API key (register at https://publicapi.ohgo.com). Without
 * OHGO_API_KEY set this returns nothing and the network simply does not appear,
 * rather than erroring the whole camera load.
 *
 * The response shape is read defensively: OHGO's schema is behind the same
 * authentication as its data, so this maps the field spellings its docs use and
 * tolerates the plausible variants instead of asserting one. If the key is set
 * and this still returns nothing, the shape is what to check first.
 */
async function ohgo(): Promise<Cam[]> {
  const key = Deno.env.get("OHGO_API_KEY");
  if (!key) return [];
  try {
    const r = await fetch("https://publicapi.ohgo.com/api/v1/cameras?page-size=500", {
      headers: { "Authorization": `APIKEY ${key}`, "User-Agent": UA },
    });
    if (!r.ok) return [];
    const body = await r.json() as Record<string, unknown>;
    const rows = (Array.isArray(body) ? body : body.results ?? body.items ?? []) as Array<Record<string, unknown>>;
    const out: Cam[] = [];
    for (const c of rows) {
      const lat = Number(c.latitude ?? c.Latitude);
      const lon = Number(c.longitude ?? c.Longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const views = (c.cameraViews ?? c.CameraViews ?? []) as Array<Record<string, unknown>>;
      const v = Array.isArray(views) ? views[0] : undefined;
      const img = typeof v?.largeUrl === "string" ? v.largeUrl
        : typeof v?.smallUrl === "string" ? v.smallUrl
        : typeof c.imageUrl === "string" ? c.imageUrl : "";
      if (!img) continue;
      out.push({
        id: `oh-${String(c.id ?? c.Id ?? out.length)}`, net: "ohgo",
        name: String(c.description ?? c.location ?? c.Description ?? "Ohio camera"),
        lat, lon, img,
        road: typeof c.routeName === "string" ? c.routeName : undefined,
      });
    }
    return out;
  } catch { return []; }
}

const NETWORKS: { id: string; label: string; region: string; load: () => Promise<Cam[]> }[] = [
  { id: "caltrans", label: "Caltrans", region: "California highways", load: caltrans },
  { id: "alertca", label: "ALERTCalifornia", region: "California wildfire cameras", load: alertCalifornia },
  { id: "midrive", label: "MDOT MiDrive", region: "Michigan", load: michigan },
  { id: "drivebc", label: "DriveBC", region: "British Columbia", load: driveBC },
  { id: "ny511", label: "511NY", region: "New York State", load: ny511 },
  { id: "ohgo", label: "OHGO", region: "Ohio", load: ohgo },
];

interface CamCache { cams: Cam[]; nets: { id: string; label: string; region: string; count: number }[]; at: string }

async function allCameras(): Promise<CamCache> {
  const hit = await cacheGet("cameras:all", 6 * 3600) as CamCache | null;
  if (hit) return hit;

  // A network that hangs used to hold the whole response behind it, which is
  // what made a cold load feel broken. Each one now gets its own budget and an
  // empty result past it, so a slow feed costs its own cameras and nothing else.
  const withTimeout = async (n: typeof NETWORKS[number]) => {
    const cams = await Promise.race([
      n.load(),
      new Promise<Cam[]>((res) => setTimeout(() => res([]), 12_000)),
    ]);
    return { n, cams };
  };
  const results = await Promise.all(NETWORKS.map(withTimeout));
  const cams = results.flatMap((r) => r.cams);
  const nets = results.map((r) => ({ id: r.n.id, label: r.n.label, region: r.n.region, count: r.cams.length }));
  const out: CamCache = { cams, nets, at: new Date().toISOString() };
  // Only cache a run that actually got something; caching a total outage for
  // six hours would turn a blip into an afternoon.
  if (cams.length > 0) await cacheSet("cameras:all", out);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  // Strip the function mount prefix to get the logical route.
  const route = url.pathname.replace(/^\/functions\/v1\/weather/, "").replace(/^\/weather/, "") || "/";

  try {
    // ---- ProbSevere -------------------------------------------------------
    /*
     * NOAA/CIMSS ProbSevere, as the vector product it actually is.
     *
     * The map used to request `/tiles/PROBSEVEREV3/{z}/{x}/{y}.png` from
     * RealEarth. Those requests return HTTP 200 and a 102-byte fully transparent
     * PNG at every zoom a person actually uses — the product's `type` is
     * "shape", so there is no raster to serve and the overlay was silently
     * empty. That is why it "never worked".
     *
     * The real feed is a GeoJSON FeatureCollection of storm objects, each
     * carrying its probabilities. Proxied here for CORS and cached for two
     * minutes, which is a little under the product's own update cadence.
     */
    if (route === "/probsevere") {
      const KEY = "probsevere:v3";
      const cached = await cacheGet(KEY, 120);
      if (cached) return json(cached, 200, 120);

      const r = await fetch("https://realearth.ssec.wisc.edu/api/shapes?products=PROBSEVEREV3", {
        signal: AbortSignal.timeout(20_000),
        headers: { "User-Agent": "StormSyncVIP/1.0 (+https://vip.sswx.space)" },
      });
      if (!r.ok) return json({ type: "FeatureCollection", features: [], error: `upstream ${r.status}` }, 200, 30);

      const raw = await r.json();
      // Flatten what the map needs into `properties`: MapLibre can only style
      // and filter on properties, and ProbSevere hangs its values off a
      // sibling `models` object that a paint expression cannot reach.
      const features = (raw?.features ?? []).map((f: Record<string, unknown>) => {
        const ps = ((f.models as Record<string, Record<string, string>> | undefined)?.probsevere) ?? {};
        const num = (v: unknown) => {
          const n = Number(String(v ?? "").replace("%", ""));
          return Number.isFinite(n) ? n : 0;
        };
        const lines = Object.keys(ps).filter((k) => k.startsWith("LINE")).sort()
          .map((k) => ps[k]).filter(Boolean);
        return {
          type: "Feature",
          geometry: f.geometry,
          properties: {
            prob: num(ps.PROB),
            summary: lines[0] ?? "",
            detail: lines.slice(1).join("\n"),
          },
        };
      });
      const out = { type: "FeatureCollection", features, at: new Date().toISOString() };
      await cacheSet(KEY, out);
      return json(out, 200, 120);
    }

    // ---- public cameras ---------------------------------------------------
    if (route === "/cameras") {
      const { cams, nets, at } = await allCameras();
      const bbox = url.searchParams.get("bbox");
      const netFilter = (url.searchParams.get("net") ?? "").split(",").filter(Boolean);
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 400) || 400, 1200);

      let list = cams;
      if (netFilter.length) list = list.filter((c) => netFilter.includes(c.net));

      let inBox = list.length;
      if (bbox) {
        const [w, s2, e, n] = bbox.split(",").map(Number);
        if ([w, s2, e, n].every(Number.isFinite)) {
          list = list.filter((c) => c.lon >= w && c.lon <= e && c.lat >= s2 && c.lat <= n);
          inBox = list.length;
          // Too many for one view: thin evenly across the box rather than
          // returning the first N, which would pile every pin in one corner.
          if (list.length > limit) {
            const step = list.length / limit;
            const thinned: typeof list = [];
            for (let i = 0; i < limit; i++) thinned.push(list[Math.floor(i * step)]);
            list = thinned;
          }
        }
      } else {
        list = list.slice(0, limit);
      }

      return json({ cameras: list, shown: list.length, matched: inBox, total: cams.length, networks: nets, fetched_at: at });
    }

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

    // ---- SWPC solar wind (aurora) ----------------------------------------
    // SWPC retired /products/solar-wind/*.json — every path under it now 404s,
    // which left the aurora Bz/Bt chart permanently empty. The replacement feed
    // is the real-time solar wind archive, but it ships a full day at 1-minute
    // cadence (~1.6 MB for mag alone), so it is trimmed here rather than in the
    // browser.
    if (route === "/swpc/solar-wind") {
      const cached = await cacheGet("swpc:solar-wind", 300);
      if (cached) return json(cached, 200, 300);

      const points = Math.min(240, Math.max(6, Number(url.searchParams.get("points") ?? 60)));
      const [magRes, windRes] = await Promise.all([
        fetchJSON(`${SWPC}/json/rtsw/rtsw_mag_1m.json`),
        fetchJSON(`${SWPC}/json/rtsw/rtsw_wind_1m.json`),
      ]);
      const mag = await magRes.json() as { time_tag: string; bt: number | null; bz_gsm: number | null }[];
      const wind = await windRes.json() as { time_tag: string; proton_speed: number | null; proton_density: number | null }[];

      // The RTSW feeds are ordered newest-first and can repeat a timestamp when
      // more than one spacecraft is reporting, so take from the head, de-dupe,
      // then flip to chronological order for charting.
      const speedAt = new Map(wind.map((w) => [w.time_tag, w]));
      const seen = new Set<string>();
      const series = mag
        .filter((m) => {
          if (m.bt == null || m.bz_gsm == null || seen.has(m.time_tag)) return false;
          seen.add(m.time_tag);
          return true;
        })
        .slice(0, points)
        .reverse()
        .map((m) => ({
          time: `${m.time_tag}Z`,
          bt: m.bt,
          bz: m.bz_gsm,
          speed: speedAt.get(m.time_tag)?.proton_speed ?? null,
          density: speedAt.get(m.time_tag)?.proton_density ?? null,
        }));

      const out = { series, latest: series.at(-1) ?? null, source: "NOAA SWPC RTSW (DSCOVR/ACE)" };
      await cacheSet("swpc:solar-wind", out);
      return json(out, 200, 300);
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
      const google = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
      try {
        // All of them at once. One slow publisher should cost the tab a few
        // hundred milliseconds, not the sum of seven timeouts, and any feed
        // that fails simply contributes nothing.
        const jobs = [
          fetch(google, { headers: { "User-Agent": UA } })
            .then((r) => (r.ok ? r.text() : ""))
            .then((x) => (x ? parseRssItems(x) : []))
            .catch(() => [] as RssItem[]),
          ...NEWS_FEEDS.map((f) =>
            fetch(f.url, { headers: { "User-Agent": UA } })
              .then((r) => (r.ok ? r.text() : ""))
              .then((x) => (x ? parseRssItems(x, f.source, f.readable) : []))
              .then((list) => (f.onTopic ? list : list.filter(onTopic)))
              .catch(() => [] as RssItem[])),
        ];
        const all = (await Promise.all(jobs)).flat();

        // Same story from two feeds is one story. Titles are the only key the
        // feeds share — the links are per-publisher and Google's is a token.
        const seen = new Set<string>();
        const merged: RssItem[] = [];
        // Readable first within the dedupe, so the copy that can be read in
        // place is the one that survives a collision.
        all.sort((a, b) => Number(!!b.readable) - Number(!!a.readable));
        for (const it of all) {
          const k = it.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
          if (!k || seen.has(k)) continue;
          seen.add(k);
          merged.push(it);
        }
        /*
         * Readable stories first, then the headline stream — NOT one list by
         * date.
         *
         * Sorting the lot by date was the obvious version and it deleted the
         * feature. Google News alone returns a hundred items and they are all
         * from the last few hours, so a straight date sort put twenty-three
         * headlines and one readable story in the top twenty-four: the
         * publishers who actually syndicate their text were drowned by the one
         * source that syndicates none of it.
         *
         * Each group stays in date order inside itself, so the top of each is
         * still the newest thing there.
         */
        const byDate = (a: RssItem, b: RssItem) => b.pubDate.localeCompare(a.pubDate);

        /*
         * At most three readable stories from any one publisher.
         *
         * Without the cap, Phys.org — which posts several times a day and
         * syndicates every one in full — took eight of the ten readable slots
         * and pushed NOAA and the hurricane centre off the tab entirely. A cap
         * is cruder than weighting by recency and it is the right crude: the
         * value of this half of the tab is that it comes from several desks.
         */
        const perSource = new Map<string, number>();
        const readable: RssItem[] = [];
        for (const it of merged.filter((i) => i.readable).sort(byDate)) {
          const n = perSource.get(it.source) ?? 0;
          if (n >= 3) continue;
          perSource.set(it.source, n + 1);
          readable.push(it);
          if (readable.length >= 10) break;
        }
        const headlines = merged.filter((i) => !i.readable).sort(byDate).slice(0, 14);
        const items = [...readable, ...headlines];
        const out = { items, readable: items.filter((i) => i.readable).length };
        if (items.length) await cacheSet(key, out);
        return json(out, 200, 600);
      } catch {
        return json({ items: [] }, 200, 120);
      }
    }

    // ---- NWPS river & flood gauges ---------------------------------------
    // The National Water Prediction Service serves no CORS headers, so every
    // gauge call is proxied here. `srid=EPSG_4326` is not optional — without it
    // the bbox filter is silently ignored and the API returns an empty list.
    if (route === "/water/gauges") {
      const b = ["xmin", "ymin", "xmax", "ymax"].map((k) => url.searchParams.get(k));
      if (b.some((v) => v === null)) return json({ error: "xmin,ymin,xmax,ymax required" }, 400);
      const [xmin, ymin, xmax, ymax] = b.map(Number);
      if (b.some((v) => !Number.isFinite(Number(v)))) return json({ error: "bbox must be numeric" }, 400);
      // A runaway box would pull thousands of gauges; clamp to a sane window.
      if (Math.abs(xmax - xmin) > 30 || Math.abs(ymax - ymin) > 20) {
        return json({ error: "bounding box too large" }, 400);
      }
      const key = `water:gauges:${xmin.toFixed(2)},${ymin.toFixed(2)},${xmax.toFixed(2)},${ymax.toFixed(2)}`;
      const cached = await cacheGet(key, 600);
      if (cached) return json(cached, 200, 600);
      const api = `https://api.water.noaa.gov/nwps/v1/gauges?srid=EPSG_4326` +
        `&bbox.xmin=${xmin}&bbox.ymin=${ymin}&bbox.xmax=${xmax}&bbox.ymax=${ymax}`;
      const r = await fetch(api, { headers: { "User-Agent": UA } });
      if (!r.ok) return json({ error: `NWPS ${r.status}`, gauges: [] }, r.status === 404 ? 200 : 502, 60);
      const d = await r.json();
      const out = { gauges: Array.isArray(d?.gauges) ? d.gauges : [] };
      await cacheSet(key, out);
      return json(out, 200, 600);
    }

    if (route === "/water/gauge") {
      const lid = (url.searchParams.get("lid") ?? "").toUpperCase();
      if (!/^[A-Z0-9]{3,8}$/.test(lid)) return json({ error: "valid lid required" }, 400);
      const key = `water:gauge:${lid}`;
      const cached = await cacheGet(key, 600);
      if (cached) return json(cached, 200, 600);
      // Detail and hydrograph together — the page needs both and one round trip
      // through this function is cheaper than two from the browser.
      const [dR, sR] = await Promise.all([
        fetch(`https://api.water.noaa.gov/nwps/v1/gauges/${lid}`, { headers: { "User-Agent": UA } }),
        fetch(`https://api.water.noaa.gov/nwps/v1/gauges/${lid}/stageflow`, { headers: { "User-Agent": UA } }),
      ]);
      if (!dR.ok) return json({ error: `NWPS ${dR.status}` }, 502, 60);
      const detail = await dR.json();
      const flow = sR.ok ? await sR.json() : null;
      // The observed series runs a month back at 15-minute cadence — far more
      // than a chart needs. Keep the last 7 days and thin to hourly.
      const trim = (series: { data?: { validTime: string; primary: number; secondary?: number }[] } | null | undefined, hours: number) => {
        const rows = Array.isArray(series?.data) ? series!.data : [];
        const cutoff = Date.now() - hours * 3600_000;
        const kept = rows.filter((p) => {
          const t = Date.parse(p.validTime);
          return Number.isFinite(t) && t >= cutoff;
        });
        const step = Math.max(1, Math.ceil(kept.length / 180));
        return kept.filter((_, i) => i % step === 0 || i === kept.length - 1);
      };
      const out = {
        detail,
        observed: flow?.observed ? { ...flow.observed, data: trim(flow.observed, 168) } : null,
        forecast: flow?.forecast ? { ...flow.forecast, data: (flow.forecast.data ?? []).slice(0, 200) } : null,
      };
      await cacheSet(key, out);
      return json(out, 200, 600);
    }

    // ---- SPC fire weather outlook ----------------------------------------
    // SPC publishes no GeoJSON for fire weather (unlike the convective
    // outlooks) — only KMZ. A KMZ is a plain ZIP holding one KML, so it is
    // unzipped and converted here. The IEM mirror returns empty for these
    // categories, so this reads SPC directly.
    if (route === "/spc/fire-outlook") {
      const day = url.searchParams.get("day") ?? "1";
      if (!/^[123]$/.test(day)) return json({ error: "day must be 1-3" }, 400);
      const key = `spc:firewx:${day}`;
      const cached = await cacheGet(key, 1800);
      if (cached) return json(cached, 200, 1800);
      try {
        const r = await fetch(`${SPC}/products/fire_wx/day${day}fireotlk.kmz`, { headers: { "User-Agent": UA } });
        if (!r.ok) throw new Error(String(r.status));
        const kml = await kmlFromKmz(new Uint8Array(await r.arrayBuffer()));
        const out = kmlToFeatures(kml);
        await cacheSet(key, out);
        return json(out, 200, 1800);
      } catch (e) {
        return json({ type: "FeatureCollection", features: [], error: String(e) }, 200, 300);
      }
    }

    // ---- Large active wildfire incidents (InciWeb) -------------------------
    if (route === "/fire/incidents") {
      const cached = await cacheGet("fire:incidents", 1800);
      if (cached) return json(cached, 200, 1800);
      try {
        const r = await fetch("https://inciweb.wildfire.gov/incidents/rss.xml", { headers: { "User-Agent": UA } });
        if (!r.ok) throw new Error(String(r.status));
        const xml = await r.text();
        const items = xml.split(/<item>/i).slice(1).map((raw) => {
          const b = raw.split(/<\/item>/i)[0];
          const title = pick(b, "title");
          const link = pick(b, "link");
          const desc = pick(b, "description").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          const pub = pick(b, "pubDate");
          // InciWeb publishes no geo tags — the position is written into the
          // description as unsigned degrees/minutes/seconds, e.g.
          //   "Latitude: 48° 56 31  Longitude: 120° 36 34".
          // Longitude is negated because every InciWeb incident is in the
          // western hemisphere.
          const dms = (label: string): number | null => {
            const m = desc.match(new RegExp(`${label}:\\s*(\\d+)[^\\d]+(\\d+)(?:[^\\d]+(\\d+))?`, "i"));
            if (!m) return null;
            const v = Number(m[1]) + Number(m[2]) / 60 + (m[3] ? Number(m[3]) / 3600 : 0);
            return Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null;
          };
          const lat = dms("Latitude");
          const lon = dms("Longitude");
          const state = (desc.match(/State:\s*([A-Za-z .]+?)\s*-{2,}/) ?? [])[1]?.trim() ?? "";
          const acresM = desc.match(/([\d,]+)\s*acres/i);
          return {
            title, link,
            description: desc.replace(/-{2,}/g, "·").replace(/\s+/g, " ").slice(0, 320),
            published: pub ? new Date(pub).toISOString() : null,
            state,
            acres: acresM ? Number(acresM[1].replace(/,/g, "")) : null,
            latitude: lat,
            longitude: lon != null ? -lon : null,
          };
        }).filter((i) => i.title);
        const out = { incidents: items.slice(0, 60) };
        await cacheSet("fire:incidents", out);
        return json(out, 200, 1800);
      } catch {
        return json({ incidents: [] }, 200, 300);
      }
    }

    /**
     * Pollen forecast, via Google's Pollen API.
     *
     * There is no free unauthenticated pollen feed covering the United States —
     * Open-Meteo's pollen fields are CAMS-Europe only and return null for every
     * US hour, and pollen.com's endpoint is an internal one that refuses any
     * request without a forged Referer. Google's is official, documented and
     * US-wide, and it needs a key.
     *
     * When the key is absent this answers 501 with a plain reason rather than
     * an empty forecast, so the client can say what is missing instead of
     * rendering zeros that look like "no pollen today".
     */
    if (route === "/pollen") {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return json({ error: "lat and lon required" }, 400);
      }

      const key = Deno.env.get("GOOGLE_POLLEN_KEY");
      if (!key) {
        return json({
          available: false,
          error: "Pollen counts need a Google Pollen API key. Set GOOGLE_POLLEN_KEY on this function to turn them on.",
        }, 501);
      }

      const cacheKey = `pollen:${lat.toFixed(2)},${lon.toFixed(2)}`;
      const cached = await cacheGet(cacheKey, 3 * 3600);
      if (cached) return json(cached, 200, 3 * 3600);

      const api = `https://pollen.googleapis.com/v1/forecast:lookup` +
        `?key=${encodeURIComponent(key)}&location.latitude=${lat}&location.longitude=${lon}` +
        `&days=5&plantsDescription=true`;
      const r = await fetch(api, { headers: { "user-agent": UA } });
      if (!r.ok) {
        return json({ available: false, error: `Google Pollen returned ${r.status}.` }, 502);
      }
      const raw = await r.json();

      const band = (n: number): string =>
        n >= 5 ? "very_high" : n >= 4 ? "high" : n >= 3 ? "moderate" : n >= 2 ? "low" : n >= 1 ? "very_low" : "none";
      const title = (s: string) =>
        s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

      // deno-lint-ignore no-explicit-any
      const days = (raw?.dailyInfo ?? []).map((d: any) => {
        const date = d.date
          ? `${d.date.year}-${String(d.date.month).padStart(2, "0")}-${String(d.date.day).padStart(2, "0")}`
          : "";
        // deno-lint-ignore no-explicit-any
        const types = (d.pollenTypeInfo ?? []).map((t: any) => ({
          code: t.code ?? "",
          label: t.displayName ?? title(t.code ?? ""),
          index: t.indexInfo?.value ?? 0,
          band: band(t.indexInfo?.value ?? 0),
          inSeason: !!t.inSeason,
          advice: t.healthRecommendations?.[0] ?? null,
        }));
        // deno-lint-ignore no-explicit-any
        const species = (d.plantInfo ?? []).map((pl: any) => ({
          code: pl.code ?? "",
          label: pl.displayName ?? title(pl.code ?? ""),
          family: pl.plantDescription?.family ?? null,
          index: pl.indexInfo?.value ?? 0,
          band: band(pl.indexInfo?.value ?? 0),
          inSeason: !!pl.inSeason,
        // deno-lint-ignore no-explicit-any
        })).filter((pl: any) => pl.inSeason || pl.index > 0);
        return { date, types, species };
      });

      const payload = { available: true, days };
      await cacheSet(cacheKey, payload);
      return json(payload, 200, 3 * 3600);
    }

    return json({ error: "not found", route }, 404);
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 502);
  }
});
