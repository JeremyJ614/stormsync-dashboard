import {
  OPEN_METEO_BASE,
  OPEN_METEO_HOURLY_VARS,
  OPEN_METEO_DAILY_VARS,
  OPEN_METEO_CURRENT_VARS,
  OPEN_METEO_PRESSURE_VARS,
  BASE_API,
} from "../config";

// Routes NWS/SPC proxy calls through the Supabase `weather` Edge Function.
const API = (path: string) => `${BASE_API}/${path.replace(/^api\//, "").replace(/^\//, "")}`;

/**
 * A fetch that is guaranteed to finish.
 *
 * `fetch` has no timeout. A request that stalls — a phone that has lost the
 * network without noticing, a service worker holding the connection, a captive
 * portal swallowing the socket — never resolves and never rejects, so React
 * Query never leaves `isLoading` and never retries. The page sits on a
 * skeleton for as long as the tab stays open, with no error, no retry button
 * and nothing to say anything went wrong. That is exactly how the Severe
 * Timing module came to show "Reading the profile hour by hour…" for ever.
 *
 * Every weather host here is behind the service worker's network-first data
 * cache (`DATA_HOSTS` in sw.js), which makes the stall MORE likely, not less:
 * the page's fetch is now waiting on the worker's fetch, and neither has a
 * deadline.
 *
 * Ten seconds is well past a slow-but-working mobile response and well short
 * of a member deciding the app is broken. On timeout this rejects, which is a
 * state the callers already know how to render. Note the ceiling a member
 * actually experiences is this multiplied by the retries — see `useOpenMeteo`,
 * where the retry count is held down for the same reason.
 */
const REQUEST_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  url: string, init?: RequestInit, ms = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const ctl = new AbortController();
  const bail = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } catch (e) {
    // An abort is a timeout to everyone upstream; say so rather than leaking
    // "AbortError", which reads like the app cancelled something on purpose.
    if ((e as Error)?.name === "AbortError") {
      throw new Error(`Timed out after ${Math.round(ms / 1000)}s: ${new URL(url).host}`);
    }
    throw e;
  } finally {
    clearTimeout(bail);
  }
}

export interface LocationCoords {
  lat: number;
  lon: number;
  name: string;
}

export interface OpenMeteoCurrentData {
  temperature_2m: number;
  apparent_temperature: number;
  weather_code: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  wind_gusts_10m: number;
  relative_humidity_2m: number;
  dew_point_2m: number;
  surface_pressure: number;
  cloud_cover: number;
  visibility: number;
  precipitation: number;
}

export interface OpenMeteoResponse {
  /**
   * Seconds to add to UTC for the forecast point's own wall clock.
   *
   * Open-Meteo returns it whenever `timezone=auto` is set, and `hourly.time`
   * is expressed in it. Without it there is no way to tell which entry in the
   * hourly array is "now" — which is how every current reading in the app came
   * to be showing midnight.
   */
  utc_offset_seconds?: number;
  timezone?: string;
  current?: OpenMeteoCurrentData;
  hourly?: Record<string, number[]> & { time: string[] };
  daily?: Record<string, (number | string)[]>;
  hourly_units?: Record<string, string>;
  daily_units?: Record<string, string>;
}

export async function fetchOpenMeteo(lat: number, lon: number): Promise<OpenMeteoResponse> {
  const url = new URL(OPEN_METEO_BASE);
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lon.toFixed(4));
  url.searchParams.set("current", OPEN_METEO_CURRENT_VARS);
  url.searchParams.set("daily", OPEN_METEO_DAILY_VARS);
  url.searchParams.set("pressure_level", "true");
  url.searchParams.set("hourly", `${OPEN_METEO_HOURLY_VARS},${OPEN_METEO_PRESSURE_VARS}`);
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("precipitation_unit", "inch");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "7");

  const res = await fetchWithTimeout(url.toString());
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
  return res.json();
}

export interface NWSPointsData {
  properties: {
    cwa: string;
    gridId: string;
    gridX: number;
    gridY: number;
    relativeLocation: { properties: { city: string; state: string } };
    forecastHourly: string;
    forecast: string;
    observationStations: string;
    timeZone: string;
  };
}

export async function fetchNWSPoints(lat: number, lon: number): Promise<NWSPointsData> {
  const res = await fetchWithTimeout(API(`api/nws/points?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`));
  if (!res.ok) throw new Error(`NWS points error: ${res.status}`);
  return res.json();
}

/**
 * What every alert carries, national feed included.
 *
 * Split from `NWSAlertFeature` on purpose. The national feed is fetched with
 * `fields=slim` and genuinely does NOT contain `description` or `instruction`
 * — 340 alerts of full NWS records is 952 KB, and those two fields are 24% of
 * it for text nothing on the warnings map or the SSWXCon score ever shows. If
 * a module later wants the text nationally, it has to say so, and the compiler
 * will stop it from silently reading `undefined` in the meantime.
 */
export interface NWSAlertSummary {
  properties: {
    id: string;
    areaDesc: string;
    headline: string;
    severity: string;
    event: string;
    onset: string;
    expires: string;
    status: string;
    messageType: string;
    sent: string;
  };
}

/** A full alert, as returned for a single point — the text included. */
export interface NWSAlertFeature extends NWSAlertSummary {
  properties: NWSAlertSummary["properties"] & {
    description: string;
    instruction: string;
  };
}

