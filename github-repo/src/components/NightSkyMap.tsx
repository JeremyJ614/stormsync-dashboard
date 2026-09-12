import { useEffect, useRef, useState } from "react";
import { skyScore, skyBand, SKY_BANDS } from "../lib/stargazing";
import * as maplibregl from "maplibre-gl";
import { BaseMap, type BaseMapHandle } from "./map/BaseMap";

// State centroids for sky-condition fetch
const STATES = [
  { name: "Alabama", abbr: "AL", lat: 32.81, lon: -86.79 },
  { name: "Arizona", abbr: "AZ", lat: 33.73, lon: -111.43 },
  { name: "Arkansas", abbr: "AR", lat: 34.97, lon: -92.37 },
  { name: "California", abbr: "CA", lat: 36.12, lon: -119.68 },
  { name: "Colorado", abbr: "CO", lat: 39.06, lon: -105.31 },
  { name: "Connecticut", abbr: "CT", lat: 41.60, lon: -72.76 },
  { name: "Delaware", abbr: "DE", lat: 39.32, lon: -75.51 },
  { name: "Florida", abbr: "FL", lat: 27.77, lon: -81.69 },
  { name: "Georgia", abbr: "GA", lat: 33.04, lon: -83.64 },
  { name: "Idaho", abbr: "ID", lat: 44.24, lon: -114.48 },
  { name: "Illinois", abbr: "IL", lat: 40.35, lon: -88.99 },
  { name: "Indiana", abbr: "IN", lat: 39.85, lon: -86.26 },
  { name: "Iowa", abbr: "IA", lat: 42.01, lon: -93.21 },
  { name: "Kansas", abbr: "KS", lat: 38.53, lon: -96.73 },
  { name: "Kentucky", abbr: "KY", lat: 37.67, lon: -84.67 },
  { name: "Louisiana", abbr: "LA", lat: 31.17, lon: -91.87 },
  { name: "Maine", abbr: "ME", lat: 44.69, lon: -69.38 },
  { name: "Maryland", abbr: "MD", lat: 39.06, lon: -76.80 },
  { name: "Massachusetts", abbr: "MA", lat: 42.23, lon: -71.53 },
  { name: "Michigan", abbr: "MI", lat: 43.33, lon: -84.54 },
  { name: "Minnesota", abbr: "MN", lat: 45.69, lon: -93.90 },
  { name: "Mississippi", abbr: "MS", lat: 32.74, lon: -89.68 },
  { name: "Missouri", abbr: "MO", lat: 38.46, lon: -92.29 },
  { name: "Montana", abbr: "MT", lat: 46.92, lon: -110.45 },
  { name: "Nebraska", abbr: "NE", lat: 41.13, lon: -98.27 },
  { name: "Nevada", abbr: "NV", lat: 38.31, lon: -117.06 },
  { name: "New Hampshire", abbr: "NH", lat: 43.45, lon: -71.56 },
  { name: "New Jersey", abbr: "NJ", lat: 40.30, lon: -74.52 },
  { name: "New Mexico", abbr: "NM", lat: 34.84, lon: -106.25 },
  { name: "New York", abbr: "NY", lat: 42.17, lon: -74.95 },
  { name: "North Carolina", abbr: "NC", lat: 35.63, lon: -79.81 },
  { name: "North Dakota", abbr: "ND", lat: 47.53, lon: -99.78 },
  { name: "Ohio", abbr: "OH", lat: 40.39, lon: -82.76 },
  { name: "Oklahoma", abbr: "OK", lat: 35.57, lon: -96.93 },
  { name: "Oregon", abbr: "OR", lat: 44.57, lon: -122.07 },
  { name: "Pennsylvania", abbr: "PA", lat: 40.59, lon: -77.21 },
  { name: "Rhode Island", abbr: "RI", lat: 41.68, lon: -71.51 },
  { name: "South Carolina", abbr: "SC", lat: 33.86, lon: -80.95 },
  { name: "South Dakota", abbr: "SD", lat: 44.30, lon: -99.44 },
  { name: "Tennessee", abbr: "TN", lat: 35.75, lon: -86.69 },
  { name: "Texas", abbr: "TX", lat: 31.05, lon: -97.56 },
  { name: "Utah", abbr: "UT", lat: 40.15, lon: -111.86 },
  { name: "Vermont", abbr: "VT", lat: 44.05, lon: -72.71 },
  { name: "Virginia", abbr: "VA", lat: 37.77, lon: -78.17 },
  { name: "Washington", abbr: "WA", lat: 47.40, lon: -121.49 },
  { name: "West Virginia", abbr: "WV", lat: 38.49, lon: -80.95 },
  { name: "Wisconsin", abbr: "WI", lat: 44.27, lon: -89.62 },
  { name: "Wyoming", abbr: "WY", lat: 42.76, lon: -107.30 },
  { name: "District of Columbia", abbr: "DC", lat: 38.90, lon: -77.03 },
  { name: "Alaska", abbr: "AK", lat: 64.20, lon: -153.0 },
  { name: "Hawaii", abbr: "HI", lat: 20.80, lon: -156.0 },
];

