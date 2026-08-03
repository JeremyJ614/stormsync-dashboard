/**
 * Reads the nightly SSWX severe-weather history (`public.severe_history`).
 *
 * The Storm Engine maintains a per-day national report ledger and republishes
 * one summary row per period each night. Consumers read whatever is present.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type HistoryPeriod = "week" | "lastmonth" | "thismonth" | "thisyear";

export interface HistEvent {
  date: string;
  title: string;
  location: string;
  category: string;
  impact: string;
}
export interface HistoryStats {
  tornadoes: number | null;
  hail_reports: number | null;
  wind_reports: number | null;
  deaths: number | null;
}
export interface PeriodHistory {
  period: HistoryPeriod;
  periodLabel: string;
  headline: string | null;
  summary: string | null;
  stats: HistoryStats;
  events: HistEvent[];
  trackingSince: string | null;
  updatedAt: string | null;
}

interface Row {
  period: HistoryPeriod;
  period_label: string;
  headline: string | null;
  summary: string | null;
  stats: HistoryStats | null;
  events: HistEvent[] | null;
  tracking_since: string | null;
  updated_at: string | null;
}

const EMPTY_STATS: HistoryStats = { tornadoes: null, hail_reports: null, wind_reports: null, deaths: null };

/** All four period summaries, keyed by period. Missing periods are absent from the map. */
export async function getSevereHistory(): Promise<Record<string, PeriodHistory>> {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await supabase.from("severe_history").select("*");
  if (error) {
    logger.error("Failed to load severe history", { scope: "storm-engine", error });
    throw error;
  }
  const out: Record<string, PeriodHistory> = {};
  for (const r of (data ?? []) as Row[]) {
    out[r.period] = {
      period: r.period,
      periodLabel: r.period_label,
      headline: r.headline,
      summary: r.summary,
      stats: r.stats ?? EMPTY_STATS,
      events: r.events ?? [],
      trackingSince: r.tracking_since,
      updatedAt: r.updated_at,
    };
  }
  return out;
}
