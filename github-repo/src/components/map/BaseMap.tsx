/**
 * The app's one map.
 *
 * Every module used to reach for whichever library it was written against —
 * MapLibre for the tropical, SPC and history maps, Leaflet for radar, aurora,
 * climatology and chase targets. Two libraries meant two sets of interaction
 * conventions for the member and two sets of bugs for us.
 *
 * This is the single foundation: a MapLibre map on the royal basemap, with the
 * raster-overlay handling (radar, satellite, probability tiles) that Leaflet
 * was previously doing, exposed through one imperative handle.
 *
 * On the choice of library: MapLibre *is* Mapbox GL JS v1, forked when Mapbox
 * moved v2 to a proprietary licence. Same renderer lineage, no access token, no
 * per-load billing, no telemetry. What makes a map look good is the style and
 * the data layers, not the vendor.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { applyRoyalBasemap } from "../../lib/basemap";

export const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export interface RasterOverlay {
  /** Stable id — changing it replaces the layer. */
  id: string;
  /** XYZ template, `{z}/{x}/{y}`. */
  url: string;
  opacity?: number;
  maxZoom?: number;
  /** Draw beneath the basemap's boundary lines so borders stay readable. */
  underLabels?: boolean;
}

export interface BaseMapHandle {
  map(): maplibregl.Map | null;
  flyTo(lat: number, lon: number, zoom?: number): void;
  fit(bounds: [number, number, number, number], padding?: number): void;
}

interface Props {
  center: { lat: number; lon: number };
  zoom?: number;
  height?: number | string;
  overlays?: RasterOverlay[];
  /** Fires once the style is loaded and the royal basemap is applied. */
  onReady?: (map: maplibregl.Map, beneath: string | undefined) => void;
  /** Raster tile telemetry, so a dead product cannot masquerade as clear weather. */
  onTiles?: (t: { loaded: number; errored: number }) => void;
  interactive?: boolean;
  className?: string;
}

export const BaseMap = forwardRef<BaseMapHandle, Props>(function BaseMap(
  { center, zoom = 6, height = 420, overlays = [], onReady, onTiles, interactive = true, className }, ref,
) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const beneath = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const live = useRef({ onReady, onTiles });
  live.current = { onReady, onTiles };

  useImperativeHandle(ref, () => ({
    map: () => map.current,
    flyTo: (lat, lon, z) => map.current?.easeTo({ center: [lon, lat], zoom: z ?? map.current.getZoom(), duration: 650 }),
    fit: (b, padding = 40) => map.current?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding, duration: 700 }),
  }), []);

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: DARK_STYLE,
      center: [center.lon, center.lat],
      zoom,
      attributionControl: false,
      interactive,
      // Scroll should pan the page, not the map, until the member asks for it.
      scrollZoom: false,
    });
    map.current = m;
    if (interactive) {
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      // Ctrl/⌘ + wheel zooms, matching every other map on the web.
      m.on("wheel", (e) => {
        if (e.originalEvent.ctrlKey || e.originalEvent.metaKey) {
          e.originalEvent.preventDefault();
          m.scrollZoom.enable();
          m.scrollZoom.wheel(e.originalEvent);
          m.scrollZoom.disable();
        }
      });
    }
    m.on("load", () => {
      beneath.current = applyRoyalBasemap(m);
      setReady(true);
      live.current.onReady?.(m, beneath.current);
    });
    return () => { m.remove(); map.current = null; };
     
  }, []);

  // ── raster overlays ────────────────────────────────────────────────────────
  const mounted = useRef<Set<string>>(new Set());
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const wanted = new Map(overlays.map((o) => [o.id, o]));

    // Remove what is no longer wanted.
    for (const id of [...mounted.current]) {
      if (wanted.has(id)) continue;
      if (m.getLayer(`ov-${id}`)) m.removeLayer(`ov-${id}`);
      if (m.getSource(`ov-${id}`)) m.removeSource(`ov-${id}`);
      mounted.current.delete(id);
    }

    for (const o of overlays) {
      const sid = `ov-${o.id}`;
      const existing = m.getSource(sid) as maplibregl.RasterTileSource | undefined;
      const currentUrl = (existing as unknown as { tiles?: string[] })?.tiles?.[0];
      if (existing && currentUrl === o.url) {
        m.setPaintProperty(sid, "raster-opacity", o.opacity ?? 1);
        continue;
      }
      if (existing) {
        if (m.getLayer(sid)) m.removeLayer(sid);
        m.removeSource(sid);
        mounted.current.delete(o.id);
      }
      m.addSource(sid, {
        type: "raster", tiles: [o.url], tileSize: 256,
        maxzoom: o.maxZoom ?? 12, attribution: "",
      });
      m.addLayer(
        { id: sid, type: "raster", source: sid, paint: { "raster-opacity": o.opacity ?? 1 } },
        o.underLabels ? beneath.current : undefined,
      );
      mounted.current.add(o.id);
    }
  }, [overlays, ready]);

  // Tile telemetry — counted from the map's own data events.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !onTiles) return;
    let loaded = 0, errored = 0;
    const onData = (e: maplibregl.MapSourceDataEvent) => {
      if (e.sourceId?.startsWith("ov-") && e.tile) { loaded++; live.current.onTiles?.({ loaded, errored }); }
    };
    const onErr = (e: { sourceId?: string }) => {
      if (e.sourceId?.startsWith("ov-")) { errored++; live.current.onTiles?.({ loaded, errored }); }
    };
    m.on("sourcedata", onData);
    m.on("error", onErr as never);
    return () => { m.off("sourcedata", onData); m.off("error", onErr as never); };
  }, [ready, onTiles]);

  useEffect(() => {
    map.current?.easeTo({ center: [center.lon, center.lat], duration: 650 });
  }, [center.lat, center.lon]);

  return <div ref={box} style={{ height }} className={className ?? "w-full rounded-xl overflow-hidden"} />;
});

export default BaseMap;
