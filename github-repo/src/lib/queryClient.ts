import { QueryClient } from "@tanstack/react-query";
import { CACHE_TTL_MS } from "../config";

/**
 * Cache lifetimes, by how fast the underlying thing actually changes.
 *
 * One global five-minute TTL meant tornado climatology from 1950 was re-fetched
 * as often as radar. These are the tiers everything should pick from — pass one
 * as `staleTime` on the query rather than inventing a new number.
 */
export const TTL = {
  /** Radar frames, live warnings, lightning — seconds matter. */
  live: 45 * 1000,
  /** Current conditions, alerts, storm reports. */
  quick: 3 * 60 * 1000,
  /** Forecasts, outlooks, model manifests — the default. */
  normal: CACHE_TTL_MS,
  /** Discussions, daily briefs, tropical products. */
  slow: 20 * 60 * 1000,
  /** Pricing, badge and FAQ config, module lists. */
  config: 60 * 60 * 1000,
  /** Climatology, glossary, historical archives — these do not change today. */
  archival: 12 * 60 * 60 * 1000,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: TTL.normal,
      gcTime: TTL.normal * 4,
      retry: 2,
      refetchOnWindowFocus: false,
      // A refetch that fails should not blank a panel that already has data.
      placeholderData: (prev: unknown) => prev,
    },
  },
});
