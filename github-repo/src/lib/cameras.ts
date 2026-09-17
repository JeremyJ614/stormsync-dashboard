/**
 * Public camera networks.
 *
 * Four networks, roughly 6,500 cameras, none of them needing an API key. The
 * lists are assembled and normalised by the `weather` edge function (see its
 * `/cameras` route) and cached there for six hours, because a camera roster
 * changes rarely and 6,500 records is not a payload to send to a phone during a
 * storm. The pictures themselves are never cached: the browser loads those
 * straight from the source, which is the entire point of a camera.
 *
 * What is here, and what is not:
 *
 *   Caltrans          3,364  California highways, stills and HLS streams
 *   ALERTCalifornia   1,295  California wildfire watch cameras
 *   MDOT MiDrive        806  Michigan
 *   DriveBC           1,024  British Columbia
 *
 * Most other state 511 systems publish cameras but require a free API key —
 * Idaho, Alaska, Pennsylvania and the rest of that vendor family all answer
 * "Invalid Key" to an anonymous request. They are absent rather than
 * half-built. Adding one is a single adapter in the edge function once a key
 * exists, and the module needs no change at all: it renders whatever the
 * networks list says it has.
 */
import { BASE_API } from "../config";

export interface Camera {
  id: string;
  /** Network id, matching NETWORK_META below. */
  net: string;
  name: string;
  lat: number;
  lon: number;
  /** Still image. Cache-busted on refresh by the caller. Absent on
   *  video-only networks such as 511NY, where `stream` is the only source. */
  img?: string;
  /** HLS playlist, where the network publishes one. */
  stream?: string;
  road?: string;
  place?: string;
  dir?: string;
}

export interface CameraNetwork {
  id: string; label: string; region: string; count: number;
}

export interface CameraResult {
  cameras: Camera[];
  /** How many came back after thinning. */
  shown: number;
  /** How many were inside the box before thinning. */
  matched: number;
  /** Every camera we know about, everywhere. */
  total: number;
  networks: CameraNetwork[];
  fetched_at: string;
}

export const NETWORK_META: Record<string, { label: string; color: string; kind: string }> = {
  caltrans: { label: "Caltrans", color: "#e8bb4d", kind: "Highway" },
  alertca: { label: "ALERTCalifornia", color: "#ff8a3d", kind: "Wildfire watch" },
  midrive: { label: "MDOT MiDrive", color: "#89cff0", kind: "Highway" },
  ny511: { label: "511NY", color: "#7fd6a0", kind: "Highway · live video" },
  ohgo: { label: "OHGO", color: "#d98cf0", kind: "Highway" },
  drivebc: { label: "DriveBC", color: "#5fd9a8", kind: "Highway" },
};

export function netColor(net: string): string {
  return NETWORK_META[net]?.color ?? "#a3a3cc";
}

/**
 * Cameras inside a bounding box.
 *
 * The box is how this stays fast: asking for the world returns a slice, asking
 * for a county returns the county. When more cameras match than the limit
 * allows, the server thins them evenly across the box rather than returning the
 * first N, so the map does not end up with every pin in one corner.
 */
export async function fetchCameras(opts: {
  bbox?: [number, number, number, number];
  nets?: string[];
  limit?: number;
} = {}): Promise<CameraResult> {
  const p = new URLSearchParams();
  if (opts.bbox) p.set("bbox", opts.bbox.join(","));
  if (opts.nets?.length) p.set("net", opts.nets.join(","));
  p.set("limit", String(opts.limit ?? 400));
  const r = await fetch(`${BASE_API}/cameras?${p}`);
  if (!r.ok) throw new Error(`Camera list returned ${r.status}`);
  return await r.json() as CameraResult;
}

/** Rough miles between two points. Good enough for sorting a nearby list. */
export function milesBetween(
  a: { lat: number; lon: number }, b: { lat: number; lon: number },
): number {
  const dy = (a.lat - b.lat) * 69;
  const dx = (a.lon - b.lon) * 69 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dx, dy);
}

/**
 * A box around a point, in degrees.
 *
 * Longitude degrees shrink with latitude, so a naive square box is much wider
 * in miles at the bottom of the country than at the top. Correcting for that
 * keeps "within 50 miles" meaning the same thing in San Diego and Fairbanks.
 */
export function boxAround(lat: number, lon: number, miles: number): [number, number, number, number] {
  const dLat = miles / 69;
  const dLon = miles / (69 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

/**
 * A cache-busted image url.
 *
 * Camera stills sit behind aggressive CDN caching, and several of these
 * networks already carry their own `?t=` stamp. Appending our own parameter is
 * the only reliable way to force a genuinely current frame when someone presses
 * refresh, and it costs nothing when they do not.
 */
export function frameUrl(cam: Camera, nonce: number): string {
  // Video-only networks have no still to bust the cache on.
  if (!cam.img) return "";
  if (!nonce) return cam.img;
  return cam.img + (cam.img.includes("?") ? "&" : "?") + `sswx=${nonce}`;
}

export const RADIUS_CHOICES = [25, 50, 100, 250] as const;
export type Radius = (typeof RADIUS_CHOICES)[number];
