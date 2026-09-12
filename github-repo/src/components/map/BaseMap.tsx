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
import * as maplibregl from "maplibre-gl";
import type { DataDrivenPropertyValueSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { applyRoyalBasemap, STORMSYNC_DARK } from "../../lib/basemap";

export const DARK_STYLE = STORMSYNC_DARK;

export interface RasterOverlay {
  /** Stable id — changing it replaces the layer. */
  id: string;
  /** XYZ template, `{z}/{x}/{y}`. */
  url: string;
  opacity?: number;
  maxZoom?: number;
  /**
   * Source tile size. 256 for an ordinary XYZ pyramid; 512 for a bbox-templated
   * service (`{bbox-epsg-3857}`) asked for a 512 px image, which is what keeps
   * NOAA's MRMS QPE sharp instead of upscaled.
   */
  tileSize?: 256 | 512;
  /** Draw beneath the basemap's boundary lines so borders stay readable. */
  underLabels?: boolean;
}

/**
 * A single georeferenced image, pinned to a bounding box.
 *
 * Plenty of the products worth showing are not tile pyramids. The WPC winter
 * storm severity images are one transparent CONUS PNG each, and an ArcGIS
 * MapServer `export` call returns one PNG for whatever box you ask for. Both
 * are useful and neither fits a `{z}/{x}/{y}` template, so the map takes them
 * as images with corners rather than making every caller invent a tile server.
 */
export interface ImageOverlay {
  id: string;
  url: string;
  /** [west, south, east, north] in degrees. */
  bounds: [number, number, number, number];
  opacity?: number;
  underLabels?: boolean;
}

/**
 * A GeoJSON overlay drawn as fill + outline.
 *
 * Some of the products worth showing are not pictures at all. ProbSevere is a
 * set of storm polygons each carrying a probability, and the only honest way to
 * draw it is to colour each polygon by its own value and let the member tap one
 * to read it. Its raster tiles are served but empty — 102-byte transparent PNGs
 * at every zoom the viewer uses — so a raster overlay for it looks exactly like
 * clear weather.
 *
 * Paint values are passed straight through to MapLibre, so a caller can hand in
 * a data-driven expression (`["interpolate", …, ["get", "prob"], …]`) rather
 * than pre-colouring every feature the way the SPC map has to.
 */
export interface ShapeOverlay {
  id: string;
  data: GeoJSON.FeatureCollection;
  /** MapLibre paint value — a colour, or an expression over feature properties. */
  fillColor?: ColorValue;
  fillOpacity?: NumberValue;
  lineColor?: ColorValue;
  lineWidth?: NumberValue;
  underLabels?: boolean;
  /** Tapping a shape hands back its properties, for a popup or a detail panel. */
  onFeatureClick?: (props: Record<string, unknown>) => void;
}

/** A colour, or an expression producing one — handed to MapLibre as-is. */
export type ColorValue = DataDrivenPropertyValueSpecification<string>;
/** A number, or an expression producing one. */
export type NumberValue = DataDrivenPropertyValueSpecification<number>;

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
  images?: ImageOverlay[];
  shapes?: ShapeOverlay[];
  /** Fires once the style is loaded and the royal basemap is applied. */
  onReady?: (map: maplibregl.Map, beneath: string | undefined) => void;
  /** Raster tile telemetry, so a dead product cannot masquerade as clear weather. */
  onTiles?: (t: { loaded: number; errored: number }) => void;
  interactive?: boolean;
  className?: string;
}

