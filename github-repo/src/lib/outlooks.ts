/**
 * The outlook catalogue.
 *
 * The Daily Brief used to carry four subtabs — Hourly, Wind, Precipitation,
 * Pressure — that re-plotted the same Open-Meteo series the hero and the ribbon
 * had already stated. Four charts of one place. What replaces them is the other
 * half of a forecast: what the national centres think is going to happen, over
 * the whole country, on horizons a point forecast cannot reach.
 *
 * Every product here is fetched from the issuing centre and drawn natively in
 * the app's own Albers projection — the same 975x610 canvas the Forecast Game
 * and the SPC module use — rather than embedded as a NOAA GIF. That is what
 * makes them pan, zoom, carry a real legend, and sit inside the module's design
 * instead of on top of it.
 *
 * WHAT IS NOT HERE, AND WHY
 * WPC's HeatRisk is the one product published only as a rendered image: there is
 * no public vector or gridded service for it. It is shown as WPC's own graphic,
 * labelled as such, rather than approximated from something else.
 *
 * Every URL below was verified against the live service before it was written
 * down. Nothing is inferred from a naming pattern.
 */
import { lobeOf, projectIn, MAP_W, MAP_H } from "./usAlbers";

/* ── shapes ──────────────────────────────────────────────────────────────── */

export type OutlookGroup = "spc" | "wpc" | "cpc" | "other";

export interface OutlookView {
  id: string;
  label: string;
  /** Secondary line on the rail button. */
  sub?: string;
}

export interface OutlookProduct {
  id: string;
  group: OutlookGroup;
  label: string;
  /** One sentence. What the product is, not a lesson in meteorology. */
  line: string;
  source: string;
  href: string;
  views: OutlookView[];
}

export interface Band {
  key: string;
  label: string;
  fill: string;
  stroke: string;
  /** All rings of this class as one evenodd path, so holes stay holes. */
  d: string;
  order: number;
}

export interface OutlookFrame {
  bands: Band[];
  /** Only the classes actually present, in the product's own order. */
  legend: { key: string; label: string; fill: string; stroke: string }[];
  issued?: string;
  valid?: string;
  expires?: string;
  /** "Slight Risk", "No areas", "Above normal over the Southwest" — the lead. */
  headline?: string;
  forecaster?: string;
  /** Set when the centre published the cycle but with nothing in it. */
  empty: boolean;
  unit?: string;
}

/* ── catalogue ───────────────────────────────────────────────────────────── */

