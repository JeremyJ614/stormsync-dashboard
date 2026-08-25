/**
 * Fire weather map: SPC outlook polygons over the royal basemap, with live
 * InciWeb incidents as embers on top.
 *
 * The one flourish this module earns — each risk polygon rises in weakest-first,
 * so the threat assembles rather than appearing, and the incident markers carry
 * a slow ember pulse scaled to fire size.
 */
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { applyRoyalBasemap } from "../../lib/basemap";
import { riskOf, type Incident } from "../../lib/fireWeather";
import { prefersReducedMotion } from "../../lib/royal";

const DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

interface Props {
  features: GeoJSON.Feature[];
  incidents: Incident[];
  center: { lat: number; lon: number };
  showIncidents: boolean;
  height?: number;
}

export function FireMap({ features, incidents, center, showIncidents, height = 400 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const beneath = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!box.current || map.current) return;
    const m = new maplibregl.Map({
      container: box.current, style: DARK_STYLE,
      center: [center.lon, center.lat], zoom: 3.6, attributionControl: false,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      beneath.current = applyRoyalBasemap(m);
      m.addSource("fire-otlk", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "fire-fill", type: "fill", source: "fire-otlk",
        paint: { "fill-color": ["get", "fill"], "fill-opacity": 0 },
      }, beneath.current);
      m.addLayer({
        id: "fire-line", type: "line", source: "fire-otlk",
        paint: { "line-color": ["get", "stroke"], "line-width": 1.6, "line-opacity": 0 },
      }, beneath.current);

      m.addSource("fire-inc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "inc-glow", type: "circle", source: "fire-inc",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "size"], 0, 9, 1, 22],
          "circle-color": "#ff6b3d", "circle-opacity": 0.18, "circle-blur": 0.8,
        },
      });
      m.addLayer({
        id: "inc-dot", type: "circle", source: "fire-inc",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "size"], 0, 3.4, 1, 7],
          "circle-color": "#ffb245", "circle-stroke-color": "#2a0f05", "circle-stroke-width": 1.2,
        },
      });

      if (!prefersReducedMotion()) {
        let raf = 0;
        const tick = () => {
          if (!m.getLayer("inc-glow")) return;
          const k = 0.5 + 0.5 * Math.sin(Date.now() / 1100);
          m.setPaintProperty("inc-glow", "circle-opacity", 0.10 + k * 0.18);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        m.once("remove", () => cancelAnimationFrame(raf));
      }
    });
    return () => { m.remove(); map.current = null; };
     
  }, []);

  // Outlook polygons — raised in weakest-first so the hierarchy reads itself.
  useEffect(() => {
    const m = map.current;
    const src = m?.getSource("fire-otlk") as maplibregl.GeoJSONSource | undefined;
    if (!m || !src) return;
    const sorted = [...features].sort(
      (a, b) => riskOf(String(a.properties?.label)).rank - riskOf(String(b.properties?.label)).rank,
    );
    src.setData({ type: "FeatureCollection", features: sorted });

    if (prefersReducedMotion()) {
      m.setPaintProperty("fire-fill", "fill-opacity", 0.34);
      m.setPaintProperty("fire-line", "line-opacity", 0.9);
      return;
    }
    m.setPaintProperty("fire-fill", "fill-opacity", 0);
    m.setPaintProperty("fire-line", "line-opacity", 0);
    const start = performance.now();
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / 700);
      const eased = 1 - Math.pow(1 - p, 3);
      if (!m.getLayer("fire-fill")) return;
      m.setPaintProperty("fire-fill", "fill-opacity", 0.34 * eased);
      m.setPaintProperty("fire-line", "line-opacity", 0.9 * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [features]);

  useEffect(() => {
    const m = map.current;
    const src = m?.getSource("fire-inc") as maplibregl.GeoJSONSource | undefined;
    if (!m || !src) return;
    const rows = showIncidents
      ? incidents.filter((i) => i.latitude != null && i.longitude != null)
      : [];
    const maxAcres = Math.max(1000, ...rows.map((i) => i.acres ?? 0));
    src.setData({
      type: "FeatureCollection",
      features: rows.map((i) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [i.longitude!, i.latitude!] },
        properties: { title: i.title, size: Math.min(1, (i.acres ?? 500) / maxAcres) },
      })),
    });
  }, [incidents, showIncidents]);

  return <div ref={box} style={{ height }} className="w-full rounded-xl overflow-hidden" />;
}
