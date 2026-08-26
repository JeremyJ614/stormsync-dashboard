/**
 * The Winter Center's data.
 *
 * Every source in this file was probed live before it was built against, and
 * the two that do not exist as public endpoints are named as absent rather than
 * faked. What that survey found, so the next person does not have to repeat it:
 *
 *   WSSI (weather.gov/wssi)      transparent CONUS PNG overlays, no geography
 *                                drawn in, so they must be composited onto our
 *                                own basemap. Bounds are declared by WPC's own
 *                                viewer and are copied here exactly.
 *   WPC PWPF (wwd/day*_psnow_*)  complete standalone maps with coastlines and a
 *                                legend baked in. Cannot be overlaid; shown as
 *                                images. They label themselves when the answer
 *                                is "less than 10 percent", which is most of the
 *                                year, and that is a feature.
 *   NOHRSC snow analysis         ArcGIS MapServer. `export` returns a
 *                                transparent PNG for any bbox, so it composites.
 *   WPC winter weather outlook   ArcGIS MapServer, days 4 to 7.
 *   CPC hazards                  ArcGIS MapServer, 3-7 and 8-14 day outlooks.
 *   NWS alerts                   already wired app-wide; winter events filtered
 *                                out of the active feed.
 *
 * Not available, and therefore not built:
 *   Probabilistic WSSI           No public endpoint could be found. The WSSI
 *                                viewer serves only the deterministic product,
 *                                and the obvious pwssi paths all 404. If NWS
 *                                publishes one later it drops straight into
 *                                OVERLAYS below.
 *
 * Off-season honesty: all of these run year round and return real, current,
 * mostly-empty products in August. The UI says "nothing in effect" from the
 * data rather than hiding the layer, because an empty winter map in July is the
 * correct answer and a missing one is a bug.
 */
import { fetchOpenMeteo, fetchNWSAlerts, type NWSAlertFeature } from "../utils/weatherApi";

// ─── the map overlays ────────────────────────────────────────────────────────
/** WPC's own declared extent for the WSSI CONUS images, copied from their viewer. */
export const WSSI_BOUNDS: [number, number, number, number] =
  [-125.811668332, 24.714103649, -64.964629385, 57.560767331];

/** A generous CONUS box for the ArcGIS exports we request ourselves. */
export const CONUS_BOUNDS: [number, number, number, number] = [-125.5, 23.5, -66.0, 50.5];

const WSSI = "https://www.wpc.ncep.noaa.gov/wwd/wssi/images";
const ARCGIS = "https://mapservices.weather.noaa.gov";

function arcgisExport(service: string, layer: number, kind: "raster" | "vector"): string {
  const [w, s, e, n] = CONUS_BOUNDS;
  return `${ARCGIS}/${kind}/rest/services/${service}/MapServer/export` +
    `?bbox=${w},${s},${e},${n}&bboxSR=4326&imageSR=4326&size=1800,1000` +
    `&format=png32&transparent=true&layers=show:${layer}&f=image`;
}

export type OverlayKind = "wssi" | "snow" | "outlook" | "cpc";

export interface WinterOverlay {
  id: string;
  group: OverlayKind;
  label: string;
  /** What the colours mean, in a sentence. */
  legend: string;
  /** Where it comes from, said plainly. */
  source: string;
  url: string;
  bounds: [number, number, number, number];
  /** Forecast hours this product covers, when it has them. */
  hours?: number[];
  /** Builds the url for one forecast hour. */
  at?: (hour: number) => string;
}

/** WSSI has five components and three forecast windows, plus a storm-total max. */
const WSSI_COMPONENTS: { key: string; label: string; legend: string }[] = [
  { key: "WSSI_Overall", label: "Overall Impact", legend: "Limited, Minor, Moderate, Major and Extreme societal impact from winter weather." },
  { key: "SnowAmount", label: "Snow Amount", legend: "Impact from snowfall accumulation alone." },
  { key: "IceAccumulation", label: "Ice Accumulation", legend: "Impact from freezing rain and ice loading." },
  { key: "BlowingSnow", label: "Blowing Snow", legend: "Impact from wind moving snow: drifting and lost visibility." },
  { key: "SnowLoad", label: "Snow Load", legend: "Weight of snow on roofs, trees and power lines." },
];