export const PRODUCTS: OutlookProduct[] = [
  {
    id: "spc-tstm",
    group: "spc",
    label: "Thunderstorms",
    line: "The categorical convective outlook, from general thunderstorms through to a high risk.",
    source: "NOAA Storm Prediction Center",
    href: "https://www.spc.noaa.gov/products/outlook/day1otlk.html",
    views: [
      { id: "1", label: "Day 1", sub: "today into tonight" },
      { id: "2", label: "Day 2", sub: "tomorrow" },
      { id: "3", label: "Day 3", sub: "day after" },
    ],
  },
  {
    id: "spc-dryt",
    group: "spc",
    label: "Dry Thunderstorms",
    line: "Where SPC expects lightning with little or no wetting rain beneath it.",
    source: "NOAA Storm Prediction Center",
    href: "https://www.spc.noaa.gov/products/fire_wx/",
    views: [
      { id: "1", label: "Day 1", sub: "today into tonight" },
      { id: "2", label: "Day 2", sub: "tomorrow" },
    ],
  },
  {
    id: "wpc-qpf-day",
    group: "wpc",
    label: "Precipitation Forecast Daily",
    line: "Twenty-four-hour rainfall totals, one forecast day at a time.",
    source: "NOAA Weather Prediction Center",
    href: "https://www.wpc.ncep.noaa.gov/qpf/qpf2.shtml",
    views: [
      { id: "d1", label: "Day 1", sub: "24 hours" },
      { id: "d2", label: "Day 2", sub: "24 hours" },
      { id: "d3", label: "Day 3", sub: "24 hours" },
    ],
  },
  {
    id: "wpc-qpf-multi",
    group: "wpc",
    label: "Precipitation Forecast Multi Day",
    line: "The same forecast accumulated across the whole period.",
    source: "NOAA Weather Prediction Center",
    href: "https://www.wpc.ncep.noaa.gov/qpf/qpf2.shtml",
    views: [
      { id: "m72", label: "Days 1–3", sub: "72 hours" },
      { id: "m120", label: "Days 1–5", sub: "120 hours" },
      { id: "m168", label: "Days 1–7", sub: "168 hours" },
    ],
  },
  {
    id: "wpc-heatrisk",
    group: "wpc",
    label: "Heat Risk",
    line: "The NWS HeatRisk index, which weighs heat against what is normal for the place and the season.",
    source: "NOAA Weather Prediction Center",
    href: "https://www.wpc.ncep.noaa.gov/heatrisk/",
    views: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: String(n), label: `Day ${n}` })),
  },
  {
    id: "cpc-temp",
    group: "cpc",
    label: "Temperature",
    line: "Odds of a warmer or cooler than normal period, at four lead times.",
    source: "NOAA Climate Prediction Center",
    href: "https://www.cpc.ncep.noaa.gov/",
    views: [
      { id: "610", label: "6–10 Day" },
      { id: "814", label: "8–14 Day" },
      { id: "mon", label: "Monthly" },
      { id: "sea", label: "Seasonal" },
    ],
  },
  {
    id: "cpc-precip",
    group: "cpc",
    label: "Precipitation",
    line: "Odds of a wetter or drier than normal period, at four lead times.",
    source: "NOAA Climate Prediction Center",
    href: "https://www.cpc.ncep.noaa.gov/",
    views: [
      { id: "610", label: "6–10 Day" },
      { id: "814", label: "8–14 Day" },
      { id: "mon", label: "Monthly" },
      { id: "sea", label: "Seasonal" },
    ],
  },
  {
    id: "cpc-rod",
    group: "cpc",
    label: "Rapid Onset Drought",
    line: "CPC's hazards outlook for drought developing quickly, with the wildfire and severe-drought areas it is issued alongside.",
    source: "NOAA Climate Prediction Center",
    href: "https://www.cpc.ncep.noaa.gov/products/predictions/threats/threats.php",
    views: [
      { id: "37", label: "3–7 Day" },
      { id: "814", label: "8–14 Day" },
    ],
  },
  {
    id: "other-foliage",
    group: "other",
    label: "Foliage Report",
    line: "Where leaves have begun to turn, ranked by state, from the national phenology record.",
    source: "USA National Phenology Network",
    href: "https://www.usanpn.org/",
    views: [],
  },
  {
    id: "other-colors",
    group: "other",
    label: "Fall Colors",
    line: "Every recent observation of colouring leaves and needles, placed on the map.",
    source: "USA National Phenology Network",
    href: "https://www.usanpn.org/",
    views: [],
  },
  {
    id: "other-foliage-progress",
    group: "other",
    label: "Season Progress",
    line: "Scrub the season and watch the turn spread, one observation at a time — every dot is a site on the day its first coloured leaves were recorded.",
    source: "USA National Phenology Network",
    href: "https://www.usanpn.org/",
    views: [],
  },
];

export const GROUPS: { id: OutlookGroup; label: string; blurb: string }[] = [
  { id: "spc", label: "SPC", blurb: "Storm Prediction Center" },
  { id: "wpc", label: "WPC", blurb: "Weather Prediction Center" },
  { id: "cpc", label: "CPC", blurb: "Climate Prediction Center" },
  { id: "other", label: "Other", blurb: "Seasonal" },
];

export function productsIn(group: OutlookGroup): OutlookProduct[] {
  return PRODUCTS.filter((p) => p.group === group);
}

/** The static graphic for a HeatRisk day. Loaded as an image, so no CORS. */
export function heatRiskSrc(day: string): string {
  return `https://www.wpc.ncep.noaa.gov/heatrisk/data/HeatRisk_${day}.png`;
}

/* ── geometry ────────────────────────────────────────────────────────────── */

type Ring = [number, number][];
interface Geom { type?: string; coordinates?: unknown; geometries?: Geom[] }

