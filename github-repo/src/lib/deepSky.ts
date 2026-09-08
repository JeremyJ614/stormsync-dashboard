import { starPosition, compassPoint } from "./astro";

/**
 * What is actually up tonight, and where to point.
 *
 * The page used to carry a fixed list of eight objects with a "season" column —
 * "Winter/Spring", "Summer" — which is the same answer in July as in January
 * and never once told anyone whether a target was above the horizon at the
 * moment they were reading it. Half the list is below the horizon on any given
 * night, and which half changes hour by hour.
 *
 * So the season column is gone. Every object here is placed in the sky for the
 * viewer's own coordinates across tonight's actual dark window, and what comes
 * back is the height it reaches, when it reaches it, and which way to face.
 *
 * Positions are J2000 right ascension and declination taken from SIMBAD, the
 * CDS object database, rather than typed from memory. Magnitudes are not
 * carried: SIMBAD's V for an extended object is its central star, which for the
 * Ring Nebula is 15.8 and for the nebula a person actually looks at is about
 * 8.8 — a number that would be worse than none. What replaces it is the
 * aperture class, which is the decision being made anyway.
 */

export type Aperture = "eye" | "binoculars" | "telescope";

export interface DeepSkyObject {
  id: string;
  name: string;
  kind: string;
  aperture: Aperture;
  /** J2000 right ascension in hours. */
  raHours: number;
  /** J2000 declination in degrees, north positive. */
  decDeg: number;
  /** One line on what you are looking at. */
  note: string;
}

const deg = (d: number) => d / 15;

/** SIMBAD J2000 positions, queried rather than remembered. */
export const CATALOGUE: DeepSkyObject[] = [
  { id: "M42",  name: "Orion Nebula",         kind: "Emission nebula",  aperture: "eye",
    raHours: deg(83.8201),   decDeg: -5.3876,  note: "A star nursery 1,300 light years out — the middle 'star' of Orion's sword." },
  { id: "M31",  name: "Andromeda Galaxy",     kind: "Spiral galaxy",    aperture: "eye",
    raHours: deg(10.684708), decDeg: 41.26875, note: "The furthest thing the unaided eye can reach: 2.5 million light years." },
  { id: "M45",  name: "Pleiades",             kind: "Open cluster",     aperture: "eye",
    raHours: deg(56.600833), decDeg: 24.113889, note: "Six or seven stars to the eye, dozens through binoculars." },
  { id: "M44",  name: "Beehive Cluster",      kind: "Open cluster",     aperture: "eye",
    raHours: deg(130.054167), decDeg: 19.621111, note: "A faint patch to the eye; binoculars break it into a swarm." },
  { id: "M7",   name: "Ptolemy Cluster",      kind: "Open cluster",     aperture: "eye",
    raHours: deg(268.447083), decDeg: -34.841111, note: "Catalogued by Ptolemy in 130 AD. Low in the south — needs a clear horizon." },
  { id: "M6",   name: "Butterfly Cluster",    kind: "Open cluster",     aperture: "binoculars",
    raHours: deg(265.069167), decDeg: -32.241944, note: "Wings of stars beside the Scorpion's stinger." },
  { id: "M13",  name: "Hercules Cluster",     kind: "Globular cluster", aperture: "binoculars",
    raHours: deg(250.423475), decDeg: 36.461319, note: "Several hundred thousand stars in a ball thirty times older than the sun." },
  { id: "M22",  name: "Sagittarius Cluster",  kind: "Globular cluster", aperture: "binoculars",
    raHours: deg(279.09975),  decDeg: -23.90475, note: "Brighter than M13 but sits low, so northern viewers see it through more air." },
  { id: "M8",   name: "Lagoon Nebula",        kind: "Emission nebula",  aperture: "binoculars",
    raHours: deg(270.904167), decDeg: -24.386667, note: "A glowing cloud in Sagittarius, visible as a smudge from a dark site." },
  { id: "M11",  name: "Wild Duck Cluster",    kind: "Open cluster",     aperture: "binoculars",
    raHours: deg(282.765833), decDeg: -6.271944, note: "One of the richest open clusters — a wedge of a few thousand stars." },
  { id: "NGC869", name: "Double Cluster",     kind: "Open clusters",    aperture: "binoculars",
    raHours: deg(34.740833),  decDeg: 57.133889, note: "Two clusters side by side in Perseus, best in wide binoculars." },
  { id: "M3",   name: "M3",                   kind: "Globular cluster", aperture: "binoculars",
    raHours: deg(205.548417), decDeg: 28.377278, note: "Half a million stars, and among the brightest globulars in the north." },
  { id: "M15",  name: "M15",                  kind: "Globular cluster", aperture: "binoculars",
    raHours: deg(322.493042), decDeg: 12.167,    note: "One of the densest known — its core may hide a black hole." },
  { id: "M35",  name: "M35",                  kind: "Open cluster",     aperture: "binoculars",
    raHours: deg(92.272083),  decDeg: 24.336111, note: "A full-moon-sized spray of stars at the feet of Gemini." },
  { id: "M81",  name: "Bode's Galaxy",        kind: "Spiral galaxy",    aperture: "telescope",
    raHours: deg(148.888219), decDeg: 69.065295, note: "Circumpolar from most of the US — up every night of the year." },
  { id: "M51",  name: "Whirlpool Galaxy",     kind: "Spiral galaxy",    aperture: "telescope",
    raHours: deg(202.469575), decDeg: 47.195258, note: "The first galaxy anyone recognised as a spiral, in 1845." },
  { id: "M33",  name: "Triangulum Galaxy",    kind: "Spiral galaxy",    aperture: "telescope",
    raHours: deg(23.462069),  decDeg: 30.660175, note: "Large but faint — the sky has to be genuinely dark for this one." },
  { id: "M57",  name: "Ring Nebula",          kind: "Planetary nebula", aperture: "telescope",
    raHours: deg(283.396237), decDeg: 33.029134, note: "A dying star's shed atmosphere, seen as a smoke ring." },
  { id: "M27",  name: "Dumbbell Nebula",      kind: "Planetary nebula", aperture: "telescope",
    raHours: deg(299.901513), decDeg: 22.721198, note: "The same ending as the Ring, seen closer and larger." },
  { id: "NGC7000", name: "North America Nebula", kind: "Emission nebula", aperture: "telescope",
    raHours: deg(314.695833), decDeg: 44.33,     note: "Shaped like the continent. Wants a dark sky and a wide field." },
];

