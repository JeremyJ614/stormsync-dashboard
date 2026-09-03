import type { Location } from "../hooks/useLocation";
import { ModuleShell } from "../components/ModuleShell";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  BaseMap, type BaseMapHandle, type RasterOverlay, type ShapeOverlay,
  type ColorValue, type NumberValue,
} from "../components/map/BaseMap";
import {
  Radar, Satellite, Layers as LayersIcon, ExternalLink, RefreshCw, AlertTriangle,
  Eye, Crosshair, Loader2, X,
} from "lucide-react";
import { BASE_API } from "../config";

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
 * Tile errors used to fail silently, so a renamed or offline product just
 * looked like clear weather. The viewer tracks tile load/error counts per layer
 * and says so plainly when a product returns nothing at all.
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
//
// It used to be requested as raster tiles, and that is exactly why it never
// worked: PROBSEVEREV3 is a *shape* product on RealEarth, and its tile endpoint
// answers 200 with a 102-byte fully transparent PNG at every zoom this viewer
// uses. So the overlay was indistinguishable from clear weather while looking
// perfectly healthy — tiles loaded, none errored, nothing ever drew.
//
// It is fetched as GeoJSON through the `weather` Edge Function instead (the
// RealEarth shapes API sends no CORS headers, so a browser cannot read it
// directly), and drawn as real storm polygons coloured by their own probability
// and tappable for the model's own reasoning.
const PROBSEVERE: RadarLayer = {
  id: "probsevere", label: "ProbSevere", group: "mrms", source: "realearth", code: "PROBSEVEREV3",
  desc: "NOAA/CIMSS ProbSevere — model probability that a tracked storm turns severe.",
  legend: [],
  note: "Each outline is a storm object NOAA/CIMSS is tracking right now, shaded by its probability of turning severe within 60 minutes. Tap one for its hail, wind and tornado probabilities. Empty over quiet weather is the correct answer — the model only tracks storms that exist.",
};

const PROB_LEGEND: Swatch[] = [
  { color: "#22c55e", label: "Under 25%" },
  { color: "#facc15", label: "25% — elevated" },
  { color: "#f97316", label: "50% — high" },
  { color: "#ef4444", label: "75%+ — extreme" },
];

// Colour each polygon from its own `prob` value rather than pre-colouring the
// features: one expression, evaluated on the GPU, and it keeps working when the
// feed refreshes underneath the layer.
const PROB_FILL = [
  "interpolate", ["linear"], ["coalesce", ["get", "prob"], 0],
  0, "#22c55e", 25, "#facc15", 50, "#f97316", 75, "#ef4444",
] as unknown as ColorValue;
// A lighter tint of the same ramp for the outline. The fill can share the radar
// palette's colours because it is translucent, but a 2px line in radar green
// laid over a green echo simply disappears — these tints sit above every colour
// in the reflectivity ramp in lightness, so the storm's edge stays readable
// whatever is underneath it.
const PROB_LINE = [
  "interpolate", ["linear"], ["coalesce", ["get", "prob"], 0],
  0, "#a7f3d0", 25, "#fde68a", 50, "#fdba74", 75, "#fca5a5",
] as unknown as ColorValue;
// Faint at low probability, solid at high — so a 5% blob does not shout as
// loudly as a 90% one on a map already carrying reflectivity underneath.
const PROB_FILL_OPACITY = [
  "interpolate", ["linear"], ["coalesce", ["get", "prob"], 0],
  0, 0.12, 50, 0.34, 100, 0.5,
] as unknown as NumberValue;

interface ProbStorm { prob: number; summary: string; detail: string }

