/**
 * Computes up to 3 "Target Area" bounding boxes from a set of GeoJSON risk
 * features -- the highest, most distinct risk clusters, for the map to fly
 * to. Only features at/above `minLevel` are considered.
 */
export interface TargetArea {
  bbox: [number, number, number, number]; // [west, south, east, north]
  maxLevel: number;
}

interface Box { west: number; south: number; east: number; north: number; maxLevel: number }

function featureBox(feature: GeoJSON.Feature): Box | null {
  const g = feature.geometry as GeoJSON.Geometry;
  const rings: number[][][][] =
    g?.type === "Polygon" ? [(g as GeoJSON.Polygon).coordinates]
    : g?.type === "MultiPolygon" ? (g as GeoJSON.MultiPolygon).coordinates
    : [];
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const poly of rings) for (const ring of poly) for (const [lon, lat] of ring) {
    if (lon < west) west = lon; if (lon > east) east = lon;
    if (lat < south) south = lat; if (lat > north) north = lat;
  }
  if (!Number.isFinite(west)) return null;
  return { west, south, east, north, maxLevel: 0 };
}

function boxesNear(a: Box, b: Box, marginDeg: number): boolean {
  return !(a.east + marginDeg < b.west || b.east + marginDeg < a.west || a.north + marginDeg < b.south || b.north + marginDeg < a.south);
}

function mergeBox(a: Box, b: Box): Box {
  return {
    west: Math.min(a.west, b.west), south: Math.min(a.south, b.south),
    east: Math.max(a.east, b.east), north: Math.max(a.north, b.north),
    maxLevel: Math.max(a.maxLevel, b.maxLevel),
  };
}

export function computeTargetAreas(
  features: GeoJSON.Feature[],
  levelOf: (f: GeoJSON.Feature) => number | "sig" | null,
  minLevel = 2,
  maxTargets = 3,
): TargetArea[] {
  let boxes: Box[] = [];
  for (const f of features) {
    const lvl = levelOf(f);
    const numeric = lvl === "sig" ? minLevel : lvl; // treat a "significant" hatch as meeting the threshold
    if (numeric === null || numeric < minLevel) continue;
    const b = featureBox(f);
    if (!b) continue;
    b.maxLevel = numeric;
    boxes.push(b);
  }
  if (boxes.length === 0) return [];

  // Greedy merge: repeatedly combine any two boxes within ~2.5 degrees of
  // each other until nothing more merges. Good enough to group a single
  // storm-risk area into one target without needing a real GIS library.
  const marginDeg = 2.5;
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxesNear(boxes[i], boxes[j], marginDeg)) {
          boxes[i] = mergeBox(boxes[i], boxes[j]);
          boxes.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }

  boxes.sort((a, b) => {
    if (b.maxLevel !== a.maxLevel) return b.maxLevel - a.maxLevel;
    const areaA = (a.east - a.west) * (a.north - a.south);
    const areaB = (b.east - b.west) * (b.north - b.south);
    return areaB - areaA;
  });

  return boxes.slice(0, maxTargets).map(b => ({ bbox: [b.west, b.south, b.east, b.north], maxLevel: b.maxLevel }));
}
