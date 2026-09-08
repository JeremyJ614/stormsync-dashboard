/**
 * Sun and moon positions, from first principles.
 *
 * The stargazing score used cloud cover, humidity and rain, and nothing else.
 * It would call a night PRISTINE under a clear sky with a full moon directly
 * overhead — which is the one night of the month you cannot see anything but
 * the moon. A full moon washes out roughly five magnitudes of sky; it is the
 * single biggest factor after cloud, and it was not in the formula at all.
 *
 * It could not be, because the app had no astronomy: the moon phase was
 * computed inline on one page from days-since-a-known-new-moon, which gives
 * the illuminated fraction and nothing else — not whether the moon is even ABOVE
 * THE HORIZON, which is what actually decides whether it ruins your night.
 *
 * These are the standard low-precision algorithms from Meeus, "Astronomical
 * Algorithms". They are good to about a minute on rise and set times and a few
 * arcminutes on position, which is far beyond what "is tonight worth going out"
 * requires. Every one is checked against the U.S. Naval Observatory's own
 * published times in the tests.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const J1970 = 2440588;
const J2000 = 2451545;

/** Mean obliquity of the ecliptic — Earth's axial tilt, in radians. */
const OBLIQUITY = 23.4397 * RAD;

const toJulian = (date: Date) => date.getTime() / 86400000 - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * 86400000);
/** Days since the J2000.0 epoch — the argument every series below is in. */
const toDays = (date: Date) => toJulian(date) - J2000;

/* ── coordinate conversions ────────────────────────────────────────────── */

const rightAscension = (l: number, b: number) =>
  Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l: number, b: number) =>
  Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
const azimuth = (H: number, phi: number, dec: number) =>
  Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitude = (H: number, phi: number, dec: number) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
/**
 * Local mean sidereal time, in radians — the hour angle the whole sky hangs on.
 *
 * The widely-copied short form uses 280.16 for the constant term. Checked
 * against the U.S. Naval Observatory's own sidereal-time service that is
 * 0.5332° adrift, which is 2.1 minutes of time, and it rotates EVERYTHING
 * computed here with it: the sun's azimuth, the moon's altitude, moonrise and
 * moonset. That was most of the residual left in the rise/set tests.
 *
 * These are the IAU values. At Oklahoma City and Boston, months apart, they
 * reproduce the USNO's published local mean sidereal time to within three
 * milliseconds.
 */
const siderealTime = (d: number, lw: number) =>
  RAD * (280.46061837 + 360.98564736629 * d) - lw;

/* ── the sun ───────────────────────────────────────────────────────────── */

const solarMeanAnomaly = (d: number) => RAD * (357.5291 + 0.98560028 * d);

/** Ecliptic longitude, mean anomaly plus the equation of centre plus perihelion. */
function eclipticLongitude(M: number): number {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372; // perihelion of the Earth
  return M + C + P + Math.PI;
}

function sunCoords(d: number) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

export interface SkyPosition {
  /** Degrees above the horizon. Negative means below it. */
  altitude: number;
  /** Degrees clockwise from north. */
  azimuth: number;
}

export function sunPosition(date: Date, lat: number, lon: number): SkyPosition {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return {
    altitude: altitude(H, phi, c.dec) * DEG,
    azimuth: (azimuth(H, phi, c.dec) * DEG + 180) % 360,
  };
}

/* ── the moon ──────────────────────────────────────────────────────────── */

/**
 * Where the moon is, with the perturbations that actually matter.
 *
 * The obvious short version keeps only the leading term of each series —
 * 6.289° in longitude, 5.128° in latitude — and that is what most snippets
 * on the internet do. Checked against the U.S. Naval Observatory it puts
 * moonrise eight minutes out, because the terms it drops are not small: the
 * evection alone is 1.274°, and near the horizon the moon climbs about twelve
 * degrees an hour, so a degree and a half of position error is most of ten
 * minutes of time error.
 *
 * The additive terms below are the standard abridged lunar theory. With them
 * rise and set land within a minute of the USNO's own published times, which
 * is what the tests assert.
 */
