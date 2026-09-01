import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { WarningFeature, TornadoFeature } from "../lib/severeHistoryData";
import { STORMSYNC_DARK } from "../lib/basemap";

/**
 * Interactive severe-history map (P-3.2).
 *
 * Now a *controlled* component: the page owns fetching and severity classification
 * (see lib/severeHistoryData.ts) and hands finished GeoJSON down. Previously this
 * fetched its own data, hard-coded a two-colour warning scheme that contradicted
 * the seven-row legend, and sized itself `h-screen` — which fought the dashboard
 * shell and produced a double scrollbar.
 *
 * Feature colours are carried on each feature's `color` property, so the map,
 * the on-page legend and the downloadable poster can never drift apart again.
 */

const DARK_MAP_STYLE = STORMSYNC_DARK;

interface Props {
  mode: "warnings" | "tornadoes";
  warnings: WarningFeature[];
  tornadoes: TornadoFeature[];
  height?: number;
}

export function WeatherHistoryMap({ mode, warnings, tornadoes, height = 430 }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const popup = useRef<maplibregl.Popup | null>(null);
  const ready = useRef(false);

  // ── init ──
  useEffect(() => {
    if (!container.current || map.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: DARK_MAP_STYLE,
      center: [-97, 38.5],
      zoom: 3.4,
      attributionControl: false,
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      ready.current = true;
      m.addSource("warn", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "warn-fill", type: "fill", source: "warn",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.22 },
      });
      m.addLayer({
        id: "warn-line", type: "line", source: "warn",
        paint: { "line-color": ["get", "color"], "line-width": 1.6, "line-opacity": 0.95 },
      });
      m.addSource("tor", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "tor-line", type: "line", source: "tor",
        paint: { "line-color": ["get", "color"], "line-width": 3, "line-opacity": 0.95 },
        layout: { "line-cap": "round" },
      });
      m.resize();
      sync(m);
    });

    // click readout
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const feats = m.queryRenderedFeatures(e.point, { layers: ["warn-fill", "tor-line"] });
      if (!feats.length) return;
      const p = feats[0].properties ?? {};
      const html = p.ef
        ? `<div style="font:12px system-ui"><b style="color:${p.color}">${p.ef}</b> tornado<br/>${p.date ?? ""}<br/>${Number(p.lengthMi ?? 0).toFixed(1)} mi · ${p.widthYd ?? 0} yd${Number(p.maxWind) ? ` · ${p.maxWind} mph` : ""}${Number(p.fatalities) ? `<br/><span style="color:#ef4444">${p.fatalities} fatalities</span>` : ""}</div>`
        : `<div style="font:12px system-ui"><b style="color:${p.color}">${p.label ?? ""}</b><br/>${p.wfo ? `WFO ${p.wfo}` : ""}${p.windtag ? `<br/>Wind ${p.windtag}` : ""}${p.hailtag ? `<br/>Hail ${p.hailtag}` : ""}${p.tornadotag ? `<br/>Tornado: ${p.tornadotag}` : ""}</div>`;
      popup.current?.remove();
      popup.current = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
        .setLngLat(e.lngLat).setHTML(html).addTo(m);
    };
    m.on("click", onClick);
    map.current = m;

    return () => { popup.current?.remove(); m.remove(); map.current = null; ready.current = false; };
  }, []);

  function sync(m: maplibregl.Map) {
    const warnSrc = m.getSource("warn") as maplibregl.GeoJSONSource | undefined;
    const torSrc = m.getSource("tor") as maplibregl.GeoJSONSource | undefined;
    warnSrc?.setData({ type: "FeatureCollection", features: (mode === "warnings" ? warnings : []) as never });
    torSrc?.setData({ type: "FeatureCollection", features: (mode === "tornadoes" ? tornadoes : []) as never });
    for (const id of ["warn-fill", "warn-line"]) {
      if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", mode === "warnings" ? "visible" : "none");
    }
    if (m.getLayer("tor-line")) m.setLayoutProperty("tor-line", "visibility", mode === "tornadoes" ? "visible" : "none");
  }

  // ── push data/mode changes ──
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    sync(m);
    popup.current?.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, warnings, tornadoes]);

  // ── keep sized inside the dashboard shell ──
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const t = setTimeout(() => m.resize(), 80);
    return () => clearTimeout(t);
  }, [height]);

  return <div ref={container} style={{ height, background: "#0a0e1a" }} />;
}

export default WeatherHistoryMap;
