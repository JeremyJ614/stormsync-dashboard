/**
 * Where a place sits inside a rendered model map.
 *
 * The frames are Lambert Conformal (central meridian -97.5°, standard parallel
 * 38.5°) drawn to a fixed extent. Because every frame is rendered by the same
 * code with the same geometry, one calibration holds for all of them — which is
 * what lets the viewer zoom to a region client-side instead of re-rendering a
 * map per region and multiplying what we store.
 *
 * TWO PLATES, AND WHY
 * The renderer used to lay the axes out normally inside a 12.8×7.6 figure. A
 * GeoAxes holds its data aspect, so the plate sat letterboxed: about 880×550 of
 * map inside 1280×760, with a title band above, a colour bar below, and 45% of
 * every frame spent on black margin. That is most of why these looked soft, and
 * it compounded on the regional presets, which crop a box out of that already
 * small map and blow it back up to full width.
 *
 * The renderer now pins the axes to the whole figure, sizes the figure to the
 * extent's own aspect, and sets an auto aspect so matplotlib cannot letterbox it
 * back. The image bounds ARE the projected extent, so there is nothing left to
 * measure — a region rect is pure projection arithmetic — and a region crops
 * from roughly 2.4× the resolution it had, over the same bytes.
 *
 * Frames already in storage are the old shape, and they stay valid until
 * retention rolls them off. The two are told apart by the only thing that
 * reliably differs and travels with the image: its aspect ratio. Nothing has to
 * be versioned, migrated, or remembered.
 *
 * MODERN.extent must stay in step with `EXTENT` in scripts/render_maps.py. It is
 * the one number the two sides share.
 */

const LON0 = -97.5;
const LAT0 = 38.5;
const SP = 38.5;          // single standard parallel — the projection is tangent

export interface Rect { left: number; top: number; width: number; height: number }

interface Extent { west: number; east: number; south: number; north: number }

export interface Plate {
  extent: Extent;
  /** Where the projected extent sits inside the image, as fractions. */
  rect: Rect;
  /** What CONUS should show — the drawn map, trimmed of any bands. */
  view: Rect;
  /** Width ÷ height of the image itself. */
  imageAspect: number;
}

const MODERN: Plate = {
  extent: { west: -122.5, east: -71.5, south: 22.5, north: 50.5 },
  rect: { left: 0, top: 0, width: 1, height: 1 },
  view: { left: 0, top: 0, width: 1, height: 1 },
  imageAspect: 0,   // filled in below, from the extent itself
};

/**
 * The old plate, with the constants that were measured against a real frame and
 * checked by plotting known cities onto it — Seattle, Denver, OKC, Chicago,
 * NYC, Houston and Miami all landed on themselves.
 */
const LEGACY: Plate = {
  extent: { west: -121, east: -73, south: 22.5, north: 50.5 },
  rect: { left: 249 / 1280, top: 76 / 760, width: 831 / 1280, height: 555 / 760 },
  view: { left: 236 / 1280, top: 72 / 760, width: (1086 - 236) / 1280, height: (670 - 72) / 760 },
  imageAspect: 1280 / 760,
};

const rad = (d: number) => (d * Math.PI) / 180;

/** Forward Lambert Conformal Conic on the unit sphere. */
function project(lat: number, lon: number): [number, number] {
  const p0 = rad(SP);
  const n = Math.sin(p0);
  const F = (Math.cos(p0) * Math.tan(Math.PI / 4 + p0 / 2) ** n) / n;
  const rho = (p: number) => F / Math.tan(Math.PI / 4 + rad(p) / 2) ** n;
  const r = rho(lat);
  const r0 = rho(LAT0);
  const theta = n * rad(lon - LON0);
  return [r * Math.sin(theta), r0 - r * Math.cos(theta)];
}

/** Projected bounding box of a lat/lon box, sampled around its boundary. */
function projectedBox(west: number, east: number, south: number, north: number) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const pts: [number, number][] = [
      [south, west + (east - west) * t],
      [north, west + (east - west) * t],
      [south + (north - south) * t, west],
      [south + (north - south) * t, east],
    ];
    for (const [la, lo] of pts) {
      const [x, y] = project(la, lo);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { x0, x1, y0, y1 };
}