export const OVERLAYS: WinterOverlay[] = [
  ...WSSI_COMPONENTS.map(({ key, label, legend }): WinterOverlay => ({
    id: `wssi-${key}`,
    group: "wssi",
    label,
    legend,
    source: "NWS Winter Storm Severity Index, via WPC",
    // The storm-total maximum is the honest default: it answers "how bad does
    // this get" without making the reader scrub to find the worst hour.
    url: `${WSSI}/web_CONUS_WSSI_Maximum_${key === "WSSI_Overall" ? "Overall" : key.replace(/([a-z])([A-Z])/g, "$1_$2")}.png`,
    bounds: WSSI_BOUNDS,
    hours: [24, 48, 72],
    at: (h) => `${WSSI}/web_CONUS_r24_${key}_f${h}.png`,
  })),
  {
    id: "nohrsc-depth",
    group: "snow",
    label: "Snow On The Ground",
    legend: "Modelled snow depth right now, from the national snow analysis.",
    source: "NOHRSC National Snow Analysis",
    url: arcgisExport("snow/NOHRSC_Snow_Analysis", 0, "raster"),
    bounds: CONUS_BOUNDS,
  },
  {
    id: "nohrsc-swe",
    group: "snow",
    label: "Water In The Snowpack",
    legend: "Snow water equivalent: how much water the snow on the ground holds.",
    source: "NOHRSC National Snow Analysis",
    url: arcgisExport("snow/NOHRSC_Snow_Analysis", 4, "raster"),
    bounds: CONUS_BOUNDS,
  },
  ...[4, 5, 6, 7].map((day): WinterOverlay => ({
    id: `wwo-day${day}`,
    group: "outlook",
    label: `Day ${day} Winter Outlook`,
    legend: "Chance of a disruptive winter storm this far out.",
    source: "WPC Winter Weather Outlook",
    // Layer ids are not sequential in this service: day 4 is layer 0, day 5 is
    // 20, day 6 is 16, day 7 is 24. Read off the service description, not guessed.
    url: arcgisExport("outlooks/winter_weather_outlook", { 4: 0, 5: 20, 6: 16, 7: 24 }[day]!, "raster"),
    bounds: CONUS_BOUNDS,
  })),
  {
    id: "cpc-precip-37",
    group: "cpc",
    label: "CPC 3-7 Day Precipitation",
    legend: "Where precipitation is favoured to run above or below normal.",
    source: "Climate Prediction Center",
    url: arcgisExport("hazards/cpc_weather_hazards", 4, "vector"),
    bounds: CONUS_BOUNDS,
  },
  {
    id: "cpc-temp-37",
    group: "cpc",
    label: "CPC 3-7 Day Temperature",
    legend: "Where temperatures are favoured to run above or below normal.",
    source: "Climate Prediction Center",
    url: arcgisExport("hazards/cpc_weather_hazards", 1, "vector"),
    bounds: CONUS_BOUNDS,
  },
  {
    id: "cpc-precip-814",
    group: "cpc",
    label: "CPC 8-14 Day Precipitation",
    legend: "The same call, a week further out.",
    source: "Climate Prediction Center",
    url: arcgisExport("hazards/cpc_weather_hazards", 6, "vector"),
    bounds: CONUS_BOUNDS,
  },
];

export const OVERLAY_GROUPS: { id: OverlayKind; label: string; blurb: string }[] = [
  { id: "wssi", label: "Storm Impact", blurb: "How much a winter storm will actually disrupt life, not just how much falls." },
  { id: "snow", label: "On The Ground", blurb: "What is lying there now, measured rather than forecast." },
  { id: "outlook", label: "Days 4-7", blurb: "Whether something is coming later in the week." },
  { id: "cpc", label: "Weeks Out", blurb: "The pattern, from the Climate Prediction Center." },
];

