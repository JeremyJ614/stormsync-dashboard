/**
 * ProbabilityMap — GPU-accelerated 60fps severe-weather probability map.
 *
 * Powered by MapLibre GL + CARTO Dark Matter vector tiles (cities, state
 * names, borders all rendered on the GPU at 60fps — no raster tile lag).
 * SPC GeoJSON is loaded as a transparent fill layer on top so every label
 * and border punches through. Colors mirror the SPC Outlook module palette.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Share2 } from "lucide-react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASE_API } from "../config";

// ─── Color palette — mirrors the SPC Outlook module ───────────────────────
export const PROB_STEPS = [
  { key: 0, label: "Highly Unlikely", note: "General storms · <2%",   color: "#3a5a6a" },
  { key: 1, label: "Not Likely",      note: "~5% within 25 mi",       color: "#83EBF2" },
  { key: 2, label: "Maybe",           note: "~15% within 25 mi",      color: "#6395EE" },
  { key: 3, label: "Likely",          note: "~30% within 25 mi",      color: "#4f48c4" },
  { key: 4, label: "Very Likely",     note: "~45% within 25 mi",      color: "#8b1fd4" },
  { key: 5, label: "Almost Certain",  note: "60%+ within 25 mi",      color: "#CCCCFF" },
];

const CAT_STEP: Record<string, number> = {
  TSTM: 0, MRGL: 1, SLGT: 2, ENH: 3, MDT: 4, HIGH: 5,
};

function pctStep(pct: number): number {
  if (pct >= 60) return 5;
  if (pct >= 45) return 4;
  if (pct >= 30) return 3;
  if (pct >= 15) return 2;
  if (pct >= 5)  return 1;
  return 0;
}

function labelToPct(label: string): number | null {
  const f = parseFloat(label);
  if (Number.isNaN(f)) return null;
  return f <= 1 ? Math.round(f * 100) : Math.round(f);
}

// Free GPU-accelerated vector tile basemap — CARTO Dark Matter GL style.
// Renders city labels, state names, international borders and coastlines
// at 60fps via WebGL with zero API key required.
const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

type Status = "loading" | "ok" | "empty" | "error";

// ─── Map component ────────────────────────────────────────────────────────
function ProbMap({
  product,
  isProb,
  onReady,
  mapRef,
}: {
  product: string;
  isProb: boolean;
  onReady: (map: maplibregl.Map) => void;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [-97, 39],
      zoom: 3.2,
      attributionControl: false,
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      // Required so getCanvas().toBlob() works for download/share
      preserveDrawingBuffer: true,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false, showZoom: true }),
      "top-right"
    );

    map.on("load", () => {
      // Source + fill layer (color per-feature via __color property)
      map.addSource("prob", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "prob-fill",
        type: "fill",
        source: "prob",
        paint: {
          "fill-color": ["get", "__color"],
          "fill-opacity": 0.62,
        },
      });

      map.addLayer({
        id: "prob-outline",
        type: "line",
        source: "prob",
        paint: {
          "line-color": ["get", "__color"],
          "line-width": 1.4,
          "line-opacity": 0.95,
        },
      });

      mapRef.current = map;
      onReady(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ height: 390 }} />;
}

// ─── Public component ──────────────────────────────────────────────────────
export function ProbabilityMap({ day }: { day: number }) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus]     = useState<Status>("loading");
  const [topStep, setTopStep]   = useState(0);

  const isProb  = day >= 4;
  const product = isProb ? `day${day}prob` : `day${day}otlk_cat`;

  // Re-create map whenever day changes (product may flip isProb/cat)
  const [mapKey, setMapKey] = useState(0);
  const prevDay = useRef(day);
  if (prevDay.current !== day) {
    prevDay.current = day;
    setMapKey(k => k + 1);
    setMapReady(false);
    setStatus("loading");
  }

  // Load SPC GeoJSON whenever map is ready or product changes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    setStatus("loading");

    let cancelled = false;

    fetch(`${BASE_API}/spc/outlook-geojson?product=${product}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((data: { features?: GeoJSON.Feature[] }) => {
        if (cancelled) return;
        const features: GeoJSON.Feature[] = [];
        let maxStep = 0;

        for (const f of data.features ?? []) {
          const label = String(f.properties?.LABEL ?? "");
          let step: number | null;
          if (isProb) {
            const pct = labelToPct(label);
            step = pct == null ? null : pctStep(pct);
          } else {
            step = CAT_STEP[label.toUpperCase()] ?? null;
          }
          if (step == null) continue;
          if (step > maxStep) maxStep = step;
          features.push({
            ...f,
            properties: { ...f.properties, __color: PROB_STEPS[step].color, __step: step },
          });
        }

        // Lower steps render first so higher-risk polygons always appear on top
        features.sort((a, b) => (a.properties?.__step ?? 0) - (b.properties?.__step ?? 0));

        const src = map.getSource("prob") as maplibregl.GeoJSONSource | undefined;
        src?.setData({ type: "FeatureCollection", features });
        setTopStep(maxStep);
        setStatus(features.length ? "ok" : "empty");
      })
      .catch(() => { if (!cancelled) setStatus("error"); });

    return () => { cancelled = true; };
  }, [mapReady, product, isProb]);

  // ── Download: grab the live WebGL canvas ──────────────────────────────
  const download = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sswx-severe-probability-day${day}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [day]);

  // ── Share ─────────────────────────────────────────────────────────────
  const share = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const fname = `sswx-severe-probability-day${day}.png`;
    map.getCanvas().toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], fname, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: `Day ${day} Severe Weather Probability — StormSync VIP` });
          return;
        } catch { /* dismissed */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fname; a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [day]);

  const top = PROB_STEPS[topStep];

  return (
    <div className="space-y-2">
      <div className="relative rounded-xl overflow-hidden border border-border">
        <ProbMap
          key={mapKey}
          product={product}
          isProb={isProb}
          mapRef={mapRef}
          onReady={() => setMapReady(true)}
        />

        {/* Loading */}
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none" style={{ zIndex: 10 }}>
            <div className="flex items-center gap-2 text-sm text-primary">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading SPC data…
            </div>
          </div>
        )}

        {/* Empty */}
        {status === "empty" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
            <div className="text-center text-sm text-muted-foreground bg-black/70 px-5 py-4 rounded-xl">
              <div className="text-2xl mb-2">🌤</div>
              No severe-weather probability for this day
            </div>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
            <div className="text-sm text-red-400 bg-black/70 px-4 py-3 rounded-xl">
              Could not load probability data
            </div>
          </div>
        )}

        {/* Peak likelihood badge */}
        {status === "ok" && (
          <div
            className="absolute top-2 left-2 bg-black/80 rounded-lg px-2.5 py-1.5 pointer-events-none"
            style={{ zIndex: 10 }}
          >
            <div className="text-[9px] uppercase tracking-[0.25em] text-white/55">Peak Likelihood</div>
            <div className="text-xs font-bold mt-0.5" style={{ color: top.color }}>
              {top.label}
            </div>
          </div>
        )}

        {/* Legend */}
        {status === "ok" && (
          <div
            className="absolute bottom-8 right-2 bg-black/85 rounded-lg px-3 py-2.5 space-y-1.5 pointer-events-none"
            style={{ zIndex: 10 }}
          >
            <div className="text-[9px] uppercase tracking-[0.2em] text-white/50 mb-1">Severe Chance</div>
            {[...PROB_STEPS].reverse().map(s => (
              <div key={s.key} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                <span className="text-[10px] text-white font-medium leading-none">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Watermark */}
        <div
          className="absolute bottom-2 left-2 text-[9px] font-bold tracking-widest text-white/30 font-mono pointer-events-none"
          style={{ zIndex: 10 }}
        >
          SSWX · NOAA SPC
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={download}
          disabled={status !== "ok"}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-semibold disabled:opacity-40 hover:bg-primary/25 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
        <button
          onClick={share}
          disabled={status !== "ok"}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm font-medium hover:border-primary/40 hover:bg-primary/10 transition-colors disabled:opacity-40"
        >
          <Share2 className="w-4 h-4" />
          Share
        </button>
      </div>
    </div>
  );
}
