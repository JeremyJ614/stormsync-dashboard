export function windComponents(speedKnots: number, dirDeg: number): [number, number] {
  const rad = (dirDeg * Math.PI) / 180;
  const u = -speedKnots * Math.sin(rad);
  const v = -speedKnots * Math.cos(rad);
  return [u, v];
}

export function windSpeed(u: number, v: number): number {
  return Math.sqrt(u * u + v * v);
}

export function windDir(u: number, v: number): number {
  let dir = (Math.atan2(-u, -v) * 180) / Math.PI;
  if (dir < 0) dir += 360;
  return dir;
}

export function mpsToKnots(mps: number): number {
  return mps * 1.94384;
}

export function knotsToMps(kts: number): number {
  return kts / 1.94384;
}

export function metersToFeet(m: number): number {
  return m * 3.28084;
}

function estimateStormMotion(
  u500: number, v500: number,
  u850: number, v850: number,
  u925: number, v925: number
): [number, number] {
  const uMean = (u500 + u850 + u925) / 3;
  const vMean = (v500 + v850 + v925) / 3;
  const spd = Math.sqrt(uMean * uMean + vMean * vMean);
  if (spd < 0.5) return [2.5, 2.5];
  const angle = Math.atan2(uMean, vMean) + (30 * Math.PI) / 180;
  const devSpd = Math.min(7.5, spd * 0.4);
  return [uMean + devSpd * Math.sin(angle), vMean + devSpd * Math.cos(angle)];
}

export interface WindLevel {
  u: number;
  v: number;
}

export function calculateSRH(levels: WindLevel[], stormU: number, stormV: number): number {
  let srh = 0;
  for (let i = 0; i < levels.length - 1; i++) {
    const ui = levels[i].u - stormU;
    const vi = levels[i].v - stormV;
    const ui1 = levels[i + 1].u - stormU;
    const vi1 = levels[i + 1].v - stormV;
    srh += ui * vi1 - ui1 * vi;
  }
  return Math.abs(srh);
}

export function computeSRHFromProfile(
  ws10m: number, wd10m: number,
  ws925: number, wd925: number,
  ws850: number, wd850: number,
  ws700: number, wd700: number,
  ws500: number, wd500: number
): number {
  const [u10, v10] = windComponents(mpsToKnots(ws10m), wd10m);
  const [u925, v925] = windComponents(mpsToKnots(ws925), wd925);
  const [u850, v850] = windComponents(mpsToKnots(ws850), wd850);
  const [u700, v700] = windComponents(mpsToKnots(ws700), wd700);
  const [u500, v500] = windComponents(mpsToKnots(ws500), wd500);

  const [stormU, stormV] = estimateStormMotion(u500, v500, u850, v850, u925, v925);

  const layers03km: WindLevel[] = [
    { u: u10, v: v10 },
    { u: u925, v: v925 },
    { u: u850, v: v850 },
    { u: u700, v: v700 },
  ];

  return calculateSRH(layers03km, stormU, stormV);
}

export function compute06kmShear(
  ws10m: number, wd10m: number,
  ws500: number, wd500: number
): number {
  const [u10, v10] = windComponents(mpsToKnots(ws10m), wd10m);
  const [u500, v500] = windComponents(mpsToKnots(ws500), wd500);
  return windSpeed(u500 - u10, v500 - v10);
}

export function dewPoint(tempC: number, rh: number): number {
  const a = 17.625;
  const b = 243.04;
  const alpha = (a * tempC) / (b + tempC) + Math.log(rh / 100);
  return (b * alpha) / (a - alpha);
}

export function heatIndex(tempF: number, rh: number): number {
  if (tempF < 80) return tempF;
  const hi =
    -42.379 +
    2.04901523 * tempF +
    10.14333127 * rh -
    0.22475541 * tempF * rh -
    0.00683783 * tempF * tempF -
    0.05481717 * rh * rh +
    0.00122874 * tempF * tempF * rh +
    0.00085282 * tempF * rh * rh -
    0.00000199 * tempF * tempF * rh * rh;
  return hi;
}

export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

export function fToC(f: number): number {
  return ((f - 32) * 5) / 9;
}

export interface SWTIInputs {
  cape: number;
  srh: number;
  shear06km: number;
  liftedIndex: number;
  dewPointC: number;
}

