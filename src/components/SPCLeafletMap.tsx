import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { BASE_API } from "../config";

export type SPCProduct =
  | "day1otlk_cat" | "day2otlk_cat" | "day3otlk_cat"
  | "day1otlk_torn" | "day2otlk_torn"
  | "day1otlk_wind" | "day2otlk_wind"
  | "day1otlk_hail" | "day2otlk_hail";

// ─────────────────────────────────────────────────────────────────────────────
//  SSWX SPC MAP STYLING — edit colors + legend wording here.
//  (Max Velocity / Ryan Hall style: your own categorical colors + legend.)
// ─────────────────────────────────────────────────────────────────────────────

// Categorical risk colors + legend wording (TSTM = general thunder, then levels 1-5).
const CAT_COLORS: Record<string, { color: string; label: string; level: number }> = {
  TSTM:  { color: "#6b7280", label: "General Thunder",         level: 0 },
  MRGL:  { color: "#fbbf24", label: "Level 1 · Marginal",     level: 1 },
  SLGT:  { color: "#f97316", label: "Level 2 · Slight",       level: 2 },
  ENH:   { color: "#ea580c", label: "Level 3 · Enhanced",     level: 3 },
  MDT:   { color: "#dc2626", label: "Level 4 · Moderate",     level: 4 },
  HIGH:  { color: "#c026d3", label: "Level 5 · High/Extreme", level: 5 },
};

// Probabilistic risk colors (% thresholds → color). SPC labels features as
// fractions ("0.05" = 5%); we normalize to whole percent before matching.
const PROB_COLORS: { label: string; color: string; match: (v: number) => boolean }[] = [
  { label: "2%",      color: "#bbf7d0", match: (v) => v >= 2  && v < 5  },
  { label: "5%",      color: "#fef08a", match: (v) => v >= 5  && v < 10 },
  { label: "10%",     color: "#fbbf24", match: (v) => v >= 10 && v < 15 },
  { label: "15%",     color: "#f97316", match: (v) => v >= 15 && v < 30 },
  { label: "30%",     color: "#ef4444", match: (v) => v >= 30 && v < 45 },
  { label: "45%",     color: "#b91c1c", match: (v) => v >= 45 && v < 60 },
  { label: "60%+",    color: "#c026d3", match: (v) => v >= 60            },
];

// Significant-severe ("hatched") areas come through as non-numeric labels
// (e.g. "SIGN", "CIG1"). Outlined, no fill — drawn over the probability shading.
const SIG_STYLE: L.PathOptions = { fillOpacity: 0, color: "#000000", weight: 1.5, opacity: 0.85, dashArray: "4 3" };

function isCategorical(product: SPCProduct) { return product.endsWith("_cat"); }

/** SPC probability labels are fractions ("0.05"); normalize to whole percent. */
function labelToPct(label: string): number | null {
  const f = parseFloat(label);
  if (Number.isNaN(f)) return null;
  return f <= 1 ? Math.round(f * 100) : Math.round(f);
}

function styleForFeature(product: SPCProduct, feature: GeoJSON.Feature): L.PathOptions {
  if (isCategorical(product)) {
    const label = (feature.properties?.LABEL ?? "").toUpperCase();
    const cat = CAT_COLORS[label];
    if (!cat) return { fillColor: "#888", fillOpacity: 0.3, weight: 0 };
    const alpha = label === "TSTM" ? 0.25 : 0.65;
    return { fillColor: cat.color, fillOpacity: alpha, color: cat.color, weight: 0.5, opacity: 0.6 };
  }
  // Probabilistic — significant-severe hatched areas have non-numeric labels.
  const pct = labelToPct(String(feature.properties?.LABEL ?? ""));
  if (pct === null) return SIG_STYLE;
  const tier = PROB_COLORS.find(p => p.match(pct));
  const fc = tier?.color ?? "#888";
  return { fillColor: fc, fillOpacity: pct >= 10 ? 0.7 : 0.5, color: fc, weight: 0.5, opacity: 0.6 };
}

interface GeoJSONData { type: string; features: GeoJSON.Feature[] }

interface Props {
  product: SPCProduct;
  height?: number;
}

export function SPCLeafletMap({ product, height = 320 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(true);

  const loadData = async (L: typeof import("leaflet"), map: L.Map) => {
    setLoading(true); setError(null);
    // Remove old layer
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    try {
      const res = await fetch(`${BASE_API}/spc/outlook-geojson?product=${product}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: GeoJSONData = await res.json();
      const features = data.features ?? [];
      if (features.length === 0) { setHasData(false); setLoading(false); return; }
      setHasData(true);
      const layer = L.geoJSON(data as GeoJSON.GeoJsonObject, {
        style: (f) => f ? styleForFeature(product, f) : {},
      });
      layer.addTo(map);
      layerRef.current = layer;
    } catch (e) {
      setError("Could not load SPC data");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      if (mapRef.current) {
        loadData(L, mapRef.current);
        return;
      }
      const map = L.map(containerRef.current!, {
        center: [39, -97], zoom: 4,
        zoomControl: true, attributionControl: false, scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 10,
      }).addTo(map);
      mapRef.current = map;
      loadData(L, map);
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload data when product changes
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      if (mapRef.current) loadData(L, mapRef.current);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  // Build legend
  const legendItems = isCategorical(product)
    ? Object.entries(CAT_COLORS).filter(([k]) => k !== "TSTM").map(([, v]) => ({ color: v.color, label: v.label }))
    : [...PROB_COLORS.map(p => ({ color: p.color, label: p.label })), { color: "#000000", label: "Significant (hatched)" }];

  return (
    <div className="relative rounded-xl overflow-hidden border border-border">
      <div ref={containerRef} style={{ height, background: "#0a0e1a" }} />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
          <div className="flex items-center gap-2 text-sm text-primary">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading SPC data…
          </div>
        </div>
      )}
      {!loading && !hasData && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center text-sm text-muted-foreground bg-black/60 px-4 py-3 rounded-lg">
            <div className="text-2xl mb-1">🌤</div>
            No active severe weather risk at this time
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-sm text-red-400 bg-black/60 px-4 py-2 rounded">{error}</div>
        </div>
      )}
      {/* Legend */}
      {!loading && hasData && (
        <div className="absolute bottom-2 right-2 bg-black/75 rounded-lg px-3 py-2 space-y-1 pointer-events-none">
          {legendItems.map(item => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: item.color }} />
              <span className="text-[10px] text-white font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