/*
 * The per-state fill was a THIRD copy of the stargazing formula, with its own
 * constants again — humidity over 60 rather than 50, rain worth 35 rather than
 * 40. So the map and the page beside it could disagree about the same night in
 * the same place, and neither knew about the moon or about whether it was even
 * dark. Both read `skyScore` now.
 */

// Purple-focused color scale (brighter, more purple than blue)
/**
 * Per-state sky clarity for the four hours around local astronomical dark.
 *
 * Open-Meteo takes comma-joined coordinate lists, so all 50 centroids ride one
 * request rather than 50. The result is memoised for 15 minutes because this
 * map rebuilds whenever Kp ticks, and cloud cover does not move that fast.
 */
type MeteoHourly = {
  hourly?: {
    cloud_cover?: number[];
    relative_humidity_2m?: number[];
    precipitation?: number[];
    time?: string[];
  };
  utc_offset_seconds?: number;
};

const CLARITY_TTL_MS = 15 * 60 * 1000;
const clarityCache = new Map<number, { at: number; scores: Record<string, number> }>();
const clarityInflight = new Map<number, Promise<Record<string, number>>>();

async function clarityByState(nightHour: number): Promise<Record<string, number>> {
  const hit = clarityCache.get(nightHour);
  if (hit && Date.now() - hit.at < CLARITY_TTL_MS) return hit.scores;

  const pending = clarityInflight.get(nightHour);
  if (pending) return pending;

  const job = (async () => {
    const lats = STATES.map((s) => s.lat).join(",");
    const lons = STATES.map((s) => s.lon).join(",");
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}` +
      `&hourly=cloud_cover,relative_humidity_2m,precipitation&forecast_days=2&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const raw: unknown = await res.json();
    const rows: MeteoHourly[] = Array.isArray(raw) ? (raw as MeteoHourly[]) : [raw as MeteoHourly];

    const idxs = [nightHour, nightHour + 1, nightHour + 2, nightHour + 3];
    const scores: Record<string, number> = {};

    STATES.forEach((state, i) => {
      const h = rows[i]?.hourly;
      if (!h) { scores[state.name] = 50; return; }
      /*
       * Each state is scored at its OWN clock and its OWN sky.
       *
       * `hourly.time` comes back as local wall-clock for that coordinate, and
       * each row carries the offset that made it — so the real instant is the
       * stamp read as UTC, minus the offset. Without that the moon and the sun
       * would be placed by somebody else's clock, and on a map spanning four
       * time zones that is the difference between dusk and midnight.
       */
      const offset = (rows[i] as { utc_offset_seconds?: number })?.utc_offset_seconds ?? 0;
      const instant = (k: number): Date | null => {
        const stamp = h.time?.[k];
        return stamp ? new Date(Date.parse(`${stamp}:00Z`) - offset * 1000) : null;
      };
      const hourScores = idxs.map((k) => {
        const at = instant(k);
        if (!at) return null;
        return skyScore({
          at, lat: state.lat, lon: state.lon,
          cloudPct: h.cloud_cover?.[k] ?? 50,
          humidityPct: h.relative_humidity_2m?.[k] ?? 60,
          precipIn: h.precipitation?.[k] ?? 0,
        }).score;
      }).filter((v): v is number => v !== null);
      // The BEST of the four hours, not the average: the question is whether
      // there is a window worth going out for, and averaging a clear 2am into
      // a cloudy 10pm answers a question nobody asked.
      scores[state.name] = hourScores.length ? Math.max(...hourScores) : 50;
    });

    clarityCache.set(nightHour, { at: Date.now(), scores });
    return scores;
  })();

  clarityInflight.set(nightHour, job);
  try {
    return await job;
  } finally {
    clarityInflight.delete(nightHour);
  }
}

function clarityBucket(score: number): { label: string; fill: string; stroke: string } {
  const b = skyBand(score);
  return { label: b.text, fill: b.color, stroke: b.stroke };
}

