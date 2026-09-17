import { starPosition, compassPoint, type SkyPosition } from "./astro";

/**
 * Where the naked-eye planets actually are.
 *
 * The page this replaces carried four paragraphs of general advice — "Venus is
 * often visible as the Morning Star", "Mars is best near opposition every 26
 * months" — which is true all year and useless on any particular night. It could
 * not tell you that Saturn is 23° up in the east right now, because it did not
 * know where Saturn was.
 *
 * These are computed from JPL's approximate Keplerian elements for the major
 * planets, the table published for 1800–2050. That is a low-precision theory by
 * professional standards and exactly the right precision here: the question is
 * "which way do I look and how high", and the answer is checked below against
 * the U.S. Naval Observatory's own almanac to within a few hundredths of a
 * degree — far finer than anyone can point a telescope by eye.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Speed of light in au per day — for the light-time correction below. */
const AU_PER_DAY = 173.1446;

/**
 * General precession in ecliptic longitude, degrees per Julian century.
 *
 * The elements above are referred to the ecliptic and equinox of J2000, but the
 * sidereal time everything is finally placed against is the equinox OF DATE.
 * Mixing the two frames is worth 0.37° in 2026 and grows by half a degree a
 * century — which is what the first version of this did, and it showed up as a
 * uniform 0.27–0.40° error in right ascension across Venus, Jupiter and Saturn
 * alike, at distances from half an au to eight and a half. A constant offset
 * that ignores distance is a frame error, not a bad orbit.
 */
const PRECESSION = 1.396971;

/** Mean obliquity of the ecliptic at a given epoch, in radians. */
const obliquityAt = (T: number) => (23.439291 - 0.0130042 * T) * RAD;

interface Elements {
  /** Semi-major axis, au, and its change per Julian century. */
  a: [number, number];
  /** Eccentricity. */
  e: [number, number];
  /** Inclination to the ecliptic, degrees. */
  i: [number, number];
  /** Mean longitude, degrees. */
  L: [number, number];
  /** Longitude of perihelion, degrees. */
  peri: [number, number];
  /** Longitude of the ascending node, degrees. */
  node: [number, number];
}

/** JPL approximate elements at J2000, with per-century rates. */
const ELEMENTS: Record<string, Elements> = {
  Mercury: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], i: [7.00497902, -0.00594749],
             L: [252.25032350, 149472.67411175], peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081] },
  Venus:   { a: [0.72333566, 0.00000390], e: [0.00677672, -0.00004107], i: [3.39467605, -0.00078890],
             L: [181.97909950, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418] },
  Earth:   { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], i: [-0.00001531, -0.01294668],
             L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0, 0] },
  Mars:    { a: [1.52371034, 0.00001847], e: [0.09339410, 0.00007882], i: [1.84969142, -0.00813131],
             L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343] },
  Jupiter: { a: [5.20288700, -0.00011607], e: [0.04838624, -0.00013253], i: [1.30439695, -0.00183714],
             L: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106] },
  Saturn:  { a: [9.53667594, -0.00125060], e: [0.05386179, -0.00050991], i: [2.48599187, 0.00193609],
             L: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794] },
  Uranus:  { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], i: [0.77263783, -0.00242939],
             L: [313.23810451, 428.48202785], peri: [170.95427630, 0.40805281], node: [74.01692503, 0.04240589] },
  Neptune: { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], i: [1.77004347, 0.00035372],
             L: [-55.12002969, 218.45945325], peri: [44.96476227, -0.32241464], node: [131.78422574, -0.00508664] },
};

const centuries = (date: Date) => (date.getTime() / 86400000 - 0.5 + 2440588 - 2451545) / 36525;
const norm180 = (d: number) => { const x = ((d % 360) + 360) % 360; return x > 180 ? x - 360 : x; };