export const BaseMap = forwardRef<BaseMapHandle, Props>(function BaseMap(
  { center, zoom = 6, height = 420, overlays = [], images = [], shapes = [], onReady, onTiles, interactive = true, className }, ref,
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
        type: "raster", tiles: [o.url], tileSize: o.tileSize ?? 256,
        maxzoom: o.maxZoom ?? 12, attribution: "",
      });
      m.addLayer(
        { id: sid, type: "raster", source: sid, paint: { "raster-opacity": o.opacity ?? 1 } },
        o.underLabels ? beneath.current : undefined,
      );
      mounted.current.add(o.id);
    }
  }, [overlays, ready]);

  // ── image overlays ─────────────────────────────────────────────────────────
  // Same diffing shape as the raster overlays above, but MapLibre's `image`
  // source takes four corners rather than a tile template, and its url and
  // coordinates can be updated in place — which matters here, because scrubbing
  // through forecast hours changes only the url and rebuilding the layer each
  // time makes the map blink.
  const mountedImages = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const wanted = new Map(images.map((o) => [o.id, o]));
    for (const id of [...mountedImages.current.keys()]) {
      if (wanted.has(id)) continue;
      if (m.getLayer(`img-${id}`)) m.removeLayer(`img-${id}`);
      if (m.getSource(`img-${id}`)) m.removeSource(`img-${id}`);
      mountedImages.current.delete(id);
    }

    for (const o of images) {
      const sid = `img-${o.id}`;
      const [w, s2, e, n] = o.bounds;
      const corners: [[number, number], [number, number], [number, number], [number, number]] =
        [[w, n], [e, n], [e, s2], [w, s2]];
      const existing = m.getSource(sid) as maplibregl.ImageSource | undefined;
      if (existing) {
        if (mountedImages.current.get(o.id) !== o.url) {
          existing.updateImage({ url: o.url, coordinates: corners });
          mountedImages.current.set(o.id, o.url);
        }
        m.setPaintProperty(sid, "raster-opacity", o.opacity ?? 1);
        continue;
      }
      m.addSource(sid, { type: "image", url: o.url, coordinates: corners });
      m.addLayer(
        { id: sid, type: "raster", source: sid, paint: { "raster-opacity": o.opacity ?? 1 } },
        o.underLabels ? beneath.current : undefined,
      );
      mountedImages.current.set(o.id, o.url);
    }
  }, [images, ready]);

  // ── shape (GeoJSON) overlays ───────────────────────────────────────────────
  // Same diffing discipline as above, with one difference that matters: a
  // GeoJSON source's data is replaced in place with `setData`, so a refreshed
  // ProbSevere feed updates the polygons without tearing down the layers and
  // making the map blink. Paint values are updated in place for the same reason.
  //
  // Each shape gets two layers — a fill and its outline — because a translucent
  // fill alone reads as a smudge at radar zooms, and the outline is what makes a
  // storm's shape legible over reflectivity.
  const mountedShapes = useRef<Set<string>>(new Set());
  // The click handler is registered once per layer, so it reads the callback
  // through a ref rather than closing over the render that installed it.
  const shapeHandlers = useRef<Map<string, (p: Record<string, unknown>) => void>>(new Map());
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    const wanted = new Map(shapes.map((o) => [o.id, o]));
    for (const id of [...mountedShapes.current]) {
      if (wanted.has(id)) continue;
      for (const suffix of ["fill", "line"]) {
        if (m.getLayer(`shp-${id}-${suffix}`)) m.removeLayer(`shp-${id}-${suffix}`);
      }
      if (m.getSource(`shp-${id}`)) m.removeSource(`shp-${id}`);
      mountedShapes.current.delete(id);
      shapeHandlers.current.delete(id);
    }

    for (const o of shapes) {
      const sid = `shp-${o.id}`;
      if (o.onFeatureClick) shapeHandlers.current.set(o.id, o.onFeatureClick);
      else shapeHandlers.current.delete(o.id);

      const existing = m.getSource(sid) as maplibregl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(o.data);
        m.setPaintProperty(`${sid}-fill`, "fill-color", o.fillColor ?? "#d9b775");
        m.setPaintProperty(`${sid}-fill`, "fill-opacity", o.fillOpacity ?? 0.35);
        m.setPaintProperty(`${sid}-line`, "line-color", o.lineColor ?? o.fillColor ?? "#d9b775");
        m.setPaintProperty(`${sid}-line`, "line-width", o.lineWidth ?? 1.6);
        continue;
      }

      m.addSource(sid, { type: "geojson", data: o.data });
      m.addLayer({
        id: `${sid}-fill`, type: "fill", source: sid,
        paint: { "fill-color": o.fillColor ?? "#d9b775", "fill-opacity": o.fillOpacity ?? 0.35 },
      }, o.underLabels ? beneath.current : undefined);
      m.addLayer({
        id: `${sid}-line`, type: "line", source: sid,
        paint: { "line-color": o.lineColor ?? o.fillColor ?? "#d9b775", "line-width": o.lineWidth ?? 1.6 },
      }, o.underLabels ? beneath.current : undefined);

      const fillId = `${sid}-fill`;
      m.on("click", fillId, (e) => {
        const f = e.features?.[0];
        if (f) shapeHandlers.current.get(o.id)?.(f.properties ?? {});
      });
      m.on("mouseenter", fillId, () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", fillId, () => { m.getCanvas().style.cursor = ""; });

      mountedShapes.current.add(o.id);
    }
  }, [shapes, ready]);

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
