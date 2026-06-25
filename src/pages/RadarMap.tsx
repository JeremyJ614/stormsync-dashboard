import type { Location } from "../hooks/useLocation";
import { useState, useRef, useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import { Radar, ExternalLink, Layers, Satellite, Radio, Activity } from "lucide-react";

interface Props { location: Location }

// ─── Overlay catalog ─────────────────────────────────────────────────────────
// Two verified free sources, both serving their LATEST frame when no time is set:
//   • IEM RIDGE single-site NEXRAD tiles  (ridge::{STATION}-{CODE}-0)
//   • SSEC RealEarth national MRMS + GOES satellite tiles
// (MRMS rotation-track / MESH swaths have no public tile service — Storm-Relative
//  Velocity + ProbSevere are the live way to watch rotation, so they stand in.)

type Group = "live" | "national" | "satellite";
type Source = "iem" | "realearth";
interface Swatch { color: string; label: string }
interface RadarLayer {
  id: string; label: string; group: Group; source: Source; code: string;
  desc: string; legend: Swatch[]; rotationNote?: boolean;
}

const REFLECTIVITY_LEGEND: Swatch[] = [
  { color: "#04e9e7", label: "Light" },
  { color: "#02fd02", label: "Moderate" },
  { color: "#fdf802", label: "Heavy" },
  { color: "#fd0000", label: "Intense" },
  { color: "#d400f9", label: "Hail / extreme" },
];
const VELOCITY_LEGEND: Swatch[] = [
  { color: "#02fd02", label: "Toward radar" },
  { color: "#fd0000", label: "Away from radar" },
];
const VIL_LEGEND: Swatch[] = [
  { color: "#3b82f6", label: "Low" },
  { color: "#fdf802", label: "Moderate" },
  { color: "#fd0000", label: "High (hail)" },
];
const IR_LEGEND: Swatch[] = [
  { color: "#1e293b", label: "Warm / low cloud" },
  { color: "#f97316", label: "Cold tops" },
  { color: "#ffffff", label: "Coldest (severe)" },
];

const LAYERS: RadarLayer[] = [
  // Live single-site NEXRAD (IEM)
  { id: "n0b", label: "Base Reflectivity", group: "live", source: "iem", code: "N0B", desc: "Precipitation intensity at the lowest radar tilt.", legend: REFLECTIVITY_LEGEND },
  { id: "n0u", label: "Base Velocity", group: "live", source: "iem", code: "N0U", desc: "Wind motion toward (green) / away (red) from the radar.", legend: VELOCITY_LEGEND, rotationNote: true },
  { id: "n0s", label: "Storm-Rel. Velocity", group: "live", source: "iem", code: "N0S", desc: "Storm-relative velocity — the cleanest way to spot a rotating couplet.", legend: VELOCITY_LEGEND, rotationNote: true },
  { id: "dvl", label: "VIL (hail)", group: "live", source: "iem", code: "DVL", desc: "Vertically Integrated Liquid — high values flag strong updrafts & hail.", legend: VIL_LEGEND },
  // National / MRMS (RealEarth)
  { id: "nexrcomp", label: "National MRMS", group: "national", source: "realearth", code: "nexrcomp", desc: "Seamless national MRMS reflectivity mosaic — no single-radar gaps.", legend: REFLECTIVITY_LEGEND },
  { id: "nexrdhr", label: "Near-Ground Refl.", group: "national", source: "realearth", code: "nexrdhr", desc: "MRMS hybrid-scan reflectivity — what's actually closest to the ground.", legend: REFLECTIVITY_LEGEND },
  { id: "probsevere", label: "ProbSevere", group: "national", source: "realearth", code: "PROBSEVEREV3", desc: "NSSL ProbSevere — outlines storms by their probability of going severe / tornadic.", legend: [{ color: "#fdf802", label: "Lower prob." }, { color: "#fd0000", label: "Higher prob." }], rotationNote: true },
  // Satellite (RealEarth GOES-East)
  { id: "truecolor", label: "True Color", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-true-color", desc: "GOES-East daytime true color (the closest free equivalent to GeoColor).", legend: [] },
  { id: "ir", label: "Clean Infrared", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-BAND13", desc: "Cloud-top temperatures — coldest tops mark the strongest storms.", legend: IR_LEGEND },
  { id: "airmass", label: "Air Mass RGB", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-airmass", desc: "Reveals air masses, fronts, and stratospheric (dry) intrusions.", legend: [] },
  { id: "sandwich", label: "IR Sandwich", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-ir-sandwich", desc: "Visible + IR blend — texture of convective storm tops in one view.", legend: [] },
];

const GROUPS: { id: Group; label: string; icon: React.ElementType }[] = [
  { id: "live", label: "Live Radar", icon: Radio },
  { id: "national", label: "National / MRMS", icon: Activity },
  { id: "satellite", label: "Satellite", icon: Satellite },
];

// Curated, nationally-distributed NEXRAD sites for single-site products.
const STATIONS: { id: string; name: string; lat: number; lon: number }[] = [
  { id: "KTLX", name: "Oklahoma City, OK", lat: 35.33, lon: -97.28 },
  { id: "KFWS", name: "Dallas–Ft Worth, TX", lat: 32.57, lon: -97.30 },
  { id: "KHGX", name: "Houston, TX", lat: 29.47, lon: -95.08 },
  { id: "KEWX", name: "Austin–San Antonio, TX", lat: 29.70, lon: -98.03 },
  { id: "KAMA", name: "Amarillo, TX", lat: 35.23, lon: -101.71 },
  { id: "KMAF", name: "Midland, TX", lat: 31.94, lon: -102.19 },
  { id: "KLZK", name: "Little Rock, AR", lat: 34.84, lon: -92.26 },
  { id: "KSHV", name: "Shreveport, LA", lat: 32.45, lon: -93.84 },
  { id: "KLIX", name: "New Orleans, LA", lat: 30.34, lon: -89.83 },
  { id: "KICT", name: "Wichita, KS", lat: 37.65, lon: -97.44 },
  { id: "KDDC", name: "Dodge City, KS", lat: 37.76, lon: -99.97 },
  { id: "KEAX", name: "Kansas City, MO", lat: 38.81, lon: -94.26 },
  { id: "KLSX", name: "St Louis, MO", lat: 38.70, lon: -90.68 },
  { id: "KSGF", name: "Springfield, MO", lat: 37.24, lon: -93.40 },
  { id: "KOAX", name: "Omaha, NE", lat: 41.32, lon: -96.37 },
  { id: "KUEX", name: "Hastings, NE", lat: 40.32, lon: -98.44 },
  { id: "KFTG", name: "Denver, CO", lat: 39.79, lon: -104.55 },
  { id: "KPUX", name: "Pueblo, CO", lat: 38.46, lon: -104.18 },
  { id: "KDMX", name: "Des Moines, IA", lat: 41.73, lon: -93.72 },
  { id: "KDVN", name: "Quad Cities, IA", lat: 41.61, lon: -90.58 },
  { id: "KLOT", name: "Chicago, IL", lat: 41.60, lon: -88.08 },
  { id: "KILX", name: "Central Illinois", lat: 40.15, lon: -89.34 },
  { id: "KIND", name: "Indianapolis, IN", lat: 39.71, lon: -86.28 },
  { id: "KMKX", name: "Milwaukee, WI", lat: 42.97, lon: -88.55 },
  { id: "KMPX", name: "Minneapolis, MN", lat: 44.85, lon: -93.57 },
  { id: "KDTX", name: "Detroit, MI", lat: 42.70, lon: -83.47 },
  { id: "KCLE", name: "Cleveland, OH", lat: 41.41, lon: -81.86 },
  { id: "KBMX", name: "Birmingham, AL", lat: 33.17, lon: -86.77 },
  { id: "KFFC", name: "Atlanta, GA", lat: 33.36, lon: -84.57 },
  { id: "KOHX", name: "Nashville, TN", lat: 36.25, lon: -86.56 },
  { id: "KLMK", name: "Louisville, KY", lat: 37.97, lon: -85.94 },
  { id: "KMRX", name: "Knoxville, TN", lat: 36.17, lon: -83.40 },
  { id: "KGSP", name: "Greenville, SC", lat: 34.88, lon: -82.22 },
  { id: "KRAH", name: "Raleigh, NC", lat: 35.67, lon: -78.49 },
  { id: "KLWX", name: "Washington, DC", lat: 38.98, lon: -77.48 },
  { id: "KDIX", name: "Philadelphia, PA", lat: 39.95, lon: -74.41 },
  { id: "KOKX", name: "New York, NY", lat: 40.87, lon: -72.86 },
  { id: "KBOX", name: "Boston, MA", lat: 41.96, lon: -71.14 },
  { id: "KBUF", name: "Buffalo, NY", lat: 42.95, lon: -78.74 },
  { id: "KTBW", name: "Tampa, FL", lat: 27.71, lon: -82.40 },
  { id: "KAMX", name: "Miami, FL", lat: 25.61, lon: -80.41 },
  { id: "KJAX", name: "Jacksonville, FL", lat: 30.48, lon: -81.70 },
  { id: "KMLB", name: "Melbourne, FL", lat: 28.11, lon: -80.65 },
  { id: "KFSX", name: "Flagstaff, AZ", lat: 34.57, lon: -111.20 },
  { id: "KIWA", name: "Phoenix, AZ", lat: 33.29, lon: -111.67 },
  { id: "KABX", name: "Albuquerque, NM", lat: 35.15, lon: -106.82 },
  { id: "KNKX", name: "San Diego, CA", lat: 32.92, lon: -117.04 },
  { id: "KVTX", name: "Los Angeles, CA", lat: 34.41, lon: -119.18 },
  { id: "KDAX", name: "Sacramento, CA", lat: 38.50, lon: -121.68 },
  { id: "KMUX", name: "San Francisco, CA", lat: 37.16, lon: -121.90 },
  { id: "KMTX", name: "Salt Lake City, UT", lat: 41.26, lon: -112.45 },
  { id: "KESX", name: "Las Vegas, NV", lat: 35.70, lon: -114.89 },
  { id: "KCBX", name: "Boise, ID", lat: 43.49, lon: -116.24 },
  { id: "KATX", name: "Seattle, WA", lat: 48.19, lon: -122.50 },
  { id: "KRTX", name: "Portland, OR", lat: 45.71, lon: -122.96 },
  { id: "KBLX", name: "Billings, MT", lat: 45.85, lon: -108.61 },
  { id: "KBIS", name: "Bismarck, ND", lat: 46.77, lon: -100.76 },
];

function nearestStation(lat: number, lon: number): string {
  let best = STATIONS[0], bestD = Infinity;
  for (const s of STATIONS) {
    const d = (s.lat - lat) ** 2 + ((s.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best.id;
}

function tileUrl(layer: RadarLayer, station: string, bust: number): string {
  if (layer.source === "iem") {
    return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${station}-${layer.code}-0/{z}/{x}/{y}.png?_=${bust}`;
  }
  return `https://realearth.ssec.wisc.edu/tiles/${layer.code}/{z}/{x}/{y}.png?_=${bust}`;
}

export default function RadarMap({ location }: Props) {
  const [group, setGroup] = useState<Group>("live");
  const [layerId, setLayerId] = useState("n0b");
  const [station, setStation] = useState(() => nearestStation(location.lat, location.lon));
  const [opacity, setOpacity] = useState(0.85);
  const [bust, setBust] = useState(0);

  const layer = LAYERS.find(l => l.id === layerId)!;
  const groupLayers = useMemo(() => LAYERS.filter(l => l.group === group), [group]);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const overlayRef = useRef<import("leaflet").TileLayer | null>(null);

  // When a station is auto-pickable, refresh it if the user's location changes.
  useEffect(() => { setStation(nearestStation(location.lat, location.lon)); }, [location.lat, location.lon]);

  // Auto-refresh the overlay every 4 minutes (radar/satellite update cadence).
  useEffect(() => {
    const t = setInterval(() => setBust(b => b + 1), 4 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Init the Leaflet map once (dark basemap + a labels pane so cities show on top).
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [location.lat, location.lon], zoom: 6, zoomControl: true,
        attributionControl: false, scrollWheelZoom: true,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 12 }).addTo(map);
      map.createPane("labels");
      const lp = map.getPane("labels")!;
      lp.style.zIndex = "650";
      lp.style.pointerEvents = "none";
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 12, pane: "labels" }).addTo(map);
      mapRef.current = map;
      // Lazy routes can mount the container before layout settles — tell Leaflet
      // its real size once painted, or tiles render misaligned / fail to load.
      setTimeout(() => map.invalidateSize(), 60);
      setBust(b => b + 1); // trigger first overlay paint
    });
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; overlayRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)draw the active overlay whenever the layer, station, opacity, or refresh changes.
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      const map = mapRef.current;
      if (!map) return;
      if (overlayRef.current) { map.removeLayer(overlayRef.current); overlayRef.current = null; }
      const t = L.tileLayer(tileUrl(layer, station, bust), { opacity, maxZoom: 12 });
      t.addTo(map);
      overlayRef.current = t;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, station, bust]);

  // Opacity is cheap — apply without a full re-add.
  useEffect(() => { overlayRef.current?.setOpacity(opacity); }, [opacity]);

  // Recenter when switching scope: single-site → station; national/satellite → CONUS.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layer.source === "iem") {
      const s = STATIONS.find(x => x.id === station);
      if (s) map.setView([s.lat, s.lon], 7);
    } else {
      map.setView([39, -97], 4);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId]);

  function pickGroup(g: Group) {
    setGroup(g);
    const first = LAYERS.find(l => l.group === g);
    if (first) setLayerId(first.id);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radar className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">Radar &amp; Satellite</h2>
        </div>
        <a href="https://radar.weather.gov" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-primary hover:underline">
          <ExternalLink className="w-3 h-3" /> NWS Radar
        </a>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">{location.name} · live NEXRAD, national MRMS &amp; GOES satellite</p>

      {/* Group tabs */}
      <div className="grid grid-cols-3 gap-2">
        {GROUPS.map(g => {
          const Icon = g.icon;
          return (
            <button key={g.id} onClick={() => pickGroup(g.id)}
              className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${group === g.id ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:border-primary/30"}`}>
              <Icon className="w-3.5 h-3.5" /> <span className="truncate">{g.label}</span>
            </button>
          );
        })}
      </div>

      {/* Product subtabs within the group */}
      <div className="flex flex-wrap gap-2">
        {groupLayers.map(l => (
          <button key={l.id} onClick={() => setLayerId(l.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${layerId === l.id ? "bg-primary text-primary-foreground" : "bg-muted/40 hover:bg-muted text-muted-foreground"}`}>
            {l.label}
          </button>
        ))}
      </div>

      {/* Single-site station picker */}
      {layer.source === "iem" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Layers className="w-3 h-3" /> Station</span>
          <select value={station} onChange={e => setStation(e.target.value)}
            className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs outline-none focus:border-primary/40">
            {STATIONS.map(s => <option key={s.id} value={s.id}>{s.id} — {s.name}</option>)}
          </select>
          <button onClick={() => setStation(nearestStation(location.lat, location.lon))}
            className="text-xs text-primary hover:underline">Nearest to me</button>
        </div>
      )}

      {/* Map */}
      <div className="relative rounded-xl overflow-hidden border border-border">
        <div ref={containerRef} style={{ height: 460, background: "#0a0e1a" }} />

        {/* Legend */}
        {layer.legend.length > 0 && (
          <div className="absolute bottom-2 right-2 bg-black/80 rounded-lg px-3 py-2 space-y-1 pointer-events-none" style={{ zIndex: 1000 }}>
            <div className="text-[9px] uppercase tracking-[0.2em] text-white/55 mb-1">{layer.label}</div>
            {layer.legend.map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                <span className="text-[10px] text-white font-medium">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Opacity */}
        <div className="absolute top-2 left-2 bg-black/75 rounded-lg px-2.5 py-1.5 flex items-center gap-2" style={{ zIndex: 1000 }}>
          <span className="text-[9px] uppercase tracking-widest text-white/60">Opacity</span>
          <input type="range" min={0.2} max={1} step={0.05} value={opacity}
            onChange={e => setOpacity(Number(e.target.value))} className="w-20 accent-primary" />
        </div>
      </div>

      {/* Active layer description */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="text-sm font-medium">{layer.label}</div>
        <p className="text-xs text-muted-foreground mt-1">{layer.desc}</p>
        {layer.rotationNote && (
          <p className="text-[11px] text-primary/90 mt-2">
            👀 Watching for rotation? A tight green-next-to-red couplet here is the live signature of a
            rotating storm — there's no public "rotation track" overlay, so this is how the pros do it.
          </p>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Sources: NWS/NEXRAD via Iowa Environmental Mesonet · NSSL MRMS &amp; NOAA GOES via SSEC RealEarth.
        Imagery auto-refreshes every few minutes.
      </p>
    </div>
  );
}
