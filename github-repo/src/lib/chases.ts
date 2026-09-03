/**
 * StormSync Chases.
 *
 * A chase is where the car went, where the tornado went, and whatever numbers
 * are worth putting next to it. Routes are stored already snapped to roads —
 * the snapping happens once, when an admin saves, so viewing the map never
 * calls a routing service and never costs anything however many people open it.
 *
 * The per-chase statistics are free-form on purpose. One chase is remembered
 * for the mileage, another for how long the tornado was down, another for the
 * hail; a fixed set of columns would be wrong for most of them.
 */
import { supabase, isSupabaseConfigured } from "./supabase";
import { logger } from "./logger";

export type LngLat = [number, number];

export interface TornadoPath {
  coords: LngLat[];
  /** EF rating, or null while it is still unrated. */
  ef: number | null;
  widthYd?: number | null;
  lengthMi?: number | null;
  label?: string;
}

export interface ChaseStat { label: string; value: string }
export interface ChaseMedia { url: string; caption?: string; kind?: "image" | "video" }

export interface Chase {
  id: string;
  title: string;
  chaseDate: string;
  summary: string | null;
  route: LngLat[];
  routeMiles: number | null;
  routeSnapped: boolean;
  tornadoPaths: TornadoPath[];
  stats: ChaseStat[];
  coverUrl: string | null;
  media: ChaseMedia[];
  published: boolean;
  sortOrder: number;
}

export interface ChaseInput {
  title: string;
  chaseDate: string;
  summary?: string | null;
  route: LngLat[];
  routeMiles?: number | null;
  routeSnapped?: boolean;
  tornadoPaths: TornadoPath[];
  stats: ChaseStat[];
  coverUrl?: string | null;
  media?: ChaseMedia[];
  published: boolean;
  sortOrder?: number;
}

/** The EF scale, as the map draws it. */
export const EF_COLOR: Record<number, string> = {
  0: "#67e8f9", 1: "#4ade80", 2: "#fbbf24", 3: "#fb923c", 4: "#f87171", 5: "#e879f9",
};
export const efColor = (ef: number | null | undefined): string =>
  ef == null ? "#a3a3cc" : EF_COLOR[ef] ?? "#a3a3cc";

function toChase(r: Record<string, unknown>): Chase {
  return {
    id: String(r.id),
    title: String(r.title ?? "Untitled chase"),
    chaseDate: String(r.chase_date),
    summary: (r.summary as string | null) ?? null,
    route: (r.route as LngLat[]) ?? [],
    routeMiles: r.route_miles == null ? null : Number(r.route_miles),
    routeSnapped: r.route_snapped === true,
    tornadoPaths: (r.tornado_paths as TornadoPath[]) ?? [],
    stats: (r.stats as ChaseStat[]) ?? [],
    coverUrl: (r.cover_url as string | null) ?? null,
    media: (r.media as ChaseMedia[]) ?? [],
    published: r.published === true,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

/** Published chases, newest first. Admins also see unpublished ones. */
export async function listChases(): Promise<Chase[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from("chases")
    .select("*")
    .order("chase_date", { ascending: false });
  if (error) { logger.error("listChases failed", { scope: "chases", error }); return []; }
  return ((data ?? []) as Record<string, unknown>[]).map(toChase);
}

function toRow(input: ChaseInput) {
  return {
    title: input.title.trim(),
    chase_date: input.chaseDate,
    summary: input.summary?.trim() || null,
    route: input.route,
    route_miles: input.routeMiles ?? null,
    route_snapped: input.routeSnapped ?? false,
    tornado_paths: input.tornadoPaths,
    stats: input.stats.filter((s) => s.label.trim() || s.value.trim()),
    cover_url: input.coverUrl?.trim() || null,
    media: input.media ?? [],
    published: input.published,
    sort_order: input.sortOrder ?? 0,
  };
}

export async function createChase(input: ChaseInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.from("chases").insert(toRow(input)).select("id").single();
  if (error) { logger.error("createChase failed", { scope: "chases", error }); return { ok: false, error: error.message }; }
  return { ok: true, id: String(data.id) };
}

export async function updateChase(id: string, input: ChaseInput): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("chases").update(toRow(input)).eq("id", id);
  if (error) { logger.error("updateChase failed", { scope: "chases", error }); return { ok: false, error: error.message }; }
  return { ok: true };
}

export async function deleteChase(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("chases").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Wipe a season, or the whole log.
 *
 * Chasing is an annual thing and the log is meant to be started fresh, so
 * clearing it is a first-class action rather than thirty presses of the bin
 * icon. `year` scopes it to one season; null means everything. Returns how many
 * rows actually went, because "are you sure" is only meaningful if what comes
 * back matches what you were told you were deleting.
 */
export async function deleteChases(year: number | null): Promise<{ ok: boolean; count?: number; error?: string }> {
  // PostgREST refuses an unfiltered DELETE, by design.
  let q = supabase.from("chases").delete().not("id", "is", null);
  if (year != null) q = q.gte("chase_date", `${year}-01-01`).lte("chase_date", `${year}-12-31`);
  const { data, error } = await q.select("id");
  if (error) { logger.error("deleteChases failed", { scope: "chases", error }); return { ok: false, error: error.message }; }
  return { ok: true, count: data?.length ?? 0 };
}

/**
 * Turn drawn waypoints into the road that was actually driven.
 *
 * Falls back to the drawn line rather than failing, and says which it got, so a
 * routing outage costs an admin their snapping and not their work.
 */
export async function snapRoute(points: LngLat[]): Promise<{ coords: LngLat[]; miles: number; snapped: boolean }> {
  if (points.length < 2) return { coords: points, miles: 0, snapped: false };

  // Snapping is a convenience, so it gets a deadline. The routing service is a
  // free public one and the function that calls it can sit waiting on a socket
  // that never answers; without this the Snap button spins for as long as the
  // admin is willing to watch it. Falling back to the drawn line is already the
  // designed outcome for a routing outage — a hang is just a slower outage.
  const SNAP_TIMEOUT_MS = 20_000;
  const fallback = { coords: points, miles: haversineMiles(points), snapped: false };

  let data: { ok?: boolean; coords?: LngLat[]; miles?: number; snapped?: boolean } | null = null;
  try {
    data = await Promise.race([
      supabase.functions
        .invoke("snap-route", { body: { points } })
        .then((r) => (r.error ? Promise.reject(r.error) : r.data)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("snap-route timed out")), SNAP_TIMEOUT_MS)),
    ]);
  } catch (error) {
    logger.error("snapRoute failed", { scope: "chases", error });
    return fallback;
  }
  if (!data?.ok) {
    logger.error("snapRoute returned no result", { scope: "chases" });
    return fallback;
  }
  return {
    coords: (data.coords ?? points) as LngLat[],
    miles: Number(data.miles ?? 0),
    snapped: data.snapped === true,
  };
}

