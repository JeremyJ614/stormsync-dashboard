import { QueryClient } from "@tanstack/react-query";
import { CACHE_TTL_MS } from "../config";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: CACHE_TTL_MS,
      gcTime: CACHE_TTL_MS * 2,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