function moonCoords(d: number) {
  const Lp = RAD * (218.316 + 13.176396 * d);   // mean longitude
  const M  = RAD * (134.963 + 13.064993 * d);   // the moon's mean anomaly
  const F  = RAD * (93.272 + 13.229350 * d);    // argument of latitude
  const D  = RAD * (297.850 + 12.190749 * d);   // mean elongation from the sun
  const Ms = RAD * (357.529 + 0.985600 * d);    // the sun's mean anomaly

  const sin = Math.sin, cos = Math.cos;

  const l = Lp + RAD * (
      6.289 * sin(M)              // equation of the centre
    + 1.274 * sin(2 * D - M)      // evection
    + 0.658 * sin(2 * D)          // variation
    + 0.214 * sin(2 * M)
    - 0.186 * sin(Ms)             // annual equation
    - 0.114 * sin(2 * F)
    - 0.059 * sin(2 * D - 2 * M)
    - 0.057 * sin(2 * D - M + Ms)
    + 0.053 * sin(2 * D + M)
    + 0.046 * sin(2 * D - Ms)
    + 0.041 * sin(M - Ms)
    - 0.035 * sin(D)              // parallactic equation
    - 0.031 * sin(M + Ms));

  const b = RAD * (
      5.128 * sin(F)
    + 0.281 * sin(M + F)
    - 0.278 * sin(F - M)
    - 0.173 * sin(F - 2 * D)
    + 0.055 * sin(2 * D + F - M)
    - 0.046 * sin(2 * D - F - M)
    + 0.033 * sin(F + 2 * D)
    + 0.017 * sin(2 * M + F));

  const dt = 385001
    - 20905 * cos(M)
    -  3699 * cos(2 * D - M)
    -  2956 * cos(2 * D)
    -   570 * cos(2 * M)
    +   246 * cos(2 * D - 2 * M)
    -   205 * cos(Ms - 2 * D)
    -   171 * cos(M + 2 * D)
    -   152 * cos(M + Ms - 2 * D);

  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
}

export interface MoonPosition extends SkyPosition {
  /** Kilometres to the moon; it varies by about 12% over a month. */
  distanceKm: number;
  /** Degrees the disc subtends — this is what makes a "supermoon". */
  apparentDiameter: number;
}

/** Geocentric altitude of the moon's centre, in degrees — no refraction. */
function moonAltitudeGeocentric(date: Date, lat: number, lon: number): number {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return altitude(H, phi, c.dec) * DEG;
}

export function moonPosition(date: Date, lat: number, lon: number): MoonPosition {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);

  // Refraction lifts a body near the horizon by up to about half a degree, so
  // a moon reported at exactly 0° is in fact already visible. This is the
  // APPARENT altitude, which is the one to show a person looking up; rise and
  // set are computed from the geocentric value against the standard threshold
  // below, because that convention already accounts for refraction and would
  // otherwise apply it twice.
  h = h + RAD * 0.017 / Math.tan(h + (RAD * 10.26) / (h * DEG + 5.10));

  return {
    altitude: h * DEG,
    azimuth: (azimuth(H, phi, c.dec) * DEG + 180) % 360,
    distanceKm: Math.round(c.dist),
    apparentDiameter: (2 * Math.atan(1737.4 / c.dist)) * DEG,
  };
}

export interface MoonIllumination {
  /** 0 at new, 1 at full. */
  fraction: number;
  /** 0 to 1 through the cycle — 0 new, 0.25 first quarter, 0.5 full. */
  phase: number;
  /** Days since the last new moon. */
  age: number;
  waxing: boolean;
  name: string;
  emoji: string;
}

const SYNODIC = 29.530588853;

export function moonIllumination(date: Date): MoonIllumination {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000; // km to the sun

  // The elongation of the moon from the sun, and from that the phase angle —
  // the actual geometry, rather than a count of days since a fixed new moon.
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec)
    + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));

  const phase = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;
  const fraction = (1 + Math.cos(inc)) / 2;
  const age = phase * SYNODIC;
  const waxing = phase < 0.5;

  return { fraction, phase, age, waxing, ...phaseName(phase) };
}

function phaseName(phase: number): { name: string; emoji: string } {
  if (phase < 0.0325 || phase >= 0.9675) return { name: "New Moon", emoji: "🌑" };
  if (phase < 0.2175) return { name: "Waxing Crescent", emoji: "🌒" };
  if (phase < 0.2825) return { name: "First Quarter", emoji: "🌓" };
  if (phase < 0.4675) return { name: "Waxing Gibbous", emoji: "🌔" };
  if (phase < 0.5325) return { name: "Full Moon", emoji: "🌕" };
  if (phase < 0.7175) return { name: "Waning Gibbous", emoji: "🌖" };
  if (phase < 0.7825) return { name: "Last Quarter", emoji: "🌗" };
  return { name: "Waning Crescent", emoji: "🌘" };
}

/* ── rise, set and the twilights ───────────────────────────────────────── */

const J0 = 0.0009;
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (Ht: number, lw: number, n: number) => J0 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, M: number, L: number) =>
  J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

function hourAngle(h: number, phi: number, d: number) {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
}

/**
 * The angles that name each kind of darkness.
 *
 * These are not arbitrary: astronomical twilight ending at -18° is the point
 * at which the sun stops contributing any light at all to the sky, and it is
 * the only time the faintest objects are visible. A stargazing forecast that
 * does not know when that happens is guessing.
 */
export const SUN_ANGLES = {
  sunrise: -0.833,        // the disc's upper limb, with refraction
  civil: -6,              // bright stars appear
  nautical: -12,          // the horizon is no longer visible at sea
  astronomical: -18,      // true darkness
} as const;

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  civilDusk: Date | null;
  nauticalDusk: Date | null;
  astronomicalDusk: Date | null;
  astronomicalDawn: Date | null;
  nauticalDawn: Date | null;
  civilDawn: Date | null;
  solarNoon: Date;
  /** True inside the polar day or night, when a given event never happens. */
  alwaysUp: boolean;
  alwaysDown: boolean;
}

