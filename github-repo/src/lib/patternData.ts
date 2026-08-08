/**
 * Weather Patterns AI — data layer (P-5.3).
 *
 * Everything numeric on the page is COMPUTED from real sources:
 *   • the 7-day regional outlook comes from SPC's own Day 1-3 categorical and
 *     Day 4-8 probabilistic GeoJSON, geometrically intersected with each region;
 *   • the season tiles come from `daily_report_counts`, the ledger the Storm
 *     Engine fills from SPC storm-report CSVs.
 *
 * The AI's only job on this page is phrasing the nightly narrative — it never
 * supplies a number. That split is deliberate: a model asked for statistics will
 * invent plausible ones.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

// ── Regions ─────────────────────────────────────────────────────────────────
// Each region is sampled on a coarse lat/lon grid; a risk polygon "covers" the
// region if it contains any sample point. Sampling beats a single centroid
// because SPC risk areas are long and thin — a Slight risk clipping the eastern
// third of the Southern Plains should still light that region up.
export interface Region { id: string; label: string; lat: [number, number]; lon: [number, number] }

export const REGIONS: Region[] = [
  { id: "nw",    label: "Northwest",       lat: [42, 49], lon: [-124, -111] },
  { id: "sw",    label: "Southwest",       lat: [31, 42], lon: [-124, -108] },
  { id: "nplns", label: "Northern Plains", lat: [41, 49], lon: [-111,  -95] },
  { id: "splns", label: "Southern Plains", lat: [28, 41], lon: [-108,  -94] },
  { id: "mw",    label: "Midwest",         lat: [37, 49], lon: [ -95,  -82] },
  { id: "se",    label: "Southeast",       lat: [25, 37], lon: [ -94,  -75] },
  { id: "ne",    label: "Northeast",       lat: [37, 47], lon: [ -82,  -67] },
];

function samplePoints(r: Region): [number, number][] {
  const out: [number, number][] = [];
  const NX = 7, NY = 5;
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NY; j++) {
      const lon = r.lon[0] + ((r.lon[1] - r.lon[0]) * (i + 0.5)) / NX;
      const lat = r.lat[0] + ((r.lat[1] - r.lat[0]) * (j + 0.5)) / NY;
      out.push([lon, lat]);
    }
  }
  return out;
}
const REGION_SAMPLES = new Map(REGIONS.map((r) => [r.id, samplePoints(r)]));

// ── Geometry ────────────────────────────────────────────────────────────────
/** Ray-casting point-in-ring. */
function inRing(pt: [number, number], ring: number[][]): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** First ring is the outer boundary; the rest are holes. */
function inPolygon(pt: [number, number], poly: number[][][]): boolean {
  if (!poly.length || !inRing(pt, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(pt, poly[k])) return false;
  return true;
}

// ── SPC outlook chain ───────────────────────────────────────────────────────
export const CAT_RANK: Record<string, number> = { TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6 };
export const CAT_LABEL: Record<string, string> = {
  TSTM: "Thunder", MRGL: "Marginal", SLGT: "Slight", ENH: "Enhanced", MDT: "Moderate", HIGH: "High",
};
export const CAT_COLOR: Record<string, string> = {
  TSTM: "#84CC16", MRGL: "#48a832", SLGT: "#f7e98e", ENH: "#e6a23c", MDT: "#dc2626", HIGH: "#ff00ff",
};

/** One region's outlook for one day. */
export interface DayCell {
  /** Categorical code for days 1-3, or null. */
  cat: string | null;
  /** Severe probability (0-1) for days 4-8, or null. */
  prob: number | null;
  /** 0 = nothing, rising with severity — used for colour + sorting. */
  rank: number;
}
export interface PatternDay {
  /** 1-7 */
  day: number;
  date: string;
  kind: "categorical" | "probabilistic";
  /** SPC said the pattern is not predictable enough to draw anything. */
  lowPredictability: boolean;
  cells: Record<string, DayCell>;
}

interface Feature {
  properties?: Record<string, string>;
  geometry?: { type?: string; coordinates?: number[][][] | number[][][][] };
}

function polygonsOf(f: Feature): number[][][][] {
  const g = f.geometry;
  if (g?.type === "Polygon") return [g.coordinates as number[][][]];
  if (g?.type === "MultiPolygon") return g.coordinates as number[][][][];
  return [];
}

function emptyCells(): Record<string, DayCell> {
  return Object.fromEntries(REGIONS.map((r) => [r.id, { cat: null, prob: null, rank: 0 }]));
}

/** Intersect one SPC product with every region. */
function assign(features: Feature[], kind: "categorical" | "probabilistic"): { cells: Record<string, DayCell>; lowPred: boolean } {
  const cells = emptyCells();
  let lowPred = false;

  for (const f of features) {
    const label = f.properties?.LABEL ?? "";
    // SPC ships this as a real polygon on quiet Day 4-8 panels. It is the
    // ABSENCE of a forecast, not a risk area — painting it as one would be a
    // straight-up lie on the grid.
    if (/predictability too low/i.test(label)) { lowPred = true; continue; }

    let rank: number, cat: string | null = null, prob: number | null = null;
    if (kind === "categorical") {
      if (!CAT_RANK[label]) continue;
      cat = label; rank = CAT_RANK[label];
    } else {
      const p = parseFloat(label);
      if (Number.isNaN(p)) continue;
      prob = p; rank = p * 10;      // keep on a comparable scale to CAT_RANK
    }

    const polys = polygonsOf(f);
    if (!polys.length) continue;

    for (const r of REGIONS) {
      const cur = cells[r.id];
      if (cur.rank >= rank) continue;                       // already worse
      const pts = REGION_SAMPLES.get(r.id)!;
      const hit = pts.some((pt) => polys.some((poly) => inPolygon(pt, poly)));
      if (hit) cells[r.id] = { cat, prob, rank };
    }
  }
  return { cells, lowPred };
}

const SPC = "https://www.spc.noaa.gov";
const isoDay = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function getJson(url: string): Promise<Feature[]> {
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const d = await r.json() as { features?: Feature[] };
    return d.features ?? [];
  } catch { return []; }
}

