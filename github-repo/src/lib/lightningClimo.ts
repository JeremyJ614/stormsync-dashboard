/**
 * Lightning climatology from NCEI (real observed data, not modelled).
 *
 * There is no free public API for historical strike density — the per-state
 * flash-density figures you see quoted come from Vaisala's NLDN, which is a
 * commercial licence. What IS freely available, and is the long-standing
 * meteorological proxy for lightning climatology, is NCEI's `DYTS` element:
 * the number of days with THUNDER observed at a station.
 *
 * So this module answers "how electrically active is my area, and when?" from
 * genuine observations:
 *   • Global Summary of the Month → monthly thunder-day curve (seasonality)
 *   • Global Summary of the Year  → annual thunder-day totals (year to year)
 *
 * The station is found by bounding box around the member's location, so the
 * climatology is theirs rather than a national average.
 */
import { logger } from "./logger";

const SEARCH = "https://www.ncei.noaa.gov/access/services/search/v1/data";
const DATA = "https://www.ncei.noaa.gov/access/services/data/v1";

export interface ClimoMonth { month: number; avgDays: number; years: number }
/**
 * One year's thunder-day total, and which calendar months actually reported.
 *
 * The months matter because NCEI emits no row for a month with no thunder, so
 * a short list is not automatically a gap — but a year missing one of the BUSY
 * months is not comparable with a year that has them all. Oklahoma City's 2014
 * is missing May, its single biggest month at 9.5 days on average, and its
 * total of 17 sat next to years in the sixties as though it had been a quiet
 * year. It was not; it was a year with a hole in it.
 */
export interface ClimoYear { year: number; days: number; reported: number[] }
export interface LightningClimo {
  stationId: string;
  monthly: ClimoMonth[];
  yearly: ClimoYear[];
  annualAvg: number;
  peakMonth: number | null;
  /** Years of record actually used, for an honest sample-size note. */
  sampleYears: number;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthName = (m: number) => MONTH_ABBR[m] ?? "";

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const txt = await r.text();
    if (!txt.trim()) return null;
    return JSON.parse(txt) as T;
  } catch { return null; }
}

/**
 * Nearest stations reporting thunder days. NCEI's data endpoint refuses a
 * bounding box without a station list, so the search service is used first to
 * turn a location into candidate station ids.
 */
