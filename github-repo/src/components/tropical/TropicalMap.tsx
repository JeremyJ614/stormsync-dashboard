/**
 * The shared MapLibre canvas for the tropical module — used both by the basin
 * overview and by each storm's Map tab.
 *
 * Sea-surface temperature is a permanent basemap layer here rather than a tab:
 * warm water is the context every other layer is read against. Everything above
 * it is driven from real NHC geometry (cone, wind field, forecast points),
 * never a rasterised NHC PNG.
 */
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { STORMSYNC_DARK } from "../../lib/basemap";
import {
  type Storm, type ConeData, type RadiiData, type ModelsData,
  type TrackPoint, type GtwoData, type ReconMission,
  intensityColor, GOLD,
} from "../../lib/tropical";

const BASEMAP = STORMSYNC_DARK;

/** NASA GIBS MUR SST. The product lags ~3 days, so the date is stepped back. */
export function sstDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d.toISOString().slice(0, 10);
}
const SST_TILES = (date: string) =>
  "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap" +
  "&VERSION=1.3.0&LAYERS=GHRSST_L4_MUR_Sea_Surface_Temperature&STYLES=&FORMAT=image%2Fpng" +
  `&TRANSPARENT=TRUE&CRS=EPSG%3A3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}&TIME=${date}`;

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export interface MapLayers {
  storms?: Storm[];
  gtwo?: GtwoData | null;
  cone?: ConeData | null;
  radii?: RadiiData | null;
  models?: ModelsData | null;
  track?: TrackPoint[] | null;
  recon?: ReconMission[] | null;
}
export interface LayerToggles {
  sst: boolean; gtwo: boolean; cone: boolean; radii: boolean;
  models: boolean; track: boolean; recon: boolean; labels: boolean;
}

interface Props {
  layers: MapLayers;
  toggles: LayerToggles;
  /** [lon, lat, zoom] — re-flies whenever the identity of this tuple changes. */
  view?: [number, number, number];
  fitTo?: GeoJSON.FeatureCollection | null;
  /** Upper bound when fitting — keeps a lone storm from zooming in too far. */
  fitMaxZoom?: number;
  height?: number | string;
  interactive?: boolean;
  onStormClick?: (id: string) => void;
  selectedStormId?: string | null;
}

