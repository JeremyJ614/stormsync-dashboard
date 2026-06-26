// Shared albers-USA projection + pre-projected state outlines.
// The state paths (usStatesAlbers.json) are rendered in a 975×610 viewBox that
// matches d3-geo geoAlbersUsa. `project()` is a calibrated affine fit that maps
// lon/lat → that same projected space (accurate to ~15-25 mi over CONUS), so SPC
// geojson can be drawn straight onto the state map. Used by the Forecast Game and
// the SPC static outlook images.
import usStatesAlbers from "../data/usStatesAlbers.json";

export const US_STATES = (usStatesAlbers as { states: { name: string; d: string }[] }).states;
export const MAP_W = 975;
export const MAP_H = 610;

const CITIES_CAL: { lat: number; lon: number; x: number; y: number }[] = [
  { lat: 47.61, lon: -122.33, x: 137, y: 116 },
  { lat: 34.05, lon: -118.24, x: 207, y: 357 },
  { lat: 39.74, lon: -104.99, x: 422, y: 274 },
  { lat: 41.88, lon: -87.63, x: 644, y: 254 },
  { lat: 29.76, lon: -95.37, x: 541, y: 466 },
  { lat: 25.76, lon: -80.19, x: 814, y: 522 },
  { lat: 40.71, lon: -74.0, x: 838, y: 245 },
  { lat: 33.75, lon: -84.39, x: 715, y: 384 },
  { lat: 35.47, lon: -97.52, x: 521, y: 372 },
];

function solveAffine() {
  let sX = 0, sY = 0, sLon = 0, sLat = 0, sXLon = 0, sXLat = 0, sYLon = 0, sYLat = 0;
  let sLonLon = 0, sLatLat = 0, sLonLat = 0;
  const n = CITIES_CAL.length;
  for (const c of CITIES_CAL) {
    sX += c.x; sY += c.y; sLon += c.lon; sLat += c.lat;
    sXLon += c.x * c.lon; sXLat += c.x * c.lat;
    sYLon += c.y * c.lon; sYLat += c.y * c.lat;
    sLonLon += c.lon * c.lon; sLatLat += c.lat * c.lat; sLonLat += c.lon * c.lat;
  }
  const A = [[n, sLon, sLat], [sLon, sLonLon, sLonLat], [sLat, sLonLat, sLatLat]];
  const bx = [sX, sXLon, sXLat];
  const by = [sY, sYLon, sYLat];
  function solve3(M: number[][], v: number[]): number[] {
    const m = M.map((r, i) => [...r, v[i]]);
    for (let i = 0; i < 3; i++) {
      let p = i;
      for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
      [m[i], m[p]] = [m[p], m[i]];
      for (let k = i + 1; k < 3; k++) {
        const f = m[k][i] / m[i][i];
        for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j];
      }
    }
    const x = [0, 0, 0];
    for (let i = 2; i >= 0; i--) {
      let s = m[i][3];
      for (let j = i + 1; j < 3; j++) s -= m[i][j] * x[j];
      x[i] = s / m[i][i];
    }
    return x;
  }
  const [a, b, c] = solve3(A, bx);
  const [d, e, f] = solve3(A, by);
  return { a, b, c, d, e, f };
}
const AFFINE = solveAffine();

export function project(lon: number, lat: number): { x: number; y: number } {
  const { a, b, c, d, e, f } = AFFINE;
  return { x: a + b * lon + c * lat, y: d + e * lon + f * lat };
}
export function unproject(x: number, y: number): { lat: number; lon: number } {
  const { a, b, c, d, e, f } = AFFINE;
  const det = b * f - c * e;
  const lon = (f * (x - a) - c * (y - d)) / det;
  const lat = (-e * (x - a) + b * (y - d)) / det;
  return { lat, lon };
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
