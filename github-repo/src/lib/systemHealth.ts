/**
 * System health, measured rather than assumed.
 *
 * Every check here actually goes and touches the thing it reports on. A green
 * light that means "we did not check" is worse than no light at all — on a
 * weather app the whole point of the panel is to catch a feed that has gone
 * quiet before a member does.
 *
 * The same rule cuts the other way, and it is the subtler half: a *red* light
 * that means "we asked wrong" is just as bad. Both readings below that can fail
 * for boring reasons are written to distinguish "the answer is zero" from "we
 * were not able to look" —
 *
 *  - Counts and cache ages come from security-definer functions rather than
 *    client `count(*)` calls. `weather_cache` has RLS on with no policy and
 *    `notifications` only exposes the caller's own rows, so counting either
 *    from the browser does not error: it quietly returns 0, which reads as a
 *    dead install.
 *  - The Edge Function probe hits the real URL path. The function routes on
 *    `url.pathname`, so invoking it with the path in a JSON body returns 404
 *    and every feed looks down.
 */
import { supabase } from "./supabase";
import { BASE_API } from "../config";

export type Status = "ok" | "slow" | "down" | "stale" | "checking" | "unknown";

export interface Check {
  id: string;
  label: string;
  group: "Database" | "Functions" | "Feeds" | "Storage";
  status: Status;
  ms: number | null;
  detail: string;
}

const SLOW_MS = 1500;

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T | null; error: unknown }> {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { ms: Math.round(performance.now() - t0), value, error: null };
  } catch (error) {
    return { ms: Math.round(performance.now() - t0), value: null, error };
  }
}

const rate = (ms: number): Status => (ms > SLOW_MS ? "slow" : "ok");

/** Round-trip a trivial query so the number means connection + auth + RLS. */
async function checkDb(): Promise<Check> {
  const { ms, error } = await timed(async () => {
    const { error: e } = await supabase.from("profiles").select("id", { count: "exact", head: true });
    if (e) throw e;
  });
  return {
    id: "db", label: "Database", group: "Database",
    status: error ? "down" : rate(ms), ms,
    detail: error ? "Query failed" : `Round trip ${ms} ms`,
  };
}

async function checkAuth(): Promise<Check> {
  const { ms, value, error } = await timed(async () => {
    const { data, error: e } = await supabase.auth.getSession();
    if (e) throw e;
    return data.session;
  });
  return {
    id: "auth", label: "Auth", group: "Database",
    status: error ? "down" : rate(ms), ms,
    detail: error ? "No response" : value ? "Session valid" : "No session",
  };
}

/**
 * Probe one route of the weather Edge Function.
 *
 * A plain GET against the real path, which is how the app itself calls it and
 * therefore the only probe whose result means anything.
 */
async function checkFunction(path: string, label: string): Promise<Check> {
  const { ms, value, error } = await timed(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const r = await fetch(`${BASE_API}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.status;
  });
  const message = error instanceof Error ? error.message : "No response";
  return {
    id: `fn${path}`, label, group: "Functions",
    status: error ? "down" : rate(ms), ms: error ? null : ms,
    detail: error ? message : `${value} in ${ms} ms`,
  };
}

/**
 * Cache freshness per feed.
 *
 * `weather_cache` rows carry the timestamp of the last successful upstream
 * fetch, so a row that has stopped moving is the earliest visible sign that a
 * source has gone away — usually well before anyone notices a blank panel.
 */
export interface CacheAge {
  key: string;
  ageMinutes: number;
  status: Status;
}

export interface CacheReport {
  /** Null when the read was refused, which is not the same as "nothing cached". */
  ages: CacheAge[] | null;
  error: string | null;
}

export async function cacheAges(): Promise<CacheReport> {
  const { data, error } = await supabase.rpc("admin_cache_ages", { p_limit: 60 });
  if (error) return { ages: null, error: error.message };
  const rows = (data ?? []) as { key: string; age_minutes: number }[];
  return {
    ages: rows.map((r) => {
      const mins = Number(r.age_minutes);
      return {
        key: r.key,
        ageMinutes: mins,
        // Different feeds refresh at wildly different cadences, so "stale" here
        // means "older than anything in this app ever caches for" rather than a
        // per-feed threshold we would have to keep in sync with the fetchers.
        status: mins > 24 * 60 ? "stale" : mins > 6 * 60 ? "slow" : "ok",
      };
    }),
    error: null,
  };
}

/**
 * The probed routes are real ones with valid parameters, verified against the
 * deployed function. That sounds obvious and is the entire point: a probe
 * pointed at a route that does not exist returns 404, and the panel then
 * reports a healthy function as down — which is how this file first shipped.
 */
export async function runChecks(): Promise<Check[]> {
  return Promise.all([
    checkDb(),
    checkAuth(),
    checkFunction("/spc/outlook-geojson?product=day1otlk_cat", "Weather function — SPC outlook"),
    checkFunction("/water/gauges?xmin=-99&ymin=34&xmax=-96&ymax=36", "Weather function — river gauges"),
    checkFunction("/nws/alerts?area=OK", "Weather function — NWS alerts"),
  ]);
}

export interface Totals {
  members: number;
  notifications: number;
  cachedFeeds: number;
  pushSubscriptions: number;
  moduleViews: number;
  auditRows: number;
}

/** Null when the caller is not permitted to read system-wide counts. */
export async function totals(): Promise<Totals | null> {
  const { data, error } = await supabase.rpc("admin_system_stats");
  if (error) return null;
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, number> | undefined;
  if (!r) return null;
  return {
    members: Number(r.members ?? 0),
    notifications: Number(r.notifications ?? 0),
    cachedFeeds: Number(r.cached_feeds ?? 0),
    pushSubscriptions: Number(r.push_subscriptions ?? 0),
    moduleViews: Number(r.module_view_rows ?? 0),
    auditRows: Number(r.audit_rows ?? 0),
  };
}

export const STATUS_COLOR: Record<Status, string> = {
  ok: "#5fd9a8",
  slow: "#e8bb4d",
  stale: "#e8bb4d",
  down: "#e2373c",
  checking: "#8f8fb0",
  unknown: "#8f8fb0",
};

export const STATUS_LABEL: Record<Status, string> = {
  ok: "Healthy", slow: "Slow", stale: "Stale", down: "Down",
  checking: "Checking", unknown: "Unknown",
};
