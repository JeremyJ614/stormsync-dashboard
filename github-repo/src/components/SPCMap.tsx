import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { applyRoyalBasemap } from "../lib/basemap";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASE_API } from "../config";
import {
  PALETTES, KIND_TITLE, classify, hazardFromProduct, levelIndexFor,
  type Kind, type Hazard,
} from "../lib/spcPalette";
import { computeTargetAreas, type TargetArea } from "../lib/spcTargetAreas";

export type SPCProduct =
  | "day1otlk_cat" | "day2otlk_cat" | "day3otlk_cat"
  | "day1otlk_torn" | "day2otlk_torn"
  | "day1otlk_wind" | "day2otlk_wind"
  | "day1otlk_hail" | "day2otlk_hail"
  | "day4prob" | "day5prob" | "day6prob" | "day7prob" | "day8prob";

export type DisplayMode = "likelihood" | "intensity";

// Free, no-API-key vector basemap (CARTO). Smooth 60fps vector zoom/pan --
// no raster tiles, no per-tile-load cost.
const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function kindFor(hazard: Hazard, mode: DisplayMode): Kind {
  if (hazard === "cat") return "cat";
  if (mode === "intensity") return hazard === "torn" ? "tornadoIntensity" : hazard === "hail" ? "hailIntensity" : "windIntensity";
  return hazard === "torn" ? "tornadoLikelihood" : hazard === "hail" ? "hailLikelihood" : "windLikelihood";
}

interface Props {
  product: SPCProduct;
  mode: DisplayMode;
  height?: number;
  /** 0 = national view, 1-3 = fly to that Target Area (if it exists) */
  targetIndex?: number;
  onTargetsComputed?: (targets: TargetArea[]) => void;
}

export function SPCMap({ product, mode, height = 340, targetIndex = 0, onTargetsComputed }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const targetsRef = useRef<TargetArea[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(true);
  const [lowConf, setLowConf] = useState(false);
  const [topIdx, setTopIdx] = useState(0);

  const hazard: Hazard = hazardFromProduct(product);
  const kind: Kind = kindFor(hazard, mode);
  const palette = PALETTES[kind];

  async function loadData(map: maplibregl.Map) {
    setLoading(true); setError(null); setLowConf(false);
    try {
      const res = await fetch(`${BASE_API}/spc/outlook-geojson?product=${product}`);
      if (!res.ok) throw new Error(String(res.status));
      const data: GeoJSON.FeatureCollection = await res.json();
      const rawFeatures = data.features ?? [];

      let maxIdx = 0, visible = 0, skipped = 0;
      const styled: GeoJSON.Feature[] = [];
      for (const f of rawFeatures) {
        const idx = levelIndexFor(mode, hazard, f);
        if (idx === null) { skipped++; continue; }
        visible++;
        if (idx > maxIdx) maxIdx = idx;
        const isSig = mode === "intensity" && idx === 1;
        styled.push({ ...f, properties: { ...f.properties, __color: palette[idx]?.color ?? "#888888", __sig: isSig } });
      }

      const src = map.getSource("spc") as maplibregl.GeoJSONSource | undefined;

      if (visible === 0) {
        src?.setData({ type: "FeatureCollection", features: [] });
        targetsRef.current = [];
        onTargetsComputed?.([]);
        if (/^day[4-8]prob$/.test(product) && skipped > 0) { setLowConf(true); setHasData(true); }
        else setHasData(false);
        setLoading(false);
        return;
      }

      setHasData(true);
      setTopIdx(maxIdx);
      src?.setData({ type: "FeatureCollection", features: styled });

      const targets = computeTargetAreas(rawFeatures, f => classify(hazard, f));
      targetsRef.current = targets;
      onTargetsComputed?.(targets);
    } catch {
      setError("Could not load SPC data");
    }
    setLoading(false);
  }

  // Map init (once)
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [-97, 39],
      zoom: 3.2,
      attributionControl: false,
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      const beneath = applyRoyalBasemap(map);

      map.addSource("spc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      // Risk areas go beneath the boundary and label layers — drawn on top, a
      // filled outlook hides every state line and place name underneath it.
      map.addLayer({
        id: "spc-fill", type: "fill", source: "spc",
        paint: {
          "fill-color": ["get", "__color"],
          "fill-opacity": ["case", ["boolean", ["get", "__sig"], false], 0, 0.52],
        },
      }, beneath);
      map.addLayer({
        id: "spc-outline", type: "line", source: "spc",
        paint: {
          "line-color": ["case", ["boolean", ["get", "__sig"], false], "#ffffff", ["get", "__color"]],
          "line-width": ["case", ["boolean", ["get", "__sig"], false], 2.5, 1.6],
          "line-opacity": 1,
        },
      }, beneath);
      setReady(true);
    });

    return () => { map.remove(); mapRef.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload data whenever product/mode changes (and once the map is ready)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    loadData(mapRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, product, mode]);

  // Fly to the requested Target Area (or back to National)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (targetIndex === 0) {
      map.easeTo({ center: [-97, 39], zoom: 3.2, duration: 700 });
      return;
    }
    const t = targetsRef.current[targetIndex - 1];
    if (t) {
      map.fitBounds([[t.bbox[0], t.bbox[1]], [t.bbox[2], t.bbox[3]]], { padding: 48, duration: 700, maxZoom: 7 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIndex, ready]);

  const top = palette[topIdx] ?? palette[0];

  return (
    <div className="relative rounded-xl overflow-hidden border border-border">
      <div ref={containerRef} style={{ height, background: "#0a0e1a" }} />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none" style={{ zIndex: 10 }}>
          <div className="flex items-center gap-2 text-sm text-primary">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading SPC data…
          </div>
        </div>
      )}
      {!loading && !hasData && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
          <div className="text-center text-sm text-muted-foreground bg-black/60 px-4 py-3 rounded-lg">
            <div className="text-2xl mb-1">🌤</div>
            No active severe weather risk at this time
          </div>
        </div>
      )}
      {!loading && lowConf && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
          <div className="text-center text-sm text-muted-foreground bg-black/60 px-4 py-3 rounded-lg max-w-xs">
            <div className="text-2xl mb-1">🌀</div>
            Predictability too low to outline a risk area for this day.
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
          <div className="text-sm text-red-400 bg-black/60 px-4 py-2 rounded">{error}</div>
        </div>
      )}

      {!loading && hasData && !lowConf && (
        <div className="absolute top-2 left-2 bg-black/75 rounded-lg px-2.5 py-1.5 pointer-events-none" style={{ zIndex: 10 }}>
          <div className="text-[9px] uppercase tracking-[0.25em] text-white/60">Highest Risk</div>
          <div className="text-xs font-bold" style={{ color: top.color }}>{top.label}</div>
        </div>
      )}

      {!loading && hasData && !lowConf && (
        <div className="absolute bottom-2 right-2 bg-black/80 rounded-lg px-3 py-2 space-y-1 pointer-events-none" style={{ zIndex: 10 }}>
          <div className="text-[9px] uppercase tracking-[0.2em] text-white/55 mb-1">{KIND_TITLE[kind]}</div>
          {palette.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: item.color }} />
              <span className="text-[10px] text-white font-medium">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
