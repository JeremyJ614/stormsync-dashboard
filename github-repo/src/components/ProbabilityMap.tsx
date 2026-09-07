/**
 * ProbabilityMap — GPU-accelerated 60fps severe-weather probability map.
 *
 * Powered by MapLibre GL + CARTO Dark Matter vector tiles (cities, state
 * names, borders all rendered on the GPU at 60fps — no raster tile lag).
 * SPC GeoJSON is loaded as a transparent fill layer on top so every label
 * and border punches through. Colors mirror the SPC Outlook module palette.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, Share2 } from "lucide-react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASE_API } from "../config";

// ─── Color palette — mirrors the SPC Outlook module ───────────────────────
/**
 * The five-level scale, and why it is not the SPC's six.
 *
 * The old scale ran from "Highly Unlikely" through "Maybe" to "Almost Certain"
 * across six steps mapped one-for-one onto the SPC's categories, and it read far
 * too cautiously: a Slight risk — a day on which storms are genuinely expected
 * somewhere near you — came out as "Maybe", which is not what a member is
 * looking at this page to be told.
 *
 * So the scale is five levels and the categories fold into them: General
 * Thunder is level 1, Marginal 2, Slight 3, Enhanced 4, and Moderate and High
 * both land on 5. Nothing about the underlying SPC data is altered; this is a
 * naming and colouring decision about how that data is presented, and the
 * percentages are still shown against every level so the mapping is auditable.
 *
 * On the colours. Levels 1 and 3 are as first specified — pearl white and
 * satin sheet gold. Level 2 is mint green and level 4 rose red.
 *
 * Level 5 went the other way twice. Gunmetal #353E43 was the original ask; it
 * was moved to the stated fallback, Nevada #666A6D, because a near-black fill
 * on a near-black basemap is a top level you cannot see. But lifting it to full
 * opacity and casing it in bright white produced the opposite problem, and it
 * is the one that actually matters: at a glance the white casing read as level
 * 1's pearl white, so the worst level on the map and the most benign one looked
 * alike. The casing is gone and the fill is back to gunmetal, which is now
 * unambiguous precisely because nothing else near it is dark.
 *
 * All of it is editable in the admin panel without a deploy — see `mapPalette`.
 * These are the defaults, not the last word.
 */
export interface ProbStep {
  /** 1-5. Also the array position + 1. */
  level: number;
  label: string;
  note: string;
  color: string;
  /** The outline, where it differs from the fill. */
  outline?: string;
  /** Fill opacity override — level 5 is opaque so grey cannot recede. */
  opacity?: number;
}

export const PROB_STEPS: ProbStep[] = [
  // Opacity climbs with the level, and level 1 is deliberately a long way down.
  // General thunder routinely covers half the country; at the same 55% the
  // other levels use, a pearl-white slab that size buries the basemap and the
  // whole map reads as one alarming wash. At 14% it is a tint you can see
  // through, its own white outline still draws the boundary, and the levels
  // that matter sit on top of it.
  { level: 1, label: "Very Slim Chance",              note: "General thunderstorms · under 5% within 25 mi", color: "#F3F2ED", opacity: 0.14 },
  { level: 2, label: "Slight Possibility",            note: "SPC Marginal · about 5% within 25 mi",          color: "#4FFFB0", opacity: 0.42 },
  { level: 3, label: "Likely",                        note: "SPC Slight · about 15% within 25 mi",           color: "#CBA135", opacity: 0.52 },
  { level: 4, label: "Near Guaranteed",               note: "SPC Enhanced · about 30% within 25 mi",         color: "#C21E56", opacity: 0.7 },
  { level: 5, label: "Destructive Storms Guaranteed", note: "SPC Moderate or High · 45%+ within 25 mi",      color: "#353E43", opacity: 0.92 },
];

/**
 * Look a level up by its number, with any admin override applied.
 *
 * The override lands on the fill and on the outline together: an outline that
 * kept the old colour after the fill changed would draw a halo nobody asked
 * for, which is most of what was wrong with level 5.
 */