async function findStations(lat: number, lon: number, halfDeg: number): Promise<string[]> {
  // NCEI bbox order is north,west,south,east.
  const bbox = [
    (lat + halfDeg).toFixed(3), (lon - halfDeg).toFixed(3),
    (lat - halfDeg).toFixed(3), (lon + halfDeg).toFixed(3),
  ].join(",");
  const end = new Date().getUTCFullYear() - 1;
  const url = `${SEARCH}?dataset=global-summary-of-the-month&dataTypes=DYTS&bbox=${bbox}` +
    `&startDate=${end - 2}-01-01&endDate=${end}-12-31&limit=8`;
  const d = await getJson<{ results?: { stations?: { id?: string }[] }[] }>(url);
  const ids: string[] = [];
  for (const r of d?.results ?? []) {
    const id = r.stations?.[0]?.id;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** NCEI pads values with spaces ("        64"). */
const numOf = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
};

interface Row { DATE: string; STATION: string; DYTS?: string }

export async function getLightningClimo(lat: number, lon: number): Promise<LightningClimo | null> {
  // Widen the search until a station turns up — thunder-day reporting is sparse
  // outside first-order stations, so a tight box often finds nothing.
  let stations: string[] = [];
  for (const half of [0.6, 1.5, 3.0]) {
    stations = await findStations(lat, lon, half);
    if (stations.length) break;
  }
  if (!stations.length) return null;

  const endYear = new Date().getUTCFullYear() - 1;
  const startYear = endYear - 14;                     // up to 15 years of record

  // Try candidate stations in order; the first with usable monthly data wins.
  for (const station of stations.slice(0, 4)) {
    const monthly = await getJson<Row[]>(
      `${DATA}?dataset=global-summary-of-the-month&stations=${station}&dataTypes=DYTS` +
      `&startDate=${startYear}-01-01&endDate=${endYear}-12-31&format=json`);
    if (!Array.isArray(monthly) || monthly.length < 12) continue;

    // Average each calendar month across all years of record.
    const buckets = Array.from({ length: 12 }, () => [] as number[]);
    const yearsSeen = new Set<number>();
    for (const r of monthly) {
      const v = numOf(r.DYTS);
      if (v === null) continue;
      const [y, m] = r.DATE.split("-").map(Number);
      if (!y || !m) continue;
      buckets[m - 1].push(v);
      yearsSeen.add(y);
    }
    const months: ClimoMonth[] = buckets.map((vals, i) => ({
      month: i,
      avgDays: vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0,
      years: vals.length,
    }));
    if (months.every((m) => m.years === 0)) continue;

    // Which months each year actually reported, taken from the monthly rows.
    const reportedBy = new Map<number, number[]>();
    for (const r of monthly) {
      if (numOf(r.DYTS) === null) continue;
      const [y, m] = r.DATE.split("-").map(Number);
      if (!y || !m) continue;
      const list = reportedBy.get(y) ?? [];
      list.push(m - 1);
      reportedBy.set(y, list);
    }

    const yearlyRaw = await getJson<Row[]>(
      `${DATA}?dataset=global-summary-of-the-year&stations=${station}&dataTypes=DYTS` +
      `&startDate=${startYear}-01-01&endDate=${endYear}-12-31&format=json`);
    const yearly: ClimoYear[] = (Array.isArray(yearlyRaw) ? yearlyRaw : [])
      .map((r) => ({
        year: Number(r.DATE),
        days: numOf(r.DYTS) ?? 0,
        reported: reportedBy.get(Number(r.DATE)) ?? [],
      }))
      .filter((r) => Number.isFinite(r.year) && r.days > 0)
      .sort((a, b) => a.year - b.year);

    // The annual figure comes from the years that actually covered the season;
    // averaging in a year with a hole in May drags the headline number down by
    // several days and makes the place look quieter than it is. With no
    // comparable year at all, the sum of the monthly means is the honest
    // fallback — it is built from every year that reported each month.
    const seasonMonths = months.filter((m) => m.avgDays >= 2).map((m) => m.month);
    const comparable = yearly.filter((y) => seasonMonths.every((m) => y.reported.includes(m)));
    const annualAvg = comparable.length
      ? Math.round(comparable.reduce((s, r) => s + r.days, 0) / comparable.length)
      : Math.round(months.reduce((s, m) => s + m.avgDays, 0));

    const peak = months.reduce((best, m) => (m.avgDays > (months[best]?.avgDays ?? -1) ? m.month : best), 0);

    return {
      stationId: station,
      monthly: months,
      yearly,
      annualAvg,
      peakMonth: months[peak]?.avgDays > 0 ? peak : null,
      sampleYears: yearsSeen.size,
    };
  }

  logger.error("no NCEI station with thunder-day data", { scope: "lightning" });
  return null;
}

/* ── Derived statistics ─────────────────────────────────────────────────────
 *
 * Everything below is arithmetic on the station's own record. Nothing is
 * looked up, assumed, or filled in from a national figure: if the record is
 * too short to support a number, the number is `null` and the page says so
 * rather than printing something that looks measured.
 */

export interface ClimoStats {
  /** Quietest calendar month, or null when the station never reports thunder. */
  quietestMonth: number | null;
  /** First and last month averaging at least two thunder days. */
  seasonStart: number | null;
  seasonEnd: number | null;
  seasonMonths: number;
  busiestYear: ClimoYear | null;
  quietestYear: ClimoYear | null;
  /**
   * Least-squares slope of the yearly totals, in days per decade.
   *
   * Null under five years of record. A thunder-day series this short is noisy
   * and a slope drawn through four points is a line through noise — it would
   * read as a climate signal, which it is not, and this module has no business
   * implying one.
   */
  trendPerDecade: number | null;
  /**
   * The fitted line itself, one point per year, so the chart draws the SAME
   * regression the headline number quotes. Computing it again in the page
   * would be two fits that could disagree, on one chart, about one record.
   */
  trendLine: { year: number; fit: number }[];
  /** Standard deviation of the yearly totals: how much one year differs. */
  variability: number | null;
  /** Share of the year's thunder falling in the three busiest months. */
  topThreeShare: number | null;
  recordFrom: number | null;
  recordTo: number | null;
  /** Years usable for the year-to-year figures, and how many were set aside. */
  comparableYears: ClimoYear[];
  incompleteYears: number;
  /** Thunder days in the month we are in now, and the odds on a given day. */
  thisMonth: number;
  thisMonthAvg: number;
  thisMonthOdds: number;
}

const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function climoStats(c: LightningClimo): ClimoStats {
  const withData = c.monthly.filter((m) => m.years > 0);
  const active = c.monthly.filter((m) => m.avgDays >= 2);

  const quietest = withData.length
    ? withData.reduce((lo, m) => (m.avgDays < lo.avgDays ? m : lo)).month
    : null;

  const totalAvg = c.monthly.reduce((s, m) => s + m.avgDays, 0);
  const topThree = [...c.monthly].sort((a, b) => b.avgDays - a.avgDays).slice(0, 3);
  const topThreeShare = totalAvg > 0
    ? Math.round((topThree.reduce((s, m) => s + m.avgDays, 0) / totalAvg) * 100)
    : null;

  /*
   * Only years that covered the whole season are comparable.
   *
   * NCEI emits no row for a month with no thunder, so a short month list is
   * not automatically a gap — but a year missing one of the busy months is not
   * a quiet year, it is a year with a hole in it. Oklahoma City's 2014 is
   * missing May, its biggest month, and its total of 17 sat beside years in
   * the sixties as though the weather had been calm. Left in, two such years
   * dragged a least-squares fit to "+20.9 days per decade" — a number that
   * looks like a climate signal and is an artefact of the record.
   */
  const seasonMonths = c.monthly.filter((m) => m.avgDays >= 2).map((m) => m.month);
  const years = c.yearly.filter((y) => seasonMonths.every((m) => y.reported.includes(m)));
  const incompleteYears = c.yearly.length - years.length;

  const busiestYear = years.length ? years.reduce((hi, y) => (y.days > hi.days ? y : hi)) : null;
  const quietestYear = years.length ? years.reduce((lo, y) => (y.days < lo.days ? y : lo)) : null;

  let trendPerDecade: number | null = null;
  let variability: number | null = null;
  let trendLine: { year: number; fit: number }[] = [];
  if (years.length >= 5) {
    const n = years.length;
    const mx = years.reduce((s, y) => s + y.year, 0) / n;
    const my = years.reduce((s, y) => s + y.days, 0) / n;
    let num = 0, den = 0, sq = 0;
    for (const y of years) {
      num += (y.year - mx) * (y.days - my);
      den += (y.year - mx) ** 2;
      sq += (y.days - my) ** 2;
    }
    if (den > 0) {
      const slope = num / den;
      trendPerDecade = Math.round(slope * 10 * 10) / 10;
      trendLine = years.map((y) => ({
        year: y.year,
        fit: Math.round((my + slope * (y.year - mx)) * 10) / 10,
      }));
    }
    variability = Math.round(Math.sqrt(sq / n) * 10) / 10;
  }

  const nowMonth = new Date().getUTCMonth();
  const thisMonthAvg = c.monthly[nowMonth]?.avgDays ?? 0;

  return {
    quietestMonth: quietest,
    seasonStart: active.length ? active[0].month : null,
    seasonEnd: active.length ? active[active.length - 1].month : null,
    seasonMonths: active.length,
    busiestYear,
    quietestYear,
    trendPerDecade,
    trendLine,
    variability,
    topThreeShare,
    recordFrom: years.length ? years[0].year : null,
    recordTo: years.length ? years[years.length - 1].year : null,
    comparableYears: years,
    incompleteYears,
    thisMonth: nowMonth,
    thisMonthAvg,
    // Thunder days per month over days in the month — the plain-language odds
    // that any given day this month brings thunder. February carries its leap
    // quarter-day so the odds do not tick up every fourth year.
    thisMonthOdds: Math.round((thisMonthAvg / DAYS_IN_MONTH[nowMonth]) * 100),
  };
}