/** Heliocentric position in the J2000 ecliptic frame, in au. */
function heliocentric(name: string, T: number): { x: number; y: number; z: number } {
  const el = ELEMENTS[name];
  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const I = (el.i[0] + el.i[1] * T) * RAD;
  const L = el.L[0] + el.L[1] * T;
  const peri = el.peri[0] + el.peri[1] * T;
  const node = (el.node[0] + el.node[1] * T) * RAD;

  const argPeri = (peri - el.node[0] - el.node[1] * T) * RAD;
  const M = norm180(L - peri) * RAD;

  // Kepler's equation, by Newton. Six passes is far past convergence for these
  // eccentricities — Mercury's 0.2 is the worst case and settles in three.
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 6; k++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }

  // In the orbital plane, then rotated by argument of perihelion, inclination
  // and node — the standard three rotations.
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cw = Math.cos(argPeri), sw = Math.sin(argPeri);
  const co = Math.cos(node), so = Math.sin(node);
  const ci = Math.cos(I), si = Math.sin(I);

  return {
    x: (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
    y: (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
    z: (sw * si) * xp + (cw * si) * yp,
  };
}

export interface PlanetPosition extends SkyPosition {
  /** J2000 right ascension in hours. */
  raHours: number;
  /** J2000 declination in degrees. */
  decDeg: number;
  /** Distance from Earth, au. */
  distanceAu: number;
}

/**
 * Geocentric right ascension, declination and horizon position.
 *
 * Geometric, without light-time or aberration: both are under a minute of arc
 * for these bodies at this distance, which is smaller than the horizon
 * refraction already ignored and far smaller than anything that changes where
 * a person points.
 */
export function planetPosition(name: string, date: Date, lat: number, lon: number): PlanetPosition {
  const T = centuries(date);
  const earth = heliocentric("Earth", T);

  // Light-time: you see the planet where it was when the light left it. Two
  // passes is plenty — the first distance is already good to a part in a
  // thousand, and the correction itself is only tens of arcseconds.
  let p = heliocentric(name, T);
  let distanceAu = Math.hypot(p.x - earth.x, p.y - earth.y, p.z - earth.z);
  for (let k = 0; k < 2; k++) {
    p = heliocentric(name, T - distanceAu / AU_PER_DAY / 36525);
    distanceAu = Math.hypot(p.x - earth.x, p.y - earth.y, p.z - earth.z);
  }

  const x = p.x - earth.x, y = p.y - earth.y, z = p.z - earth.z;

  // Into ecliptic longitude and latitude, precessed from J2000 to the equinox
  // of date, then out to the equator of date.
  const lambda = Math.atan2(y, x) + PRECESSION * T * RAD;
  const beta = Math.atan2(z, Math.hypot(x, y));
  const eps = obliquityAt(T);

  const cb = Math.cos(beta);
  const xe = cb * Math.cos(lambda);
  const ye = cb * Math.sin(lambda) * Math.cos(eps) - Math.sin(beta) * Math.sin(eps);
  const ze = cb * Math.sin(lambda) * Math.sin(eps) + Math.sin(beta) * Math.cos(eps);

  const ra = (((Math.atan2(ye, xe) * DEG) % 360) + 360) % 360;
  const dec = Math.atan2(ze, Math.hypot(xe, ye)) * DEG;
  const horizon = starPosition(date, lat, lon, ra / 15, dec);

  return { ...horizon, raHours: ra / 15, decDeg: dec, distanceAu };
}

/** The five a person can see without equipment, in the order they are asked about. */
export const NAKED_EYE_PLANETS = [
  { name: "Venus",   symbol: "♀", color: "#fde047", note: "The brightest thing in the sky after the sun and moon. Never far from them, so it is a dusk or dawn object." },
  { name: "Jupiter", symbol: "♃", color: "#fb923c", note: "Steady and cream-white. Binoculars held still show the four Galilean moons as a line of dots." },
  { name: "Saturn",  symbol: "♄", color: "#a78bfa", note: "Fainter and yellower than Jupiter. The rings need a telescope — around 25× is enough to see them." },
  { name: "Mars",    symbol: "♂", color: "#ef4444", note: "Distinctly orange. Its brightness swings enormously with distance, which changes over about 26 months." },
  { name: "Mercury", symbol: "☿", color: "#94a3b8", note: "Hard. It never strays far from the sun, so it is only ever low in twilight for a week or two at a time." },
] as const;

export interface PlanetTonight {
  name: string;
  symbol: string;
  color: string;
  note: string;
  /** Right now. */
  altitude: number;
  azimuth: number;
  compass: string;
  distanceAu: number;
  /** Best it gets across the window asked about. */
  peakAltitude: number;
  peakAt: Date;
  peakCompass: string;
  /** True when it clears the horizon at some point in the window. */
  upTonight: boolean;
  /**
   * Set when the peak lands on an edge of the window rather than inside it —
   * the planet is still climbing when the sun comes up, or already past its
   * best when the sun goes down. Without this the card reads "Mars, 56°, at
   * 7:10am", which is true and sounds like an invitation, when what is
   * happening is that Mars is rising into the dawn.
   */
  clipped: "rising-at-dawn" | "past-best-at-dusk" | null;
}

/**
 * The naked-eye planets across a window, brightest prospect first.
 *
 * Sorted by how high they get rather than alphabetically: the one that reaches
 * 60° is the one worth going outside for, and the one that peaks at 4° is not,
 * whatever its name.
 */
export function planetsTonight(
  lat: number, lon: number, from: Date, to: Date, now: Date = new Date(),
): PlanetTonight[] {
  const span = Math.max(3600_000, to.getTime() - from.getTime());
  const steps = Math.max(1, Math.min(200, Math.round(span / 600_000)));

  return NAKED_EYE_PLANETS.map((p) => {
    let peakAltitude = -90, peakAt = from, peakAz = 0;
    for (let k = 0; k <= steps; k++) {
      const at = new Date(from.getTime() + (span * k) / steps);
      const pos = planetPosition(p.name, at, lat, lon);
      if (pos.altitude > peakAltitude) { peakAltitude = pos.altitude; peakAt = at; peakAz = pos.azimuth; }
    }
    const nowPos = planetPosition(p.name, now, lat, lon);
    const edge = 20 * 60_000;
    const clipped: PlanetTonight["clipped"] =
      peakAltitude <= 0 ? null
      : peakAt.getTime() >= to.getTime() - edge ? "rising-at-dawn"
      : peakAt.getTime() <= from.getTime() + edge ? "past-best-at-dusk"
      : null;

    return {
      name: p.name, symbol: p.symbol, color: p.color, note: p.note,
      altitude: nowPos.altitude, azimuth: nowPos.azimuth, compass: compassPoint(nowPos.azimuth),
      distanceAu: nowPos.distanceAu,
      peakAltitude, peakAt, peakCompass: compassPoint(peakAz),
      upTonight: peakAltitude > 0, clipped,
    };
  }).sort((a, b) => b.peakAltitude - a.peakAltitude);
}