// Aurora view-line latitude from Kp
const KP_VIEW: [number, number][] = [
  [0, 66], [1, 63], [2, 60], [3, 56], [4, 53], [5, 50], [6, 47], [7, 43], [8, 40], [9, 37],
];
/**
 * The latitude a naked-eye aurora reaches at a given Kp.
 *
 * Exported so the page's latitude ladder and the map's view lines cannot
 * disagree — two versions of this table drifting apart is exactly the sort of
 * thing that makes a dashboard contradict itself.
 */
export function viewLineLat(kp: number): number {
  const k = Math.max(0, Math.min(9, kp));
  for (let i = 0; i < KP_VIEW.length - 1; i++) {
    const [k0, l0] = KP_VIEW[i], [k1, l1] = KP_VIEW[i + 1];
    if (k >= k0 && k <= k1) { const t = (k - k0) / (k1 - k0 || 1); return l0 + (l1 - l0) * t; }
  }
  return KP_VIEW[KP_VIEW.length - 1][1];
}

// Each entry carries BOTH colors (map fill + outline) so the single unified
// legend can show them side-by-side against the label.
export const SKY_LEGEND = SKY_BANDS.map((b) => ({
  label: b.text, color: b.color, stroke: b.stroke, range: b.range,
}));

export const AURORA_LEGEND = [
  { label: "OVERHEAD",    color: "#c084fc", stroke: "#7e22ce" },
  { label: "NAKED EYE",   color: "#f472b6", stroke: "#be185d" },
  { label: "CAMERA ONLY", color: "#a855f7", stroke: "#6b21a8" },
];

type MapMode = "stargazing" | "aurora" | "both";

interface Props {
  mode: MapMode;
  peakKp?: number;
  currentKp?: number;
  userLat?: number;
  userLon?: number;
  userName?: string;
  height?: number;
  nightHour?: number;
}

