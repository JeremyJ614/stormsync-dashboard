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

/**
 * Ecliptic longitude: mean anomaly, plus the equation of centre, plus the
 * longitude of perihelion.
 *
 * That last term is not a constant, and treating it as one is the bug this
 * carries a comment for. Earth's perihelion precesses about 0.0000471° a day —
 * 1.72° a century — so a fixed 102.9372 is right at J2000 and drifts by roughly
 * a fifth of a degree a decade after it. Measured against the standard Meeus
 * expression the old form was 0.46° adrift in 2026 and 0.70° by 2040, and it
 * grows without bound.
 *
 * That is not a rounding error. The sun moves about a degree a day, so it put
 * the equinoxes and solstices THIRTEEN HOURS late, dragged every moon phase
 * about fifty minutes late with it (a phase is an elongation from the sun), and
 * cost a couple of minutes on every sunrise and sunset in the app.
 */
function eclipticLongitude(M: number, d: number): number {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * (102.93735 + 0.00004708 * d); // perihelion of the Earth, precessing
  return M + C + P + Math.PI;
}

function sunCoords(d: number) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M, d);
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
  const L = eclipticLongitude(M, ds);
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

/* ── the sun's place in the year ───────────────────────────────────────── */

/** The sun's apparent ecliptic longitude in degrees, 0 at the March equinox. */
export function sunEclipticLongitude(date: Date): number {
  const d = toDays(date);
  const L = eclipticLongitude(solarMeanAnomaly(d), d) * DEG;
  return ((L % 360) + 360) % 360;
}

export type SeasonName = "Spring" | "Summer" | "Autumn" | "Winter";

export interface SeasonEvent {
  /** What the sun is doing, not what month it is. */
  name: "March equinox" | "June solstice" | "September equinox" | "December solstice";
  /** The season that STARTS here, in the northern hemisphere. */
  starts: SeasonName;
  at: Date;
}

/**
 * The equinoxes and solstices of a year, to the minute.
 *
 * These are not dates. They are the four instants when the sun's ecliptic
 * longitude passes 0°, 90°, 180° and 270°, and they move by up to about
 * eighteen hours across the leap-year cycle — the September equinox was the
 * 22nd in 2025 and is the 23rd in 2026. The page this replaces had the four
 * dates written into it as constants, so it was simply wrong in some years, and
 * it never showed a time at all.
 *
 * Found by bisection on the longitude, which is monotonic here. Checked against
 * the U.S. Naval Observatory's own seasons service.
 */
export function seasonEvents(year: number): SeasonEvent[] {
  const targets: { deg: number; name: SeasonEvent["name"]; starts: SeasonName; month: number }[] = [
    { deg: 0,   name: "March equinox",      starts: "Spring", month: 2 },
    { deg: 90,  name: "June solstice",      starts: "Summer", month: 5 },
    { deg: 180, name: "September equinox",  starts: "Autumn", month: 8 },
    { deg: 270, name: "December solstice",  starts: "Winter", month: 11 },
  ];

  return targets.map((t) => {
    // A twenty-day bracket around the nominal date always contains the
    // crossing; the events never wander more than a couple of days.
    let lo = Date.UTC(year, t.month, 10);
    let hi = Date.UTC(year, t.month, 30);
    // Measure longitude relative to the target so the crossing is a sign change
    // rather than a wrap at 360.
    const f = (ms: number) => {
      const d = sunEclipticLongitude(new Date(ms)) - t.deg;
      return d > 180 ? d - 360 : d < -180 ? d + 360 : d;
    };
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) < 0) lo = mid; else hi = mid;
    }
    return { name: t.name, starts: t.starts, at: new Date((lo + hi) / 2) };
  });
}

/**
 * Which season it is, and the instant the next one begins.
 *
 * Driven by the events above rather than by month numbers, so the boundary is
 * the real one — on the 20th of March the answer changes at the minute the sun
 * crosses, not at midnight.
 */
export function currentSeason(at: Date = new Date()): { season: SeasonName; next: SeasonEvent } {
  const events = [
    ...seasonEvents(at.getUTCFullYear() - 1),
    ...seasonEvents(at.getUTCFullYear()),
    ...seasonEvents(at.getUTCFullYear() + 1),
  ];
  const next = events.find((e) => e.at > at)!;
  const started = events.filter((e) => e.at <= at).pop()!;
  return { season: started.starts, next };
}

/* ── the moon's own calendar ───────────────────────────────────────────── */

export type PhaseName = "New Moon" | "First Quarter" | "Full Moon" | "Last Quarter";

export interface PhaseEvent { name: PhaseName; at: Date }

/**
 * The next few new moons, quarters and full moons.
 *
 * The quantity that defines them is the elongation of the moon from the sun —
 * 0° new, 90° first quarter, 180° full — not a count of days from a fixed
 * epoch. The count-of-days version this replaces drifts by up to about half a
 * day, which is the difference between a full moon tonight and a full moon
 * tomorrow.
 *
 * Stepped six hours at a time looking for a crossing, then bisected. Checked
 * against the U.S. Naval Observatory's own phase service.
 */
