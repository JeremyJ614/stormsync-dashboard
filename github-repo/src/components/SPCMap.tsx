import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as maplibregl from "maplibre-gl";
import "../lib/maplibreWorker";
import { applyRoyalBasemap, STORMSYNC_DARK } from "../lib/basemap";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASE_API } from "../config";
import {
  levelsFor, KIND_TITLE, targetLevel, hazardFromProduct, levelIndexFor,
  type Kind, type Hazard,
} from "../lib/spcPalette";
import { subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot } from "../lib/mapPalette";
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
const DARK_STYLE = STORMSYNC_DARK;

/**
 * The significant-severe hatch, drawn once into a canvas.
 *
 * A `fill-pattern` cannot be tinted per feature, so this is deliberately
 * colourless: near-black diagonals over transparency, laid on top of the level
 * colour rather than instead of it. The area underneath keeps its own hue and
 * the hatch supplies the "significant" reading — which is the job the hatching
 * on SPC's own graphics does.
 *
 * 16px at pixelRatio 2 is an 8px tile on screen, close enough to SPC's spacing
 * to read as the same convention without moiré at low zoom.
 */
const SIG_HATCH_ID = "spc-sig-hatch";

function sigHatch(): ImageData {
  const N = 16;
  const c = document.createElement("canvas");
  c.width = N; c.height = N;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(10,8,18,0.85)";
  g.lineWidth = 2.2;
  // Drawn three times, offset by a tile in each direction, so the diagonals
  // meet across tile edges instead of stopping at them.
  for (const d of [-N, 0, N]) {
    g.beginPath();
    g.moveTo(d, N);
    g.lineTo(d + N, 0);
    g.stroke();
  }
  return g.getImageData(0, 0, N, N);
}

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
  // Subscribing keeps the map honest while somebody is editing the palette in
  // the admin panel: `levelsFor` reads the override synchronously, but without
  // a subscription nothing would tell React to run it again.
  const paletteState = useSyncExternalStore(
    subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot);
  void paletteState;
  const palette = levelsFor(kind);

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
        // Every conditional-intensity contour gets the hatch, not only the first.
        const isSig = mode === "intensity" && idx >= 1;
        styled.push({ ...f, properties: { ...f.properties, __color: palette[idx]?.color ?? "#888888", __sig: isSig, __idx: idx } });
      }

      // Painted in level order, so Intensity 3 lands on top of Intensity 2 on
      // top of Intensity 1 on top of the risk area. MapLibre draws a layer in
      // source order, and SPC hands the contours back with the nested ones
      // first, which is the wrong way round for a stack of nested polygons.
      styled.sort((a, b) =>
        Number(a.properties?.__idx ?? 0) - Number(b.properties?.__idx ?? 0));

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

      const targets = computeTargetAreas(rawFeatures, f => targetLevel(hazard, f));
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

      if (!map.hasImage(SIG_HATCH_ID)) map.addImage(SIG_HATCH_ID, sigHatch(), { pixelRatio: 2 });

      map.addSource("spc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

      // Risk areas go beneath the boundary and label layers — drawn on top, a
      // filled outlook hides every state line and place name underneath it.
      /*
       * THE BUG THIS FIXES — the Intensity tabs painted one colour, not two.
       *
       * A conditional-intensity area was drawn with `fill-opacity: 0` and a
       * white outline. That is SPC's own convention on their static graphics,
       * but here it meant every tier above the base of every Intensity palette
       * existed in the legend and was never once put on the map. The whole tab
       * read as one colour with a glowing white ring around part of it, which
       * is exactly how it was reported.
       *
       * Now the sig area is filled in its own colour, nearly opaque so it reads
       * as that colour rather than as a blend with the general area it sits
       * inside, and the "significant" meaning is carried by a hatch drawn over
       * the top — which is what the hatching on SPC's own graphics is for.
       */
      map.addLayer({
        id: "spc-fill", type: "fill", source: "spc",
        paint: {
          "fill-color": ["get", "__color"],
          // 0.86 rather than 0.52: the sig polygon is nested inside the general
          // one, so at matching opacity the two colours would mix and the
          // result would be neither of them.
          "fill-opacity": ["case", ["boolean", ["get", "__sig"], false], 0.86, 0.52],
        },
      }, beneath);
      map.addLayer({
        id: "spc-hatch", type: "fill", source: "spc",
        filter: ["boolean", ["get", "__sig"], false],
        paint: { "fill-pattern": SIG_HATCH_ID, "fill-opacity": 0.9 },
      }, beneath);
      map.addLayer({
        id: "spc-outline", type: "line", source: "spc",
        paint: {
          "line-color": ["get", "__color"],
          "line-width": ["case", ["boolean", ["get", "__sig"], false], 2.2, 1.6],
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
  }, [ready, product, mode, paletteState]);

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
