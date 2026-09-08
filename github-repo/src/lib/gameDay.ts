/**
 * The contest day.
 *
 * The Forecast Game and Daily Trivia both run on a calendar day, and both used
 * `new Date().toISOString().slice(0, 10)` — the UTC date. In Eastern time UTC
 * rolls over at 8pm, so from 8pm onwards everything filed itself against
 * TOMORROW. Locking your pins after dinner stored them as the next day's entry,
 * and the next morning the game showed picks you had already made as locked,
 * sitting beside a fresh SPC outlook they were never made against. Nothing was
 * broken; the day just ended at the wrong time.
 *
 * The day is now Eastern, so it turns over at local midnight the way anybody
 * playing would assume. Eastern rather than each viewer's own zone on purpose:
 * this is a single national contest scored against one set of storm reports,
 * and a member in Los Angeles and one in Boston have to be playing the same
 * round. One shared clock, published, is fairer than everybody having their own
 * and the leaderboard meaning something different for each of them.
 *
 * `en-CA` is not a stylistic choice — it is the locale that formats as
 * YYYY-MM-DD, which is the shape the database column wants. The zone name
 * carries its own daylight-saving rules, so this stays correct across the March
 * and November changeovers without a table of offsets.
 */
export const GAME_TZ = "America/New_York";

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAME_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's contest date, `YYYY-MM-DD`, in Eastern time. */
export function gameDate(at: Date = new Date()): string {
  return FMT.format(at);
}

/** The contest date `days` before (or after, if negative) the given moment. */
export function gameDateOffset(days: number, at: Date = new Date()): string {
  return gameDate(new Date(at.getTime() + days * 86_400_000));
}

/**
 * How long until the day turns over, in milliseconds.
 *
 * Used to re-arm the pages that show "today": someone who leaves the game open
 * across midnight should watch the board reset rather than sit on a stale round
 * until they think to reload. Found by stepping forward until the formatted
 * date changes rather than by arithmetic on an offset, so a changeover night —
 * when the day is 23 or 25 hours long — needs no special case.
 */
export function msUntilNextGameDay(at: Date = new Date()): number {
  const today = gameDate(at);
  // Midnight Eastern is never more than 24h + 1h of DST slack away.
  let lo = 0, hi = 26 * 3_600_000;
  while (hi - lo > 1000) {
    const mid = (lo + hi) / 2;
    if (gameDate(new Date(at.getTime() + mid)) === today) lo = mid; else hi = mid;
  }
  return Math.ceil(hi);
}

/** A contest date rendered for a reader, e.g. "Mon, Sep 8". */
export function formatGameDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC", weekday: "short", month: "short", day: "numeric",
  });
}
