import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { BASE_API } from "../config";

export type SPCProduct =
  | "day1otlk_cat" | "day2otlk_cat" | "day3otlk_cat"
  | "day1otlk_torn" | "day2otlk_torn"
  | "day1otlk_wind" | "day2otlk_wind"
  | "day1otlk_hail" | "day2otlk_hail";

// ─────────────────────────────────────────────────────────────────────────────
//  SSWX SPC MAP STYLING — your colors + legend words live here.
//  Categorical "Severe Weather" uses levels 0-5; hazard Likelihood maps use 1-5.
// ─────────────────────────────────────────────────────────────────────────────
interface Level { color: string; label: string }
const LEVELS: Level[] = [
  { color: "#D9D9D9", label: "Lvl. 0 Minor Convection" },          // Platinum (TSTM, categorical only)
  { color: "#8FAEC0", label: "Lvl. 1 Unorganized" },              // Pewter Blue
  { color: "#253559", label: "Lvl. 2 Escalating Baseline" },      // Winter Blue
  { color: "#CBA135", label: "Lvl. 3 Intensified Multi-Hazard" }, // Satin Sheet Gold
  { color: "#FA003F", label: "Lvl. 4 Destructive Apex Threat" },  // Rose Red
  { color: "#1E1B29", label: "Lvl. 5 Lethal Historic Catastrophe" }, // Near-black (lifted so it reads on the dark map)
];
// Level 5 is near-black; use a lighter tint for its text on dark UI chrome.
const L5_TEXT = "#BBB7CC";

const CAT_LEVEL: Record<string, number> = { TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5 };

function isCategorical(product: SPCProduct) { return product.endsWith("_cat"); }
function hazardOf(product: SPCProduct): "cat" | "torn" | "wind" | "hail" {
  const m = product.match(/_(cat|torn|wind|hail)$/);
  return (m?.[1] as "cat" | "torn" | "wind" | "hail") ?? "cat";
}

/** SPC probability labels are fractions ("0.05" = 5%); normalize to whole percent. */
function labelToPct(label: string): number | null {
  const f = parseFloat(label);
  if (Number.isNaN(f)) return null;
  return f <= 1 ? Math.round(f * 100) : Math.round(f);
}

/** SPC probability band → SSWX 1-5 level (tornado bands differ from wind/hail). */
function probToLevel(hazard: "torn" | "wind" | "hail", pct: number): number {
  if (hazard === "torn") {
    if (pct >= 30) return 5; if (pct >= 15) return 4; if (pct >= 10) return 3; if (pct >= 5) return 2; return 1;
  }
  if (pct >= 60) return 5; if (pct >= 45) return 4; if (pct >= 30) return 3; if (pct >= 15) return 2; return 1;
}

/** A feature's SSWX level, or "sig" for significant-severe (hatched) areas. */
function featureLevel(product: SPCProduct, feature: GeoJSON.Feature): number | "sig" {
  const label = String(feature.properties?.LABEL ?? "");
  if (isCategorical(product)) return CAT_LEVEL[label.toUpperCase()] ?? 0;
  const pct = labelToPct(label);
  if (pct === null) return "sig";
  return probToLevel(hazardOf(product) as "torn" | "wind" | "hail", pct);
}

function styleForFeature(product: SPCProduct, feature: GeoJSON.Feature, dominant: string): L.PathOptions {
  const lvl = featureLevel(product, feature);
  // Significant-severe → glowing neon border in the dominant categorical color.
  if (lvl === "sig") {
    return { fillColor: dominant, fillOpacity: 0, color: dominant, weight: 2.5, opacity: 1, className: "spc-neon" };
  }
  const L = LEVELS[lvl];
  // Level 5 → one plain near-black fill, no border.
  if (lvl === 5) {
    return { fillColor: L.color, fillOpacity: 0.9, color: L.color, weight: 0, opacity: 0 };
  }
  const dark = lvl === 2 || lvl === 0;
  return {
    fillColor: L.color,
    fillOpacity: lvl === 0 ? 0.32 : dark ? 0.72 : 0.6,
    color: L.color, weight: 1, opacity: 0.95, className: "spc-soft",
  };
}

interface GeoJSONData { type: string; features: GeoJSON.Feature[] }
interface Props { product: SPCProduct; height?: number }