export function NightSkyMap({
  mode,
  peakKp = 2,
  currentKp = 2,
  userLat = 39,
  userLon = -98,
  userName = "Your Location",
  height = 360,
  nightHour = 22,
}: Props) {
  const handle = useRef<BaseMapHandle>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const ready = useRef(false);

  /**
   * Draws both halves of this map: per-state sky clarity, and the aurora view
   * lines. Migrated off Leaflet onto the shared MapLibre BaseMap — the geometry
   * and the science are unchanged, but the fills now sit *beneath* the
   * coastlines and labels instead of over them, so the map stays readable.
   */
  async function build(map: maplibregl.Map, beneath: string | undefined) {
    setStatus("loading");
    try {
      const W = -130, E = -58;

      // ── states, coloured by sky clarity ──────────────────────────────────
      const geoRes = await fetch("https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json");
      const geoData: GeoJSON.FeatureCollection = await geoRes.json();

      if (mode === "stargazing" || mode === "both") {
        const scoreMap = await clarityByState(nightHour);
        for (const f of geoData.features) {
          const name = String((f.properties as Record<string, unknown>)?.NAME ?? (f.properties as Record<string, unknown>)?.name ?? "");
          const score = scoreMap[name] ?? 50;
          const b = clarityBucket(score);
          f.properties = { ...(f.properties ?? {}), name, score, fill: b.fill, stroke: b.stroke, label: `${name}: ${b.label} (${score}/100)` };
        }
      } else {
        for (const f of geoData.features) {
          f.properties = { ...(f.properties ?? {}), fill: "#1e1040", stroke: "#4c1d95", label: "" };
        }
      }

      upsertGeo(map, "sky-states", geoData);
      addOnce(map, {
        id: "sky-fill", type: "fill", source: "sky-states",
        paint: { "fill-color": ["get", "fill"], "fill-opacity": mode === "both" ? 0.45 : 0.7 },
      }, beneath);
      addOnce(map, {
        id: "sky-line", type: "line", source: "sky-states",
        paint: { "line-color": ["get", "stroke"], "line-width": 0.8, "line-opacity": 0.7 },
      }, beneath);

      // ── aurora view lines ────────────────────────────────────────────────
      if (mode === "aurora" || mode === "both") {
        const nakedLat = viewLineLat(peakKp);
        // North to south: overhead, then the naked-eye view line, then the
        // stretch only a long exposure reaches. These two were the other way
        // round — the map had "camera only" drawn NORTH of the naked-eye line
        // and "overhead" south of it, which is backwards in both directions.
        // The oval expands equatorward as Kp climbs, so being under it takes a
        // higher latitude than seeing it on the horizon does, and a camera
        // reaches further south than the eye, not less far.
        const overheadLat = viewLineLat(Math.max(0, peakKp - 1.5));
        const cameraLat = viewLineLat(Math.min(9, peakKp + 1.5));
        const curLat = viewLineLat(currentKp);

        const line = (lat: number, color: string, width: number, dash: number[] | null, label: string, kind: string): GeoJSON.Feature => ({
          type: "Feature",
          properties: { color, width, label, kind, dashed: dash ? 1 : 0 },
          geometry: { type: "LineString", coordinates: [[W, lat], [E, lat]] },
        });

        const feats: GeoJSON.Feature[] = [
          { type: "Feature", properties: { kind: "band" },
            geometry: { type: "Polygon", coordinates: [[[W, nakedLat], [E, nakedLat], [E, 75], [W, 75], [W, nakedLat]]] } },
          line(overheadLat, "#c084fc", 2.5, [2, 2], `Overhead ~${Math.round(overheadLat)}°N`, "dash"),
          line(nakedLat, "#f472b6", 3.5, null, `Kp ${peakKp.toFixed(1)} naked eye ~${Math.round(nakedLat)}°N`, "solid"),
          line(cameraLat, "#a855f7", 2, [4, 2.5], `Camera only ~${Math.round(cameraLat)}°N`, "dash"),
          ...(Math.abs(curLat - nakedLat) > 0.5
            ? [line(curLat, "#c084fc", 2, [3, 3], `Now Kp ${currentKp.toFixed(1)} ~${Math.round(curLat)}°N`, "dash")]
            : []),
          { type: "Feature",
            properties: { kind: "you", color: userLat >= nakedLat ? "#f472b6" : "#64748b", label: userName },
            geometry: { type: "Point", coordinates: [userLon, userLat] } },
        ];

        upsertGeo(map, "aurora", { type: "FeatureCollection", features: feats });
        addOnce(map, { id: "aurora-band", type: "fill", source: "aurora",
          filter: ["==", ["get", "kind"], "band"],
          paint: { "fill-color": "#f472b6", "fill-opacity": 0.1 } }, beneath);
        addOnce(map, { id: "aurora-solid", type: "line", source: "aurora",
          filter: ["==", ["get", "kind"], "solid"],
          paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": 1 } });
        addOnce(map, { id: "aurora-dash", type: "line", source: "aurora",
          filter: ["==", ["get", "kind"], "dash"],
          paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": 0.88, "line-dasharray": [3, 3] } });
        addOnce(map, { id: "aurora-you", type: "circle", source: "aurora",
          filter: ["==", ["get", "kind"], "you"],
          paint: { "circle-radius": 6, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      }

      attachTooltip(map, ["sky-fill", "aurora-solid", "aurora-dash", "aurora-you"]);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    const m = handle.current?.map();
    if (m && ready.current) void build(m, undefined);
     
  }, [mode, peakKp, currentKp, userLat, userLon, nightHour]);

  return (
    <div className="relative">
      <BaseMap
        ref={handle}
        center={{ lat: 47, lon: -96 }}
        zoom={2.7}
        height={height}
        onReady={(m, beneath) => { ready.current = true; void build(m, beneath); }}
      />
      {status === "loading" && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none text-xs text-muted-foreground">
          Reading the sky…
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none text-xs text-red-300">
          Could not load the sky map.
        </div>
      )}
    </div>
  );
}

// ── small MapLibre helpers ───────────────────────────────────────────────────
function upsertGeo(map: maplibregl.Map, id: string, data: GeoJSON.FeatureCollection) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(data);
  else map.addSource(id, { type: "geojson", data });
}

function addOnce(map: maplibregl.Map, layer: maplibregl.LayerSpecification, beneath?: string) {
  if (map.getLayer(layer.id)) return;
  map.addLayer(layer, beneath);
}

/** One shared hover tooltip across every layer that carries a `label`. */
function attachTooltip(map: maplibregl.Map, layers: string[]) {
  const pop = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
  for (const id of layers) {
    if (!map.getLayer(id)) continue;
    map.on("mousemove", id, (e) => {
      const lab = e.features?.[0]?.properties?.label;
      if (typeof lab !== "string" || !lab) return;
      map.getCanvas().style.cursor = "pointer";
      pop.setLngLat(e.lngLat).setText(lab).addTo(map);
    });
    map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; pop.remove(); });
  }
}

export default NightSkyMap;
