import { useState, useRef, useEffect, useMemo } from "react";
import * as maplibregl from "maplibre-gl";
import { BaseMap, type BaseMapHandle } from "../map/BaseMap";

/**
 * The climatology map, and the reasoning behind how it is smoothed.
 *
 * Lifted out of the page it was written in when that page was rebuilt. Nothing
 * about the map changed — it was the one part of the old module that was doing
 * real work, and the notes below are the record of getting it right.
 */
export const EF_COLOR: Record<number, string> = { 0: "#86efac", 1: "#fde047", 2: "#f59e0b", 3: "#f97316", 4: "#ef4444", 5: "#d946ef" };

// Density heat gradient (position 0..1 -> rgb). Cool -> hot, tuned for the dark basemap.
const HEAT_GRADIENT: [number, number[]][] = [
  [0.00, [ 30,  58,  95]],
  [0.20, [ 37,  99, 235]],
  [0.38, [  6, 182, 212]],
  [0.55, [ 34, 197,  94]],
  [0.70, [253, 224,  71]],
  [0.84, [249, 115,  22]],
  [0.93, [239,  68,  68]],
  [1.00, [217,  70, 239]],
];

/**
 * Weighting exponent applied to each grid cell before the kernels accumulate.
 * Shared with the legend below, which has to invert it to name real counts.
 */
export const HEAT_EXP = 0.7;

/** Legend rows in real tornado counts, derived from the grid's own maximum. */
export function heatLegend(max: number): { label: string; color: string }[] {
  const stops = [1, 0.72, 0.48, 0.3, 0.17, 0.08];
  const rows = stops.map((f) => {
    const g = HEAT_GRADIENT;
    let a = g[0], b = g[g.length - 1];
    for (let i = 0; i < g.length - 1; i++) if (f >= g[i][0] && f <= g[i + 1][0]) { a = g[i]; b = g[i + 1]; break; }
    const t = (f - a[0]) / ((b[0] - a[0]) || 1);
    const rgb = [0, 1, 2].map((k) => Math.round(a[1][k] + (b[1][k] - a[1][k]) * t));
    return { label: `${Math.max(1, Math.round(max * f ** (1 / HEAT_EXP)))}+`, color: `rgb(${rgb.join(",")})` };
  });
  // collapse rows that round to the same count (small grids compress the low end)
  return rows.filter((r, i) => i === 0 || r.label !== rows[i - 1].label);
}

// ─── Shared MapLibre map for density grids + tracks ──────────────────────────
const GRID_RES = 0.25; // density bin size in degrees (matches tornadoClimo.json densityRes)

/**
 * Radius of one grid cell, in screen pixels, as a function of zoom.
 *
 * The old canvas layer recomputed this on every pan by projecting two points
 * and measuring the gap. It is a closed form: web-mercator world width is
 * 512·2^z px, so 0.25° of longitude is 512·2^z·(0.25/360) px — which doubles
 * per zoom level, exactly what an exponential-base-2 interpolation expresses.
 *
 * The multiplier is 2.4 cells rather than the canvas layer's 1.35. A Gaussian
 * kernel falls to zero *at* its radius, so at 1.35 the 0.25° rows only grazed
 * one another and the field came out visibly striped along latitude. At 2.4
 * each cell reaches its second neighbour and the rows dissolve into a
 * continuous surface — which is what a climatology is.
 */
const CELL_RADIUS: maplibregl.ExpressionSpecification = [
  "interpolate", ["exponential", 2], ["zoom"],
  3, 7,
  6, 56,
  12, 56,
];

/**
 * Radius tracks cell size exactly, so the number of neighbours inside the
 * kernel is the same at every zoom and one constant intensity holds throughout.
 * 1.2 is where the Plains and Dixie cores reach the top of the ramp without the
 * merely-active parts of the Midwest saturating with them.
 */
const HEAT_INTENSITY = 1.2;

/** HEAT_GRADIENT, expressed against MapLibre's normalised heatmap-density. */
const HEAT_COLOR: maplibregl.ExpressionSpecification = [
  "interpolate", ["linear"], ["heatmap-density"],
  0, "rgba(30,58,95,0)",
  ...HEAT_GRADIENT.flatMap<number | string>(([stop, [r, g, b]]) =>
    stop === 0 ? [] : [stop, `rgb(${r},${g},${b})`]),
] as maplibregl.ExpressionSpecification;

