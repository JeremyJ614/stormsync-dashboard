// Weather data proxy: the Supabase `weather` Edge Function (replaced the retired
// Render backend). If the Supabase URL is unset the calls fail fast rather than
// silently hitting a dead host — the app surfaces a clear module error.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const BASE_API = `${SUPABASE_URL ?? ""}/functions/v1/weather`;
// Emergency Storm Contact relay (U-23) — server-side email + carrier SMS relay.
export const RELAY_API = `${SUPABASE_URL ?? ""}/functions/v1/relay`;

export const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";
export const NWS_BASE = "https://api.weather.gov";
export const SPC_BASE = "https://www.spc.noaa.gov";
export const IEM_BASE = "https://mesonet.agron.iastate.edu";

export const CACHE_TTL_MS = 5 * 60 * 1000;

export const DEFAULT_LOCATION = {
  lat: 35.4676,
  lon: -97.5164,
  name: "Oklahoma City, OK",
};

export const OPEN_METEO_HOURLY_VARS = [
  "temperature_2m",
  "apparent_temperature",
  "precipitation_probability",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "relative_humidity_2m",
  "dew_point_2m",
  "surface_pressure",
  "cloud_cover",
  "visibility",
  "cape",
  "lifted_index",
].join(",");

export const OPEN_METEO_PRESSURE_VARS = [
  "wind_speed_925hPa",
  "wind_direction_925hPa",
  "wind_speed_850hPa",
  "wind_direction_850hPa",
  "wind_speed_700hPa",
  "wind_direction_700hPa",
  "wind_speed_500hPa",
  "wind_direction_500hPa",
  "wind_speed_300hPa",
  "wind_direction_300hPa",
  "temperature_850hPa",
  "geopotential_height_500hPa",
].join(",");

export const OPEN_METEO_DAILY_VARS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "apparent_temperature_max",
  "precipitation_sum",
  "precipitation_probability_max",
  "weather_code",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "wind_direction_10m_dominant",
  "sunrise",
  "sunset",
].join(",");

export const OPEN_METEO_CURRENT_VARS = [
  "temperature_2m",
  "apparent_temperature",
  "weather_code",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "relative_humidity_2m",
  "dew_point_2m",
  "surface_pressure",
  "cloud_cover",
  "visibility",
  "precipitation",
].join(",");

export const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Icy fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Moderate rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Moderate showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ hail",
  99: "Thunderstorm w/ heavy hail",
};

export const WEATHER_ICONS: Record<number, string> = {
  0: "☀️",
  1: "🌤️",
  2: "⛅",
  3: "☁️",
  45: "🌫️",
  48: "🌫️",
  51: "🌦️",
  53: "🌦️",
  55: "🌧️",
  61: "🌧️",
  63: "🌧️",
  65: "🌧️",
  71: "🌨️",
  73: "❄️",
  75: "❄️",
  77: "🌨️",
  80: "🌦️",
  81: "🌦️",
  82: "⛈️",
  85: "🌨️",
  86: "❄️",
  95: "⛈️",
  96: "⛈️",
  99: "⛈️",
};
