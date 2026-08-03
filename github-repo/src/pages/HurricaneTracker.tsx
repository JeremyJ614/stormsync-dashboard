/**
 * SSWX VIP Tropical Tracker — Enhanced rebuild.
 *
 * Fixes & additions vs previous version:
 *  • SST overlay → NASA GIBS WMTS (reliable, CORS-OK, 60fps raster tiles)
 *  • NHC 7-Day Formation Odds → HTML image panel (no CORS friction)
 *  • Active storm clicking → flies map to storm
 *  • Previous (best) track → rendered as a colored polyline on the map
 *  • Spaghetti / model tracks → NHC image panel per selected storm
 *  • Wind radii → GeoJSON fill via the NHC edge-function proxy
 *  • Season stats, Areas to Watch, About section retained
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { NHC_API } from "../config";
import {
  Wind, RefreshCw, ChevronDown, ChevronUp, History,
  Navigation2, Gauge, ExternalLink, Clock, Info, Eye,
  Globe2, Map as MapIcon, Layers, TrendingUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Storm {
  id: string;
  name: string;
  classification?: string;
  intensity?: string | number;
  pressure?: string | number;
  latitudeNumeric?: number;
  longitudeNumeric?: number;
  latitude?: string;
  longitude?: string;
  movementDir?: string | number;
  movementSpeed?: string | number;
  lastUpdate?: string;
  forecastGraphics?: { url?: string };
  publicAdvisory?: { url?: string };
}

interface Disturbance {
  id: string;
  basin: string;
  probability: number;
  description: string;
  location?: string;
}

interface TrackPoint {
  lat: number;
  lon: number;
  winds_kt: number;
  pressure?: number;
  timestamp: string;
  type?: string;
}

type MapTab = "active-zone" | "full-atlantic" | "worldwide" | "sst" | "active-systems" | "formation-odds";

// ─── Constants ────────────────────────────────────────────────────────────────
const KT_TO_MPH = 1.15078;

// CARTO Dark Matter vector style — city labels, borders, state names at 60fps.
const CARTO_DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// NASA GIBS MUR SST — served as WMS (bbox-epsg-3857 format), CORS-OK, ~1-3 day latency.
// WMS format confirmed working (HTTP 200). The WMTS {z}/{y}/{x} endpoint returns 400.
function sstDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d.toISOString().slice(0, 10);
}
const SST_TILES = `https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=GHRSST_L4_MUR_Sea_Surface_Temperature&STYLES=&FORMAT=image%2Fpng&TRANSPARENT=TRUE&CRS=EPSG%3A3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}&TIME=${sstDate()}`;

const TAB_VIEWS: Record<MapTab, { center: [number, number]; zoom: number; label: string }> = {
  "active-zone":    { center: [-60, 25],   zoom: 3.5,  label: "Active Zone" },
  "full-atlantic":  { center: [-55, 25],   zoom: 2.8,  label: "Full Atlantic" },
  "worldwide":      { center: [0,   20],   zoom: 1.5,  label: "Worldwide" },
  "sst":            { center: [0,   20],   zoom: 1.5,  label: "Sea Surface Temp" },
  "active-systems": { center: [-60, 25],   zoom: 3.5,  label: "Active Systems" },
  "formation-odds": { center: [-55, 25],   zoom: 2.8,  label: "NHC 7-Day Odds" },
};

// ─── Storm helpers ─────────────────────────────────────────────────────────────
function stormCategory(kt: number) {
  if (kt >= 137) return { label: "Category 5 Hurricane", short: "CAT 5", color: "#d946ef" };
  if (kt >= 113) return { label: "Category 4 Hurricane", short: "CAT 4", color: "#a855f7" };
  if (kt >= 96)  return { label: "Category 3 Hurricane", short: "CAT 3", color: "#ef4444" };
  if (kt >= 83)  return { label: "Category 2 Hurricane", short: "CAT 2", color: "#f97316" };
  if (kt >= 64)  return { label: "Category 1 Hurricane", short: "CAT 1", color: "#fbbf24" };
  if (kt >= 34)  return { label: "Tropical Storm",       short: "TS",    color: "#22d3ee" };
  return         { label: "Tropical Depression",        short: "TD",    color: "#94a3b8" };
}

function stormCoords(s: Storm): [number, number] | null {
  if (typeof s.latitudeNumeric === "number" && typeof s.longitudeNumeric === "number")
    return [s.longitudeNumeric, s.latitudeNumeric];
  const parse = (v?: string, neg?: RegExp) => {
    if (!v) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : (neg?.test(v) ? -n : n);
  };
  const lat = parse(s.latitude, /S/i);
  const lon = parse(s.longitude, /W/i);
  return lat !== null && lon !== null ? [lon, lat] : null;
}

function formatUpdate(ts?: string) {
  if (!ts) return null;
  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
  } catch { return ts; }
}

// Storm ID → NHC uppercase format (e.g. "al012026" → "AL012026")
function nhcId(id: string) { return id.toUpperCase(); }

// NHC storm graphics folder: basin (2 chars) + storm number (2 chars), e.g. "EP07"
// The /api/ path only contains .kmz and .js files — actual PNGs are under /storm_graphics/{FOLDER}/
function stormFolder(stormId: string): string {
  const id = nhcId(stormId); // e.g. "EP072026"
  return id.slice(0, 2) + id.slice(2, 4); // "EP" + "07" → "EP07"
}

// NHC storm graphics image URLs — _latest.png suffix gives the current advisory image
function spaghettUrl(stormId: string) {
  const folder = stormFolder(stormId);
  return `https://www.nhc.noaa.gov/storm_graphics/${folder}/${nhcId(stormId)}_all_model_track_latest.png`;
}
function coneUrl(stormId: string) {
  const folder = stormFolder(stormId);
  return `https://www.nhc.noaa.gov/storm_graphics/${folder}/${nhcId(stormId)}_5day_cone_with_line_and_wind_latest.png`;
}

// ─── Tropical Map ─────────────────────────────────────────────────────────────
interface TropicalMapProps {
  storms: Storm[];
  tracks: Record<string, TrackPoint[]>;   // stormId → best track pts
  windRadii: Record<string, GeoJSON.FeatureCollection>; // stormId → radii GeoJSON
  activeTab: MapTab;
  selectedStormId: string | null;
  onStormClick?: (stormId: string) => void;
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
}

function TropicalMap({
  storms, tracks, windRadii, activeTab, selectedStormId, onStormClick, mapRef,
}: TropicalMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // ── Init map ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CARTO_DARK_STYLE,
      center: [-55, 25],
      zoom: 2.8,
      attributionControl: false,
      scrollZoom: false,
    });

    map.on("load", () => {
      // SST raster source — WMS with {bbox-epsg-3857} placeholder.
      // MapLibre substitutes the bbox automatically; tileSize 256 keeps tiles manageable.
      map.addSource("sst", {
        type: "raster",
        tiles: [SST_TILES],
        tileSize: 256,
        attribution: "NASA/JPL MUR SST via NASA GIBS WMS",
      });
      map.addLayer({ id: "sst-layer", type: "raster", source: "sst", layout: { visibility: "none" }, paint: { "raster-opacity": 0.9 } });

      // Best-track lines source
      map.addSource("tracks", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "track-line", type: "line", source: "tracks",
        paint: { "line-color": ["get", "__color"], "line-width": 2, "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "track-dots", type: "circle", source: "tracks",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 4,
          "circle-color": ["get", "__color"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.85,
        },
      });

      // Wind radii source
      map.addSource("radii", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "radii-fill", type: "fill", source: "radii",
        paint: { "fill-color": ["get", "__color"], "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: "radii-outline", type: "line", source: "radii",
        paint: { "line-color": ["get", "__color"], "line-width": 1.2, "line-opacity": 0.6 },
      });

      // Storm dot markers — circles + glow
      map.addSource("storms", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "storm-glow", type: "circle", source: "storms",
        paint: { "circle-radius": 28, "circle-color": ["get", "color"], "circle-opacity": 0.14, "circle-blur": 1.0 },
      });
      map.addLayer({
        id: "storm-dot", type: "circle", source: "storms",
        paint: {
          "circle-radius": ["case", ["==", ["get", "id"], selectedStormId ?? ""], 13, 10],
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.95,
        },
      });

      // Click handler on storm dots
      map.on("click", "storm-dot", (e) => {
        const feat = e.features?.[0];
        if (feat?.properties?.id) onStormClick?.(feat.properties.id);
      });
      map.on("mouseenter", "storm-dot", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "storm-dot", () => { map.getCanvas().style.cursor = ""; });

      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Update storm dots ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const features = storms.flatMap(s => {
      const coords = stormCoords(s);
      if (!coords) return [];
      const cat = stormCategory(Number(s.intensity) || 0);
      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: coords },
        properties: { id: s.id, name: s.name, color: cat.color, short: cat.short },
      }];
    });
    (map.getSource("storms") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection", features,
    });

    // Update selected storm pulse radius in paint
    map.setPaintProperty("storm-dot", "circle-radius", [
      "case",
      ["==", ["get", "id"], selectedStormId ?? "___none___"],
      14, 10,
    ]);
  }, [mapReady, storms, selectedStormId]);

  // ── Update best-track lines ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const lineFeatures: GeoJSON.Feature[] = [];
    const dotFeatures: GeoJSON.Feature[] = [];

    for (const [_sid, pts] of Object.entries(tracks)) {
      if (!pts.length) continue;
      // Line string
      lineFeatures.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: pts.map(p => [p.lon, p.lat]) },
        properties: { __color: "#ffffff" },
      });
      // Dots colored by intensity
      for (const pt of pts) {
        const cat = stormCategory(pt.winds_kt);
        dotFeatures.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [pt.lon, pt.lat] },
          properties: { __color: cat.color },
        });
      }
    }

    (mapRef.current.getSource("tracks") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: [...lineFeatures, ...dotFeatures],
    });
  }, [mapReady, tracks]);

  // ── Update wind radii ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const allFeatures: GeoJSON.Feature[] = [];
    for (const [_sid, fc] of Object.entries(windRadii)) {
      allFeatures.push(...(fc.features ?? []));
    }
    (mapRef.current.getSource("radii") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection", features: allFeatures,
    });
  }, [mapReady, windRadii]);

  // ── Tab view + SST toggle ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const view = TAB_VIEWS[activeTab];
    map.flyTo({ center: view.center, zoom: view.zoom, duration: 900 });
    map.setLayoutProperty("sst-layer", "visibility", activeTab === "sst" ? "visible" : "none");
  }, [mapReady, activeTab]);

  // ── Fly to selected storm ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current || !selectedStormId) return;
    const storm = storms.find(s => s.id === selectedStormId);
    if (!storm) return;
    const coords = stormCoords(storm);
    if (coords) {
      mapRef.current.flyTo({ center: coords, zoom: 5.5, duration: 1200 });
    }
  }, [mapReady, selectedStormId, storms]);

  return (
    <div className="relative w-full" style={{ height: "430px" }}>
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute bottom-8 left-2 text-[10px] font-bold tracking-widest text-white/35 font-mono pointer-events-none">
        VIP.SSWX.SPACE
      </div>
      <div className="absolute top-2 right-10 text-[10px] text-white/50 bg-black/50 rounded px-2 py-0.5 pointer-events-none">
        Updated: {new Date().toLocaleString("en-US", {
          month: "numeric", day: "numeric", year: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
        })}
      </div>
    </div>
  );
}

// ─── Intensity scale ───────────────────────────────────────────────────────────
const INTENSITY_SCALE = [
  { label: "TD",     desc: "< 39 mph",     color: "#94a3b8" },
  { label: "TS",     desc: "39–73 mph",    color: "#22d3ee" },
  { label: "Cat 1",  desc: "74–95 mph",    color: "#fbbf24" },
  { label: "Cat 2",  desc: "96–110 mph",   color: "#f97316" },
  { label: "Cat 3",  desc: "111–129 mph",  color: "#ef4444" },
  { label: "Cat 4",  desc: "130–156 mph",  color: "#a855f7" },
  { label: "Cat 5",  desc: "≥ 157 mph",    color: "#d946ef" },
];

// SST color scale (for the legend panel)
const SST_SCALE = [
  { c: "#050f7a", label: "≤ 20°C" },
  { c: "#0052ff", label: "22°C" },
  { c: "#00baff", label: "24°C" },
  { c: "#00ff88", label: "26°C" },
  { c: "#ffff00", label: "28°C" },
  { c: "#ff8800", label: "30°C" },
  { c: "#ff0000", label: "32°C+" },
];

// ─── NHC 7-Day Formation Odds Panel ───────────────────────────────────────────
function FormationOddsPanel() {
  const [errAtl, setErrAtl]   = useState(false);
  const [errEpac, setErrEpac] = useState(false);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-black/30 flex items-center justify-between">
        <div>
          <div className="font-bold text-sm">NHC 7-Day Formation Odds</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Areas with ≥10% chance of tropical development in the next 7 days
          </div>
        </div>
        <a
          href="https://www.nhc.noaa.gov/gtwo.php"
          target="_blank" rel="noopener noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" /> NHC Source
        </a>
      </div>
      <div className="p-4 space-y-4">
        {/* Atlantic */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Atlantic Basin
          </div>
          {errAtl ? (
            <div className="text-sm text-muted-foreground bg-muted/20 rounded-lg p-4 text-center">
              Image unavailable — <a href="https://www.nhc.noaa.gov/gtwo.php?basin=atlc&fdays=7" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">view on NHC</a>
            </div>
          ) : (
            <img
              src="https://www.nhc.noaa.gov/xgtwo/two_atl_7d0.png"
              alt="NHC Atlantic 7-Day Formation Odds"
              className="w-full rounded-lg"
              onError={() => setErrAtl(true)}
            />
          )}
        </div>
        {/* East Pacific */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            East Pacific Basin
          </div>
          {errEpac ? (
            <div className="text-sm text-muted-foreground bg-muted/20 rounded-lg p-4 text-center">
              Image unavailable — <a href="https://www.nhc.noaa.gov/gtwo.php?basin=epac&fdays=7" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">view on NHC</a>
            </div>
          ) : (
            <img
              src="https://www.nhc.noaa.gov/xgtwo/two_epac_7d0.png"
              alt="NHC East Pacific 7-Day Formation Odds"
              className="w-full rounded-lg"
              onError={() => setErrEpac(true)}
            />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Color-coded by 7-day formation probability: Yellow ≥10%, Orange ≥30%, Red ≥60%.
          Source: National Hurricane Center Tropical Weather Outlook.
        </p>
      </div>
    </div>
  );
}

// ─── Storm Model Panel (spaghetti + cone) ─────────────────────────────────────
function StormModelPanel({ storm }: { storm: Storm }) {
  const [view, setView] = useState<"spaghetti" | "cone">("cone");
  const [err, setErr] = useState(false);

  const url = view === "cone" ? coneUrl(storm.id) : spaghettUrl(storm.id);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mt-3">
      <div className="px-4 py-2.5 border-b border-border bg-black/20 flex items-center gap-2">
        <Layers className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm">Forecast Graphics — {storm.name}</span>
        <div className="ml-auto flex rounded-lg overflow-hidden border border-border text-[11px] font-medium">
          {(["cone", "spaghetti"] as const).map(v => (
            <button
              key={v}
              onClick={() => { setView(v); setErr(false); }}
              className={`px-3 py-1 capitalize transition-colors ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v === "spaghetti" ? "Model Tracks" : "Forecast Cone"}
            </button>
          ))}
        </div>
      </div>
      <div className="p-3">
        {err ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <div className="text-xl mb-2">📡</div>
            Graphic not available yet — the NHC publishes these after the first advisory.{" "}
            {storm.forecastGraphics?.url && (
              <a href={storm.forecastGraphics.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                View on NHC
              </a>
            )}
          </div>
        ) : (
          <img
            key={url}
            src={url}
            alt={`${storm.name} ${view}`}
            className="w-full rounded-lg"
            onError={() => setErr(true)}
          />
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          {view === "cone"
            ? "Official NHC 5-day forecast cone. The cone represents the probable track of the center, not the storm's full size."
            : "Ensemble model tracks from major global and regional forecast systems. Spread indicates forecast uncertainty."}
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function HurricaneTracker() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [activeTab,       setActiveTab]       = useState<MapTab>("active-zone");
  const [selectedStormId, setSelectedStormId] = useState<string | null>(null);
  const [showModels,      setShowModels]       = useState<Record<string, boolean>>({});
  const [aboutOpen,       setAboutOpen]        = useState(false);
  const [basinUpdated,    setBasinUpdated]     = useState<string | null>(null);
  const [tracks,          setTracks]           = useState<Record<string, TrackPoint[]>>({});
  const [windRadii,       setWindRadii]        = useState<Record<string, GeoJSON.FeatureCollection>>({});

  // ── Active storms ───────────────────────────────────────────────────────
  const { data, isLoading, isError, refetch, isFetching, dataUpdatedAt } = useQuery<{ activeStorms: Storm[] }>({
    queryKey: ["nhc-active"],
    queryFn: async () => {
      const res = await fetch(`${NHC_API}/active`);
      if (!res.ok) throw new Error("NHC fetch failed");
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  // ── Areas to Watch ──────────────────────────────────────────────────────
  const { data: atwData } = useQuery<{ disturbances: Disturbance[] }>({
    queryKey: ["nhc-atw"],
    queryFn: async () => {
      const res = await fetch(`${NHC_API}/areas-to-watch`);
      if (!res.ok) return { disturbances: [] };
      return res.json();
    },
    refetchInterval: 30 * 60 * 1000,
    staleTime: 29 * 60 * 1000,
  });

  const storms      = data?.activeStorms ?? [];
  const disturbances = atwData?.disturbances ?? [];
  const isQuiet     = storms.length === 0;

  // ── Fetch best tracks for all active storms ──────────────────────────────
  useEffect(() => {
    if (!storms.length) return;
    for (const s of storms) {
      // Only fetch if we don't already have this storm's track
      if (tracks[s.id]) continue;
      fetch(`${NHC_API}/track/${s.id}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { track?: TrackPoint[] } | null) => {
          if (data?.track?.length) {
            setTracks(prev => ({ ...prev, [s.id]: data.track! }));
          }
        })
        .catch(() => { /* best-effort */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storms.map(s => s.id).join(",")]);

  // ── Fetch wind radii for active storms ───────────────────────────────────
  useEffect(() => {
    if (!storms.length) return;
    for (const s of storms) {
      if (windRadii[s.id]) continue;
      fetch(`${NHC_API}/windrad/${s.id}`)
        .then(r => r.ok ? r.json() : null)
        .then((data: { radii?: GeoJSON.FeatureCollection } | null) => {
          if (data?.radii) {
            setWindRadii(prev => ({ ...prev, [s.id]: data.radii! }));
          }
        })
        .catch(() => { /* best-effort */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storms.map(s => s.id).join(",")]);

  useEffect(() => {
    if (dataUpdatedAt) {
      setBasinUpdated(new Date(dataUpdatedAt).toLocaleString("en-US", {
        month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
      }));
    }
  }, [dataUpdatedAt]);

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  // Clicking a storm: select + switch to Active Zone tab
  const handleStormSelect = useCallback((stormId: string) => {
    setSelectedStormId(prev => prev === stormId ? null : stormId);
    setActiveTab("active-zone");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero ── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0b1f3a 0%, #0d2847 40%, #112040 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url(https://www.nhc.noaa.gov/tafb/atl_lt.gif)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            mixBlendMode: "screen",
            filter: "hue-rotate(180deg) saturate(1.4)",
          }}
        />
        <div className="relative z-10 px-4 py-6 md:px-8">
          <div
            className="inline-block text-[10px] font-bold tracking-[0.2em] uppercase px-2.5 py-1 rounded mb-3"
            style={{ background: "#00c8ff33", color: "#00c8ff", border: "1px solid #00c8ff55" }}
          >
            STORMSYNC VIP TROPICS
          </div>
          <h1
            className="font-black uppercase leading-none mb-2"
            style={{
              fontSize: "clamp(2.2rem, 8vw, 3.8rem)",
              fontFamily: "'Barlow Condensed', 'Inter', sans-serif",
              letterSpacing: "-0.01em",
              color: "#ffffff",
              textShadow: "0 2px 20px rgba(0,200,255,0.3)",
            }}
          >
            TROPICAL TRACKER
          </h1>
          <p className="text-sm text-white/60 max-w-lg">
            Live hurricane tracking · NHC forecasts · Sea surface temp · Model guidance · VIP impact outlook
          </p>
        </div>
      </div>

      {/* ── Map block ── */}
      <div className="bg-[#0a1628] border-b border-border">
        {/* Map header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center">
              <Globe2 className="w-3 h-3 text-primary" />
            </div>
            <span className="text-xs font-bold tracking-wider text-foreground/80 uppercase">
              The Tropics Right Now
            </span>
            <span className="text-xs text-muted-foreground hidden sm:block">
              · Sea surface temp · Active systems · NHC 7-day formation odds
            </span>
          </div>
          <div className="flex items-center gap-3">
            {basinUpdated && (
              <span className="text-[10px] text-muted-foreground hidden md:block">
                Updated: {basinUpdated}
              </span>
            )}
            <span
              className="text-[10px] font-bold uppercase px-2 py-0.5 rounded"
              style={{
                background: isQuiet ? "#1a2a1a" : "#2a1a1a",
                color: isQuiet ? "#4ade80" : "#f87171",
                border: `1px solid ${isQuiet ? "#22c55e33" : "#ef444433"}`,
              }}
            >
              {isQuiet ? "QUIET" : `${storms.length} ACTIVE`}
            </span>
            {selectedStormId && (
              <button
                onClick={() => setSelectedStormId(null)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                × Clear selection
              </button>
            )}
          </div>
        </div>

        {/* Map */}
        <TropicalMap
          storms={storms}
          tracks={selectedStormId ? { [selectedStormId]: tracks[selectedStormId] ?? [] } : tracks}
          windRadii={selectedStormId ? { [selectedStormId]: windRadii[selectedStormId] ?? { type: "FeatureCollection", features: [] } } : windRadii}
          activeTab={activeTab}
          selectedStormId={selectedStormId}
          onStormClick={handleStormSelect}
          mapRef={mapRef}
        />

        {/* Tab navigation */}
        <div className="flex overflow-x-auto border-t border-border/50 bg-[#080f1e]">
          {(Object.entries(TAB_VIEWS) as [MapTab, { label: string }][]).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`
                px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border-b-2 shrink-0
                ${activeTab === key
                  ? "border-primary text-primary bg-primary/10"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5"}
              `}
            >
              {label}
            </button>
          ))}
          <div className="ml-auto px-4 py-2.5 text-[10px] text-muted-foreground/60 uppercase tracking-wider whitespace-nowrap self-center">
            ◉ Basin as of {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Loading / error */}
        {isLoading && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <div className="inline-block animate-spin text-2xl mb-2">🌀</div>
            <p>Fetching NHC data…</p>
          </div>
        )}
        {isError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-center">
            Unable to reach the NHC data feed.{" "}
            <button onClick={handleRefresh} className="text-primary underline">Retry</button>
          </div>
        )}

        {/* ── NHC 7-Day Odds panel (shown when formation-odds tab) ── */}
        {activeTab === "formation-odds" && <FormationOddsPanel />}

        {/* ── SST legend (shown on SST tab) ── */}
        {activeTab === "sst" && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Sea Surface Temperature — MUR JPL SST via NASA GIBS
            </div>
            <div className="flex gap-2 items-end">
              {SST_SCALE.map(sw => (
                <div key={sw.label} className="flex flex-col items-center gap-1 flex-1">
                  <div className="w-full h-5 rounded-sm" style={{ background: sw.c }} />
                  <span className="text-[9px] text-muted-foreground">{sw.label}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              Data: NASA/JPL MUR SST Analysis (1 km resolution, ~3 day latency).
              Waters above 26°C (orange+) can support tropical development and intensification.
            </p>
          </div>
        )}

        {/* ── Quiet state ── */}
        {!isLoading && !isError && isQuiet && (
          <div className="text-center py-8">
            <div className="inline-block border border-border rounded-2xl px-8 py-8 bg-card/50 backdrop-blur-sm max-w-lg w-full">
              <h2 className="text-xl font-bold tracking-widest uppercase mb-3">
                The Tropics Are Quiet
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                No active tropical systems right now. When a storm forms, it gets its own live tracker
                here automatically — official NHC cone and advisories, model guidance, sea surface temp,
                and our VIP impact outlook.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-background/80 border border-border rounded-xl p-4">
                  <div className="text-3xl font-black text-foreground">0</div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1">
                    Active Storms
                  </div>
                </div>
                <div className="bg-background/80 border border-border rounded-xl p-4">
                  <div className="text-3xl font-black text-foreground">{disturbances.length}</div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-1">
                    Areas Being Watched
                  </div>
                </div>
              </div>
              <Link href="/hurricane/history">
                <button className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/10 text-sm font-medium transition-all">
                  <History className="w-4 h-4" />
                  Browse Past Storms
                </button>
              </Link>
            </div>
          </div>
        )}

        {/* ── Active storms ── */}
        {!isLoading && !isError && !isQuiet && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Active Systems — {storms.length} Storm{storms.length !== 1 ? "s" : ""}
              </h2>
              <button
                onClick={handleRefresh}
                disabled={isFetching}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>

            {storms.map(s => {
              const kt  = Number(s.intensity) || 0;
              const cat = stormCategory(kt);
              const mph = Math.round(kt * KT_TO_MPH);
              const isSelected = selectedStormId === s.id;
              const hasTrack   = (tracks[s.id]?.length ?? 0) > 0;
              const showModel  = showModels[s.id];

              return (
                <div
                  key={s.id}
                  className="rounded-2xl overflow-hidden border transition-all"
                  style={{ borderColor: isSelected ? cat.color + "88" : cat.color + "44" }}
                >
                  {/* Storm header — clickable to select + fly map */}
                  <button
                    className="w-full px-4 py-3 flex items-center justify-between text-left transition-all"
                    style={{ background: `linear-gradient(90deg, ${cat.color}${isSelected ? "28" : "18"} 0%, transparent 100%)` }}
                    onClick={() => handleStormSelect(s.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🌀</span>
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wider">{cat.label}</div>
                        <div className="font-black text-lg uppercase tracking-wide">{s.name}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span
                          className="inline-block text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider"
                          style={{ background: cat.color + "22", color: cat.color }}
                        >
                          {cat.short}
                        </span>
                        {s.lastUpdate && (
                          <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1 justify-end">
                            <Clock className="w-3 h-3" />
                            {formatUpdate(s.lastUpdate)}
                          </div>
                        )}
                      </div>
                      <div
                        className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
                        style={{
                          background: isSelected ? cat.color + "22" : "transparent",
                          borderColor: isSelected ? cat.color + "66" : "rgba(255,255,255,0.08)",
                          color: isSelected ? cat.color : "rgba(255,255,255,0.5)",
                        }}
                      >
                        <MapIcon className="w-3 h-3" />
                        {isSelected ? "Tracking" : "View"}
                      </div>
                    </div>
                  </button>

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-px bg-border">
                    <div className="bg-card px-4 py-3 text-center">
                      <Wind className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-xl font-black">{mph}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">mph winds</div>
                    </div>
                    <div className="bg-card px-4 py-3 text-center">
                      <Gauge className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-xl font-black">{s.pressure || "—"}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">mb pressure</div>
                    </div>
                    <div className="bg-card px-4 py-3 text-center">
                      <Navigation2 className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                      <div className="text-xl font-black">{s.movementSpeed || "—"}</div>
                      <div className="text-[10px] text-muted-foreground uppercase">
                        {s.movementDir ? `mph ${s.movementDir}` : "movement"}
                      </div>
                    </div>
                  </div>

                  {/* Track info row */}
                  {isSelected && (
                    <div className="bg-black/20 px-4 py-2.5 flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <TrendingUp className="w-3.5 h-3.5 text-primary" />
                        {hasTrack
                          ? `Best track loaded · ${tracks[s.id].length} positions`
                          : "Loading best track…"}
                      </div>
                    </div>
                  )}

                  {/* Links + model toggle */}
                  <div className="grid gap-px bg-border" style={{ gridTemplateColumns: `repeat(${[s.forecastGraphics?.url, s.publicAdvisory?.url, true].filter(Boolean).length}, 1fr)` }}>
                    {s.forecastGraphics?.url && (
                      <a
                        href={s.forecastGraphics.url}
                        target="_blank" rel="noopener noreferrer"
                        className="bg-card px-4 py-2.5 text-xs text-primary hover:bg-primary/10 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Forecast Cone
                      </a>
                    )}
                    {s.publicAdvisory?.url && (
                      <a
                        href={s.publicAdvisory.url}
                        target="_blank" rel="noopener noreferrer"
                        className="bg-card px-4 py-2.5 text-xs text-primary hover:bg-primary/10 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Public Advisory
                      </a>
                    )}
                    <button
                      onClick={() => setShowModels(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
                      className={`bg-card px-4 py-2.5 text-xs flex items-center justify-center gap-1.5 transition-colors ${showModel ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary"}`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      {showModel ? "Hide Models" : "Show Models"}
                    </button>
                  </div>

                  {/* Spaghetti / cone panel */}
                  {showModel && (
                    <div className="px-4 pb-4">
                      <StormModelPanel storm={s} />
                    </div>
                  )}
                </div>
              );
            })}

            <Link href="/hurricane/history">
              <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/10 text-sm transition-all">
                <History className="w-4 h-4" />
                Browse Past Storms
              </button>
            </Link>
          </div>
        )}

        {/* ── Areas to Watch ── */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-card/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm">Areas to Watch</span>
            </div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              As of {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          <div className="px-4 py-4 text-sm text-muted-foreground">
            {disturbances.length === 0 ? (
              <p>No areas of tropical development are being watched right now. The basin is quiet.</p>
            ) : (
              <div className="space-y-3">
                {disturbances.map(d => (
                  <div key={d.id} className="flex items-start gap-3">
                    <div
                      className="mt-1 w-3 h-3 rounded-full shrink-0"
                      style={{ background: d.probability >= 60 ? "#f97316" : d.probability >= 30 ? "#fbbf24" : "#94a3b8" }}
                    />
                    <div>
                      <div className="font-medium text-foreground">{d.description}</div>
                      <div className="text-[11px] mt-0.5">{d.basin}</div>
                      {d.location && <div className="text-[11px] mt-0.5">{d.location}</div>}
                      <div className="text-[11px] mt-0.5 font-medium" style={{
                        color: d.probability >= 60 ? "#f97316" : d.probability >= 30 ? "#fbbf24" : "#94a3b8"
                      }}>
                        {d.probability}% formation chance (7 days)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Past Storm History ── */}
        <Link href="/hurricane/history">
          <div className="border border-border rounded-xl overflow-hidden cursor-pointer hover:border-primary/40 transition-colors group">
            <div className="px-4 py-4 flex items-center justify-between bg-card/40 hover:bg-card/70 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <History className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="font-bold">Past Storm History</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Track every storm — best tracks, peak intensity, graphics, advisories
                  </div>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors -rotate-90" />
            </div>
          </div>
        </Link>

        {/* ── About ── */}
        <div className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setAboutOpen(v => !v)}
            className="w-full px-4 py-4 flex items-center justify-between bg-card/40 hover:bg-card/60 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-muted/30 flex items-center justify-center">
                <Info className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <div className="font-bold">About the Tropical Tracker</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Data sources, the Saffir-Simpson scale, NHC advisory schedule
                </div>
              </div>
            </div>
            {aboutOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
          </button>
          {aboutOpen && (
            <div className="px-4 py-4 border-t border-border text-sm text-muted-foreground space-y-3">
              <p><strong className="text-foreground">Data sources:</strong> Active storm positions and intensities from the National Hurricane Center (NHC) — updated every 5 minutes. Sea surface temperature: NASA/JPL MUR SST Analysis at 1 km resolution via NASA GIBS.</p>
              <p><strong className="text-foreground">Spaghetti models:</strong> Ensemble model tracks from the NHC operational models — tap "Show Models" on any active storm card. Forecast cone images are official NHC graphics.</p>
              <p><strong className="text-foreground">Best track:</strong> Click any active storm to highlight it on the map. The storm's previous positions (best track) appear as colored dots, color-coded by intensity at each point.</p>
              <p><strong className="text-foreground">Advisory schedule:</strong> NHC issues advisories every 6 hours for active tropical storms and hurricanes (more frequently when threatening land). Formation outlooks update every 6 hours.</p>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-1.5 pr-4 font-semibold text-foreground">Type</th>
                      <th className="text-left py-1.5 pr-4 font-semibold text-foreground">Winds</th>
                      <th className="text-left py-1.5 font-semibold text-foreground">Color</th>
                    </tr>
                  </thead>
                  <tbody>
                    {INTENSITY_SCALE.map(row => (
                      <tr key={row.label} className="border-b border-border/30">
                        <td className="py-1.5 pr-4" style={{ color: row.color }}>{row.label}</td>
                        <td className="py-1.5 pr-4">{row.desc}</td>
                        <td className="py-1.5"><div className="w-4 h-4 rounded-sm" style={{ background: row.color }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] border-t border-border pt-3">
                For life-safety guidance, always defer to{" "}
                <a href="https://www.nhc.noaa.gov" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">nhc.noaa.gov</a>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