function ringsOf(g: Geom | null | undefined): Ring[] {
  if (!g) return [];
  if (g.type === "Polygon") return (g.coordinates as Ring[]) ?? [];
  if (g.type === "MultiPolygon") return ((g.coordinates as Ring[][]) ?? []).flat();
  if (g.type === "GeometryCollection") return (g.geometries ?? []).flatMap(ringsOf);
  return [];
}

/** How far past the canvas a ring may sit and still be worth drawing. */
const OFF_CANVAS = 80;

/**
 * Ring to path.
 *
 * Three things happen here, each for a reason that showed up in the real data.
 *
 * The lobe is chosen ONCE, from the ring's mean position, and then held for
 * every vertex. Albers-USA is a composite of three projections, and `project`
 * picks between them per point — correct for a dot, disastrous for a polygon,
 * because CPC's outlooks include Alaska and a ring along the Bering coast has
 * some vertices inside the inset's clip box and some outside. Projected
 * independently, half the ring lands in the inset and half two thousand pixels
 * above the map.
 *
 * Coordinates are rounded to a tenth of a pixel and repeats dropped. These
 * outlooks arrive generalised by the server at about five kilometres, which is
 * under a pixel at the default zoom, so consecutive vertices routinely land on
 * the same tenth — and emitting them all would put tens of thousands of no-op
 * segments into the DOM for the browser to walk on every repaint.
 *
 * Rings that miss the canvas entirely are dropped. The Pacific territories and
 * the far Aleutians are in several of these layers, have nowhere to go on this
 * map, and would otherwise be a few hundred kilobytes of path string masked out
 * of sight.
 */
function ringPath(ring: Ring): string {
  if (ring.length < 4) return "";

  let mlon = 0, mlat = 0;
  for (const pt of ring) { mlon += pt[0]; mlat += pt[1]; }
  const lobe = lobeOf(mlon / ring.length, mlat / ring.length);

  let out = "";
  let px = NaN, py = NaN, n = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pt of ring) {
    const p = projectIn(lobe, pt[0], pt[1]);
    const x = Math.round(p.x * 10) / 10;
    const y = Math.round(p.y * 10) / 10;
    if (x === px && y === py) continue;
    out += n === 0 ? `M${x} ${y}` : `L${x} ${y}`;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    px = x; py = y; n++;
  }
  if (n < 3) return "";
  if (x1 < -OFF_CANVAS || x0 > MAP_W + OFF_CANVAS) return "";
  if (y1 < -OFF_CANVAS || y0 > MAP_H + OFF_CANVAS) return "";
  return `${out}Z`;
}

function pathOf(g: Geom | null | undefined): string {
  return ringsOf(g).map(ringPath).join("");
}

/* ── ramps ───────────────────────────────────────────────────────────────── */

/** WPC's own QPF class breaks, in inches, with the NWS palette. */
const QPF_SCALE: [number, string][] = [
  [0.01, "#c9f0c9"], [0.10, "#7fd67f"], [0.25, "#3cb84a"], [0.50, "#1c8f3a"],
  [0.75, "#6fd4ff"], [1.00, "#3aa7ff"], [1.25, "#1f6fe0"], [1.50, "#2b3fc0"],
  [1.75, "#7a3fd0"], [2.00, "#b03fd0"], [2.50, "#e03fb0"], [3.00, "#ff5f6f"],
  [4.00, "#ff8a3f"], [5.00, "#ffc23f"], [7.00, "#ffe98a"], [10.0, "#fff6c8"],
  [15.0, "#ffffff"], [20.0, "#e8d8ff"],
];

function qpfColour(v: number): string {
  let c = QPF_SCALE[0][1];
  for (const [t, col] of QPF_SCALE) { if (v >= t - 1e-9) c = col; }
  return c;
}

/**
 * CPC's divergent scales — and there are TWO of them.
 *
 * Temperature is red-above / blue-below. Precipitation is green-above /
 * brown-below. That is not a house style, it is CPC's own convention and it is
 * load-bearing: on a map with no units, the hue is the only thing telling you
 * whether "above, 60%" means hot or wet. Running both products off one ramp —
 * which is what shipped — made the precipitation outlook a recolour of the
 * temperature one, and there is no way to read it correctly.
 */
