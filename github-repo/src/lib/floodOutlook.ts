/**
 * The flooding outlook.
 *
 * WPC's Excessive Rainfall Outlook: where rain is expected to exceed what the
 * ground can take. It answers a different question from a rainfall total —
 * three inches is nothing on dry sand and a flash flood on a burn scar — and
 * WPC publishes it only as zipped shapefiles, so an edge function turns it into
 * something a map can draw.
 *
 * Five days, one more than the severe outlook covers.
 */
import { FLOOD_API } from "../config";
import { logger } from "./logger";

export interface EroFeature {
  type: "Feature";
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: {
    outlook: string; rank: number; product: string;
    valid: string; issued: string; start: string; end: string;
  };
}

export interface EroDay {
  day: number;
  label: string;
  available: boolean;
  reason?: string;
  issued?: string | null;
  valid?: string | null;
  maxRank?: number;
  features: EroFeature[];
}

export interface EroPayload {
  days: EroDay[];
  source: string;
  fetchedAt: string;
  stale?: boolean;
}

/** The four categories, as WPC ranks them. */
export const ERO_LEVELS = [
  { rank: 1, key: "MRGL", label: "Marginal", odds: "at least 5%",  color: "#4ea86a",
    meaning: "Isolated flash flooding possible. Low-lying roads and poor drainage first." },
  { rank: 2, key: "SLGT", label: "Slight",   odds: "at least 15%", color: "#e3c04a",
    meaning: "Scattered flash flooding expected somewhere in the area." },
  { rank: 3, key: "MDT",  label: "Moderate", odds: "at least 40%", color: "#e07a3f",
    meaning: "Numerous flash floods likely. This is a day to change plans around." },
  { rank: 4, key: "HIGH", label: "High",     odds: "at least 70%", color: "#c451c4",
    meaning: "A significant, potentially life-threatening flash flood event. WPC issues very few of these a year." },
] as const;

export const eroLevel = (rank: number) => ERO_LEVELS.find((l) => l.rank === rank);
export const eroColor = (rank: number) => eroLevel(rank)?.color ?? "#5a6478";

export async function fetchFloodOutlook(): Promise<EroPayload> {
  const res = await fetch(FLOOD_API);
  if (!res.ok) {
    logger.error("flood outlook failed", { scope: "flood", status: res.status });
    throw new Error(`The flooding outlook is unavailable (${res.status}).`);
  }
  const data = (await res.json()) as EroPayload & { error?: string };
  if (data.error) throw new Error(data.error);
  return data;
}

// ── where you are in it ──────────────────────────────────────────────────────

/** Ray casting against one ring. */
function inRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
function inPolygon(lon: number, lat: number, poly: number[][][]): boolean {
  if (!poly.length || !inRing(lon, lat, poly[0])) return false;
  for (let i = 1; i < poly.length; i++) if (inRing(lon, lat, poly[i])) return false;
  return true;
}

/** The highest category covering a point on a given day, or 0. */
export function rankAt(day: EroDay, lon: number, lat: number): number {
  let best = 0;
  for (const f of day.features ?? []) {
    if (f.properties.rank <= best) continue;
    const polys = f.geometry.type === "Polygon"
      ? [f.geometry.coordinates as number[][][]]
      : (f.geometry.coordinates as number[][][][]);
    if (polys.some((p) => inPolygon(lon, lat, p))) best = f.properties.rank;
  }
  return best;
}

/** "Sep 1, 4:00 PM" from WPC's "2026-09-01 16:00:00", which is UTC. */
export function eroTime(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = new Date(`${raw.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
