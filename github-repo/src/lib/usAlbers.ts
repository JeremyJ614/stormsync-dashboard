// Shared Albers-USA projection + pre-projected state outlines.
//
// The state paths in `usStatesAlbers.json` are d3-geo `geoAlbersUsa()` output at
// `.scale(1300).translate([487.5, 305])` in a 975x610 viewBox — the us-atlas
// standard. `project()` below is that same projection, implemented exactly, so
// anything drawn through it lands on the state map it is drawn over.
//
// WHAT THIS REPLACED, AND WHY IT MATTERED
// The previous version fitted a six-parameter AFFINE transform to nine
// hand-recorded city pixel positions. Albers is a conic projection: it curves,
// and no affine can represent it, so the fit carried error that grew towards the
// edges of the country. Worse, the nine reference positions had been read off a
// differently-scaled rendering — checked against the state outlines actually
// shipping, Los Angeles was out by 120 px and Seattle by 80.
//
// The result was every SPC outlook, probability field and chase scan drawn in a
// slightly different projection from the map underneath it. At the Canadian
// border the two disagreed by about 38 px — roughly 120 miles — which is why
// risk areas over North Dakota did not sit inside North Dakota.
//
// Verified against all 51 pre-projected state paths: bounding boxes agree to
// 0.1 px, Hawaii's inset included.
import usStatesAlbers from "../data/usStatesAlbers.json";
import usNationAlbers from "../data/usNationAlbers.json";

export const US_STATES = (usStatesAlbers as { states: { name: string; d: string }[] }).states;
/** The national outline, same projection. Used to mask overlays to the country. */
export const US_NATION_PATH = (usNationAlbers as { nation: string }).nation;
export const MAP_W = 975;
export const MAP_H = 610;

/** The scale and translate the shipped state paths were generated at. */
const K = 1300;
const TX = 487.5;
const TY = 305;
const RAD = Math.PI / 180;

/**
 * One conic equal-area lobe of the composite, as d3 defines it.
 *
 * `rotLon` is d3's `.rotate([rotLon, 0])`; `centerLon`/`centerLat` are its
 * `.center([...])`, which d3 interprets in the rotated frame — hence the
 * `-rotLon + centerLon` when locating it.
 */
function conic(p0deg: number, p1deg: number, rotLon: number, centerLon: number, centerLat: number) {
  const p0 = p0deg * RAD, p1 = p1deg * RAD;
  const n = (Math.sin(p0) + Math.sin(p1)) / 2;
  const c = 1 + Math.sin(p0) * (2 * n - Math.sin(p0));
  const r0 = Math.sqrt(c) / n;

  const raw = (lon: number, lat: number): [number, number] => {
    const x = (lon + rotLon) * RAD * n;
    const r = Math.sqrt(c - 2 * n * Math.sin(lat * RAD)) / n;
    return [r * Math.sin(x), r0 - r * Math.cos(x)];
  };
  const [cx, cy] = raw(-rotLon + centerLon, centerLat);

  return {
    forward(lon: number, lat: number, k: number, tx: number, ty: number): [number, number] {
      const [X, Y] = raw(lon, lat);
      return [tx + k * (X - cx), ty - k * (Y - cy)];
    },
    inverse(sx: number, sy: number, k: number, tx: number, ty: number): { lon: number; lat: number } {
      const X = (sx - tx) / k + cx;
      const Y = cy - (sy - ty) / k;
      const r0y = r0 - Y;
      const lonRot = (Math.atan2(X, Math.abs(r0y)) / n) * Math.sign(r0y || 1);
      const lat = Math.asin((c - (X * X + r0y * r0y) * n * n) / (2 * n));
      return { lon: lonRot / RAD - rotLon, lat: lat / RAD };
    },
  };
}

// d3's three lobes, verbatim.
const LOWER48 = conic(29.5, 45.5, 96, -0.6, 38.7);
const ALASKA = conic(55, 65, 154, -2.0, 58.5);
const HAWAII = conic(8, 18, 157, -3.0, 19.9);
const EPS = 1e-6;

/**
 * Where each lobe lives on the canvas, and the box that decides which lobe owns
 * a point. These fractions of the scale are d3's own, and getting them right is
 * what puts Alaska and Hawaii in their insets rather than in the Pacific.
 */