const CPC_TEMP_ABOVE: Record<number, string> = {
  33: "#f7d8bd", 40: "#f2b489", 50: "#e88e55", 60: "#d96c2e", 70: "#bd4f18", 80: "#97390d", 90: "#742a06",
};
const CPC_TEMP_BELOW: Record<number, string> = {
  33: "#cfe6f6", 40: "#a3cdea", 50: "#71b2dc", 60: "#4291c7", 70: "#2470ab", 80: "#155489", 90: "#0c3c66",
};
const CPC_PRECIP_ABOVE: Record<number, string> = {
  33: "#d5ecd2", 40: "#aedcaa", 50: "#7cc67e", 60: "#4aa956", 70: "#2b8a3c", 80: "#186b2a", 90: "#0d4c1c",
};
const CPC_PRECIP_BELOW: Record<number, string> = {
  33: "#f0e2c8", 40: "#e2c99f", 50: "#d0ac74", 60: "#b88f52", 70: "#9a7238", 80: "#7b5825", 90: "#5d4116",
};

// CPC prints "equal chances" white, which on a dark map would be the loudest
// thing on it. Charcoal keeps it legible as its own area while saying,
// correctly, that there is nothing to read there.
const CPC_EC = "#474757";

function nearestStep(prob: number): number {
  const steps = [33, 40, 50, 60, 70, 80, 90];
  return steps.reduce((a, b) => (Math.abs(b - prob) < Math.abs(a - prob) ? b : a), 33);
}

/** "Above"/"A" → above, "Below"/"B" → below, "Normal"/"EC"/"N" → equal chances. */
function cpcClass(cat: string): "above" | "below" | "ec" {
  const c = (cat || "").trim().toLowerCase();
  if (c.startsWith("a")) return "above";
  if (c.startsWith("b")) return "below";
  return "ec";
}

const HAZARD_COLOURS: Record<string, string> = {
  "rapid onset drought risk": "#e8a33d",
  "severe drought": "#a9682c",
  "critical wildfire risk": "#e04b2f",
};

/* ── fetch ───────────────────────────────────────────────────────────────── */

const SPC = "https://www.spc.noaa.gov";
const NOAA_GIS = "https://mapservices.weather.noaa.gov/vector/rest/services";

/**
 * Generalisation is the whole reason these are usable in a browser: WPC's Day 1
 * QPF is seventeen megabytes of raw contour vertices and 260 kilobytes at five
 * kilometres, which is a quarter of a pixel on a country-wide map.
 */
function gisUrl(layer: string): string {
  return `${NOAA_GIS}/${layer}/query?where=1%3D1&outFields=*&outSR=4326&returnGeometry=true`
    + `&maxAllowableOffset=0.05&geometryPrecision=3&f=geojson`;
}

interface GeoFeature { properties?: Record<string, unknown>; geometry?: Geom | null }

async function getFeatures(url: string): Promise<GeoFeature[]> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
  const d = await r.json() as { features?: GeoFeature[] };
  return d.features ?? [];
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

/**
 * Fold features into one path per class.
 *
 * A class here is a legend entry — a risk category, a rainfall contour, a
 * probability step — and every feature that belongs to it contributes its rings
 * to a single `d`. One path per class instead of one per polygon is the
 * difference between a few dozen SVG nodes and several thousand, and because
 * the rings share a path they can use `evenodd` so an enclosed lower class
 * punches through as a real hole rather than being painted over.
 */
function collect(
  features: GeoFeature[],
  classify: (p: Record<string, unknown>) => { key: string; label: string; fill: string; stroke: string; order: number } | null,
): Band[] {
  const by = new Map<string, Band>();
  for (const f of features) {
    const cls = classify(f.properties ?? {});
    if (!cls) continue;
    const d = pathOf(f.geometry);
    if (!d) continue;
    const got = by.get(cls.key);
    if (got) got.d += d;
    else by.set(cls.key, { ...cls, d });
  }
  return [...by.values()].sort((a, b) => a.order - b.order);
}

