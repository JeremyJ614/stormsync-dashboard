/**
 * Reads the nightly SSWX Storm Engine artifact (`public.daily_brief`).
 *
 * The engine writes one row per day. Until the Anthropic key is configured it
 * writes a deterministic SPC risk overview with status `skipped`; once the key
 * is set the nightly Claude run fills in the AI narrative with status `ok`.
 * Consumers render whatever is present and fall back gracefully.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export interface RiskOverview {
  day1_category: string | null;
  day1_category_name: string;
  tornado_prob_max: number;
  wind_prob_max: number;
  hail_prob_max: number;
  day2_category: string | null;
  day3_category: string | null;
}

export interface ChaseTarget {
  area: string;
  reason: string;
  hazards: string;
}

export interface DailyBriefContent {
  risk_overview?: RiskOverview;
  discussion_plain?: string;
  pattern?: string;
  chase_targets?: ChaseTarget[];
  history_recap?: string;
  confidence?: "low" | "moderate" | "high";
}

export interface DailyBrief {
  briefDate: string;
  status: "pending" | "ok" | "error" | "skipped";
  model: string | null;
  headline: string | null;
  summary: string | null;
  content: DailyBriefContent;
  generatedAt: string | null;
}

interface BriefRow {
  brief_date: string;
  status: DailyBrief["status"];
  model: string | null;
  headline: string | null;
  summary: string | null;
  content: DailyBriefContent | null;
  generated_at: string | null;
}

/** Latest usable brief. Skips `error` rows so a transient failed run (e.g. the
 *  AI provider being briefly overloaded) never blanks the consumer pages —
 *  they fall back to the most recent good brief until the next run succeeds. */
export async function getLatestBrief(): Promise<DailyBrief | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from("daily_brief")
    .select("*")
    .neq("status", "error")
    .order("brief_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error("Failed to load daily brief", { scope: "storm-engine", error });
    throw error;
  }
  if (!data) return null;
  const r = data as BriefRow;
  return {
    briefDate: r.brief_date,
    status: r.status,
    model: r.model,
    headline: r.headline,
    summary: r.summary,
    content: r.content ?? {},
    generatedAt: r.generated_at,
  };
}