const fullOf = (e: Extent) => projectedBox(e.west, e.east, e.south, e.north);
const MODERN_FULL = fullOf(MODERN.extent);
const LEGACY_FULL = fullOf(LEGACY.extent);

// The renderer derives the figure's shape from this same extent, so the two
// cannot disagree even if the extent is changed later.
MODERN.imageAspect = (MODERN_FULL.x1 - MODERN_FULL.x0) / (MODERN_FULL.y1 - MODERN_FULL.y0);

/**
 * Which plate a frame is, from its own pixels.
 *
 * The two shapes are 1.68 and about 1.42, so the midpoint separates them with
 * room to spare. A frame of unknown size is treated as modern, because that is
 * what everything rendered from here on will be.
 */
export function plateFor(width?: number, height?: number): Plate {
  if (!width || !height) return MODERN;
  const a = width / height;
  return Math.abs(a - LEGACY.imageAspect) < Math.abs(a - MODERN.imageAspect) ? LEGACY : MODERN;
}

/** A lat/lon box as a rect in fractions of the whole PNG. */
export function regionRect(r: RegionBox, plate: Plate = MODERN): Rect {
  const full = plate === LEGACY ? LEGACY_FULL : MODERN_FULL;
  const b = projectedBox(r.west, r.east, r.south, r.north);
  const u0 = (b.x0 - full.x0) / (full.x1 - full.x0);
  const u1 = (b.x1 - full.x0) / (full.x1 - full.x0);
  // Screen v runs the opposite way to projected y.
  const v0 = 1 - (b.y1 - full.y0) / (full.y1 - full.y0);
  const v1 = 1 - (b.y0 - full.y0) / (full.y1 - full.y0);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const left = clamp(plate.rect.left + u0 * plate.rect.width);
  const top = clamp(plate.rect.top + v0 * plate.rect.height);
  return {
    left,
    top,
    width: Math.min(1 - left, (u1 - u0) * plate.rect.width),
    height: Math.min(1 - top, (v1 - v0) * plate.rect.height),
  };
}

/** The source rect a region should be drawn from, in fractions of the PNG. */
export function regionSourceRect(regionId: string, plate: Plate = MODERN): Rect {
  if (regionId === "conus") return { ...plate.view };
  const region = REGIONS.find((r) => r.id === regionId);
  return region ? regionRect(region, plate) : { ...plate.view };
}

/** Width ÷ height of a region as it will be drawn, for the container's aspect. */
export function regionAspect(regionId: string, plate: Plate = MODERN): number {
  const r = regionSourceRect(regionId, plate);
  return (r.width * plate.imageAspect) / r.height;
}

export interface RegionBox {
  id: string; label: string;
  west: number; east: number; south: number; north: number;
}
export const REGIONS: RegionBox[] = [
  { id: "conus",     label: "CONUS",     west: -121, east: -73,   south: 22.5, north: 50.5 },
  { id: "northwest", label: "Northwest", west: -125, east: -108,  south: 39,   north: 50 },
  { id: "southwest", label: "Southwest", west: -125, east: -105,  south: 30,   north: 43 },
  { id: "nplains",   label: "N. Plains", west: -107, east: -89,   south: 39,   north: 49.5 },
  { id: "splains",   label: "S. Plains", west: -107, east: -89,   south: 27,   north: 40 },
  { id: "midwest",   label: "Midwest",   west: -97,  east: -80,   south: 36,   north: 49 },
  { id: "northeast", label: "Northeast", west: -83,  east: -66,   south: 37,   north: 47.5 },
  { id: "southeast", label: "Southeast", west: -95,  east: -75,   south: 24,   north: 37.5 },
];

/**
 * A CSS transform that brings a region to fill a container.
 *
 * Kept for callers that scale an `<img>` rather than blitting onto a canvas.
 */
export function regionTransform(regionId: string, containerAspect: number, plate: Plate = MODERN) {
  const region = REGIONS.find((r) => r.id === regionId) ?? REGIONS[0];
  if (region.id === "conus") return { scale: 1, x: 0, y: 0 };
  const rect = regionRect(region, plate);
  const scale = Math.min(1 / rect.width, (1 / rect.height) * (containerAspect / plate.imageAspect));
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return { scale, x: (0.5 / scale - cx) * 100, y: (0.5 / scale - cy) * 100 };
}
