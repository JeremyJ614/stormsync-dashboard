/**
 * Where a place sits inside a rendered model map.
 *
 * The frames are Lambert Conformal (central meridian -97.5°, standard parallel
 * 38.5°) drawn to a fixed extent, letterboxed inside a 1280×760 figure with a
 * title band above and a colour bar below. Because every frame is rendered by
 * the same code with the same figure geometry, one calibration holds for all of
 * them — which is what lets the viewer zoom to a region client-side instead of
 * re-rendering a map per region and multiplying what we store.
 *
 * The constants below were measured against a real frame and checked by
 * plotting known cities onto it: Seattle, Denver, OKC, Chicago, NYC, Houston
 * and Miami all land on themselves.
 */

const LON0 = -97.5;
const LAT0 = 38.5;
const SP = 38.5;          // single standard parallel — the projection is tangent
const EXTENT = { west: -121, east: -73, south: 22.5, north: 50.5 };

/** Map rect as a fraction of the rendered PNG (1280×760). */
export const MAP_RECT = {
  left: 249 / 1280,
  top: 76 / 760,
  width: 831 / 1280,
  height: 555 / 760,
} as const;

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

const FULL = projectedBox(EXTENT.west, EXTENT.east, EXTENT.south, EXTENT.north);

/** A lat/lon box as a rect in fractions of the whole PNG. */
export function regionRect(r: RegionBox) {
  const b = projectedBox(r.west, r.east, r.south, r.north);
  const u0 = (b.x0 - FULL.x0) / (FULL.x1 - FULL.x0);
  const u1 = (b.x1 - FULL.x0) / (FULL.x1 - FULL.x0);
  // Screen v runs the opposite way to projected y.
  const v0 = 1 - (b.y1 - FULL.y0) / (FULL.y1 - FULL.y0);
  const v1 = 1 - (b.y0 - FULL.y0) / (FULL.y1 - FULL.y0);
  return {
    left: MAP_RECT.left + u0 * MAP_RECT.width,
    top: MAP_RECT.top + v0 * MAP_RECT.height,
    width: (u1 - u0) * MAP_RECT.width,
    height: (v1 - v0) * MAP_RECT.height,
  };
}

export interface RegionBox {
  id: string; label: string;
  west: number; east: number; south: number; north: number;
}

/**
 * Region presets. Boxes are drawn a little generously so a system sitting on a
 * region's edge is still visible rather than clipped at the frame edge.
 */
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
 * CSS transform that frames `region` inside a container of the given aspect.
 * Returns a scale plus a translate in percent of the image's own size, for use
 * with `transform-origin: 0 0`.
 */
export function regionTransform(regionId: string, containerAspect: number) {
  const region = REGIONS.find((r) => r.id === regionId) ?? REGIONS[0];
  if (region.id === "conus") {
    // Show the whole plate, title and colour bar included.
    return { scale: 1, x: 0, y: 0 };
  }
  const rect = regionRect(region);
  // The image is laid out at width 100%; its rendered aspect is 1280/760.
  const imgAspect = 1280 / 760;
  // Scale so the region fills whichever axis binds first.
  const scale = Math.min(1 / rect.width, (1 / rect.height) * (containerAspect / imgAspect));
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return {
    scale,
    x: (0.5 / scale - cx) * 100,
    y: (0.5 / scale - cy) * 100,
  };
}