/** The ramp's colour at a single value, for the tapped-storm card. */
function probColor(v: number): string {
  const stops: [number, string][] = [[0, "#22c55e"], [25, "#facc15"], [50, "#f97316"], [75, "#ef4444"]];
  let out = stops[0][1];
  for (const [at, c] of stops) if (v >= at) out = c;
  return out;
}

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
  // ProbSevere is a fetched feed rather than a tile pyramid, so it carries its
  // own load state: an empty result over quiet weather and a failed fetch look
  // identical on the map, and only one of them is worth telling the member about.
  const [prob, setProb] = useState<{
    state: "idle" | "loading" | "ok" | "error";
    data: GeoJSON.FeatureCollection;
    at: string | null;
    error: string | null;
  }>({ state: "idle", data: { type: "FeatureCollection", features: [] }, at: null, error: null });
  const [probPick, setProbPick] = useState<ProbStorm | null>(null);
  const [updated, setUpdated] = useState<Date>(() => new Date());
  // tile telemetry so a dead product can't masquerade as clear weather
  const [tiles, setTiles] = useState({ loaded: 0, errored: 0, done: false });

  const mapHandle = useRef<BaseMapHandle>(null);

  const layer = useMemo(() => LAYERS.find(l => l.id === layerId) ?? LAYERS[0], [layerId]);
  const groupLayers = useMemo(() => LAYERS.filter(l => l.group === group), [group]);

  const refresh = useCallback(() => { setBust(b => b + 1); setUpdated(new Date()); }, []);

  // Auto-refresh the active product every 4 minutes.
  useEffect(() => {
    const t = setInterval(refresh, 4 * 60 * 1000);
    return () => clearInterval(t);
  }, [refresh]);

  // ── overlays, declared rather than imperatively added ───────────────────
  // The Leaflet version rebuilt a tile layer by hand on every change (and kept
  // two custom panes to get the stacking right). BaseMap diffs these instead,
  // and the royal basemap already owns the label ordering.
  const overlays = useMemo<RasterOverlay[]>(() => [{
    id: `product-${layer.id}`,
    url: tileUrl(layer, bust),
    opacity,
    maxZoom: layer.maxZoom ?? 12,
    underLabels: true,
  }], [layer, bust, opacity]);

  // ── ProbSevere ────────────────────────────────────────────────────────────
  // Fetched, not tiled. Refetches on the same 4-minute cadence as the raster
  // products (`bust` changes), and only while the overlay is actually on —
  // there is no reason to pull a national storm-object feed for a member who
  // has the box unticked.
  useEffect(() => {
    if (!showProb) {
      setProb({ state: "idle", data: { type: "FeatureCollection", features: [] }, at: null, error: null });
      setProbPick(null);
      return;
    }
    let live = true;
    setProb(p => ({ ...p, state: "loading", error: null }));
    // A stalled national feed should not leave the badge spinning forever.
    const ctl = new AbortController();
    const kill = setTimeout(() => ctl.abort(), 20_000);
    fetch(`${BASE_API}/probsevere`, { signal: ctl.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: GeoJSON.FeatureCollection & { at?: string; error?: string }) => {
        if (!live) return;
        // The function answers 200 with an empty collection and an `error` field
        // when RealEarth is the one that failed, so that a dead upstream cannot
        // read as "no storms" on the map.
        if (d.error) { setProb({ state: "error", data: { type: "FeatureCollection", features: [] }, at: null, error: d.error }); return; }
        setProb({ state: "ok", data: { type: "FeatureCollection", features: d.features ?? [] }, at: d.at ?? null, error: null });
      })
      .catch((e: Error) => {
        if (!live || e.name === "AbortError") { if (live) setProb(p => ({ ...p, state: "error", error: "timed out" })); return; }
        setProb({ state: "error", data: { type: "FeatureCollection", features: [] }, at: null, error: e.message });
      })
      .finally(() => clearTimeout(kill));
    return () => { live = false; ctl.abort(); clearTimeout(kill); };
  }, [showProb, bust]);

  const onProbClick = useCallback((props: Record<string, unknown>) => {
    setProbPick({
      prob: Number(props.prob) || 0,
      summary: String(props.summary ?? ""),
      detail: String(props.detail ?? ""),
    });
  }, []);

  const shapes = useMemo<ShapeOverlay[]>(() => {
    if (!showProb || prob.data.features.length === 0) return [];
    return [{
      id: "probsevere",
      data: prob.data,
      fillColor: PROB_FILL,
      fillOpacity: PROB_FILL_OPACITY,
      lineColor: PROB_LINE,
      lineWidth: 2.2,
      // Above the labels deliberately, unlike the raster products: these are
      // small outlines that a place name would otherwise cut straight through.
      onFeatureClick: onProbClick,
    }];
  }, [showProb, prob.data, onProbClick]);

  /** Highest probability currently on screen — the number worth surfacing. */
  const probPeak = useMemo(() => prob.data.features.reduce(
    (n, f) => Math.max(n, Number(f.properties?.prob) || 0), 0,
  ), [prob.data]);

  // Tile telemetry, so a dead product cannot masquerade as clear weather.
  const tileCount = useRef({ loaded: 0, errored: 0 });
  useEffect(() => {
    tileCount.current = { loaded: 0, errored: 0 };
    setTiles({ loaded: 0, errored: 0, done: false });
    const t = setTimeout(() => {
      setTiles({ ...tileCount.current, done: true });
    }, 4500);
    return () => clearTimeout(t);
    // No `showProb` here any more: ProbSevere is not a raster product, so
    // toggling it cannot change the tile counts and restarting the window on it
    // only made the active product look like it was reloading.
  }, [layerId, bust]);

  const onTiles = useCallback((c: { loaded: number; errored: number }) => {
    tileCount.current = c;
  }, []);

  const offline = tiles.done && tiles.loaded === 0 && tiles.errored > 0;

  // There is deliberately no "no returns in view" badge. It used to read
  // `loaded > 0 && errored === 0` — which is true exactly when the product is
  // healthy, so it fired over a screen full of reflectivity. Tile counts can
  // prove a product is *offline*; they cannot distinguish a transparent tile
  // from a full one, and the only ways to tell (sampling the WebGL canvas, or
  // decoding every tile body) cost more frame budget than the answer is worth.
  // A confident wrong "no returns" during severe weather is worse than none.

  return (
    <ModuleShell
      wide
      eyebrow="Iowa State Mesonet · NOAA MRMS · GOES-East"
      title={<>Radar &amp; MRMS</>}
      subtitle={`${location.name} — live national radar, MRMS mosaics and GOES-East satellite.`}
      actions={
        <button onClick={refresh}
          className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs font-semibold flex items-center gap-1.5 hover:border-primary/40 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      }
    >

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
        {/* The height lives here, not on BaseMap: the map is sized `h-full`, so
            the wrapper is what a percentage resolves against. Phones keep the
            420px the Leaflet version used; desktops get the extra room a radar
            loop actually wants. */}
        <div className="sswx-map-shell h-[420px] md:h-[560px]">
          <BaseMap
            ref={mapHandle}
            center={{ lat: location.lat, lon: location.lon }}
            zoom={6}
            height="100%"
            overlays={overlays}
            shapes={shapes}
            onTiles={onTiles}
            className="w-full h-full"
          />

          {/* data-state badge */}
          <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5 items-start">
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
            {/* ProbSevere state. It has to say all three things separately —
                loading, upstream failed, and genuinely no tracked storms — or
                the overlay goes back to being unfalsifiable. */}
            {showProb && prob.state === "loading" && (
              <span className="px-2 py-1 rounded-md bg-black/75 text-[10px] text-white flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading ProbSevere…
              </span>
            )}
            {showProb && prob.state === "error" && (
              <span className="px-2 py-1 rounded-md bg-red-500/85 text-[10px] text-white font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> ProbSevere unavailable{prob.error ? ` — ${prob.error}` : ""}
              </span>
            )}
            {showProb && prob.state === "ok" && (
              <span className="px-2 py-1 rounded-md bg-black/75 text-[10px] text-white flex items-center gap-1.5">
                <Crosshair className="w-3 h-3 text-primary" />
                {prob.data.features.length === 0
                  ? "ProbSevere — no storms tracked nationally"
                  : `ProbSevere — ${prob.data.features.length} storms · peak ${Math.round(probPeak)}%`}
              </span>
            )}
          </div>

          {/* legend — the active product's, plus ProbSevere's ramp when it is on */}
          {(layer.legend.length > 0 || showProb) && (
            <div className="absolute bottom-2 right-2 z-10 bg-black/80 rounded-lg px-3 py-2 space-y-1 pointer-events-none">
              {layer.legend.length > 0 && (
                <>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-white/55 mb-1">{layer.label}</div>
                  {layer.legend.map(sw => (
                    <div key={sw.label} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ background: sw.color }} />
                      <span className="text-[10px] text-white whitespace-nowrap">{sw.label}</span>
                    </div>
                  ))}
                </>
              )}
              {showProb && (
                <>
                  <div className={`text-[9px] uppercase tracking-[0.2em] text-white/55 mb-1 ${layer.legend.length > 0 ? "pt-1.5 border-t border-white/10" : ""}`}>
                    ProbSevere
                  </div>
                  {PROB_LEGEND.map(sw => (
                    <div key={sw.label} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ background: sw.color }} />
                      <span className="text-[10px] text-white whitespace-nowrap">{sw.label}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Tapped storm. Sits over the map rather than in the controls below,
              because the polygon it describes is small and the member needs the
              two next to each other. */}
          {probPick && (
            <div className="absolute bottom-2 left-2 z-10 max-w-[min(320px,calc(100%-1rem))] bg-black/88 border border-white/12 rounded-lg p-3">
              <div className="flex items-start gap-2 mb-1.5">
                <span className="text-lg font-black tabular-nums leading-none"
                      style={{ color: probColor(probPick.prob) }}>
                  {Math.round(probPick.prob)}%
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-white/55 pt-1 flex-1">
                  chance severe
                </span>
                <button onClick={() => setProbPick(null)} aria-label="Close storm details"
                        className="text-white/50 hover:text-white shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {probPick.summary && (
                <div className="text-[11px] text-white leading-relaxed">{probPick.summary}</div>
              )}
              {probPick.detail && (
                <div className="mt-1.5 pt-1.5 border-t border-white/10 text-[10px] text-white/70 leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto">
                  {probPick.detail}
                </div>
              )}
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
            <div className="text-[10px] text-primary/85 bg-primary/10 border border-primary/25 rounded-lg px-2.5 py-1.5 leading-relaxed">
              {PROBSEVERE.note}
              {prob.at && (
                <span className="block mt-1 text-muted-foreground/70 tabular-nums">
                  Feed read {new Date(prob.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
                </span>
              )}
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
    </ModuleShell>
  );
}