// ─── the national snow outlook images ────────────────────────────────────────
/**
 * WPC probabilistic winter precipitation.
 *
 * These are standalone maps rather than overlays, which is why they get their
 * own tab instead of the map. They also state their own answer in plain English
 * when the probability is under ten percent, which saves the module from having
 * to guess whether an empty map means "quiet" or "broken".
 */
export interface SnowOutlookImage {
  id: string; label: string; detail: string; url: string;
  /** Intrinsic pixel size, so the space is reserved and the page does not jump.
   *  Snow and ice are published at different sizes; asserting one size for both
   *  reserves the wrong box and shifts the layout when the second one arrives. */
  w: number; h: number;
}

const WWD = "https://www.wpc.ncep.noaa.gov/wwd";

export function snowOutlookImages(day: 1 | 2 | 3): SnowOutlookImage[] {
  return [
    { id: `snow4-${day}`, label: `4 inches or more`, detail: "Enough to be noticed and to need clearing.", url: `${WWD}/day${day}_psnow_gt_04.gif`, w: 750, h: 562 },
    { id: `snow8-${day}`, label: `8 inches or more`, detail: "A storm people will remember for the week.", url: `${WWD}/day${day}_psnow_gt_08.gif`, w: 750, h: 562 },
    { id: `snow12-${day}`, label: `12 inches or more`, detail: "The kind that closes things.", url: `${WWD}/day${day}_psnow_gt_12.gif`, w: 750, h: 562 },
  ];
}

/** Ice is published for day 1 only at the quarter-inch threshold. */
export const ICE_OUTLOOK: SnowOutlookImage = {
  id: "ice25",
  label: "Quarter inch of ice or more",
  detail: "The threshold where trees and power lines start coming down.",
  url: `${WWD}/day1_pice_gt_25_conus.gif`,
  w: 800, h: 561,
};

// ─── active winter alerts ────────────────────────────────────────────────────
const WINTER_EVENTS = [
  "blizzard warning", "blizzard watch",
  "ice storm warning",
  "winter storm warning", "winter storm watch", "winter weather advisory",
  "snow squall warning",
  "lake effect snow warning", "lake effect snow watch", "lake effect snow advisory",
  "freezing rain advisory", "freezing fog advisory",
  "extreme cold warning", "extreme cold watch", "cold weather advisory",
  "wind chill warning", "wind chill watch", "wind chill advisory",
  "frost advisory", "freeze warning", "freeze watch",
  "avalanche warning", "avalanche watch",
];

export function isWinterEvent(event: string | undefined): boolean {
  if (!event) return false;
  const e = event.toLowerCase();
  return WINTER_EVENTS.some((w) => e === w || e.includes(w));
}

/** How loud each alert is, so the list can sort by what matters. */
export function winterRank(event: string): number {
  const e = event.toLowerCase();
  if (e.includes("blizzard warning") || e.includes("ice storm warning")) return 5;
  if (e.includes("snow squall")) return 5;
  if (e.includes("winter storm warning") || e.includes("extreme cold warning") || e.includes("wind chill warning")) return 4;
  if (e.includes("warning")) return 3;
  if (e.includes("watch")) return 2;
  return 1;
}

export const WINTER_TONE: Record<number, string> = {
  5: "#ff4d55", 4: "#ff8a3d", 3: "#e8bb4d", 2: "#89cff0", 1: "#a3a3cc",
};

export async function fetchWinterAlerts(lat: number, lon: number): Promise<NWSAlertFeature[]> {
  const all = await fetchNWSAlerts(lat, lon).catch(() => [] as NWSAlertFeature[]);
  return all
    .filter((a) => a.properties.messageType !== "Cancel" && isWinterEvent(a.properties.event))
    .sort((a, b) => winterRank(b.properties.event) - winterRank(a.properties.event));
}

/** Every winter alert in the country, for the national picture. */
export async function fetchNationalWinterAlerts(): Promise<
  { event: string; area: string; state: string; rank: number }[]