// ─── places ──────────────────────────────────────────────────────────────────

export interface Place { label: string; lon: number; lat: number }

/**
 * Turn a place name into a point, or a point into a place name.
 *
 * Both directions go through `snap-route`, which is admin-only and sets the
 * identifying User-Agent that Nominatim's usage policy asks for — a browser
 * cannot set that header, and a public geocoder called directly from every
 * editor session is exactly what the policy is about.
 *
 * A failure returns an empty list rather than throwing. Geocoding is an
 * assistant for placing a waypoint; the admin can always click the map instead,
 * and losing their drawing to a lookup failure would be absurd.
 */
export async function findPlaces(query: string): Promise<Place[]> {
  if (query.trim().length < 2) return [];
  try {
    const { data, error } = await supabase.functions.invoke("snap-route", {
      body: { mode: "geocode", query: query.trim() },
    });
    if (error || !data?.ok) return [];
    return (data.places ?? []) as Place[];
  } catch (error) {
    logger.error("findPlaces failed", { scope: "chases", error });
    return [];
  }
}

/** What is at this point, in words. Used to name a waypoint the admin clicked. */
export async function describePoint(p: LngLat): Promise<Place | null> {
  try {
    const { data, error } = await supabase.functions.invoke("snap-route", {
      body: { mode: "geocode", at: p },
    });
    if (error || !data?.ok) return null;
    return ((data.places ?? []) as Place[])[0] ?? null;
  } catch (error) {
    logger.error("describePoint failed", { scope: "chases", error });
    return null;
  }
}

/** Great-circle length of a line, in miles. */
export function haversineMiles(coords: LngLat[]): number {
  const R = 3958.7613;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lo1, la1] = coords[i - 1], [lo2, la2] = coords[i];
    const p1 = (la1 * Math.PI) / 180, p2 = (la2 * Math.PI) / 180;
    const dp = p2 - p1, dl = ((lo2 - lo1) * Math.PI) / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    total += 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  return Number(total.toFixed(1));
}

/** Bounding box of everything drawn for a set of chases, for fitBounds. */
export function chaseBounds(chases: Chase[]): [[number, number], [number, number]] | null {
  let w = 180, e = -180, s = 90, n = -90, seen = false;
  const take = (c: LngLat[]) => {
    for (const [lo, la] of c) {
      seen = true;
      if (lo < w) w = lo; if (lo > e) e = lo;
      if (la < s) s = la; if (la > n) n = la;
    }
  };
  for (const c of chases) {
    take(c.route);
    for (const t of c.tornadoPaths) take(t.coords);
  }
  return seen ? [[w, s], [e, n]] : null;
}

/** The headline numbers across a season, for the page header. */
export function chaseSeasonTotals(chases: Chase[]) {
  const miles = chases.reduce((t, c) => t + (c.routeMiles ?? 0), 0);
  const tornadoes = chases.reduce((t, c) => t + c.tornadoPaths.length, 0);
  const rated = chases.flatMap((c) => c.tornadoPaths.map((t) => t.ef)).filter((e): e is number => e != null);
  return {
    chases: chases.length,
    miles: Math.round(miles),
    tornadoes,
    strongest: rated.length ? Math.max(...rated) : null,
  };
}