function legendOf(bands: Band[]): OutlookFrame["legend"] {
  return bands.map((b) => ({ key: b.key, label: b.label, fill: b.fill, stroke: b.stroke }));
}

/* SPC ---------------------------------------------------------------------- */

async function spcOutlook(url: string): Promise<OutlookFrame> {
  const features = await getFeatures(url);
  const first = features[0]?.properties ?? {};
  const bands = collect(features, (p) => {
    const label = str(p.LABEL2) || str(p.LABEL);
    if (!label || label.toLowerCase() === "no areas") return null;
    return {
      key: str(p.LABEL) || label,
      label,
      fill: str(p.fill) || "#8899aa",
      stroke: str(p.stroke) || "#ffffff",
      order: num(p.DN) || 0,
    };
  });
  const top = bands[bands.length - 1];
  return {
    bands,
    legend: legendOf(bands),
    issued: str(first.ISSUE_ISO) || undefined,
    valid: str(first.VALID_ISO) || undefined,
    expires: str(first.EXPIRE_ISO) || undefined,
    forecaster: str(first.FORECASTER) || undefined,
    headline: top ? top.label : "No areas",
    empty: bands.length === 0,
  };
}

/* WPC QPF ------------------------------------------------------------------ */

const QPF_LAYERS: Record<string, string> = {
  d1: "precip/wpc_qpf/MapServer/1",
  d2: "precip/wpc_qpf/MapServer/2",
  d3: "precip/wpc_qpf/MapServer/3",
  m72: "precip/wpc_qpf/MapServer/9",
  m120: "precip/wpc_qpf/MapServer/10",
  m168: "precip/wpc_qpf/MapServer/11",
};

async function wpcQpf(view: string): Promise<OutlookFrame> {
  const layer = QPF_LAYERS[view];
  if (!layer) throw new Error("unknown QPF period");
  const features = await getFeatures(gisUrl(layer));
  const first = features[0]?.properties ?? {};
  const bands = collect(features, (p) => {
    const v = num(p.qpf);
    if (!Number.isFinite(v) || v < 0.01) return null;
    const fill = qpfColour(v);
    return { key: v.toFixed(2), label: `${v.toFixed(2)}″`, fill, stroke: fill, order: v };
  });
  const max = bands.length ? Math.max(...bands.map((b) => b.order)) : 0;
  return {
    bands,
    legend: legendOf(bands),
    issued: str(first.issue_time) ? `${str(first.issue_time).replace(" ", "T")}Z` : undefined,
    valid: str(first.valid_time) || undefined,
    headline: bands.length ? `Up to ${max.toFixed(2)} inches` : "No measurable rain forecast",
    empty: bands.length === 0,
    unit: "inches",
  };
}

/* CPC ---------------------------------------------------------------------- */

const CPC_LAYERS: Record<string, Record<string, string>> = {
  temp: {
    "610": "outlooks/cpc_6_10_day_outlk/MapServer/0",
    "814": "outlooks/cpc_8_14_day_outlk/MapServer/0",
    mon: "outlooks/cpc_mthly_temp_outlk/MapServer/0",
    sea: "outlooks/cpc_sea_temp_outlk/MapServer/0",
  },
  precip: {
    "610": "outlooks/cpc_6_10_day_outlk/MapServer/1",
    "814": "outlooks/cpc_8_14_day_outlk/MapServer/1",
    mon: "outlooks/cpc_mthly_precip_outlk/MapServer/0",
    sea: "outlooks/cpc_sea_precip_outlk/MapServer/0",
  },
};

const WARM = { above: "Leaning warm", below: "Leaning cool" };
const WET = { above: "Leaning wet", below: "Leaning dry" };

