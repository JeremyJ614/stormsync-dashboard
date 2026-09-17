import { sunPosition, moonPosition, moonIllumination } from "./astro";

/**
 * How good tonight actually is for looking up.
 *
 * The old score was `100 − cloud*0.85 − humidity − rain`. Three problems with
 * that, in rising order of seriousness.
 *
 * It ignored the moon. A clear night under a full moon at the zenith would
 * score PRISTINE, and it is the worst night of the month for anything except
 * looking at the moon: full moonlight washes out something like five
 * magnitudes of sky, taking the Milky Way and most deep-sky objects with it.
 *
 * It ignored darkness. The same clear sky scored PRISTINE at two in the
 * afternoon, because nothing in the formula knew where the sun was.
 *
 * And it was a single opaque number. "62" tells you nothing about whether to
 * wait two hours for the moon to set or give up and go to bed.
 *
 * So it is now a product of four named factors, each between 0 and 1, each
 * from a real measurement — and each returned, so the page can say which one
 * is spoiling it. A product rather than a sum on purpose: these gate each
 * other. Perfect transparency at noon is still noon, and no amount of darkness
 * rescues a sky under solid cloud.
 *
 * It is an index, not a measurement, and it does not know about light
 * pollution — that needs a sky-brightness survey the app does not have. It
 * says how good the SKY OVERHEAD is tonight compared with the same spot on its
 * best night, and it is labelled that way.
 */

export interface SkyFactor {
  key: "darkness" | "cloud" | "moon" | "air";
  label: string;
  /** 0 spoils the night completely, 1 costs nothing. */
  value: number;
  /** What it is, in words a person can act on. */
  detail: string;
}

export interface SkyScore {
  score: number;
  factors: SkyFactor[];
  /** The factor doing the most damage, or null when nothing is. */
  limiting: SkyFactor | null;
}

export interface SkyInputs {
  at: Date;
  lat: number;
  lon: number;
  cloudPct: number;
  humidityPct: number;
  precipIn: number;
}

/**
 * Darkness, from the sun's actual altitude.
 *
 * Full marks only after astronomical twilight ends at −18°, which is the
 * point the sun stops contributing any light at all. Civil twilight at −6°
 * still has enough glow to hide everything but the brightest stars, so it
 * scores near zero rather than "a bit worse than night".
 */
function darknessFactor(sunAlt: number): number {
  if (sunAlt >= -6) return 0;
  if (sunAlt <= -18) return 1;
  return (Math.abs(sunAlt) - 6) / 12;
}

/**
 * What the moon costs, which depends on being UP as much as being full.
 *
 * A full moon below the horizon costs nothing. A full moon overhead costs
 * almost everything. The penalty scales with illuminated fraction and with how
 * high it is — its light has less atmosphere to cross and lights more sky the
 * higher it climbs. Below the horizon, and for the few degrees of refracted
 * glow just under it, the cost tapers to nothing rather than switching off.
 */
function moonFactor(moonAlt: number, illum: number): number {
  if (moonAlt <= -3) return 1;
  const up = Math.min(1, (moonAlt + 3) / 33);          // 0 at −3°, 1 by 30°
  return 1 - 0.85 * illum * up;
}

/** Cloud, straight through. Solid overcast is the end of the night. */
const cloudFactor = (cloudPct: number) => Math.max(0, 1 - cloudPct / 100);

/**
 * Everything else in the air: damp haze and rain.
 *
 * Humidity below about half costs nothing — dry air is not a bonus, it is the
 * normal case. Above that it scatters enough to soften faint detail. Rain is
 * not a factor so much as an ending.
 */
function airFactor(humidityPct: number, precipIn: number): number {
  if (precipIn > 0.001) return 0.15;
  return Math.max(0.4, 1 - Math.max(0, humidityPct - 50) / 120);
}

