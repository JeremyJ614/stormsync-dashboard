/**
 * Season stats that need SURVEYED tornado data (P-5.3 completion).
 *
 * SPC storm reports tell you a tornado was *reported*; they carry no EF rating
 * (F_Scale is almost always "UNK" at report time) and no casualty count. The
 * NOAA Damage Assessment Toolkit carries the post-survey truth: efscale, efnum,
 * fatalities, injuries, path length and width.
 *
 * All aggregation happens SERVER-SIDE via ArcGIS `outStatistics`, so the page
 * pulls a few hundred bytes instead of the ~1,100 track records behind them.
 *
 * NOT included, deliberately: `propdamage`. The field exists, but summed across
 * an entire year (including an EF4) it comes to ~13,000 — which is plainly not
 * dollars. It is sparsely and inconsistently populated, so a "costliest month"
 * built on it would be a confident, wrong number. Left out rather than faked.
 */
import { logger } from "./logger";

const DAT = "https://services.dat.noaa.gov/arcgis/rest/services/nws_damageassessmenttoolkit/DamageViewer/FeatureServer/1/query";

export interface DatSeason {
  /** Surveyed tornado count (not raw reports). */
  surveyed: number;
  maxEf: number | null;
  strongest: { ef: string; date: string; lengthMi: number | null; wfo: string | null } | null;
  /** Distinct DAYS with at least one EF3+, not the record count - a single
   *  outbreak day can produce several. */
  ef3PlusDays: number;
  ef3PlusCount: number;
  fatalities: number;
  injuries: number;
}

const qs = (params: Record<string, string>) =>
  Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

async function getJson(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${DAT}?${qs({ f: "json", ...params })}`);
    if (!r.ok) return null;
    const j = await r.json();
    // ArcGIS reports failures as HTTP 200 with an { error } body.
    if (j && typeof j === "object" && "error" in j) return null;
    return j as Record<string, unknown>;
  } catch { return null; }
}

const isoFromEpoch = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Everything the season tiles need, in three small requests. */
export async function getDatSeason(year: number): Promise<DatSeason | null> {
  const where = `stormdate >= DATE '${year}-01-01'`;

  const [statsRes, ef3Res] = await Promise.all([
    getJson({
      where,
      outStatistics: JSON.stringify([
        { statisticType: "count", onStatisticField: "objectid", outStatisticFieldName: "n" },
        { statisticType: "max", onStatisticField: "efnum", outStatisticFieldName: "maxef" },
        { statisticType: "sum", onStatisticField: "fatalities", outStatisticFieldName: "fat" },
        { statisticType: "sum", onStatisticField: "injuries", outStatisticFieldName: "inj" },
      ]),
    }),
    getJson({
      where: `${where} AND efnum >= 3`,
      outFields: "stormdate,efscale,efnum,fatalities,length,wfo",
      returnGeometry: "false",
    }),
  ]);

  if (!statsRes) { logger.error("DAT season stats failed", { scope: "pattern" }); return null; }

  type Attr = Record<string, number | string | null>;
  const s = ((statsRes.features as { attributes: Attr }[] | undefined) ?? [])[0]?.attributes ?? {};
  const ef3 = ((ef3Res?.features as { attributes: Attr }[] | undefined) ?? []).map((f) => f.attributes);

  // A single outbreak day can hold several EF3+ tracks, so count DAYS.
  const days = new Set<string>();
  for (const a of ef3) {
    const ts = Number(a.stormdate);
    if (Number.isFinite(ts)) days.add(isoFromEpoch(ts));
  }

  // Strongest = highest EF, then longest path as the tie-break.
  const sorted = [...ef3].sort((a, b) =>
    (Number(b.efnum) || 0) - (Number(a.efnum) || 0) || (Number(b.length) || 0) - (Number(a.length) || 0));
  const top = sorted[0];

  return {
    surveyed: Number(s.n) || 0,
    maxEf: s.maxef == null ? null : Number(s.maxef),
    strongest: top
      ? {
          ef: String(top.efscale ?? "EFU"),
          date: Number.isFinite(Number(top.stormdate)) ? isoFromEpoch(Number(top.stormdate)) : "",
          lengthMi: Number.isFinite(Number(top.length)) ? Math.round(Number(top.length) * 10) / 10 : null,
          wfo: top.wfo ? String(top.wfo) : null,
        }
      : null,
    ef3PlusDays: days.size,
    ef3PlusCount: ef3.length,
    fatalities: Number(s.fat) || 0,
    injuries: Number(s.inj) || 0,
  };
}

/**
 * Expected surveyed-tornado count from Jan 1 through a given date, from the
 * 1950-2023 SPC climatology already shipped in tornadoClimo.json
 * (`cumAvgByMonth` = average cumulative count through the end of each month).
 * Linearly interpolated inside the current month.
 *
 * IMPORTANT: this is compared against DAT's SURVEYED count, never against raw
 * SPC reports. Reports include duplicates for a single tornado, so measuring
 * them against a confirmed-tornado normal would inflate "percent of normal".
 */
export function expectedToDate(cumAvgByMonth: number[], on: Date): number | null {
  if (!Array.isArray(cumAvgByMonth) || cumAvgByMonth.length !== 12) return null;
  const m = on.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(on.getUTCFullYear(), m + 1, 0)).getUTCDate();
  const frac = (on.getUTCDate() - 1) / daysInMonth;
  const prev = m === 0 ? 0 : cumAvgByMonth[m - 1];
  const cur = cumAvgByMonth[m];
  return prev + (cur - prev) * frac;
}