> {
  const r = await fetch("https://api.weather.gov/alerts/active?status=actual&message_type=alert", {
    headers: { Accept: "application/geo+json" },
  });
  if (!r.ok) throw new Error(`NWS alerts returned ${r.status}`);
  const d = await r.json() as { features?: { properties?: Record<string, unknown> }[] };
  const out: { event: string; area: string; state: string; rank: number }[] = [];
  for (const f of d.features ?? []) {
    const p = f.properties ?? {};
    const event = String(p.event ?? "");
    if (!isWinterEvent(event)) continue;
    const area = String(p.areaDesc ?? "");
    // areaDesc is "County, ST; County, ST" — the state is the last token.
    const state = (area.match(/,\s*([A-Z]{2})\b/) ?? [])[1] ?? "";
    out.push({ event, area, state, rank: winterRank(event) });
  }
  return out.sort((a, b) => b.rank - a.rank);
}

// ─── snowfall by city, and the hourly timeline ───────────────────────────────
export interface SnowCity { name: string; state: string; lat: number; lon: number }

/**
 * Cities the snowfall table covers.
 *
 * Weighted toward the places that actually get snow and the places where snow
 * causes the most trouble when it arrives. Deliberately not the same list as
 * the chase cities: a good snow city and a good chase city have almost nothing
 * in common.
 */
export const SNOW_CITIES: SnowCity[] = [
  { name: "Seattle", state: "WA", lat: 47.61, lon: -122.33 },
  { name: "Spokane", state: "WA", lat: 47.66, lon: -117.43 },
  { name: "Portland", state: "OR", lat: 45.52, lon: -122.68 },
  { name: "Boise", state: "ID", lat: 43.62, lon: -116.2 },
  { name: "Missoula", state: "MT", lat: 46.87, lon: -113.99 },
  { name: "Billings", state: "MT", lat: 45.78, lon: -108.5 },
  { name: "Casper", state: "WY", lat: 42.85, lon: -106.32 },
  { name: "Denver", state: "CO", lat: 39.74, lon: -104.99 },
  { name: "Salt Lake City", state: "UT", lat: 40.76, lon: -111.89 },
  { name: "Albuquerque", state: "NM", lat: 35.08, lon: -106.65 },
  { name: "Rapid City", state: "SD", lat: 44.08, lon: -103.23 },
  { name: "Bismarck", state: "ND", lat: 46.81, lon: -100.78 },
  { name: "Fargo", state: "ND", lat: 46.88, lon: -96.79 },
  { name: "Minneapolis", state: "MN", lat: 44.98, lon: -93.27 },
  { name: "Duluth", state: "MN", lat: 46.79, lon: -92.1 },
  { name: "Des Moines", state: "IA", lat: 41.59, lon: -93.62 },
  { name: "Omaha", state: "NE", lat: 41.26, lon: -95.94 },
  { name: "Kansas City", state: "MO", lat: 39.1, lon: -94.58 },
  { name: "St. Louis", state: "MO", lat: 38.63, lon: -90.2 },
  { name: "Chicago", state: "IL", lat: 41.88, lon: -87.63 },
  { name: "Milwaukee", state: "WI", lat: 43.04, lon: -87.91 },
  { name: "Green Bay", state: "WI", lat: 44.51, lon: -88.02 },
  { name: "Marquette", state: "MI", lat: 46.55, lon: -87.4 },
  { name: "Detroit", state: "MI", lat: 42.33, lon: -83.05 },
  { name: "Grand Rapids", state: "MI", lat: 42.96, lon: -85.67 },
  { name: "Indianapolis", state: "IN", lat: 39.77, lon: -86.16 },
  { name: "Cleveland", state: "OH", lat: 41.5, lon: -81.69 },
  { name: "Columbus", state: "OH", lat: 39.96, lon: -83.0 },
  { name: "Pittsburgh", state: "PA", lat: 40.44, lon: -79.996 },
  { name: "Buffalo", state: "NY", lat: 42.89, lon: -78.88 },
  { name: "Syracuse", state: "NY", lat: 43.05, lon: -76.15 },
  { name: "Albany", state: "NY", lat: 42.65, lon: -73.76 },
  { name: "New York", state: "NY", lat: 40.71, lon: -74.0 },
  { name: "Philadelphia", state: "PA", lat: 39.95, lon: -75.17 },
  { name: "Boston", state: "MA", lat: 42.36, lon: -71.06 },
  { name: "Portland", state: "ME", lat: 43.66, lon: -70.26 },
  { name: "Burlington", state: "VT", lat: 44.48, lon: -73.21 },
  { name: "Concord", state: "NH", lat: 43.21, lon: -71.54 },
  { name: "Washington", state: "DC", lat: 38.9, lon: -77.04 },
  { name: "Baltimore", state: "MD", lat: 39.29, lon: -76.61 },
  { name: "Richmond", state: "VA", lat: 37.54, lon: -77.44 },
  { name: "Charleston", state: "WV", lat: 38.35, lon: -81.63 },
  { name: "Louisville", state: "KY", lat: 38.25, lon: -85.76 },
  { name: "Nashville", state: "TN", lat: 36.16, lon: -86.78 },
  { name: "Oklahoma City", state: "OK", lat: 35.47, lon: -97.52 },
  { name: "Amarillo", state: "TX", lat: 35.22, lon: -101.83 },
  { name: "Dallas", state: "TX", lat: 32.78, lon: -96.8 },
  { name: "Wichita", state: "KS", lat: 37.69, lon: -97.34 },
  { name: "Flagstaff", state: "AZ", lat: 35.2, lon: -111.65 },
  { name: "Reno", state: "NV", lat: 39.53, lon: -119.81 },
  { name: "Anchorage", state: "AK", lat: 61.22, lon: -149.9 },
];

