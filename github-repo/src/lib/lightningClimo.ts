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
export interface ClimoYear { year: number; days: number }
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

    const yearlyRaw = await getJson<Row[]>(
      `${DATA}?dataset=global-summary-of-the-year&stations=${station}&dataTypes=DYTS` +
      `&startDate=${startYear}-01-01&endDate=${endYear}-12-31&format=json`);
    const yearly: ClimoYear[] = (Array.isArray(yearlyRaw) ? yearlyRaw : [])
      .map((r) => ({ year: Number(r.DATE), days: numOf(r.DYTS) ?? 0 }))
      .filter((r) => Number.isFinite(r.year) && r.days > 0)
      .sort((a, b) => a.year - b.year);

    // Prefer the yearly dataset for the annual figure; fall back to summing the
    // monthly means when the yearly series is missing.
    const annualAvg = yearly.length
      ? Math.round(yearly.reduce((s, r) => s + r.days, 0) / yearly.length)
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
