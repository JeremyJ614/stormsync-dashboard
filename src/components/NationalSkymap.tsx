import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

// 51 state centroids (50 states + DC) for Open-Meteo batch call
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

function clarityBucket(score: number): { label: string; fill: string; stroke: string } {
  if (score >= 85) return { label: "PRISTINE",  fill: "#fbbf24", stroke: "#d97706" };
  if (score >= 70) return { label: "EXCELLENT", fill: "#4ade80", stroke: "#16a34a" };
  if (score >= 55) return { label: "CLEAR",     fill: "#22d3ee", stroke: "#0891b2" };
  if (score >= 35) return { label: "FAIR",      fill: "#818cf8", stroke: "#4f46e5" };
  return                   { label: "HAZY",     fill: "#a78bfa", stroke: "#7c3aed" };
}

const LEGEND = [
  { label: "PRISTINE",  color: "#fbbf24" },
  { label: "EXCELLENT", color: "#4ade80" },
  { label: "CLEAR",     color: "#22d3ee" },
  { label: "FAIR",      color: "#818cf8" },
  { label: "HAZY",      color: "#a78bfa" },
];

interface Props { nightHour?: number } // which forecast hour to use (default 22 = 10pm)

export function NationalSkymap({ nightHour = 22 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function build() {
      try {
        // Batch Open-Meteo call for all states
        const lats = STATES.map(s => s.lat).join(",");
        const lons = STATES.map(s => s.lon).join(",");
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=cloud_cover,relative_humidity_2m,precipitation&forecast_days=2&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("open-meteo");
        const raw = await res.json();
        const results: { hourly: { cloud_cover: number[]; relative_humidity_2m: number[]; precipitation: number[] } }[] =
          Array.isArray(raw) ? raw : [raw];
        if (cancelled) return;

        // Build score map: state name → score
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

        if (cancelled) return;

        // Fetch US states GeoJSON
        const geoRes = await fetch("https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json");
        if (!geoRes.ok) throw new Error("geojson");
        const geoData = await geoRes.json();
        if (cancelled) return;

        const L = await import("leaflet");
        if (cancelled || !containerRef.current || mapRef.current) return;

        const map = L.map(containerRef.current!, {
          center: [39.5, -98], zoom: 4,
          zoomControl: false, attributionControl: false, scrollWheelZoom: false,
          dragging: true,
        });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
          maxZoom: 8,
        }).addTo(map);
        mapRef.current = map;

        L.geoJSON(geoData, {
          style: (feature) => {
            const name = feature?.properties?.NAME ?? feature?.properties?.name ?? "";
            const score = scoreMap[name] ?? 50;
            const bucket = clarityBucket(score);
            return {
              fillColor: bucket.fill,
              fillOpacity: 0.72,
              color: bucket.stroke,
              weight: 0.8,
              opacity: 0.7,
            };
          },
          onEachFeature: (feature, layer) => {
            const name = feature?.properties?.NAME ?? feature?.properties?.name ?? "";
            const score = scoreMap[name] ?? 50;
            const bucket = clarityBucket(score);
            layer.bindTooltip(`${name}: ${bucket.label} (${score}/100)`, { direction: "center", permanent: false });
          },
        }).addTo(map);

        // Add city name labels layer on top
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
          maxZoom: 8, pane: "shadowPane",
        }).addTo(map);

        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    build();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [nightHour]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[rgba(34,211,238,0.3)] bg-[#07070F]"
      style={{ boxShadow: "0 0 40px rgba(34,211,238,0.12)" }}>
      <div ref={containerRef} style={{ height: 340, background: "#07070F" }} />

      {/* Legend overlay — bottom right like Ryan Hall */}
      <div className="absolute bottom-3 right-3 bg-black/80 rounded-lg px-3 py-2 space-y-1 pointer-events-none">
        <div className="text-[9px] uppercase tracking-[0.12em] text-white/50 font-semibold mb-1">KEY</div>
        {LEGEND.map(l => (
          <div key={l.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: l.color }} />
            <span className="text-[10px] text-white font-semibold tracking-wide">{l.label}</span>
          </div>
        ))}
      </div>

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
          <div className="flex items-center gap-3 text-sm text-cyan-300">
            <div className="w-4 h-4 border-2 border-cyan-300 border-t-transparent rounded-full animate-spin" />
            Building tonight's national sky map…
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
          Couldn't load the national sky map. Try refreshing.
        </div>
      )}
    </div>
  );
}
