import type { Location } from "../hooks/useLocation";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import {
  Radar, Satellite, Layers as LayersIcon, ExternalLink, RefreshCw, AlertTriangle,
  Eye, Crosshair, Loader2,
} from "lucide-react";

interface Props { location: Location }

/**
 * Radar & MRMS (P-3.3 overhaul).
 *
 * Three product groups — Radar, MRMS, Satellite — five verified layers each, all
 * served as standard XYZ tiles from two free public sources:
 *   • IEM  (mesonet.agron.iastate.edu) — national NEXRAD reflectivity composites
 *   • SSEC RealEarth — NEXRAD/MRMS derived products + GOES-East ABI imagery
 *
 * Every product id below was probed live and confirmed to return imagery. Where a
 * product I wanted has no public XYZ service (single-site base/storm-relative
 * velocity, correlation coefficient, MRMS MESH and rotation tracks), I substituted
 * the closest national equivalent and say so in the layer description rather than
 * shipping a dead tab.
 *
 * Tile errors used to fail silently (Leaflet swallows them), so a renamed or
 * offline product just looked like clear weather. The viewer now tracks tile
 * load/error counts per layer and surfaces "no returns" vs "product offline".
 */

type Group = "radar" | "mrms" | "satellite";
type Source = "iem" | "realearth";
interface Swatch { color: string; label: string }
interface RadarLayer {
  id: string; label: string; group: Group; source: Source; code: string;
  desc: string; legend: Swatch[]; note?: string; maxZoom?: number;
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
const HEIGHT_LEGEND: Swatch[] = [
  { color: "#1d4ed8", label: "Low" },
  { color: "#22c55e", label: "Moderate" },
  { color: "#facc15", label: "Tall" },
  { color: "#ef4444", label: "Towering" },
];
const LIQUID_LEGEND: Swatch[] = [
  { color: "#0ea5e9", label: "Low VIL" },
  { color: "#22c55e", label: "Moderate" },
  { color: "#facc15", label: "High" },
  { color: "#ef4444", label: "Hail signature" },
];
const CLASS_LEGEND: Swatch[] = [
  { color: "#22c55e", label: "Rain" },
  { color: "#38bdf8", label: "Snow / ice" },
  { color: "#f97316", label: "Mixed" },
  { color: "#ef4444", label: "Hail" },
];
const WV_LEGEND: Swatch[] = [
  { color: "#0f172a", label: "Dry" },
  { color: "#38bdf8", label: "Moist" },
  { color: "#ffffff", label: "Saturated" },
];

const LAYERS: RadarLayer[] = [
  // ── Radar ────────────────────────────────────────────────────────────────
  { id: "n0q", label: "Base Reflectivity", group: "radar", source: "iem", code: "nexrad-n0q-900913",
    desc: "National NEXRAD base reflectivity mosaic — the standard 'where is it raining and how hard' view.",
    legend: REFLECTIVITY_LEGEND, maxZoom: 12 },
  { id: "n0r", label: "Legacy Reflectivity", group: "radar", source: "iem", code: "nexrad-n0r-900913",
    desc: "Legacy 8-bit reflectivity mosaic. Coarser than base reflectivity but often updates when N0Q lags.",
    legend: REFLECTIVITY_LEGEND, maxZoom: 12 },
  { id: "nexrdhr", label: "Hybrid-Scan Reflectivity", group: "radar", source: "realearth", code: "nexrdhr",
    desc: "Lowest usable radar bin at every point — the closest look at what is actually reaching the ground.",
    legend: REFLECTIVITY_LEGEND },
  { id: "nexreet", label: "Enhanced Echo Tops", group: "radar", source: "realearth", code: "nexreet",
    desc: "Height of the storm tops. Rapidly rising tops mark strengthening updrafts.",
    legend: HEIGHT_LEGEND },
  { id: "nexrhhc", label: "Hydrometeor Class", group: "radar", source: "realearth", code: "nexrhhc",
    desc: "Dual-pol classification of what the radar is seeing — rain, snow, mixed or hail.",
    legend: CLASS_LEGEND,
    note: "Stands in for correlation coefficient: no public national XYZ service exists for raw CC, and this is the dual-pol product built from it." },

  // ── MRMS ─────────────────────────────────────────────────────────────────
  { id: "nexrcomp", label: "National Composite", group: "mrms", source: "realearth", code: "nexrcomp",
    desc: "MRMS national reflectivity composite — every radar merged into one seamless mosaic.",
    legend: REFLECTIVITY_LEGEND },
  { id: "MERGEDREF", label: "Merged Reflectivity", group: "mrms", source: "realearth", code: "MERGEDREF",
    desc: "MRMS 3-D merged reflectivity field, quality-controlled across overlapping radars.",
    legend: REFLECTIVITY_LEGEND },
  { id: "nexrdvl", label: "Integrated Liquid (VIL)", group: "mrms", source: "realearth", code: "nexrdvl",
    desc: "Vertically integrated liquid — how much water the storm is holding aloft. High VIL flags hail potential.",
    legend: LIQUID_LEGEND,
    note: "Stands in for MRMS MESH: the MESH hail swath has no public tile service, and VIL is the field MESH is derived from." },
  { id: "nexr1hpcp", label: "1-Hour Precipitation", group: "mrms", source: "realearth", code: "nexr1hpcp",
    desc: "Radar-estimated rainfall accumulation over the past hour.",
    legend: LIQUID_LEGEND },
  { id: "nexrphase", label: "Precipitation Phase", group: "mrms", source: "realearth", code: "nexrphase",
    desc: "Rain vs freezing rain vs sleet vs snow across the country.",
    legend: CLASS_LEGEND },

  // ── Satellite ────────────────────────────────────────────────────────────
  { id: "truecolor", label: "True Color", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-true-color",
    desc: "GOES-East natural colour imagery. Daytime only — goes dark after sunset.",
    legend: [] },
  { id: "band13", label: "Clean IR", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-BAND13",
    desc: "Infrared cloud-top temperature. Works day and night; coldest tops mark the strongest storms.",
    legend: IR_LEGEND },
  { id: "wv", label: "Water Vapor", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-BAND09-VAPR",
    desc: "Mid-level moisture. Shows the dry slots and moisture plumes that steer convection.",
    legend: WV_LEGEND },
  { id: "airmass", label: "Air Mass RGB", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-airmass",
    desc: "Colour composite separating warm moist, cold dry and stratospheric-intrusion air masses.",
    legend: [] },
  { id: "sandwich", label: "IR Sandwich", group: "satellite", source: "realearth", code: "G19-ABI-CONUS-ir-sandwich",
    desc: "Visible texture blended with IR temperature — overshooting tops stand out clearly.",
    legend: IR_LEGEND },
];

// ProbSevere is offered as a bonus overlay rather than a group member.
const PROBSEVERE: RadarLayer = {
  id: "probsevere", label: "ProbSevere", group: "mrms", source: "realearth", code: "PROBSEVEREV3",
  desc: "NOAA/CIMSS ProbSevere — model probability that a tracked storm turns severe.",
  legend: [{ color: "#22c55e", label: "Low" }, { color: "#facc15", label: "Elevated" }, { color: "#ef4444", label: "High" }],
  note: "Served here as raster tiles. ProbSevere is natively a vector product (storm polygons carrying probability values); the interactive polygon version needs a CORS proxy and is queued as a follow-up.",
};

const GROUPS: { id: Group; label: string; icon: typeof Radar }[] = [
  { id: "radar", label: "Radar", icon: Radar },
  { id: "mrms", label: "MRMS", icon: LayersIcon },
  { id: "satellite", label: "Satellite", icon: Satellite },
];

function tileUrl(l: RadarLayer, bust: number): string {
  // IEM codes already carry their projection suffix (…-900913); RealEarth ids do not.
  return l.source === "iem"
    ? `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/${l.code}/{z}/{x}/{y}.png?_=${bust}`
    : `https://realearth.ssec.wisc.edu/tiles/${l.code}/{z}/{x}/{y}.png?_=${bust}`;
}

export default function RadarMap({ location }: Props) {
  const [group, setGroup] = useState<Group>("radar");
  const [layerId, setLayerId] = useState("n0q");
  const [opacity, setOpacity] = useState(0.85);
  const [bust, setBust] = useState(0);
  const [showProb, setShowProb] = useState(false);
  const [updated, setUpdated] = useState<Date>(() => new Date());
  // tile telemetry so a dead product can't masquerade as clear weather
  const [tiles, setTiles] = useState({ loaded: 0, errored: 0, done: false });

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const overlayRef = useRef<import("leaflet").TileLayer | null>(null);
  const probRef = useRef<import("leaflet").TileLayer | null>(null);

  const layer = useMemo(() => LAYERS.find(l => l.id === layerId) ?? LAYERS[0], [layerId]);
  const groupLayers = useMemo(() => LAYERS.filter(l => l.group === group), [group]);

  const refresh = useCallback(() => { setBust(b => b + 1); setUpdated(new Date()); }, []);

  // Auto-refresh the active product every 4 minutes.
  useEffect(() => {
    const t = setInterval(refresh, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [refresh]);

  // ── init map once ──
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, {
        center: [location.lat, location.lon], zoom: 6,
        zoomControl: true, attributionControl: false, scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 12 }).addTo(map);
      map.createPane("labels");
      const lp = map.getPane("labels")!;
      lp.style.zIndex = "650";
      lp.style.pointerEvents = "none";
      lp.style.filter = "brightness(1.7) contrast(1.1)";
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 12, pane: "labels" }).addTo(map);
      map.createPane("prob");
      const pp = map.getPane("prob")!;
      pp.style.zIndex = "620";
      pp.style.pointerEvents = "none";
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 60);
    });
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; overlayRef.current = null; probRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── recentre when the member's location changes ──
  useEffect(() => { mapRef.current?.setView([location.lat, location.lon], mapRef.current.getZoom()); }, [location.lat, location.lon]);

  // ── (re)build the active product overlay ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    setTiles({ loaded: 0, errored: 0, done: false });
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      if (overlayRef.current) { map.removeLayer(overlayRef.current); overlayRef.current = null; }
      let loaded = 0, errored = 0;
      const t = L.tileLayer(tileUrl(layer, bust), { opacity, maxZoom: layer.maxZoom ?? 12 });
      t.on("tileload", () => { loaded++; });
      t.on("tileerror", () => { errored++; });
      t.on("load", () => { if (!cancelled) setTiles({ loaded, errored, done: true }); });
      t.addTo(map);
      overlayRef.current = t;
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId, bust]);

  useEffect(() => { overlayRef.current?.setOpacity(opacity); }, [opacity]);

  // ── ProbSevere bonus overlay ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !mapRef.current) return;
      if (probRef.current) { map.removeLayer(probRef.current); probRef.current = null; }
      if (!showProb) return;
      const t = L.tileLayer(tileUrl(PROBSEVERE, bust), { opacity: 0.9, maxZoom: 12, pane: "prob" });
      t.addTo(map);
      probRef.current = t;
    });
    return () => { cancelled = true; };
  }, [showProb, bust]);

  const offline = tiles.done && tiles.loaded === 0 && tiles.errored > 0;
  const empty = tiles.done && tiles.loaded > 0 && tiles.errored === 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-wide uppercase flex items-center gap-2">
            <Radar className="w-5 h-5 text-primary" /> Radar &amp; MRMS
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {location.name} · live national radar, MRMS mosaics &amp; GOES-East satellite
          </p>
        </div>
        <button onClick={refresh}
          className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs font-semibold flex items-center gap-1.5 hover:border-primary/40 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Group tabs */}
      <div className="grid grid-cols-3 gap-2 bg-card border border-border rounded-xl p-1.5">
        {GROUPS.map(g => {
          const Icon = g.icon;
          const active = group === g.id;
          return (
            <button key={g.id}
              onClick={() => { setGroup(g.id); setLayerId(LAYERS.find(l => l.group === g.id)!.id); }}
              className={`py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-4 h-4" /> {g.label}
            </button>
          );
        })}
      </div>

      {/* Product rail */}
      <div className="flex gap-2 overflow-x-auto pb-1 px-1 -mx-1 max-w-full">
        {groupLayers.map(l => (
          <button key={l.id} onClick={() => setLayerId(l.id)}
            className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
              layerId === l.id ? "bg-primary/15 border-primary/40 text-primary" : "bg-muted/20 border-border text-muted-foreground hover:text-foreground"}`}>
            <span className="whitespace-nowrap">{l.label}</span>
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="relative">
          <div ref={containerRef} style={{ height: 420, background: "#0a0e1a" }} />

          {/* data-state badge */}
          <div className="absolute top-2 left-2 z-[1000] flex flex-col gap-1.5 items-start">
            {!tiles.done && (
              <span className="px-2 py-1 rounded-md bg-black/75 text-[10px] text-white flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading {layer.label}…
              </span>
            )}
            {offline && (
              <span className="px-2 py-1 rounded-md bg-red-500/85 text-[10px] text-white font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Product offline — no tiles returned
              </span>
            )}
            {empty && (
              <span className="px-2 py-1 rounded-md bg-black/70 text-[10px] text-white/80">
                No returns in view — try zooming out
              </span>
            )}
          </div>

          {/* legend */}
          {layer.legend.length > 0 && (
            <div className="absolute bottom-2 right-2 z-[1000] bg-black/80 rounded-lg px-3 py-2 space-y-1 pointer-events-none">
              <div className="text-[9px] uppercase tracking-[0.2em] text-white/55 mb-1">{layer.label}</div>
              {layer.legend.map(sw => (
                <div key={sw.label} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ background: sw.color }} />
                  <span className="text-[10px] text-white whitespace-nowrap">{sw.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* controls */}
        <div className="p-3 border-t border-border space-y-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-muted-foreground flex-1 min-w-[180px]">
              <Eye className="w-3.5 h-3.5 shrink-0" />
              <span className="shrink-0">Opacity</span>
              <input type="range" min={0.2} max={1} step={0.05} value={opacity}
                onChange={e => setOpacity(Number(e.target.value))} className="flex-1 accent-primary min-w-0" />
              <span className="tabular-nums w-8 text-right shrink-0">{Math.round(opacity * 100)}%</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0">
              <input type="checkbox" checked={showProb} onChange={e => setShowProb(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
              <Crosshair className="w-3.5 h-3.5 text-primary" /> ProbSevere
            </label>
          </div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">{layer.desc}</div>
          {layer.note && (
            <div className="text-[10px] text-yellow-200/80 bg-yellow-400/10 border border-yellow-400/25 rounded-lg px-2.5 py-1.5 leading-relaxed">
              {layer.note}
            </div>
          )}
          {showProb && (
            <div className="text-[10px] text-yellow-200/80 bg-yellow-400/10 border border-yellow-400/25 rounded-lg px-2.5 py-1.5 leading-relaxed">
              {PROBSEVERE.note}
            </div>
          )}
          <div className="text-[10px] text-muted-foreground/70 tabular-nums">
            Updated {updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · auto-refreshes every 4 min ·
            source {layer.source === "iem" ? "Iowa Environmental Mesonet" : "SSEC RealEarth"}
          </div>
        </div>
      </div>

      {/* External tools */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-2">Full-resolution radar tools</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            { label: "NWS Radar (radar.weather.gov)", href: "https://radar.weather.gov/" },
            { label: "NOAA MRMS product viewer", href: "https://mrms.nssl.noaa.gov/qvs/product_viewer/" },
            { label: "CIMSS ProbSevere", href: "https://cimss.ssec.wisc.edu/severe_conv/probsev.html" },
            { label: "GOES-East imagery (STAR)", href: "https://www.star.nesdis.noaa.gov/goes/index.php" },
          ].map(x => (
            <a key={x.href} href={x.href} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-primary hover:underline">
              <ExternalLink className="w-3 h-3 shrink-0" /> {x.label}
            </a>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
          Always defer to official NWS warnings. These mosaics update every few minutes and can lag a fast-moving storm.
        </p>
      </div>
    </div>
  );
}