export function SPCLeafletMap({ product, height = 340 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(true);
  const [topLevel, setTopLevel] = useState<number>(0);

  const loadData = async (L: typeof import("leaflet"), map: L.Map) => {
    setLoading(true); setError(null);
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    try {
      const res = await fetch(`${BASE_API}/spc/outlook-geojson?product=${product}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data: GeoJSONData = await res.json();
      const features = data.features ?? [];
      if (features.length === 0) { setHasData(false); setLoading(false); return; }
      setHasData(true);
      let maxLvl = 0;
      for (const f of features) { const l = featureLevel(product, f); if (typeof l === "number" && l > maxLvl) maxLvl = l; }
      setTopLevel(maxLvl);
      const dominant = LEVELS[maxLvl].color;
      const layer = L.geoJSON(data as GeoJSON.GeoJsonObject, { style: (f) => f ? styleForFeature(product, f, dominant) : {} });
      layer.addTo(map);
      layerRef.current = layer;
    } catch {
      setError("Could not load SPC data");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      if (mapRef.current) { loadData(L, mapRef.current); return; }
      const map = L.map(containerRef.current!, {
        center: [39, -97], zoom: 4, zoomControl: true, attributionControl: false, scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 10 }).addTo(map);
      mapRef.current = map;
      loadData(L, map);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => { if (mapRef.current) loadData(L, mapRef.current); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  const cat = isCategorical(product);
  const legendLevels = cat ? LEVELS.map((v, i) => ({ ...v, i })) : LEVELS.map((v, i) => ({ ...v, i })).slice(1);
  const readoutColor = topLevel === 5 ? L5_TEXT : LEVELS[topLevel].color;

  return (
    <div className="relative rounded-xl overflow-hidden border border-border">
      <style>{`
        .spc-soft { filter: drop-shadow(0 0 2px rgba(255,255,255,.25)); }
        .spc-neon { filter: drop-shadow(0 0 3px rgba(255,255,255,.55)) drop-shadow(0 0 6px rgba(255,255,255,.4)); }
      `}</style>

      <div ref={containerRef} style={{ height, background: "#0a0e1a" }} />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none" style={{ zIndex: 1000 }}>
          <div className="flex items-center gap-2 text-sm text-primary">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading SPC data…
          </div>
        </div>
      )}
      {!loading && !hasData && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 1000 }}>
          <div className="text-center text-sm text-muted-foreground bg-black/60 px-4 py-3 rounded-lg">
            <div className="text-2xl mb-1">🌤</div>
            No active severe weather risk at this time
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 1000 }}>
          <div className="text-sm text-red-400 bg-black/60 px-4 py-2 rounded">{error}</div>
        </div>
      )}

      {/* Highest-risk readout */}
      {!loading && hasData && (
        <div className="absolute top-2 right-2 bg-black/75 rounded-lg px-2.5 py-1.5 pointer-events-none" style={{ zIndex: 1000 }}>
          <div className="text-[9px] uppercase tracking-[0.25em] text-white/60">Highest Risk</div>
          <div className="text-xs font-bold" style={{ color: readoutColor }}>{LEVELS[topLevel].label}</div>
        </div>
      )}

      {/* Legend */}
      {!loading && hasData && (
        <div className="absolute bottom-2 right-2 bg-black/80 rounded-lg px-3 py-2 space-y-1 pointer-events-none" style={{ zIndex: 1000 }}>
          <div className="text-[9px] uppercase tracking-[0.2em] text-white/55 mb-1">
            {cat ? "Threat Level" : `${hazardOf(product) === "torn" ? "Tornado" : hazardOf(product) === "wind" ? "Wind" : "Hail"} Likelihood`}
          </div>
          {legendLevels.map(item => (
            <div key={item.i} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: item.color, outline: item.i === 5 ? "1px solid rgba(255,255,255,.25)" : undefined }} />
              <span className="text-[10px] text-white font-medium">{item.label}</span>
            </div>
          ))}
          {!cat && (
            <div className="flex items-center gap-2 pt-0.5 border-t border-white/10 mt-1">
              <div className="w-3 h-3 rounded-sm flex-shrink-0 border-2" style={{ borderColor: "#fff", background: "transparent", boxShadow: "0 0 5px #fff" }} />
              <span className="text-[10px] text-white font-medium">Significant (neon)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