export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  const lw = RAD * -lon, phi = RAD * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);

  const at = (angleDeg: number): { rise: Date | null; set: Date | null } => {
    const h0 = angleDeg * RAD;
    const cosH = (Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    // Outside [-1, 1] the sun never reaches that angle on this day at this
    // latitude — a real answer, not a failure, and the caller is told so.
    if (cosH > 1 || cosH < -1) return { rise: null, set: null };
    const w = hourAngle(h0, phi, dec);
    const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
    const Jrise = Jnoon - (Jset - Jnoon);
    return { rise: fromJulian(Jrise), set: fromJulian(Jset) };
  };

  const day = at(SUN_ANGLES.sunrise);
  const civil = at(SUN_ANGLES.civil);
  const naut = at(SUN_ANGLES.nautical);
  const astro = at(SUN_ANGLES.astronomical);

  const noonAlt = sunPosition(fromJulian(Jnoon), lat, lon).altitude;
  return {
    sunrise: day.rise, sunset: day.set,
    civilDusk: civil.set, nauticalDusk: naut.set, astronomicalDusk: astro.set,
    astronomicalDawn: astro.rise, nauticalDawn: naut.rise, civilDawn: civil.rise,
    solarNoon: fromJulian(Jnoon),
    alwaysUp: day.rise === null && noonAlt > 0,
    alwaysDown: day.rise === null && noonAlt <= 0,
  };
}

/**
 * Moonrise and moonset, found by walking the altitude curve.
 *
 * There is no closed form for these the way there is for the sun: the moon
 * moves about 13° a day against the stars, so its rise time shifts by nearly
 * an hour each night and can skip a calendar day entirely. Stepping hour by
 * hour and interpolating across the sign change is the standard approach and
 * is accurate to about a minute.
 */
/**
 * The altitude the moon's CENTRE has when its upper limb touches the horizon.
 *
 * Not zero, and not a fudge. The conventional value folds three things
 * together: refraction lifts the image by about 34 arcminutes, the disc's own
 * radius is about 15.7, and the moon is close enough that horizontal parallax
 * moves it about 57 the other way. Net, the geocentric centre sits about an
 * eighth of a degree ABOVE the horizon at the moment of rise.
 *
 * Testing against a plain zero was worth four minutes of error on moonset —
 * the moon covers roughly twelve degrees an hour near the horizon, so a
 * three-quarter-degree threshold mistake is most of that.
 */
const MOON_RISE_ALT = 0.125;

export function moonTimes(date: Date, lat: number, lon: number): { rise: Date | null; set: Date | null } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const alt = (t: number) => moonAltitudeGeocentric(new Date(t), lat, lon) - MOON_RISE_ALT;

  let rise: Date | null = null, set: Date | null = null;
  let prev = alt(start.getTime());

  for (let i = 1; i <= 24; i++) {
    const t = start.getTime() + i * 3600_000;
    const h = alt(t);
    if (prev < 0 && h >= 0) rise = new Date(refine(t - 3600_000, t, alt));
    if (prev >= 0 && h < 0) set = new Date(refine(t - 3600_000, t, alt));
    prev = h;
    if (rise && set) break;
  }
  return { rise, set };
}

/**
 * The exact moment of the crossing, by bisection.
 *
 * Linear interpolation across a whole hour was the other half of the error:
 * altitude is a sine, not a line, and near the horizon it is at its steepest.
 * Twenty halvings of an hour resolve it to under two seconds.
 */
function refine(lo: number, hi: number, f: (t: number) => number): number {
  const fLo = f(lo);
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(f(mid)) === Math.sign(fLo)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ── fixed objects ─────────────────────────────────────────────────────── */

/**
 * Where a catalogue object is in the sky.
 *
 * Deep-sky targets do not move against the stars on any timescale this app
 * cares about, so a J2000 right ascension and declination is the whole input.
 * Precession shifts them by roughly half a degree per century — smaller than
 * the refraction this deliberately leaves out, and far smaller than the
 * difference between "up" and "not up", which is the only question being asked.
 *
 * `raHours` is right ascension in hours (0–24, the way catalogues print it);
 * `decDeg` is declination in degrees, north positive.
 */
export function starPosition(
  date: Date, lat: number, lon: number, raHours: number, decDeg: number,
): SkyPosition {
  const lw = RAD * -lon, phi = RAD * lat, d = toDays(date);
  const ra = raHours * 15 * RAD;
  const dec = decDeg * RAD;
  const H = siderealTime(d, lw) - ra;
  return {
    altitude: altitude(H, phi, dec) * DEG,
    azimuth: (azimuth(H, phi, dec) * DEG + 180) % 360,
  };
}

/**
 * The compass point an azimuth falls in, for telling someone where to look.
 *
 * "205°" is a number. "SSW" is an instruction you can follow standing in a
 * field in the dark, which is where this gets read.
 */
export function compassPoint(azimuthDeg: number): string {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round((((azimuthDeg % 360) + 360) % 360) / 22.5) % 16];
}