export function stepAt(level: number): ProbStep {
  const base = PROB_STEPS[Math.max(1, Math.min(PROB_STEPS.length, level)) - 1];
  const color = paletteColor(`prob:${base.level}`, base.color);
  return color === base.color ? base : { ...base, color, outline: base.outline ? color : undefined };
}

/** SPC category → level. Moderate and High both top out the scale. */
const CAT_STEP: Record<string, number> = {
  TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 5,
};

/**
 * Probability → level, for the Day 4-8 products, which are probabilistic
 * rather than categorical. The thresholds are the same ones the SPC uses to
 * draw each category, so a 15% day reads the same on Day 6 as a Slight does on
 * Day 1 instead of drifting a level between the two halves of the module.
 */
function pctStep(pct: number): number {
  if (pct >= 45) return 5;
  if (pct >= 30) return 4;
  if (pct >= 15) return 3;
  if (pct >= 5)  return 2;
  return 1;
}

function labelToPct(label: string): number | null {
  const f = parseFloat(label);
  if (Number.isNaN(f)) return null;
  return f <= 1 ? Math.round(f * 100) : Math.round(f);
}

// Free GPU-accelerated vector tile basemap — CARTO Dark Matter GL style.
// Renders city labels, state names, international borders and coastlines
// at 60fps via WebGL with zero API key required.
import { applyRoyalBasemap, STORMSYNC_DARK } from "../lib/basemap";
import { paletteColor, subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot } from "../lib/mapPalette";

const DARK_STYLE = STORMSYNC_DARK;

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
      // Required so getCanvas().toBlob() works for download/share. MapLibre v5
      // moved the WebGL context flags into their own bag.
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false, showZoom: true }),
      "top-right"
    );

    map.on("load", () => {
      const beneath = applyRoyalBasemap(map);
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
          // Per-feature, so the top level can be opaque without lifting the
          // whole ramp and burying the basemap under the lower ones.
          "fill-opacity": ["coalesce", ["get", "__opacity"], 0.55],
        },
      }, beneath);

      map.addLayer({
        id: "prob-outline",
        type: "line",
        source: "prob",
        paint: {
          "line-color": ["coalesce", ["get", "__outline"], ["get", "__color"]],
          "line-width": ["coalesce", ["get", "__width"], 1.6],
          "line-opacity": 1,
        },
      }, beneath);

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
  // 0 means nothing has been drawn; every real value is a level, 1-5.
  const [topStep, setTopStep]   = useState(0);
  // Subscribing rather than reading once: an admin editing the scale in the
  // panel next door has to see this map repaint as they type, which is the only
  // way to judge a colour against a real outlook.
  const palette = useSyncExternalStore(
    subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot);

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
          const meta = stepAt(step);
          features.push({
            ...f,
            properties: {
              ...f.properties,
              __color: meta.color,
              __outline: meta.outline ?? meta.color,
              __opacity: meta.opacity ?? 0.55,
              __width: meta.outline ? 2.4 : 1.6,
              __step: step,
            },
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
  }, [mapReady, product, isProb, palette]);

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

  const top = topStep > 0 ? stepAt(topStep) : null;

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
            <div className="text-xs font-bold mt-0.5" style={{ color: top ? top.color : "#ffffff" }}>
              {top ? `${top.level} · ${top.label}` : "None"}
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
            {/* Through `stepAt`, not straight off PROB_STEPS. Reading the
                constant here meant the legend kept painting the shipped colour
                after an admin changed the map's — the two disagreeing about
                what a level looks like, on the same screen, which is worse
                than either being wrong on its own. */}
            {[...PROB_STEPS].reverse().map(base => {
              const s = stepAt(base.level);
              return (
              <div key={s.level} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm flex-shrink-0"
                     style={{ background: s.color, border: s.outline ? `1px solid ${s.outline}` : "none" }} />
                <span className="text-[10px] text-white font-medium leading-none tabular-nums opacity-60">{s.level}</span>
                <span className="text-[10px] text-white font-medium leading-none">{s.label}</span>
              </div>
              );
            })}
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