export function skyScore(i: SkyInputs): SkyScore {
  const sunAlt = sunPosition(i.at, i.lat, i.lon).altitude;
  const moon = moonPosition(i.at, i.lat, i.lon);
  const illum = moonIllumination(i.at).fraction;

  const factors: SkyFactor[] = [
    {
      key: "darkness", label: "Darkness", value: darknessFactor(sunAlt),
      detail: sunAlt >= 0 ? `sun ${Math.round(sunAlt)}° up — daylight`
        : sunAlt > -6 ? "civil twilight, still too bright"
        : sunAlt > -12 ? "nautical twilight"
        : sunAlt > -18 ? "astronomical twilight" : "full darkness",
    },
    {
      key: "cloud", label: "Cloud", value: cloudFactor(i.cloudPct),
      detail: `${Math.round(i.cloudPct)}% cover`,
    },
    {
      key: "moon", label: "Moon", value: moonFactor(moon.altitude, illum),
      detail: moon.altitude <= -3
        ? `below the horizon — ${Math.round(illum * 100)}% lit, but out of the way`
        : `${Math.round(illum * 100)}% lit, ${Math.round(moon.altitude)}° up`,
    },
    {
      key: "air", label: "Air", value: airFactor(i.humidityPct, i.precipIn),
      detail: i.precipIn > 0.001 ? "raining" : `${Math.round(i.humidityPct)}% humidity`,
    },
  ];

  const score = Math.round(factors.reduce((a, f) => a * f.value, 1) * 100);
  const worst = factors.reduce((lo, f) => (f.value < lo.value ? f : lo));

  return { score, factors, limiting: worst.value < 0.95 ? worst : null };
}

export interface SkyBand {
  /** Lowest score in the band. */
  min: number;
  text: string;
  /** Fill, for the map and for the number. */
  color: string;
  /** Outline, for the map's state borders. */
  stroke: string;
  /** The band's span, for a legend. */
  range: string;
}

/**
 * The one scale.
 *
 * The map used to carry its own copy of this with different thresholds and
 * different names — 85/70/55/35 against the panel's 80/60/40/20, and no "GOOD"
 * band at all. So the same night could be CLEAR on the map and GOOD in the
 * panel beside it, and a state painted "HAZY" was a score the legend could not
 * explain. Both read this now, and a legend built from it cannot drift.
 */
export const SKY_BANDS: SkyBand[] = [
  { min: 80, text: "PRISTINE",   color: "#fde047", stroke: "#ca8a04", range: "80+" },
  { min: 60, text: "EXCELLENT",  color: "#e879f9", stroke: "#c026d3", range: "60–79" },
  { min: 40, text: "GOOD",       color: "#c084fc", stroke: "#9333ea", range: "40–59" },
  { min: 20, text: "POOR",       color: "#818cf8", stroke: "#4f46e5", range: "20–39" },
  { min: 5,  text: "WASHED OUT", color: "#6366f1", stroke: "#4338ca", range: "5–19" },
  { min: 0,  text: "NO VIEWING", color: "#4c1d95", stroke: "#3b0764", range: "0–4" },
];

export function skyBand(score: number): SkyBand {
  return SKY_BANDS.find((b) => score >= b.min) ?? SKY_BANDS[SKY_BANDS.length - 1];
}

export function skyLabel(score: number): { text: string; color: string } {
  const b = skyBand(score);
  return { text: b.text, color: b.color };
}

/* ── tonight ───────────────────────────────────────────────────────────── */

export interface SkyHour { at: Date; score: number; label: string }

export interface BestWindow {
  start: Date;
  end: Date;
  peak: number;
  hours: number;
}

/**
 * The best run of hours between now and dawn.
 *
 * The question is never "what is the sky like at this instant" — it is
 * "is it worth going out, and when". So this finds the longest contiguous
 * stretch that stays above a usable threshold, and reports its peak. A night
 * that only clears at 3am is a different answer from one that is good all
 * evening, and a single number cannot tell them apart.
 */
export function bestWindow(hours: SkyHour[], threshold = 40): BestWindow | null {
  let best: BestWindow | null = null;
  let run: SkyHour[] = [];

  const close = () => {
    if (run.length === 0) return;
    const peak = Math.max(...run.map((h) => h.score));
    const w: BestWindow = {
      start: run[0].at,
      // The window runs to the END of its last hour, not to the start of it.
      end: new Date(run[run.length - 1].at.getTime() + 3600_000),
      peak,
      hours: run.length,
    };
    if (!best || w.hours > best.hours || (w.hours === best.hours && w.peak > best.peak)) best = w;
    run = [];
  };

  for (const h of hours) {
    if (h.score >= threshold) run.push(h); else close();
  }
  close();
  return best;
}
