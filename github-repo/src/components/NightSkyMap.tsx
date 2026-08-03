import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

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

function clarityScore(cloud: number, humidity: number, precip: number): number {
  return Math.max(0, Math.round(100 - cloud * 0.85 - Math.max(0, humidity - 60) * 0.2 - (precip > 0.1 ? 35 : 0)));
}

// Purple-focused color scale (brighter, more purple than blue)
function clarityBucket(score: number): { label: string; fill: string; stroke: string } {
  if (score >= 85) return { label: "PERFECT",   fill: "#fde047", stroke: "#ca8a04" };
  if (score >= 70) return { label: "EXCELLENT", fill: "#e879f9", stroke: "#c026d3" };
  if (score >= 55) return { label: "CLEAR",     fill: "#c084fc", stroke: "#9333ea" };
  if (score >= 35) return { label: "FAIR",      fill: "#818cf8", stroke: "#4f46e5" };
  return                   { label: "POOR",     fill: "#4c1d95", stroke: "#3b0764" };
}

// Aurora view-line latitude from Kp
const KP_VIEW: [number, number][] = [
  [0, 66], [1, 63], [2, 60], [3, 56], [4, 53], [5, 50], [6, 47], [7, 43], [8, 40], [9, 37],
];
function viewLineLat(kp: number): number {
  const k = Math.max(0, Math.min(9, kp));
  for (let i = 0; i < KP_VIEW.length - 1; i++) {
    const [k0, l0] = KP_VIEW[i], [k1, l1] = KP_VIEW[i + 1];
    if (k >= k0 && k <= k1) { const t = (k - k0) / (k1 - k0 || 1); return l0 + (l1 - l0) * t; }
  }
  return KP_VIEW[KP_VIEW.length - 1][1];
}

export const SKY_LEGEND = [
  { label: "PERFECT",   color: "#fde047" },
  { label: "EXCELLENT", color: "#e879f9" },
  { label: "CLEAR",     color: "#c084fc" },
  { label: "FAIR",      color: "#818cf8" },
  { label: "POOR",      color: "#4c1d95" },
];