export interface TargetTonight {
  object: DeepSkyObject;
  /** Highest it gets during tonight's dark window, in degrees. */
  peakAltitude: number;
  /** When it gets there. */
  peakAt: Date;
  /** Which way to face at that moment. */
  compass: string;
  azimuthAtPeak: number;
  /** Where it is at this instant — negative means below the horizon. */
  altitudeNow: number;
  compassNow: string;
}

/**
 * How high is high enough to bother.
 *
 * Below about twenty degrees you are looking through two to three times the
 * air you look through overhead, and through whatever haze and light dome sits
 * on the horizon. Objects there are technically up and practically not worth
 * setting up for, so the page marks them rather than pretending.
 */
export const USABLE_ALTITUDE = 20;

/**
 * Every catalogue object placed across the dark window, best first.
 *
 * Sampled every ten minutes rather than solved analytically: the window is a
 * few hours, twenty objects is a few hundred evaluations, and the answer wanted
 * is "roughly when, and how high", which ten minutes resolves completely.
 */
export function targetsTonight(
  lat: number, lon: number, from: Date, to: Date, now: Date = new Date(),
): TargetTonight[] {
  const span = to.getTime() - from.getTime();
  const steps = Math.max(1, Math.min(200, Math.round(span / 600_000)));

  return CATALOGUE.map((object) => {
    let peakAltitude = -90;
    let peakAt = from;
    let azimuthAtPeak = 0;

    for (let i = 0; i <= steps; i++) {
      const at = new Date(from.getTime() + (span * i) / steps);
      const p = starPosition(at, lat, lon, object.raHours, object.decDeg);
      if (p.altitude > peakAltitude) {
        peakAltitude = p.altitude;
        peakAt = at;
        azimuthAtPeak = p.azimuth;
      }
    }

    const nowPos = starPosition(now, lat, lon, object.raHours, object.decDeg);
    return {
      object,
      peakAltitude,
      peakAt,
      azimuthAtPeak,
      compass: compassPoint(azimuthAtPeak),
      altitudeNow: nowPos.altitude,
      compassNow: compassPoint(nowPos.azimuth),
    };
  }).sort((a, b) => b.peakAltitude - a.peakAltitude);
}