const LOBES = [
  { p: LOWER48, k: K, tx: TX, ty: TY,
    x0: TX - 0.455 * K, x1: TX + 0.455 * K, y0: TY - 0.238 * K, y1: TY + 0.238 * K },
  { p: ALASKA, k: K * 0.35, tx: TX - 0.307 * K, ty: TY + 0.201 * K,
    x0: TX - 0.425 * K + EPS, x1: TX - 0.214 * K - EPS, y0: TY + 0.120 * K + EPS, y1: TY + 0.234 * K - EPS },
  { p: HAWAII, k: K, tx: TX - 0.205 * K, ty: TY + 0.212 * K,
    x0: TX - 0.214 * K + EPS, x1: TX - 0.115 * K - EPS, y0: TY + 0.166 * K + EPS, y1: TY + 0.234 * K - EPS },
] as const;

/**
 * lon/lat → the 975x610 canvas.
 *
 * Tries the lower 48 first, then the Alaska and Hawaii insets, exactly as d3
 * does: a point belongs to the first lobe whose clip box it lands inside.
 * Anything outside all three — mid-Pacific, deep into Canada — still returns the
 * lower-48 position rather than null, because every caller here draws polygons
 * that may legitimately run off the edge of the country, and a hole in a ring is
 * worse than a vertex past the border.
 */
export function project(lon: number, lat: number): { x: number; y: number } {
  for (const l of LOBES) {
    const [x, y] = l.p.forward(lon, lat, l.k, l.tx, l.ty);
    if (x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1) return { x, y };
  }
  const [x, y] = LOWER48.forward(lon, lat, K, TX, TY);
  return { x, y };
}

/**
 * Which lobe of the composite owns a point: 0 lower 48, 1 Alaska, 2 Hawaii.
 *
 * Exposed so a caller drawing a *polygon* can decide the lobe once for the whole
 * ring and then hold it. `project` decides per point, which is right for a dot
 * and wrong for a ring: a coastline in the Aleutians has vertices that fall
 * inside the Alaska inset box and vertices that do not, and projecting them
 * independently sends half the ring to the inset and half to a point two
 * thousand pixels above the map.
 */
export function lobeOf(lon: number, lat: number): number {
  for (let i = 0; i < LOBES.length; i++) {
    const l = LOBES[i];
    const [x, y] = l.p.forward(lon, lat, l.k, l.tx, l.ty);
    if (x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1) return i;
  }
  return 0;
}

/** Project forcing a particular lobe. See `lobeOf`. */
export function projectIn(lobe: number, lon: number, lat: number): { x: number; y: number } {
  const l = LOBES[lobe] ?? LOBES[0];
  const [x, y] = l.p.forward(lon, lat, l.k, l.tx, l.ty);
  return { x, y };
}

/**
 * Canvas → lon/lat.
 *
 * The inset boxes are tested FIRST and the lower 48 is the fallback — the
 * reverse of `project`. That is not a stylistic choice: the lower-48 clip box
 * spans the whole canvas, so both insets sit inside it, and checking it first
 * would resolve every click on Hawaii to a point in the Pacific off Baja.
 * (d3's own `albersUsa.invert` orders it the same way, for the same reason.)
 */
export function unproject(x: number, y: number): { lat: number; lon: number } {
  for (const l of [LOBES[1], LOBES[2]]) {
    if (x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1) {
      return l.p.inverse(x, y, l.k, l.tx, l.ty);
    }
  }
  return LOWER48.inverse(x, y, K, TX, TY);
}

// State name → 2-letter abbreviation, for on-map labels.
const STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY",
  Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA",
  Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "Puerto Rico": "PR",
};

// Area-weighted-ish centroid of an SVG path (average of its vertices, largest ring wins),
// used to place a small state abbreviation label. Computed once from the projected paths.
function pathCentroid(d: string): { x: number; y: number } {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i + 1 < nums.length; i += 2) { sx += nums[i]; sy += nums[i + 1]; n++; }
  return n ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}

export interface StateLabel { abbr: string; x: number; y: number }
export const US_STATE_LABELS: StateLabel[] = US_STATES
  .map((s) => { const abbr = STATE_ABBR[s.name]; if (!abbr) return null; const c = pathCentroid(s.d); return { abbr, x: c.x, y: c.y }; })
  .filter((l): l is StateLabel => l !== null);