export async function fetchNWSAlerts(lat: number, lon: number): Promise<NWSAlertFeature[]> {
  const res = await fetchWithTimeout(API(`api/nws/alerts?point=${lat.toFixed(4)},${lon.toFixed(4)}`));
  // Never swallow this into an empty list. An empty list means "the Weather
  // Service has nothing out for you", and a caller cannot tell that apart from
  // "we could not ask". On a severe-weather product those are opposite answers,
  // so a failed request has to surface as a failure.
  if (!res.ok) throw new Error(`NWS alerts unavailable (${res.status})`);
  const data = await res.json();
  return data.features || [];
}

export async function fetchAllUSAlerts(): Promise<NWSAlertSummary[]> {
  // `fields=slim` drops the fields no national-feed consumer reads. Measured on
  // a live feed of 340 alerts: 952,285 bytes of JSON down to 224,095, or 113 KB
  // to 25 KB gzipped. `limit` is now actually enforced by the edge function —
  // it used to be accepted and ignored.
  const res = await fetchWithTimeout(API(`api/nws/alerts?limit=500&fields=slim`));
  // Same reasoning as fetchNWSAlerts: [] here would score as a quiet nation.
  if (!res.ok) throw new Error(`National NWS alert feed unavailable (${res.status})`);
  const data = await res.json();
  return data.features || [];
}

export async function fetchStormReports(): Promise<{ today: { tornado: number; hail: number; wind: number }; yesterday: { tornado: number; hail: number; wind: number } }> {
  const res = await fetchWithTimeout(API(`api/spc/storm-reports`));
  // Zeros would read as "no tornadoes were reported today", which is a claim.
  if (!res.ok) throw new Error(`SPC storm reports unavailable (${res.status})`);
  return res.json();
}

export interface NWSForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
  probabilityOfPrecipitation?: { value: number | null };
  relativeHumidity?: { value: number | null };
  icon: string;
}

export async function fetchNWSForecast(forecastUrl: string): Promise<NWSForecastPeriod[]> {
  const res = await fetchWithTimeout(API(`api/nws/forecast?url=${encodeURIComponent(forecastUrl)}`));
  if (!res.ok) throw new Error(`NWS forecast error: ${res.status}`);
  const data = await res.json();
  return data.properties?.periods || [];
}

export interface NWSDiscussion {
  productText: string;
  issuanceTime: string;
  id: string;
}

export async function fetchNWSDiscussion(office: string): Promise<NWSDiscussion | null> {
  try {
    const listUrl = `https://api.weather.gov/products/types/AFD/locations/${office}`;
    const res = await fetchWithTimeout(API(`api/nws/forecast?url=${encodeURIComponent(listUrl)}`));
    if (!res.ok) return null;
    const data = await res.json();
    const products = data["@graph"];
    if (!products?.length) return null;
    const latest = products[0];
    const prodId = latest["@id"].split("/").pop();
    const prodRes = await fetchWithTimeout(API(`api/nws/forecast?url=${encodeURIComponent(`https://api.weather.gov/products/${prodId}`)}`));
    if (!prodRes.ok) return null;
    const prod = await prodRes.json();
    return {
      productText: prod.productText || "",
      issuanceTime: prod.issuanceTime || "",
      id: prod.id || "",
    };
  } catch {
    return null;
  }
}

export async function fetchNWSHazardousWeather(office: string): Promise<string | null> {
  try {
    const listUrl = `https://api.weather.gov/products/types/HWO/locations/${office}`;
    const res = await fetchWithTimeout(API(`api/nws/forecast?url=${encodeURIComponent(listUrl)}`));
    if (!res.ok) return null;
    const data = await res.json();
    const products = data["@graph"];
    if (!products?.length) return null;
    const latest = products[0];
    const prodId = latest["@id"].split("/").pop();
    const prodRes = await fetchWithTimeout(API(`api/nws/forecast?url=${encodeURIComponent(`https://api.weather.gov/products/${prodId}`)}`));
    if (!prodRes.ok) return null;
    const prod = await prodRes.json();
    return prod.productText || null;
  } catch {
    return null;
  }
}

export async function fetchSPCMesoscaleDiscussions(): Promise<unknown[]> {
  try {
    const url = `https://www.spc.noaa.gov/products/md/`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const text = await res.text();
    const matches = text.matchAll(/md(\d{4})\.html/g);
    const ids = [...new Set([...matches].map((m) => m[1]))].slice(0, 5);
    return ids.map((id) => ({
      id,
      url: `https://www.spc.noaa.gov/products/md/md${id}.html`,
      title: `Mesoscale Discussion ${id}`,
    }));
  } catch {
    return [];
  }
}

export async function geocodeLocation(query: string): Promise<Array<{ lat: number; lon: number; name: string }>> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.results?.length) return [];
  return data.results.map((r: { latitude: number; longitude: number; name: string; admin1: string; country_code: string }) => ({
    lat: r.latitude,
    lon: r.longitude,
    name: `${r.name}${r.admin1 ? ", " + r.admin1 : ""}, ${r.country_code}`,
  }));
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": "StormSync/1.0" } });
    if (!res.ok) return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    const data = await res.json();
    const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || "";
    const state = data.address?.state || "";
    return city && state ? `${city}, ${state}` : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  } catch {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
}