export function ClimoMap({ mode, grid, tracks, minEF, sinceYear, height = 400 }: {
  mode: "grid" | "tracks";
  grid?: [number, number, number][];
  tracks?: [number, number, number, number, number, number][];
  minEF?: number;
  sinceYear?: number;
  height?: number;
}) {
  const handle = useRef<BaseMapHandle>(null);
  const [ready, setReady] = useState(false);

  /**
   * Grid cells as weighted points.
   *
   * The exponent is the whole character of this map. The canvas layer used a
   * square root, which was right for it — each blob was drawn once and read
   * alone. Here the kernels overlap and *sum*, so a square root double-counts
   * the low end: give a four-tornado cell 14% of a hundred-tornado cell's
   * weight and eighteen overlapping neighbours push the entire Ohio Valley to
   * the top of the ramp alongside Moore and Tuscaloosa. 0.7 keeps sparse cells
   * legible while leaving the real corridors somewhere to go.
   */
  const heat = useMemo<GeoJSON.FeatureCollection>(() => {
    const pts = grid ?? [];
    const max = pts.reduce((m, p) => (p[2] > m ? p[2] : m), 1);
    return {
      type: "FeatureCollection",
      features: pts.map(([lat, lon, v]) => ({
        type: "Feature" as const,
        properties: { w: Math.max(0.03, Math.min(1, (v / max) ** HEAT_EXP)), n: v },
        geometry: { type: "Point" as const, coordinates: [lon + GRID_RES / 2, lat + GRID_RES / 2] },
      })),
    };
  }, [grid]);

  const lines = useMemo<GeoJSON.FeatureCollection>(() => {
    const feats: GeoJSON.Feature[] = [];
    let drawn = 0;
    for (const [slat, slon, elat, elon, mag, yr] of tracks ?? []) {
      if ((minEF && mag < minEF) || (sinceYear && yr < sinceYear)) continue;
      if (drawn++ > 6000) break;
      feats.push({
        type: "Feature",
        properties: { mag, yr, label: `EF${mag} · ${yr}` },
        geometry: { type: "LineString", coordinates: [[slon, slat], [elon, elat]] },
      });
    }
    return { type: "FeatureCollection", features: feats };
  }, [tracks, minEF, sinceYear]);

  function onReady(map: maplibregl.Map, beneath: string | undefined) {
    map.addSource("climo-heat", { type: "geojson", data: heat });
    map.addLayer({
      id: "climo-heat",
      type: "heatmap",
      source: "climo-heat",
      layout: { visibility: mode === "grid" ? "visible" : "none" },
      paint: {
        "heatmap-weight": ["get", "w"],
        "heatmap-intensity": HEAT_INTENSITY,
        "heatmap-radius": CELL_RADIUS,
        "heatmap-color": HEAT_COLOR,
        "heatmap-opacity": 0.8,
      },
    }, beneath);

    map.addSource("climo-tracks", { type: "geojson", data: lines });
    map.addLayer({
      id: "climo-tracks",
      type: "line",
      source: "climo-tracks",
      layout: {
        visibility: mode === "tracks" ? "visible" : "none",
        "line-cap": "round",
        // Violent tornadoes are the reason to open this map, and there are far
        // fewer of them — without a sort key the EF2 mass buries every EF5.
        "line-sort-key": ["get", "mag"],
      },
      paint: {
        "line-color": [
          "match", ["get", "mag"],
          0, EF_COLOR[0], 1, EF_COLOR[1], 2, EF_COLOR[2],
          3, EF_COLOR[3], 4, EF_COLOR[4], 5, EF_COLOR[5],
          "#f59e0b",
        ],
        "line-width": ["case", [">=", ["get", "mag"], 4], 2.5, 1.5],
        "line-opacity": 0.8,
      },
    });

    const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    map.on("mousemove", "climo-tracks", (e) => {
      const label = e.features?.[0]?.properties?.label;
      if (typeof label !== "string") return;
      map.getCanvas().style.cursor = "pointer";
      pop.setLngLat(e.lngLat).setText(label).addTo(map);
    });
    map.on("mouseleave", "climo-tracks", () => { map.getCanvas().style.cursor = ""; pop.remove(); });

    setReady(true);
  }

  useEffect(() => {
    const map = handle.current?.map();
    if (!map || !ready) return;
    (map.getSource("climo-heat") as maplibregl.GeoJSONSource | undefined)?.setData(heat);
    (map.getSource("climo-tracks") as maplibregl.GeoJSONSource | undefined)?.setData(lines);
    map.setLayoutProperty("climo-heat", "visibility", mode === "grid" ? "visible" : "none");
    map.setLayoutProperty("climo-tracks", "visibility", mode === "tracks" ? "visible" : "none");
  }, [heat, lines, mode, ready]);

  return (
    <BaseMap
      ref={handle}
      center={{ lat: 39, lon: -97 }}
      zoom={3.6}
      height={height}
      onReady={onReady}
      className="w-full rounded-xl overflow-hidden"
    />
  );
}