/**
 * Days 1-7. Days 1-3 are SPC's categorical outlooks; days 4-7 are the Day 4-8
 * probabilistic panels (SPC issues no categorical beyond Day 3, so the grid
 * legitimately changes units halfway across — the UI labels which is which).
 */
export async function getSevenDayPattern(): Promise<PatternDay[]> {
  const sources: { day: number; url: string; kind: "categorical" | "probabilistic" }[] = [
    { day: 1, url: `${SPC}/products/outlook/day1otlk_cat.nolyr.geojson`, kind: "categorical" },
    { day: 2, url: `${SPC}/products/outlook/day2otlk_cat.nolyr.geojson`, kind: "categorical" },
    { day: 3, url: `${SPC}/products/outlook/day3otlk_cat.nolyr.geojson`, kind: "categorical" },
    { day: 4, url: `${SPC}/products/exper/day4-8/day4prob.nolyr.geojson`, kind: "probabilistic" },
    { day: 5, url: `${SPC}/products/exper/day4-8/day5prob.nolyr.geojson`, kind: "probabilistic" },
    { day: 6, url: `${SPC}/products/exper/day4-8/day6prob.nolyr.geojson`, kind: "probabilistic" },
    { day: 7, url: `${SPC}/products/exper/day4-8/day7prob.nolyr.geojson`, kind: "probabilistic" },
  ];
  return Promise.all(sources.map(async (s) => {
    const { cells, lowPred } = assign(await getJson(s.url), s.kind);
    return {
      day: s.day, date: isoDay(s.day - 1), kind: s.kind,
      lowPredictability: lowPred, cells,
    };
  }));
}

// ── Season stats (real counts, no AI) ───────────────────────────────────────
export interface SeasonTile {
  id: string; label: string; value: string; sub: string; tone: "neutral" | "up" | "down" | "hot";
}
interface CountRow {
  report_date: string; tornado: number; hail: number; wind: number;
  state_tornadoes: Record<string, number> | null;
  max_hail_in: number | null; max_hail_place: string | null;
  max_gust_kt: number | null; max_gust_place: string | null;
}
const KT_TO_MPH = 1.15078;

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const n = (x: number) => x.toLocaleString();