async function cpcOutlook(kind: "temp" | "precip", view: string): Promise<OutlookFrame> {
  const layer = CPC_LAYERS[kind][view];
  if (!layer) throw new Error("unknown CPC period");
  const features = await getFeatures(gisUrl(layer));
  const first = features[0]?.properties ?? {};
  const words = kind === "temp" ? WARM : WET;

  const bands = collect(features, (p) => {
    const cls = cpcClass(str(p.cat));
    const prob = nearestStep(num(p.prob) || 33);
    if (cls === "ec") {
      return { key: "ec", label: "Equal chances", fill: CPC_EC, stroke: CPC_EC, order: 0 };
    }
    const ramp = kind === "temp"
      ? (cls === "above" ? CPC_TEMP_ABOVE : CPC_TEMP_BELOW)
      : (cls === "above" ? CPC_PRECIP_ABOVE : CPC_PRECIP_BELOW);
    const fill = ramp[prob];
    return {
      key: `${cls}-${prob}`,
      label: `${cls === "above" ? "Above" : "Below"} ${prob}%`,
      fill, stroke: fill,
      // Below sorts under above only so the legend reads cool-to-warm; the paint
      // order within each side still runs weakest first.
      order: (cls === "below" ? -1 : 1) * prob,
    };
  });

  // Strongest signal on either side is the lead.
  const strong = bands.reduce<Band | null>(
    (a, b) => (b.key !== "ec" && (!a || Math.abs(b.order) > Math.abs(a.order)) ? b : a), null,
  );
  const period = str(first.valid_seas)
    || (num(first.start_date) && num(first.end_date) ? spanLabel(num(first.start_date), num(first.end_date)) : "");

  return {
    bands: [...bands].sort((a, b) => Math.abs(a.order) - Math.abs(b.order)),
    legend: legendOf([...bands].sort((a, b) => a.order - b.order)),
    issued: num(first.fcst_date) ? new Date(num(first.fcst_date)).toISOString() : undefined,
    valid: period || undefined,
    headline: strong
      ? `${strong.order > 0 ? words.above : words.below}, to ${Math.abs(strong.order)}%`
      : "Equal chances across the country",
    empty: bands.length === 0,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function spanLabel(a: number, b: number): string {
  const f = (ms: number) => {
    const d = new Date(ms);
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  };
  return `${f(a)} \u2013 ${f(b)}`;
}

/* CPC hazards -------------------------------------------------------------- */

const ROD_LAYERS: Record<string, string> = {
  "37": "hazards/cpc_weather_hazards/MapServer/7",
  "814": "hazards/cpc_weather_hazards/MapServer/8",
};

async function cpcRapidOnsetDrought(view: string): Promise<OutlookFrame> {
  const layer = ROD_LAYERS[view];
  if (!layer) throw new Error("unknown hazards period");
  const features = await getFeatures(gisUrl(layer));
  const first = features[0]?.properties ?? {};
  const bands = collect(features, (p) => {
    const label = str(p.label);
    const colour = HAZARD_COLOURS[label.toLowerCase()];
    if (!colour) return null;
    return {
      key: label, label, fill: colour, stroke: colour,
      order: label.toLowerCase().startsWith("rapid") ? 2 : 1,
    };
  });
  const rod = bands.find((b) => b.key.toLowerCase().startsWith("rapid"));
  return {
    bands,
    legend: legendOf(bands),
    valid: num(first.start_date) && num(first.end_date)
      ? spanLabel(num(first.start_date), num(first.end_date)) : undefined,
    headline: rod
      ? "Rapid onset drought risk is posted"
      : bands.length
        ? "No rapid onset drought risk in this period"
        : "No drought or wildfire hazards in this period",
    empty: bands.length === 0,
  };
}

/* ── the one entry point ─────────────────────────────────────────────────── */

export function loadOutlook(productId: string, view: string): Promise<OutlookFrame> {
  switch (productId) {
    case "spc-tstm":
      return spcOutlook(`${SPC}/products/outlook/day${view}otlk_cat.nolyr.geojson`);
    case "spc-dryt":
      return spcOutlook(`${SPC}/products/fire_wx/day${view}fw_dryt.nolyr.geojson`);
    case "wpc-qpf-day":
    case "wpc-qpf-multi":
      return wpcQpf(view);
    case "cpc-temp":
      return cpcOutlook("temp", view);
    case "cpc-precip":
      return cpcOutlook("precip", view);
    case "cpc-rod":
      return cpcRapidOnsetDrought(view);
    default:
      return Promise.reject(new Error(`no loader for ${productId}`));
  }
}