export interface CitySnow {
  city: SnowCity;
  /** Inches over the next five days, one entry per day. */
  daily: { date: string; snowIn: number; lowF: number; highF: number }[];
  totalIn: number;
  /** The day with the most snow, or null if none of them have any. */
  peakDay: string | null;
}

const CM_TO_IN = 0.393701;
const cToF = (c: number) => (c * 9) / 5 + 32;

/**
 * Snowfall for every city in one request.
 *
 * Open-Meteo takes comma-separated coordinates and answers with an array in the
 * same order, so 51 cities cost one round trip rather than 51. `snowfall_sum`
 * is centimetres regardless of the other unit settings, which is worth being
 * explicit about: assuming inches here would overstate every number by 2.54x.
 */
export async function fetchCitySnow(): Promise<CitySnow[]> {
  const lat = SNOW_CITIES.map((c) => c.lat).join(",");
  const lon = SNOW_CITIES.map((c) => c.lon).join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=snowfall_sum,temperature_2m_min,temperature_2m_max&forecast_days=5&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo returned ${r.status}`);
  const body = await r.json();
  const arr = Array.isArray(body) ? body : [body];

  return SNOW_CITIES.map((city, i) => {
    const d = arr[i]?.daily;
    const days = (d?.time ?? []) as string[];
    const daily = days.map((date, k) => ({
      date,
      snowIn: Math.round((Number(d.snowfall_sum?.[k] ?? 0) * CM_TO_IN) * 10) / 10,
      lowF: Math.round(cToF(Number(d.temperature_2m_min?.[k] ?? 0))),
      highF: Math.round(cToF(Number(d.temperature_2m_max?.[k] ?? 0))),
    }));
    const totalIn = Math.round(daily.reduce((a, b) => a + b.snowIn, 0) * 10) / 10;
    const peak = daily.reduce<{ date: string; snowIn: number } | null>(
      (best, x) => (x.snowIn > (best?.snowIn ?? 0) ? x : best), null);
    return { city, daily, totalIn, peakDay: peak && peak.snowIn > 0 ? peak.date : null };
  });
}

// ─── the hourly storm timeline ───────────────────────────────────────────────
export type WinterPtype = "snow" | "sleet" | "freezing" | "rain" | "none";

export interface WinterHour {
  time: string;
  tempF: number;
  snowIn: number;
  precipIn: number;
  ptype: WinterPtype;
  windMph: number;
  gustMph: number;
  /** Feet, for the "is it snowing above me" question. */
  freezingLevelFt: number;
  visibilityMi: number;
  /** Running total of snow so far in the window. */
  accumIn: number;
}

/**
 * Precipitation type, decided the way a forecaster does it: from the depth of
 * the warm layer aloft rather than from the surface temperature alone. A 34°F
 * surface under a deep sub-freezing column still snows, and a 30°F surface
 * under a warm nose gives freezing rain, which is the dangerous case.
 */
function classify(tempF: number, t850C: number, t700C: number, precipIn: number, snowIn: number): WinterPtype {
  if (precipIn <= 0.001) return "none";
  if (snowIn > 0.05) return "snow";
  const warmAloft = t850C > 0.5 || t700C > 0.5;
  if (tempF <= 32 && warmAloft) return "freezing";
  if (tempF <= 36 && warmAloft && t850C < 3) return "sleet";
  if (tempF <= 33) return "snow";
  return "rain";
}

export const PTYPE_STYLE: Record<WinterPtype, { label: string; color: string }> = {
  snow: { label: "Snow", color: "#89cff0" },
  sleet: { label: "Sleet", color: "#c084fc" },
  freezing: { label: "Freezing rain", color: "#ff4d55" },
  rain: { label: "Rain", color: "#5fd9a8" },
  none: { label: "Dry", color: "#4a4a68" },
};

export async function fetchWinterTimeline(lat: number, lon: number): Promise<WinterHour[]> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,snowfall,precipitation,wind_speed_10m,wind_gusts_10m,` +
    `freezing_level_height,visibility,temperature_850hPa,temperature_700hPa` +
    `&forecast_days=3&timezone=auto&wind_speed_unit=mph`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Open-Meteo returned ${r.status}`);
  const d = await r.json();
  const h = d.hourly;
  const n = (h?.time ?? []).length;
  const out: WinterHour[] = [];
  let accum = 0;
  for (let i = 0; i < n; i++) {
    const snowIn = Number(h.snowfall?.[i] ?? 0) * CM_TO_IN;
    accum += snowIn;
    const tempF = cToF(Number(h.temperature_2m?.[i] ?? 0));
    const precipMm = Number(h.precipitation?.[i] ?? 0);
    out.push({
      time: h.time[i],
      tempF: Math.round(tempF),
      snowIn: Math.round(snowIn * 100) / 100,
      precipIn: Math.round((precipMm / 25.4) * 100) / 100,
      ptype: classify(tempF, Number(h.temperature_850hPa?.[i] ?? -10), Number(h.temperature_700hPa?.[i] ?? -20), precipMm / 25.4, snowIn),
      windMph: Math.round(Number(h.wind_speed_10m?.[i] ?? 0)),
      gustMph: Math.round(Number(h.wind_gusts_10m?.[i] ?? 0)),
      // Open-Meteo reports freezing level in metres here; the unit trap that
      // bit the Nowcast module only applies when precipitation_unit is set.
      freezingLevelFt: Math.round(Number(h.freezing_level_height?.[i] ?? 0) * 3.28084),
      visibilityMi: Math.round((Number(h.visibility?.[i] ?? 0) / 1609.34) * 10) / 10,
      accumIn: Math.round(accum * 10) / 10,
    });
  }
  return out;
}

/** The one-line read on a timeline: when it starts, when it stops, how much. */
export function timelineSummary(hours: WinterHour[]): {
  starts: string | null; ends: string | null; totalIn: number; worst: WinterPtype;
} {
  const wet = hours.filter((h) => h.ptype !== "none" && h.ptype !== "rain");
  const total = hours.reduce((a, b) => a + b.snowIn, 0);
  const order: WinterPtype[] = ["none", "rain", "sleet", "snow", "freezing"];
  let worst: WinterPtype = "none";
  for (const h of hours) if (order.indexOf(h.ptype) > order.indexOf(worst)) worst = h.ptype;
  return {
    starts: wet[0]?.time ?? null,
    ends: wet.length ? wet[wet.length - 1].time : null,
    totalIn: Math.round(total * 10) / 10,
    worst,
  };
}

export { fetchOpenMeteo };