/**
 * One ingredient's contribution to the index.
 *
 * The five sub-scores were computed and then thrown away, leaving a 0-100
 * number with no way to see what built it — so a 40 from deep instability and
 * no turning read identically to a 40 from strong shear over nothing. They are
 * returned now, with the measurement each came from, so the page can show why
 * the index is what it is instead of asserting it.
 */
export interface SWTIPart {
  key: "cape" | "srh" | "shear" | "li" | "dew";
  label: string;
  /** Points contributed, and the most this ingredient can ever contribute. */
  score: number;
  max: number;
  /** The measurement itself, and what it is measured in. */
  value: number;
  unit: string;
  color: string;
}

export interface SWTIResult {
  score: number;
  parts: SWTIPart[];
  tornadoRisk: "none" | "marginal" | "slight" | "moderate" | "high" | "violent";
  hailRisk: "none" | "small" | "large" | "giant";
  windRisk: "none" | "marginal" | "significant";
  label: string;
  color: string;
}

export function computeSWTI(inputs: SWTIInputs): SWTIResult {
  const { cape, srh, shear06km, liftedIndex, dewPointC } = inputs;

  let capeScore = 0;
  if (cape >= 4000) capeScore = 30;
  else if (cape >= 3000) capeScore = 24;
  else if (cape >= 2000) capeScore = 18;
  else if (cape >= 1500) capeScore = 14;
  else if (cape >= 1000) capeScore = 10;
  else if (cape >= 500) capeScore = 5;
  else capeScore = 0;

  let srhScore = 0;
  if (srh >= 500) srhScore = 30;
  else if (srh >= 400) srhScore = 25;
  else if (srh >= 300) srhScore = 20;
  else if (srh >= 200) srhScore = 14;
  else if (srh >= 150) srhScore = 10;
  else if (srh >= 100) srhScore = 6;
  else if (srh >= 50) srhScore = 3;
  else srhScore = 0;

  let shearScore = 0;
  if (shear06km >= 60) shearScore = 20;
  else if (shear06km >= 50) shearScore = 16;
  else if (shear06km >= 40) shearScore = 13;
  else if (shear06km >= 30) shearScore = 10;
  else if (shear06km >= 20) shearScore = 6;
  else if (shear06km >= 10) shearScore = 3;
  else shearScore = 0;

  let liScore = 0;
  if (liftedIndex <= -8) liScore = 12;
  else if (liftedIndex <= -6) liScore = 10;
  else if (liftedIndex <= -4) liScore = 8;
  else if (liftedIndex <= -2) liScore = 6;
  else if (liftedIndex <= 0) liScore = 3;
  else liScore = 0;

  let dewScore = 0;
  if (dewPointC >= 22) dewScore = 8;
  else if (dewPointC >= 19) dewScore = 6;
  else if (dewPointC >= 16) dewScore = 4;
  else if (dewPointC >= 13) dewScore = 2;
  else dewScore = 0;

  const score = capeScore + srhScore + shearScore + liScore + dewScore;

  let tornadoRisk: SWTIResult["tornadoRisk"];
  if (score >= 90 && srh >= 400 && cape >= 3000) tornadoRisk = "violent";
  else if (score >= 70 && srh >= 300 && cape >= 2000) tornadoRisk = "high";
  else if (score >= 50 && srh >= 200 && cape >= 1500) tornadoRisk = "moderate";
  else if (score >= 35 && srh >= 100 && cape >= 1000) tornadoRisk = "slight";
  else if (score >= 20 && (srh >= 50 || cape >= 500)) tornadoRisk = "marginal";
  else tornadoRisk = "none";

  let hailRisk: SWTIResult["hailRisk"];
  if (cape >= 4000 && shear06km >= 50) hailRisk = "giant";
  else if (cape >= 2500 && shear06km >= 35) hailRisk = "large";
  else if (cape >= 1000 && shear06km >= 20) hailRisk = "small";
  else hailRisk = "none";

  let windRisk: SWTIResult["windRisk"];
  if (cape >= 2000 && shear06km >= 40 && liftedIndex <= -4) windRisk = "significant";
  else if (cape >= 1000 && shear06km >= 25) windRisk = "marginal";
  else windRisk = "none";

  const riskLabels: Record<SWTIResult["tornadoRisk"], string> = {
    none: "No Risk",
    marginal: "Marginal",
    slight: "Slight",
    moderate: "Moderate",
    high: "High",
    violent: "Violent",
  };

  const riskColors: Record<SWTIResult["tornadoRisk"], string> = {
    none: "#4ade80",
    marginal: "#86efac",
    slight: "#fde047",
    moderate: "#fb923c",
    high: "#ef4444",
    violent: "#d946ef",
  };

  const parts: SWTIPart[] = [
    { key: "cape",  label: "Instability",  score: capeScore,  max: 30, value: cape,        unit: "J/kg",  color: "#ef4444" },
    { key: "srh",   label: "Helicity",     score: srhScore,   max: 30, value: srh,         unit: "m²/s²", color: "#a855f7" },
    { key: "shear", label: "Shear",        score: shearScore, max: 20, value: shear06km,   unit: "kt",    color: "#38bdf8" },
    { key: "li",    label: "Lifted index", score: liScore,    max: 12, value: liftedIndex, unit: "°C",    color: "#fbbf24" },
    { key: "dew",   label: "Moisture",     score: dewScore,   max: 8,  value: dewPointC,   unit: "°C",    color: "#4ade80" },
  ];

  return {
    score: Math.min(100, score),
    parts,
    tornadoRisk,
    hailRisk,
    windRisk,
    label: riskLabels[tornadoRisk],
    color: riskColors[tornadoRisk],
  };
}

