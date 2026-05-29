import { useQuery } from "@tanstack/react-query";
import {
  fetchOpenMeteo,
  fetchNWSPoints,
  fetchNWSAlerts,
  fetchNWSForecast,
  fetchNWSDiscussion,
  fetchNWSHazardousWeather,
  type LocationCoords,
} from "../utils/weatherApi";

export function useOpenMeteo(loc: LocationCoords) {
  return useQuery({
    queryKey: ["openmeteo", loc.lat.toFixed(3), loc.lon.toFixed(3)],
    queryFn: () => fetchOpenMeteo(loc.lat, loc.lon),
    enabled: !!loc,
  });
}

export function useNWSPoints(loc: LocationCoords) {
  return useQuery({
    queryKey: ["nws-points", loc.lat.toFixed(3), loc.lon.toFixed(3)],
    queryFn: () => fetchNWSPoints(loc.lat, loc.lon),
    enabled: !!loc,
    staleTime: 30 * 60 * 1000,
  });
}

export function useNWSAlerts(loc: LocationCoords) {
  return useQuery({
    queryKey: ["nws-alerts", loc.lat.toFixed(3), loc.lon.toFixed(3)],
    queryFn: () => fetchNWSAlerts(loc.lat, loc.lon),
    enabled: !!loc,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useNWSForecast(forecastUrl: string | undefined) {
  return useQuery({
    queryKey: ["nws-forecast", forecastUrl],
    queryFn: () => fetchNWSForecast(forecastUrl!),
    enabled: !!forecastUrl,
  });
}

export function useNWSDiscussion(office: string | undefined) {
  return useQuery({
    queryKey: ["nws-discussion", office],
    queryFn: () => fetchNWSDiscussion(office!),
    enabled: !!office,
    staleTime: 15 * 60 * 1000,
  });
}

export function useNWSHazardousWeather(office: string | undefined) {
  return useQuery({
    queryKey: ["nws-hwo", office],
    queryFn: () => fetchNWSHazardousWeather(office!),
    enabled: !!office,
    staleTime: 15 * 60 * 1000,
  });
}
