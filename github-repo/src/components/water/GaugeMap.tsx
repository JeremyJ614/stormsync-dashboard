/**
 * Gauge map. MapLibre over the royal basemap, one circle per gauge coloured by
 * flood category, with a slow halo on anything at or above action stage so a
 * river in trouble is findable without reading a single label.
 */
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { applyRoyalBasemap } from "../../lib/basemap";
import { FLOOD_STYLE, type GaugeSummary } from "../../lib/riverGauges";
import { prefersReducedMotion } from "../../lib/royal";

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface Props {
  gauges: GaugeSummary[];
  center: { lat: number; lon: number };
  selected: string | null;
  onSelect: (lid: string) => void;
  height?: number;
}

export function GaugeMap({ gauges, center, selected, onSelect, height = 380 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const beneath = useRef<string | undefined>(undefined);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = new maplibregl.Map({
      container: box.current,
      style: DARK_STYLE,
      center: [center.lon, center.lat],
      zoom: 6.2,
      attributionControl: false,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      beneath.current = applyRoyalBasemap(m);
      m.addSource("gauges", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "gauge-halo", type: "circle", source: "gauges",
        filter: ["==", ["get", "alert"], true],
        paint: {
          "circle-radius": 16,
          "circle-color": ["get", "color"],
          "circle-opacity": 0.16,
          "circle-blur": 0.6,
        },
      }, beneath.current);
      m.addLayer({
        id: "gauge-dot", type: "circle", source: "gauges",
        paint: {
          "circle-radius": ["case", ["==", ["get", "alert"], true], 6.5, 4.5],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#0b0b1a",
          "circle-stroke-width": 1.4,
        },
      }, beneath.current);
      m.addLayer({
        id: "gauge-sel", type: "circle", source: "gauges",
        filter: ["==", ["get", "lid"], ""],
        paint: {
          "circle-radius": 11, "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": "#d9b775", "circle-stroke-width": 2,
        },
      }, beneath.current);

      m.on("click", "gauge-dot", (e) => {
        const lid = e.features?.[0]?.properties?.lid;
        if (typeof lid === "string") onSelectRef.current(lid);
      });
      m.on("mouseenter", "gauge-dot", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "gauge-dot", () => { m.getCanvas().style.cursor = ""; });

      // A slow breath on the alert halo. Cheap — one paint property, no layout.
      if (!prefersReducedMotion()) {
        let raf = 0;
        const tick = () => {
          if (!m.getLayer("gauge-halo")) return;
          const k = 0.5 + 0.5 * Math.sin(Date.now() / 900);
          m.setPaintProperty("gauge-halo", "circle-radius", 13 + k * 8);
          m.setPaintProperty("gauge-halo", "circle-opacity", 0.10 + k * 0.14);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        m.once("remove", () => cancelAnimationFrame(raf));
      }
    });
    return () => { m.remove(); map.current = null; };
    // Centre changes are handled by the effect below; this one builds once.
     
  }, []);

  useEffect(() => {
    const m = map.current;
    const src = m?.getSource("gauges") as maplibregl.GeoJSONSource | undefined;
    if (!m || !src) return;
    src.setData({
      type: "FeatureCollection",
      features: gauges.map((g) => {
        const st = FLOOD_STYLE[g.worst] ?? FLOOD_STYLE.not_defined;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [g.longitude, g.latitude] },
          properties: { lid: g.lid, name: g.name, color: st.color, alert: st.rank >= 1 },
        };
      }),
    });
  }, [gauges]);

  useEffect(() => {
    const m = map.current;
    if (!m || !m.getLayer("gauge-sel")) return;
    m.setFilter("gauge-sel", ["==", ["get", "lid"], selected ?? ""]);
    const g = gauges.find((x) => x.lid === selected);
    if (g) m.easeTo({ center: [g.longitude, g.latitude], duration: 600 });
  }, [selected, gauges]);

  useEffect(() => {
    map.current?.easeTo({ center: [center.lon, center.lat], zoom: 6.2, duration: 700 });
  }, [center.lat, center.lon]);

  return <div ref={box} style={{ height }} className="w-full rounded-xl overflow-hidden" />;
}