/**
 * The ingredient holding the index back, in plain words.
 *
 * A composite number tells you how bad, never why. Storms need fuel AND turning
 * AND a way to organise, and which one is missing is the whole story — 2,500
 * J/kg with no shear is a pulse thunderstorm, and 60 knots of shear over
 * nothing is a windy afternoon. This names the weakest link by how much of its
 * own ceiling it reached, not by raw points, because the ceilings differ.
 */
export function swtiReading(r: SWTIResult): string {
  const scored = r.parts.filter((p) => p.max > 0);
  if (r.score === 0) {
    return "Nothing is in place for storms right now — no meaningful instability, and no wind structure to organise any.";
  }
  const filled = [...scored].sort((a, b) => b.score / b.max - a.score / a.max);
  const best = filled[0], worst = filled[filled.length - 1];
  const pct = (p: SWTIPart) => Math.round((p.score / p.max) * 100);
  if (worst.score === 0) {
    return `${best.label.toLowerCase()} is the strongest ingredient at ${pct(best)}% of its scale, but ${worst.label.toLowerCase()} is contributing nothing — which is what caps this at ${r.score}.`;
  }
  return `${best.label.toLowerCase()} leads at ${pct(best)}% of its scale and ${worst.label.toLowerCase()} lags at ${pct(worst)}%, for ${r.score} of 100.`;
}

export function getWindDirection(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function mphToKnots(mph: number): number {
  return mph * 0.868976;
}

export function knotsToMph(kts: number): number {
  return kts * 1.15078;
}

export function msToMph(ms: number): number {
  return ms * 2.23694;
}

export function pressureTendency(pressures: number[]): "rising" | "falling" | "steady" {
  if (pressures.length < 2) return "steady";
  const delta = pressures[pressures.length - 1] - pressures[0];
  if (delta > 0.5) return "rising";
  if (delta < -0.5) return "falling";
  return "steady";
}

export function thunderstormPotential(cape: number, li: number, srh: number): number {
  let score = 0;
  if (cape > 1000) score += 30;
  if (cape > 2000) score += 20;
  if (li < -2) score += 20;
  if (li < -4) score += 10;
  if (srh > 150) score += 10;
  if (srh > 300) score += 10;
  return Math.min(100, score);
}

export function probabilityOfTornado(swti: SWTIResult): number {
  const riskMap: Record<SWTIResult["tornadoRisk"], number> = {
    none: 0,
    marginal: 5,
    slight: 15,
    moderate: 30,
    high: 55,
    violent: 80,
  };
  return riskMap[swti.tornadoRisk];
}

export function visibilityDescription(visibilityMeters: number): string {
  const miles = visibilityMeters / 1609.34;
  if (miles >= 10) return "Excellent";
  if (miles >= 7) return "Good";
  if (miles >= 5) return "Fair";
  if (miles >= 3) return "Moderate";
  if (miles >= 1) return "Poor";
  return "Very Poor";
}