export default function TropicalMap({
  layers, toggles, view, fitTo, fitMaxZoom = 7, height = 460,
  interactive = true, onStormClick, selectedStormId,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const clickRef = useRef(onStormClick);
  clickRef.current = onStormClick;

  // ── init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!box.current || map.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: BASEMAP,
      center: [view?.[0] ?? -55, view?.[1] ?? 22],
      zoom: view?.[2] ?? 2.6,
      attributionControl: false,
      scrollZoom: interactive,
      dragPan: interactive,
      renderWorldCopies: true,
    });
    if (interactive) m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    m.on("load", () => {
      // ── sea-surface temperature ──
      // Slotted beneath the basemap's country outlines and place labels so
      // coastlines stay readable: the GIBS tiles are transparent over land, so
      // the dark landmass still reads through from the fills below.
      m.addSource("sst", { type: "raster", tiles: [SST_TILES(sstDate())], tileSize: 256 });
      const labelLayer =
        m.getLayer("boundary_country_outline")?.id ??
        m.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      m.addLayer(
        {
          id: "sst", type: "raster", source: "sst",
          paint: {
            // SST is basin-scale context. Held strong while the whole basin is
            // in view, then faded out as you close in on a storm so the cone,
            // wind field and track stay readable against it.
            "raster-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.58, 3.5, 0.46, 5.5, 0.2, 7, 0.07],
            "raster-fade-duration": 0,
          },
        },
        labelLayer,
      );

      const src = (id: string) => m.addSource(id, { type: "geojson", data: EMPTY });
      ["gtwo", "radii", "cone", "models", "track", "storms", "fcst", "recon"].forEach(src);

      // ── formation odds: dashed outline + tinted wash + % label ──
      m.addLayer({ id: "gtwo-fill", type: "fill", source: "gtwo",
        paint: { "fill-color": ["get", "__color"], "fill-opacity": 0.14 } });
      m.addLayer({ id: "gtwo-line", type: "line", source: "gtwo",
        paint: { "line-color": ["get", "__color"], "line-width": 1.6, "line-dasharray": [2.5, 1.6], "line-opacity": 0.95 } });
      m.addLayer({ id: "gtwo-label", type: "symbol", source: "gtwo",
        layout: {
          "symbol-placement": "point", "text-field": ["get", "label"],
          "text-size": 12, "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-allow-overlap": true,
        },
        paint: { "text-color": ["get", "__color"], "text-halo-color": "#05070f", "text-halo-width": 1.6 } });

      // ── wind field ──
      m.addLayer({ id: "radii-fill", type: "fill", source: "radii",
        paint: { "fill-color": ["get", "__color"], "fill-opacity": 0.17 } });
      m.addLayer({ id: "radii-line", type: "line", source: "radii",
        paint: { "line-color": ["get", "__color"], "line-width": 1, "line-opacity": 0.55 } });

      // ── forecast cone ──
      m.addLayer({ id: "cone-fill", type: "fill", source: "cone",
        paint: { "fill-color": "#e8e4ff", "fill-opacity": 0.12 } });
      m.addLayer({ id: "cone-line", type: "line", source: "cone",
        paint: { "line-color": "#e8e4ff", "line-width": 1.2, "line-opacity": 0.5, "line-dasharray": [3, 2] } });

      // ── model spaghetti ──
      m.addLayer({ id: "models-line", type: "line", source: "models",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "__color"],
          "line-width": ["case", ["get", "__official"], 2.6, 1.3],
          "line-opacity": ["case", ["get", "__official"], 1, 0.72],
        } });

      // ── past (best) track ──
      m.addLayer({ id: "track-line", type: "line", source: "track",
        filter: ["==", "$type", "LineString"],
        paint: { "line-color": "#8fa3bf", "line-width": 1.6, "line-opacity": 0.75 } });
      m.addLayer({ id: "track-dot", type: "circle", source: "track",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 3.4, "circle-color": ["get", "__color"],
          "circle-stroke-width": 0.8, "circle-stroke-color": "#05070f",
        } });

      // ── forecast track: line, position dots, labels ──
      m.addLayer({ id: "fcst-line", type: "line", source: "fcst",
        filter: ["==", "$type", "LineString"],
        paint: { "line-color": GOLD, "line-width": 2, "line-opacity": 0.9 } });
      m.addLayer({ id: "fcst-dot", type: "circle", source: "fcst",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 6, "circle-color": ["get", "__color"],
          "circle-stroke-width": 1.6, "circle-stroke-color": "#f4f1ff",
        } });
      m.addLayer({ id: "fcst-label", type: "symbol", source: "fcst",
        filter: ["==", "$type", "Point"],
        layout: {
          "text-field": ["get", "__label"], "text-size": 10.5,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-offset": [0, -1.5], "text-anchor": "bottom", "text-allow-overlap": false,
        },
        paint: { "text-color": "#e9e6f5", "text-halo-color": "#05070f", "text-halo-width": 1.8 } });

      // ── recon aircraft fixes ──
      m.addLayer({ id: "recon-dot", type: "circle", source: "recon",
        paint: {
          "circle-radius": 5, "circle-color": "#4ade80",
          "circle-stroke-width": 1.4, "circle-stroke-color": "#05070f",
        } });

      // ── active storms ──
      m.addLayer({ id: "storm-glow", type: "circle", source: "storms",
        paint: { "circle-radius": 26, "circle-color": ["get", "__color"], "circle-opacity": 0.16, "circle-blur": 1 } });
      m.addLayer({ id: "storm-dot", type: "circle", source: "storms",
        paint: {
          "circle-radius": ["case", ["get", "__selected"], 11, 8],
          "circle-color": ["get", "__color"],
          "circle-stroke-width": 2, "circle-stroke-color": "#f4f1ff",
        } });
      m.addLayer({ id: "storm-label", type: "symbol", source: "storms",
        layout: {
          "text-field": ["get", "__label"], "text-size": 11.5,
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-offset": [0, 1.5], "text-anchor": "top", "text-allow-overlap": true,
          "text-letter-spacing": 0.08,
        },
        paint: { "text-color": "#f4f1ff", "text-halo-color": "#05070f", "text-halo-width": 2 } });

      m.on("click", "storm-dot", (e) => {
        const id = e.features?.[0]?.properties?.__id;
        if (id) clickRef.current?.(String(id));
      });
      for (const id of ["storm-dot", "gtwo-fill"]) {
        m.on("mouseenter", id, () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", id, () => { m.getCanvas().style.cursor = ""; });
      }

      map.current = m;
      setReady(true);
    });

    return () => { m.remove(); map.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── data → sources ────────────────────────────────────────────────────────
  const setData = (id: string, fc: GeoJSON.FeatureCollection) =>
    (map.current?.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(fc);

  useEffect(() => {
    if (!ready) return;
    const feats = (layers.storms ?? []).map((s) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
      properties: {
        __id: s.id, __color: intensityColor(s.intensity_kt),
        __label: `${s.name.toUpperCase()}  ${s.intensity_mph}`,
        __selected: s.id === selectedStormId,
      },
    }));
    setData("storms", { type: "FeatureCollection", features: feats });
  }, [ready, layers.storms, selectedStormId]);

  useEffect(() => {
    if (!ready) return;
    setData("gtwo", toggles.gtwo && layers.gtwo ? layers.gtwo.areas : EMPTY);
  }, [ready, layers.gtwo, toggles.gtwo]);

  useEffect(() => {
    if (!ready) return;
    setData("cone", toggles.cone && layers.cone ? layers.cone.cone : EMPTY);

    // Forecast line + labelled positions come from the same cone archive.
    const feats: GeoJSON.Feature[] = [];
    if (toggles.cone && layers.cone) {
      feats.push(...layers.cone.line.features);
      for (const p of layers.cone.points) {
        feats.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
          properties: {
            __color: intensityColor(p.maxwind_kt),
            __label: toggles.labels ? `${p.dateLabel}  ·  ${p.maxwind_mph} mph` : "",
          },
        });
      }
    }
    setData("fcst", { type: "FeatureCollection", features: feats });
  }, [ready, layers.cone, toggles.cone, toggles.labels]);

  useEffect(() => {
    if (!ready) return;
    setData("radii", toggles.radii && layers.radii ? layers.radii.initial : EMPTY);
  }, [ready, layers.radii, toggles.radii]);

  useEffect(() => {
    if (!ready) return;
    const feats: GeoJSON.Feature[] = [];
    if (toggles.models && layers.models) {
      for (const mdl of layers.models.models) {
        if (mdl.points.length < 2) continue;
        feats.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: mdl.points.map((p) => [p.lon, p.lat]) },
          properties: { __color: mdl.color, __official: mdl.official, __id: mdl.id },
        });
      }
    }
    setData("models", { type: "FeatureCollection", features: feats });
  }, [ready, layers.models, toggles.models]);

  useEffect(() => {
    if (!ready) return;
    const feats: GeoJSON.Feature[] = [];
    if (toggles.track && layers.track?.length) {
      feats.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: layers.track.map((p) => [p.lon, p.lat]) },
        properties: {},
      });
      for (const p of layers.track) {
        feats.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
          properties: { __color: intensityColor(p.winds_kt) },
        });
      }
    }
    setData("track", { type: "FeatureCollection", features: feats });
  }, [ready, layers.track, toggles.track]);

  useEffect(() => {
    if (!ready) return;
    const feats = (toggles.recon ? layers.recon ?? [] : [])
      .filter((r) => r.lat != null && r.lon != null)
      .map((r) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [r.lon!, r.lat!] },
        properties: { __id: r.key },
      }));
    setData("recon", { type: "FeatureCollection", features: feats });
  }, [ready, layers.recon, toggles.recon]);

  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.setLayoutProperty("sst", "visibility", toggles.sst ? "visible" : "none");
  }, [ready, toggles.sst]);

  // ── camera ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !map.current || !view) return;
    map.current.flyTo({ center: [view[0], view[1]], zoom: view[2], duration: 900 });
  }, [ready, view?.[0], view?.[1], view?.[2]]);

  useEffect(() => {
    if (!ready || !map.current || !fitTo?.features?.length) return;
    const b = new maplibregl.LngLatBounds();
    const walk = (c: unknown) => {
      if (Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") b.extend(c as [number, number]);
      else if (Array.isArray(c)) c.forEach(walk);
    };
    fitTo.features.forEach((f) => walk((f.geometry as { coordinates?: unknown }).coordinates));
    if (!b.isEmpty()) map.current.fitBounds(b, { padding: 56, duration: 900, maxZoom: fitMaxZoom });
  }, [ready, fitTo, fitMaxZoom]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      <div ref={box} className="w-full h-full" />
      <div
        className="absolute bottom-2 left-3 text-[9px] font-semibold tracking-[0.22em] pointer-events-none select-none"
        style={{ color: "rgba(217,183,117,0.42)" }}
      >
        VIP.SSWX.SPACE
      </div>
    </div>
  );
}
