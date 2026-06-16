import { useQuery } from "@tanstack/react-query";
import { getLatestBrief, type DailyBrief } from "../lib/dailyBrief";

/**
 * Shared reader for the nightly SSWX Storm Engine brief (`public.daily_brief`).
 *
 * Every AI module (Daily Briefing, Forecast Discussion plain-language, Weather
 * Pattern AI, Storm Chasing targets, …) consumes this ONE artifact rather than
 * making its own per-request AI call — that is what keeps the whole product on
 * the free AI tier. The brief refreshes once nightly, so we cache it for an hour.
 */
export function useDailyBrief() {
  return useQuery<DailyBrief | null>({
    queryKey: ["daily-brief"],
    queryFn: getLatestBrief,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
