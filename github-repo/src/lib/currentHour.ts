/**
 * Which hour of an Open-Meteo series is "now".
 *
 * Every module that showed a current reading took `hourly.cape[0]`, and index
 * zero is not now — it is MIDNIGHT. The request asks for `timezone=auto` and
 * `forecast_days=7` with no start hour, so the series always begins at 00:00
 * local on the current day. At 07:24 on 8 September, Oklahoma City's index 0
 * read 580 J/kg of CAPE while the hour it was actually living in read 190.
 *
 * So the Threat Index gauge, its four parameter tiles, the dashboard's
 * composite, the SSWXCon local term, the mosquito and aurora readings and the
 * air-quality figures were all reporting the atmosphere as it had been at
 * midnight — up to twenty-three hours stale, and wrong by a factor of three on
 * the number that matters most for storms.
 *
 * The index is found from the API's own time array rather than computed from
 * an offset, because the array is what the values are indexed by. Times come
 * back as `YYYY-MM-DDTHH:MM` in LOCAL time, which sorts lexicographically, so
 * "the last hour that has started" is a scan for the last entry not after now.
 */

/** The shape this needs; anything with an hourly time array will do. */
export interface HourlySeries {
  hourly?: { time?: string[] } & Record<string, unknown>;
  utc_offset_seconds?: number;
}

/**
 * Local wall-clock time at the forecast point, as `YYYY-MM-DDTHH:MM`.
 *
 * Built by shifting the epoch by the location's offset and then reading the
 * result in UTC — which is how you get another place's wall clock without a
 * timezone database. `utc_offset_seconds` is absent on a cached response from
 * an older build, so the viewer's own clock is the fallback; being an hour out
 * for one render is better than pinning to midnight for ever.
 */
function localStamp(offsetSeconds: number | undefined): string {
  const ms = Date.now() + (offsetSeconds ?? -new Date().getTimezoneOffset() * 60) * 1000;
  return new Date(ms).toISOString().slice(0, 16);
}

/**
 * Index of the hour containing now, or 0 when the series cannot be read.
 *
 * Falls back to the LAST hour when now is past the end of the series rather
 * than to the first: a stale forecast should read as the most recent thing it
 * knows, never as the oldest.
 */
export function hourIndexNow(data: HourlySeries | undefined | null): number {
  const times = data?.hourly?.time;
  if (!Array.isArray(times) || times.length === 0) return 0;

  const now = localStamp(data?.utc_offset_seconds);
  if (now < times[0]) return 0;              // series starts in the future
  for (let i = times.length - 1; i >= 0; i--) {
    if (times[i] <= now) return i;
  }
  return 0;
}

/**
 * Reader for one hourly variable at a given index.
 *
 * Exists so a caller cannot accidentally mix an index from one response with
 * the arrays of another, and so a missing variable is `undefined` rather than
 * a silent zero — a measured zero and an absent reading are different claims,
 * and several modules have been caught making the second look like the first.
 */
export function at(
  hourly: Record<string, unknown> | undefined,
  key: string,
  index: number,
): number | undefined {
  const arr = hourly?.[key];
  if (!Array.isArray(arr)) return undefined;
  const v = arr[index];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