export function moonPhases(from: Date, count = 4): PhaseEvent[] {
  const elong = (ms: number) => {
    const d = toDays(new Date(ms));
    const s = sunCoords(d), m = moonCoords(d);
    // Difference in apparent ecliptic longitude, which is what "quarter" means.
    const sl = Math.atan2(Math.sin(s.ra) * Math.cos(OBLIQUITY) + Math.tan(s.dec) * Math.sin(OBLIQUITY), Math.cos(s.ra));
    const ml = Math.atan2(Math.sin(m.ra) * Math.cos(OBLIQUITY) + Math.tan(m.dec) * Math.sin(OBLIQUITY), Math.cos(m.ra));
    return (((ml - sl) * DEG % 360) + 360) % 360;
  };

  const NAMES: PhaseName[] = ["New Moon", "First Quarter", "Full Moon", "Last Quarter"];
  const out: PhaseEvent[] = [];
  const STEP = 6 * 3600_000;

  let t = from.getTime();
  let prev = elong(t);
  const end = t + 45 * 86400_000;

  while (t < end && out.length < count) {
    const next = t + STEP;
    const cur = elong(next);
    // Which quarter boundaries fall inside this step. Elongation always
    // increases, so a drop means it wrapped past 360.
    for (let q = 0; q < 4; q++) {
      const target = q * 90;
      const crossed = prev < cur ? (prev < target && cur >= target)
        : (prev < target || cur >= target);   // the wrap at new moon
      if (!crossed) continue;
      let lo = t, hi = next;
      const dist = (ms: number) => {
        const d = elong(ms) - target;
        return d > 180 ? d - 360 : d < -180 ? d + 360 : d;
      };
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (dist(mid) < 0) lo = mid; else hi = mid;
      }
      out.push({ name: NAMES[q], at: new Date((lo + hi) / 2) });
    }
    t = next;
    prev = cur;
  }

  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, count);
}

/* ── the night, as a window ────────────────────────────────────────────── */

type SunEventKind = "sunrise" | "sunset" | "astronomicalDusk" | "astronomicalDawn"
  | "civilDusk" | "civilDawn" | "nauticalDusk" | "nauticalDawn";

/**
 * The next time the sun does a given thing, looking forward from an instant.
 *
 * `sunTimes` answers for the UTC day it is handed, which is not the same
 * question. In the Americas the evening's sunset belongs to the NEXT UTC day,
 * so "today's sunset and tomorrow's sunrise" — the obvious-looking pairing —
 * spans about thirty-five hours and swallows a whole daytime. Anything scored
 * across that window is scored partly in daylight.
 */
export function nextSunEvent(
  kind: SunEventKind, lat: number, lon: number, from: Date,
): Date | null {
  for (let d = 0; d < 3; d++) {
    const t = sunTimes(new Date(from.getTime() + d * 86400_000), lat, lon)[kind];
    if (t && t > from) return t;
  }
  return null;
}

/** Likewise for the moon, which can skip a calendar day entirely. */
export function nextMoonEvent(
  kind: "rise" | "set", lat: number, lon: number, from: Date,
): Date | null {
  for (let d = 0; d < 3; d++) {
    const t = moonTimes(new Date(from.getTime() + d * 86400_000), lat, lon)[kind];
    if (t && t > from) return t;
  }
  return null;
}

export interface NightWindow {
  /** Sunset to sunrise — the night as a whole. */
  start: Date;
  end: Date;
  /** The astronomically dark part, which is shorter and can be absent. */
  darkStart: Date | null;
  darkEnd: Date | null;
  /** True when the night is already under way. */
  started: boolean;
}

/**
 * Tonight, bounded properly.
 *
 * If the sun is already down the night has begun, so it runs from now; if it is
 * still up, from the coming sunset. Either way it ends at the FIRST sunrise
 * after that, never a later one. The dark window is the same question asked of
 * astronomical twilight, and comes back null in the summer above about 49°,
 * where the sun never gets 18° down and there is no astronomical night at all.
 */
export function nightWindow(lat: number, lon: number, at: Date = new Date()): NightWindow {
  const sunUp = sunPosition(at, lat, lon).altitude > SUN_ANGLES.sunrise;
  const start = sunUp ? (nextSunEvent("sunset", lat, lon, at) ?? at) : at;
  const end = nextSunEvent("sunrise", lat, lon, start)
    ?? new Date(start.getTime() + 12 * 3600_000);

  const darkNow = sunPosition(at, lat, lon).altitude <= SUN_ANGLES.astronomical;
  const darkStart = darkNow ? at : nextSunEvent("astronomicalDusk", lat, lon, at);
  const darkEnd = darkStart ? nextSunEvent("astronomicalDawn", lat, lon, darkStart) : null;

  // A dark window that does not sit inside the night is not this night's.
  const usableDark = darkStart && darkEnd && darkStart < end;
  return {
    start, end,
    darkStart: usableDark ? darkStart : null,
    darkEnd: usableDark ? darkEnd : null,
    started: !sunUp,
  };
}
