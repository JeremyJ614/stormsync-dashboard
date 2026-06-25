import type { Location } from "../hooks/useLocation";
import { useState, useRef, useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import { Radar, ExternalLink, Satellite, Activity } from "lucide-react";

interface Props { location: Location }

// Two verified free tile sources, both serving their LATEST frame when no time is
// set, both standard XYZ:
//   • IEM national NEXRAD composites  (cache/tile.py/1.0.0/<layer>)
//   • SSEC RealEarth national MRMS + GOES satellite tiles
// (Single-site velocity/VIL and MRMS rotation-track / MESH swaths have NO public
//  XYZ tile service — ProbSevere is the live national "this storm may go severe /
//  tornadic" layer and stands in for the rotation intent.)

type Group = "national" | "satellite";
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
const IR_LEGEND: Swatch[] = [
  { color: "#1e293b", label: "Warm / low cloud" },
  { color: "#f97316", label: "Cold tops" },
  { color: "#ffffff", label: "Coldest (severe)" },
];

const LAYERS: RadarLayer[] = [
  // National radar / MRMS
  { id: "n0q", label: "Base Reflectivity", group: "national", source: "iem", code: "nexrad-n0q-900913", desc: "National NEXRAD base reflectivity mosaic — precipitation intensity, storm cells and squall lines. Updates ~5 min.", legend: REFLECTIVITY_LEGEND },
  { id: "n0r", label: "Reflectivity (Legacy)", group: "national", source: "iem", code: "nexrad-n0r-900913", desc: "Legacy 16-level national reflectivity composite — a higher-contrast look at the radar mosaic.", legend: REFLECTIVITY_LEGEND },
  { id: "nexrcomp", label: "National MRMS", group: "national", source: "realearth", code: "nexrcomp", desc: "Seamless national MRMS reflectivity mosaic — no single-radar gaps.", legend: REFLECTIVITY_LEGEND },
  { id: "nexrdhr", label: "Near-Ground Refl.", group: "national", source: "realearth", code: "nexrdhr", desc: "MRMS hybrid-scan reflectivity — what's actually closest to the ground.", legend: REFLECTIVITY_LEGEND },
  { id: "probsevere", label: "ProbSevere", group: "national", source: "realearth", code: "PROBSEVEREV3", desc: "NSSL ProbSevere outlines storms by their probability of going severe / tornadic — the live way to spot rotating, dangerous cells.", legend: [{ color: "#fdf802", label: "Lower prob." }, { color: "#fd0000", label: "Higher prob." }], rotationNote: true },
  // Satellite (RealEarth GOES-East)
  { id: "truecolor", label: "True Color", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-true-color", desc: "GOES-East daytime true color (the closest free equivalent to GeoColor).", legend: [] },
  { id: "ir", label: "Clean Infrared", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-BAND13", desc: "Cloud-top temperatures — coldest tops mark the strongest storms.", legend: IR_LEGEND },
  { id: "airmass", label: "Air Mass RGB", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-airmass", desc: "Reveals air masses, fronts, and stratospheric (dry) intrusions.", legend: [] },
  { id: "sandwich", label: "IR Sandwich", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-ir-sandwich", desc: "Visible + IR blend — texture of convective storm tops in one view.", legend: [] },
];

const GROUPS: { id: Group; label: string; icon: React.ElementType }[] = [
  { id: "national", label: "Radar & MRMS", icon: Activity },
  { id: "satellite", label: "Satellite", icon: Satellite },
];

function tileUrl(layer: RadarLayer, bust: number): string {
  if (layer.source === "iem") {
    return `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/${layer.code}/{z}/{x}/{y}.png?_=${bust}`;
  }
  return `https://realearth.ssec.wisc.edu/tiles/${layer.code}/{z}/{x}/{y}.png?_=${bust}`;
}

export default function RadarMap({ location }: Props) {
  const [group, setGroup] = useState<Group>("national");
  const [layerId, setLayerId] = useState("n0q");
  const [opacity, setOpacity] = useState(0.85);
  const [bust, setBust] = useState(0);

  const layer = LAYERS.find(l => l.id === layerId)!;
  const groupLayers = useMemo(() => LAYERS.filter(l => l.group === group), [group]);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const overlayRef = useRef<import("leaflet").TileLayer | null>(null);

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

  // (Re)draw the active overlay whenever the layer or refresh changes.
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => {
      const map = mapRef.current;
      if (!map) return;
      if (overlayRef.current) { map.removeLayer(overlayRef.current); overlayRef.current = null; }
      const t = L.tileLayer(tileUrl(layer, bust), { opacity, maxZoom: 12 });
      t.addTo(map);
      overlayRef.current = t;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, bust]);

  // Opacity is cheap — apply without a full re-add.
  useEffect(() => { overlayRef.current?.setOpacity(opacity); }, [opacity]);

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
      <p className="text-sm text-muted-foreground -mt-2">{location.name} · national NEXRAD, MRMS &amp; GOES satellite</p>

      {/* Group tabs */}
      <div className="grid grid-cols-2 gap-2">
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
            👀 There's no public "rotation track" tile layer — ProbSevere is the live, national way
            to flag storms that are rotating or trending tornadic. Pair it with reflectivity above.
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