export const AURORA_LEGEND = [
  { label: "Overhead",   color: "#c084fc" },
  { label: "Naked eye",  color: "#f472b6" },
  { label: "Camera",     color: "#a855f7" },
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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  // Re-draw aurora lines when Kp changes without full re-mount
  const auroraLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    // Cleanup on mode change
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      auroraLayerRef.current = null;
    }

    async function build() {
      try {
        const L = await import("leaflet");
        if (cancelled || !containerRef.current) return;

        const map = L.map(containerRef.current!, {
          center: [46, -96], zoom: 3,
          zoomControl: false, attributionControl: false, scrollWheelZoom: false,
          dragging: true,
        });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 8 }).addTo(map);
        mapRef.current = map;

        // ── Sky condition fill (stargazing + both) ──
        if (mode === "stargazing" || mode === "both") {
          const lats = STATES.map(s => s.lat).join(",");
          const lons = STATES.map(s => s.lon).join(",");
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=cloud_cover,relative_humidity_2m,precipitation&forecast_days=2&timezone=auto`;
          const [meteoRes, geoRes] = await Promise.all([
            fetch(url),
            fetch("https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json"),
          ]);
          if (cancelled) return;
          const raw = await meteoRes.json();
          const geoData = await geoRes.json();
          if (cancelled) return;

          const results: { hourly: { cloud_cover: number[]; relative_humidity_2m: number[]; precipitation: number[] } }[] =
            Array.isArray(raw) ? raw : [raw];

          const scoreMap: Record<string, number> = {};
          STATES.forEach((state, i) => {
            const r = results[i];
            if (!r?.hourly) { scoreMap[state.name] = 50; return; }
            const idxs = [nightHour, nightHour + 1, nightHour + 2, nightHour + 3];
            const avg = (arr: number[]) => {
              const vals = idxs.map(h => arr[h]).filter(v => v != null);
              return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
            };
            const cloud = avg(r.hourly.cloud_cover ?? []);
            const hum   = avg(r.hourly.relative_humidity_2m ?? []);
            const precip = Math.max(...idxs.map(h => r.hourly.precipitation?.[h] ?? 0));
            scoreMap[state.name] = clarityScore(cloud, hum, precip);
          });

          L.geoJSON(geoData, {
            style: (feature) => {
              const name = feature?.properties?.NAME ?? feature?.properties?.name ?? "";
              const score = scoreMap[name] ?? 50;
              const b = clarityBucket(score);
              return { fillColor: b.fill, fillOpacity: mode === "both" ? 0.45 : 0.72, color: b.stroke, weight: 0.8, opacity: 0.7 };
            },
            onEachFeature: (feature, layer) => {
              const name = feature?.properties?.NAME ?? feature?.properties?.name ?? "";
              const score = scoreMap[name] ?? 50;
              const b = clarityBucket(score);
              layer.bindTooltip(`${name}: ${b.label} (${score}/100)`, { direction: "center" });
            },
          }).addTo(map);
        } else {
          // Aurora-only: just fetch GeoJSON for dark outlines
          const geoRes = await fetch("https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json");
          if (cancelled) return;
          const geoData = await geoRes.json();
          if (cancelled) return;
          L.geoJSON(geoData, {
            style: () => ({ fillColor: "#1e1040", fillOpacity: 0.55, color: "#4c1d95", weight: 0.8, opacity: 0.5 }),
          }).addTo(map);
        }

        // City labels on top
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
          maxZoom: 8, pane: "shadowPane",
        }).addTo(map);

        // ── Aurora view lines (aurora + both) ──
        if (mode === "aurora" || mode === "both") {
          const W = -130, E = -58;
          const nakedLat = viewLineLat(peakKp);
          const overheadLat = viewLineLat(Math.min(9, peakKp + 1.5));
          const cameraLat  = viewLineLat(Math.max(0, peakKp - 1.5));
          const curLat     = viewLineLat(currentKp);

          const g = L.layerGroup().addTo(map);
          auroraLayerRef.current = g;

          // Aurora-possible band
          L.polygon([[nakedLat, W], [nakedLat, E], [75, E], [75, W]],
            { color: "#f472b6", weight: 0, fillColor: "#f472b6", fillOpacity: 0.10 }).addTo(g);

          // Overhead line — light purple
          L.polyline([[overheadLat, W], [overheadLat, E]], {
            color: "#c084fc", weight: 2.5, opacity: 0.95, dashArray: "4 4",
          }).addTo(g).bindTooltip(`Overhead ~${Math.round(overheadLat)}°N`, { sticky: true });

          // Naked-eye line — hot pink (peak Kp)
          L.polyline([[nakedLat, W], [nakedLat, E]], {
            color: "#f472b6", weight: 3.5, opacity: 1,
          }).addTo(g).bindTooltip(`Kp ${peakKp.toFixed(1)} naked eye ~${Math.round(nakedLat)}°N`, { sticky: true });

          // Camera line — deep purple
          L.polyline([[cameraLat, W], [cameraLat, E]], {
            color: "#a855f7", weight: 2, opacity: 0.85, dashArray: "8 5",
          }).addTo(g).bindTooltip(`Camera only ~${Math.round(cameraLat)}°N`, { sticky: true });

          // Current Kp dashed line (light purple) — only if it differs meaningfully
          if (Math.abs(curLat - nakedLat) > 0.5) {
            L.polyline([[curLat, W], [curLat, E]], {
              color: "#c084fc", weight: 2, opacity: 0.8, dashArray: "6 6",
            }).addTo(g).bindTooltip(`Now Kp ${currentKp.toFixed(1)} ~${Math.round(curLat)}°N`, { sticky: true });
          }

          // User dot
          const aboveNaked = userLat >= nakedLat;
          L.circleMarker([userLat, userLon], {
            radius: 6, color: "#fff", weight: 2,
            fillColor: aboveNaked ? "#f472b6" : "#64748b", fillOpacity: 1,
          }).addTo(g).bindTooltip(userName, { sticky: true });
        }

        if (!cancelled) setStatus("ok");
      } catch (e) {
        if (!cancelled) setStatus("error");
      }
    }

    build();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, peakKp, currentKp, userLat, userLon, nightHour]);

  const showSkyLegend  = mode === "stargazing" || mode === "both";
  const showAuroraLgnd = mode === "aurora"     || mode === "both";

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ background: "#07070F" }}>
      <div ref={containerRef} style={{ height, background: "#07070F" }} />

      {/* Legend overlay — bottom right */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-2 pointer-events-none" style={{ zIndex: 1000 }}>
        {showAuroraLgnd && (
          <div className="bg-black/80 rounded-lg px-3 py-2 space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-white/50 font-semibold mb-1">Aurora View Lines</div>
            {AURORA_LEGEND.map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <div className="w-5 h-[2px] flex-shrink-0" style={{ background: l.color }} />
                <span className="text-[10px] text-white font-semibold tracking-wide">{l.label}</span>
              </div>
            ))}
          </div>
        )}
        {showSkyLegend && (
          <div className="bg-black/80 rounded-lg px-3 py-2 space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-white/50 font-semibold mb-1">Sky Conditions</div>
            {SKY_LEGEND.map(l => (
              <div key={l.label} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: l.color }} />
                <span className="text-[10px] text-white font-semibold tracking-wide">{l.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Peak Kp badge — top left when aurora visible */}
      {(mode === "aurora" || mode === "both") && (
        <div className="absolute top-2 left-2 bg-black/80 rounded-lg px-2.5 py-1.5 pointer-events-none" style={{ zIndex: 1000 }}>
          <div className="text-[9px] uppercase tracking-[0.2em] text-white/50">Peak Kp · 3-day</div>
          <div className="text-xs font-bold" style={{ color: "#f472b6" }}>
            Kp {peakKp.toFixed(1)} · view line ~{Math.round(viewLineLat(peakKp))}°N
          </div>
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
          <div className="flex items-center gap-3 text-sm text-purple-300">
            <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            Building night sky map…
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
          Couldn't load map data. Try refreshing.
        </div>
      )}
    </div>
  );
}