export async function getSeasonStats(): Promise<{ tiles: SeasonTile[]; trackingSince: string | null; days: number; pendingDetail: number }> {
  if (!isSupabaseConfigured) return { tiles: [], trackingSince: null, days: 0, pendingDetail: 0 };
  const year = new Date().getUTCFullYear();
  const { data, error } = await supabase
    .from("daily_report_counts")
    .select("report_date,tornado,hail,wind,state_tornadoes,max_hail_in,max_hail_place,max_gust_kt,max_gust_place")
    .gte("report_date", `${year}-01-01`).order("report_date");
  if (error) { logger.error("season stats failed", { scope: "pattern", error }); return { tiles: [], trackingSince: null, days: 0, pendingDetail: 0 }; }

  const rows = (data ?? []) as CountRow[];
  if (rows.length === 0) return { tiles: [], trackingSince: null, days: 0, pendingDetail: 0 };

  // Only the three count columns are summable — the detail columns on CountRow
  // are strings/objects, so keep this key type narrow rather than Omit-ing.
  const sum = (k: "tornado" | "hail" | "wind") => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
  const torn = sum("tornado"), hail = sum("hail"), wind = sum("wind");
  const total = torn + hail + wind;

  const withTotals = rows.map((r) => ({ ...r, total: r.tornado + r.hail + r.wind }));
  const busiest = [...withTotals].sort((a, b) => b.total - a.total)[0];
  const activeDays = withTotals.filter((r) => r.total > 0).length;

  // Per-month totals → peak month.
  const byMonth = new Map<number, number>();
  for (const r of withTotals) {
    const m = Number(r.report_date.slice(5, 7)) - 1;
    byMonth.set(m, (byMonth.get(m) ?? 0) + r.total);
  }
  const peakMonth = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];

  // Last 7 days vs the 7 before, for a real trend rather than a vibe.
  const last14 = withTotals.slice(-14);
  const recent = last14.slice(-7).reduce((s, r) => s + r.total, 0);
  const prior = last14.slice(0, Math.max(0, last14.length - 7)).reduce((s, r) => s + r.total, 0);
  const trendPct = prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null;

  const torn30 = withTotals.slice(-30).reduce((s, r) => s + r.tornado, 0);

  // Consecutive most-recent days with zero reports.
  let quietStreak = 0;
  for (let i = withTotals.length - 1; i >= 0 && withTotals[i].total === 0; i--) quietStreak++;

  const avgPerActive = activeDays > 0 ? Math.round(total / activeDays) : 0;
  const tornShare = total > 0 ? ((torn / total) * 100).toFixed(1) : "0.0";

  // Season leader by state — summed across every day's per-state map, so a state
  // that never leads a single day but places consistently still ranks correctly.
  const stateTotals = new Map<string, number>();
  for (const r of rows) {
    for (const [st, c] of Object.entries(r.state_tornadoes ?? {})) {
      stateTotals.set(st, (stateTotals.get(st) ?? 0) + (Number(c) || 0));
    }
  }
  const topState = [...stateTotals.entries()].sort((a, b) => b[1] - a[1])[0];

  // Season superlatives — the single largest hail stone and strongest measured
  // gust of the year, with where they happened.
  const bigHail = rows
    .filter((r) => r.max_hail_in != null)
    .sort((a, b) => (b.max_hail_in ?? 0) - (a.max_hail_in ?? 0))[0];
  const bigGust = rows
    .filter((r) => r.max_gust_kt != null)
    .sort((a, b) => (b.max_gust_kt ?? 0) - (a.max_gust_kt ?? 0))[0];

  // Rows written before the detail columns existed have no superlatives yet;
  // say so rather than showing a confidently wrong "—".
  const pendingDetail = rows.filter((r) => r.max_hail_in == null && r.max_gust_kt == null
    && Object.keys(r.state_tornadoes ?? {}).length === 0).length;

  // NOTE ON LABELS: the ledger begins when SSWX started tracking, not on Jan 1 —
  // for 2026 that is May, so the entire spring tornado peak is outside it.
  // Labelling these "2026" would overstate coverage by a wide margin, so every
  // cumulative tile says "tracked" and the section header prints the start date.
  const since = rows[0].report_date;
  const tiles: SeasonTile[] = [
    { id: "torn", label: "Tornado reports tracked", value: n(torn), sub: `${tornShare}% of all reports`, tone: "hot" },
    { id: "hail", label: "Hail reports tracked", value: n(hail), sub: "1in+ hail, SPC logged", tone: "neutral" },
    { id: "wind", label: "Wind reports tracked", value: n(wind), sub: "58mph+ / damage", tone: "neutral" },
    { id: "total", label: "All severe reports", value: n(total), sub: `across ${n(rows.length)} tracked days`, tone: "neutral" },
    { id: "busiest", label: "Busiest day", value: n(busiest.total),
      sub: busiest.report_date, tone: "hot" },
    { id: "active", label: "Active days", value: n(activeDays),
      sub: `${Math.round((activeDays / rows.length) * 100)}% of tracked days`, tone: "neutral" },
    { id: "peak", label: "Peak month", value: peakMonth ? MONTHS[peakMonth[0]] : "—",
      sub: peakMonth ? `${n(peakMonth[1])} reports` : "no data", tone: "neutral" },
    { id: "torn30", label: "Tornadoes, last 30d", value: n(torn30), sub: "rolling window", tone: torn30 > 0 ? "hot" : "neutral" },
    { id: "trend", label: "7-day trend",
      value: trendPct === null ? "—" : `${trendPct > 0 ? "+" : ""}${trendPct}%`,
      sub: `${n(recent)} vs ${n(prior)} prior week`,
      tone: trendPct === null ? "neutral" : trendPct > 0 ? "up" : "down" },
    { id: "avg", label: "Avg per active day", value: n(avgPerActive), sub: "reports nationwide", tone: "neutral" },
    { id: "quiet", label: "Current quiet streak", value: `${quietStreak}d`,
      sub: quietStreak === 0 ? "reports logged today" : "days with zero reports", tone: quietStreak > 3 ? "down" : "neutral" },
    { id: "topstate", label: "Top tornado state",
      value: topState ? topState[0] : "—",
      sub: topState ? `${n(topState[1])} reports since ${since}` : "no data yet", tone: "hot" },
    { id: "bighail", label: "Largest hail",
      value: bigHail?.max_hail_in != null ? `${bigHail.max_hail_in}"` : "—",
      sub: bigHail?.max_hail_place ? `${bigHail.max_hail_place} · ${bigHail.report_date}` : "no data yet", tone: "hot" },
    { id: "biggust", label: "Peak wind gust",
      value: bigGust?.max_gust_kt != null ? `${Math.round(bigGust.max_gust_kt * KT_TO_MPH)} mph` : "—",
      sub: bigGust?.max_gust_place ? `${bigGust.max_gust_place} · ${bigGust.report_date}` : "no data yet", tone: "hot" },
  ];

  return { tiles, trackingSince: rows[0].report_date, days: rows.length, pendingDetail };
}
