/**
 * Tropical data layer — types, palette and fetch helpers shared by the basin
 * tracker and the per-storm pages.
 *
 * Everything here is served by the `tropical` edge function, which parses the
 * NHC's shapefile/ATCF/recon products server-side. Nothing in the UI talks to
 * nhc.noaa.gov directly (no CORS, and the a-deck alone is ~2 MB gzipped).
 */
import { TROPICAL_API } from "../config";

// ── palette ──────────────────────────────────────────────────────────────────
// A restrained, jewel-toned Saffir-Simpson ramp: deep sapphire through
// champagne into garnet. Deliberately not the neon cyan/magenta ramp every
// other tracker uses.
export const INTENSITY = [
  { key: "TD", label: "TD",    range: "< 39 mph",    color: "#8fa3bf", min: -Infinity },
  { key: "TS", label: "TS",    range: "39–73 mph",   color: "#5b9dd9", min: 34 },
  { key: "C1", label: "Cat 1", range: "74–95 mph",   color: "#d9b775", min: 64 },
  { key: "C2", label: "Cat 2", range: "96–110 mph",  color: "#e0954e", min: 83 },
  { key: "C3", label: "Cat 3", range: "111–129 mph", color: "#d96a45", min: 96 },
  { key: "C4", label: "Cat 4", range: "130–156 mph", color: "#c1443f", min: 113 },
  { key: "C5", label: "Cat 5", range: "≥ 157 mph",   color: "#9b3a6b", min: 137 },
] as const;

export const GOLD = "#d9b775";
export const GOLD_DIM = "rgba(217,183,117,0.28)";

export type IntensityTier = (typeof INTENSITY)[number];

/** Saffir-Simpson bucket for a wind speed in knots. */
export function intensityOf(kt: number): IntensityTier {
  let hit: IntensityTier = INTENSITY[0];
  for (const t of INTENSITY) if (kt >= t.min) hit = t;
  return hit;
}
export const intensityColor = (kt: number) => intensityOf(kt).color;

/** Full storm-type name from the NHC two-letter classification. */
export function classificationLabel(code: string | undefined, kt: number): string {
  switch ((code ?? "").toUpperCase()) {
    case "HU": return intensityOf(kt).key.startsWith("C") ? `${intensityOf(kt).label} Hurricane` : "Hurricane";
    case "TS": return "Tropical Storm";
    case "TD": return "Tropical Depression";
    case "STS": return "Subtropical Storm";
    case "SD": return "Subtropical Depression";
    case "PTC": return "Potential Tropical Cyclone";
    case "PT": return "Post-Tropical Cyclone";
    case "RM": return "Remnant Low";
    default: return intensityOf(kt).key === "TD" ? "Tropical Depression" : intensityOf(kt).label;
  }
}

export const BASIN_NAME: Record<string, string> = {
  AL: "Atlantic", EP: "Eastern Pacific", CP: "Central Pacific",
  WP: "Western Pacific", IO: "Indian Ocean", SH: "Southern Hemisphere",
};

// ── types ────────────────────────────────────────────────────────────────────
export interface ForecastPoint {
  lat: number; lon: number; tau: number;
  maxwind_kt: number; maxwind_mph: number;
  gust_kt: number; gust_mph: number;
  mslp: number | null;
  dateLabel: string; fullDateLabel: string; validTime: string;
  stormType: string; dir: number | null; speed_kt: number | null;
  cat: number; short: string; label: string;
}

export interface Storm {
  id: string; atcfId: string; name: string; binNumber: string | null; basin: string;
  classification: string;
  intensity_kt: number; intensity_mph: number;
  gust_kt: number | null; gust_mph: number | null;
  pressure_mb: number | null;
  lat: number; lon: number;
  movementDir: number | null; movementSpeed_mph: number | null;
  lastUpdate: string;
  advisoryNum: string | null; advisoryIssuance: string | null;
  cat: number; short: string; label: string;
  links: {
    publicAdvisory: string | null; forecastAdvisory: string | null;
    discussion: string | null; windProbabilities: string | null;
    graphics: string | null; coneKmz: string | null;
  };
  forecastPoints: ForecastPoint[];
}

export interface ConeData {
  advisory: string | null; advisoryDate: string | null;
  cone: GeoJSON.FeatureCollection; line: GeoJSON.FeatureCollection;
  points: ForecastPoint[]; source: string;
}
export interface RadiiData {
  advisory: string | null;
  initial: GeoJSON.FeatureCollection; forecast: GeoJSON.FeatureCollection;
  source: string;
}
export interface GtwoData {
  updated: string | null;
  areas: GeoJSON.FeatureCollection; points: GeoJSON.FeatureCollection;
  outlookText: Record<string, string>;
}
export interface ModelTrack {
  id: string; name: string; color: string; official: boolean;
  peak_kt: number; peak_mph: number;
  points: { lon: number; lat: number; tau: number; vmax_kt: number; vmax_mph: number; mslp: number | null }[];
}
export interface ModelsData {
  initialized: string | null; cycle?: string;
  models: ModelTrack[]; count: number; ensemble: boolean;
}
export interface TrackPoint {
  timestamp: string; lat: number; lon: number;
  winds_kt: number; winds_mph: number; pressure: number | null;
  type: string; cat: number; short: string; label: string;
}
export interface ReconMission {
  key: string; mission: string; aircraft: string; missionNum: string;
  stormName: string; stormId: string | null;
  fixTime: string | null; lastObTime?: string | null;
  lat: number | null; lon: number | null; mslp: number | null;
  maxFlWind_kt: number | null; maxFlWind_mph: number | null;
  maxSfcWind_kt: number | null; maxSfcWind_mph: number | null;
  obNumber: string | null; status: "active" | "completed"; remarks: string | null;
}
export interface SatelliteData {
  available: boolean; reason?: string;
  satellite: string; satelliteLabel: string; subLon: number;
  product: string; productLabel: string;
  zoom: number; tileSize: number; grid: number; cropSize: number;
  center: { lat: number; lon: number; col: number; row: number };
  tiles: { row: number; col: number; left: number; top: number }[];
  frames: { ts: string; iso: string; base: string }[];
  count: number;
}

// ── fetch ────────────────────────────────────────────────────────────────────
export async function tropicalFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${TROPICAL_API}${path}`);
  if (!res.ok) {
    let detail = "";
    try { detail = ((await res.json()) as { error?: string }).error ?? ""; } catch { /* body may be empty */ }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/** URL for one satellite tile of a given frame. */
export const tileUrl = (base: string, row: number, col: number) =>
  `${base}/${String(row).padStart(3, "0")}_${String(col).padStart(3, "0")}.png`;

// ── formatting ───────────────────────────────────────────────────────────────
export const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (deg: number | null | undefined) =>
  deg == null ? "—" : COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

export function formatCoord(lat: number, lon: number) {
  const nLon = ((lon + 540) % 360) - 180;
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(nLon).toFixed(1)}°${nLon >= 0 ? "E" : "W"}`;
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatClock(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      timeZoneName: "short", ...opts,
    });
  } catch { return iso; }
}
