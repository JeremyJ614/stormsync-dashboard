/**
 * VIP Model Runs — Phase 2 Rewrite
 *
 * HRRR tab  : Animated map image player powered by data.maxvelocitywx.com API.
 *             Products: Reflectivity, Temperature, Dew Point, Wind Gust,
 *             CAPE, Updraft Helicity, Total Precipitation.
 *             Playback controls, legend, download/share, About.
 *
 * GFS tab   : Enhanced multi-model parameter chart viewer via Open-Meteo.
 *             All parameters from Surface → Precipitation → Wind →
 *             Instability/Severe → Upper Air → Moisture.
 */
import {
  useState, useEffect, useRef, useCallback,
} from "react";
import type { Location } from "../hooks/useLocation";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend, CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";
import {
  Play, Pause, SkipBack, SkipForward, Download, Share2,
  ChevronDown, ChevronUp, RefreshCw, Info, GitCompare,
  Radar, Thermometer, Droplets, Wind, Zap, TrendingUp,
  CloudRain, BarChart3,
} from "lucide-react";
import { cToF, msToMph } from "../utils/weatherCalc";

// ─── Types ─────────────────────────────────────────────────────────────────
interface Props { location: Location }

interface HrrrProduct {
  key: string;
  name: string;
  short: string;
  unit: string;
  note: string | null;
  ticks: { v: number; pos: number }[];
  stops: { v: number; color: string; color2: string | null; pos: number }[];
}
interface HrrrFrame {
  key: string;
  fhr: number;
  label: string;
  validTime: string;
  generated: string;
}
interface HrrrRun {
  cycleId: string;
  cycle: { date: string; hour: number; label: string; runTime: string };
  forecastHours: number[];
  maxFhr: number;
  extended: boolean;
  complete: boolean;
  products: HrrrProduct[];
  frames: Record<string, HrrrFrame[]>;
  source: string;
  generatedAt: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────
const MV_API = "https://data.maxvelocitywx.com";
const SPEEDS: Record<string, number> = { Slow: 900, Normal: 500, Fast: 250 };

// GFS comparison models
const GFS_MODELS = [
  { id: "gfs_seamless",  label: "GFS",   color: "#06b6d4" },
  { id: "ecmwf_ifs025", label: "ECMWF", color: "#a78bfa" },
  { id: "icon_seamless", label: "ICON",  color: "#f97316" },
  { id: "gem_seamless",  label: "GEM",   color: "#4ade80" },
];

// GFS parameter categories
const GFS_CATEGORIES = [
  "Surface", "Precipitation", "Wind", "Instability / Severe", "Upper Air", "Moisture",
] as const;
type GfsCategory = typeof GFS_CATEGORIES[number];

interface GfsParam { id: string; label: string; unit: string; cat: GfsCategory; convert: (v: number) => number }

const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;
const fahr = (v: number) => Math.round(cToF(v));
const mph = (v: number) => Math.round(msToMph(v));

const GFS_PARAMS: GfsParam[] = [
  // Surface
  { id: "temperature_2m",         cat: "Surface",              label: "Temperature (°F)",            unit: "°F",    convert: fahr },
  { id: "apparent_temperature",    cat: "Surface",              label: "Feels Like (°F)",             unit: "°F",    convert: fahr },
  { id: "dew_point_2m",           cat: "Surface",              label: "Dew Point (°F)",              unit: "°F",    convert: fahr },
  { id: "wet_bulb_temperature_2m", cat: "Surface",             label: "Wet-Bulb Temp (°F)",          unit: "°F",    convert: fahr },
  { id: "relative_humidity_2m",    cat: "Surface",             label: "Relative Humidity (%)",       unit: "%",     convert: r0 },
  { id: "cloud_cover",             cat: "Surface",             label: "Cloud Cover (%)",             unit: "%",     convert: r0 },
  { id: "visibility",              cat: "Surface",             label: "Visibility (mi)",             unit: " mi",   convert: (v) => Math.round((v / 1609.34) * 10) / 10 },
  { id: "surface_pressure",        cat: "Surface",             label: "Surface Pressure (hPa)",      unit: " hPa",  convert: r0 },
  { id: "pressure_msl",            cat: "Surface",             label: "Sea-Level Pressure (hPa)",    unit: " hPa",  convert: r0 },
  // Precipitation
  { id: "precipitation_probability", cat: "Precipitation",    label: "Precip Probability (%)",      unit: "%",     convert: r0 },
  { id: "precipitation",           cat: "Precipitation",       label: "Precipitation (mm)",          unit: " mm",   convert: r1 },
  { id: "rain",                    cat: "Precipitation",       label: "Rain (mm)",                   unit: " mm",   convert: r1 },
  { id: "showers",                 cat: "Precipitation",       label: "Convective Showers (mm)",     unit: " mm",   convert: r1 },
  { id: "snowfall",                cat: "Precipitation",       label: "Snowfall (cm)",               unit: " cm",   convert: r1 },
  { id: "snow_depth",              cat: "Precipitation",       label: "Snow Depth (in)",             unit: " in",   convert: (v) => Math.round(v * 39.37 * 10) / 10 },
  // Wind
  { id: "wind_speed_10m",          cat: "Wind",               label: "10m Wind (mph)",              unit: " mph",  convert: mph },
  { id: "wind_gusts_10m",          cat: "Wind",               label: "Wind Gusts (mph)",            unit: " mph",  convert: mph },
  { id: "wind_speed_80m",          cat: "Wind",               label: "80m Wind (mph)",              unit: " mph",  convert: mph },
  { id: "wind_speed_120m",         cat: "Wind",               label: "120m Wind (mph)",             unit: " mph",  convert: mph },
  { id: "wind_speed_925hPa",       cat: "Wind",               label: "925mb Wind (mph)",            unit: " mph",  convert: mph },
  { id: "wind_speed_850hPa",       cat: "Wind",               label: "850mb Wind (mph)",            unit: " mph",  convert: mph },
  { id: "wind_speed_700hPa",       cat: "Wind",               label: "700mb Wind (mph)",            unit: " mph",  convert: mph },
  { id: "wind_speed_500hPa",       cat: "Wind",               label: "500mb Wind (mph)",            unit: " mph",  convert: mph },
  { id: "wind_speed_300hPa",       cat: "Wind",               label: "300mb Wind (mph)",            unit: " mph",  convert: mph },
  // Instability / Severe
  { id: "cape",                    cat: "Instability / Severe", label: "Surface CAPE (J/kg)",        unit: " J/kg", convert: r0 },
  { id: "lifted_index",            cat: "Instability / Severe", label: "Lifted Index",               unit: "",      convert: r1 },
  { id: "convective_inhibition",   cat: "Instability / Severe", label: "CIN (J/kg)",                 unit: " J/kg", convert: r0 },
  { id: "boundary_layer_height",   cat: "Instability / Severe", label: "Boundary Layer Height (m)",  unit: " m",   convert: r0 },
  { id: "freezing_level_height",   cat: "Instability / Severe", label: "Freezing Level (ft)",        unit: " ft",  convert: (v) => Math.round((v * 3.281) / 10) * 10 },
  // Upper Air
  { id: "temperature_850hPa",      cat: "Upper Air",           label: "850mb Temp (°F)",            unit: "°F",    convert: fahr },
  { id: "temperature_700hPa",      cat: "Upper Air",           label: "700mb Temp (°F)",            unit: "°F",    convert: fahr },
  { id: "temperature_500hPa",      cat: "Upper Air",           label: "500mb Temp (°F)",            unit: "°F",    convert: fahr },
  { id: "geopotential_height_500hPa", cat: "Upper Air",        label: "500mb Height (m)",           unit: " m",    convert: r0 },
  { id: "geopotential_height_700hPa", cat: "Upper Air",        label: "700mb Height (m)",           unit: " m",    convert: r0 },
  { id: "relative_humidity_850hPa",   cat: "Upper Air",        label: "850mb RH (%)",               unit: "%",     convert: r0 },
  { id: "relative_humidity_700hPa",   cat: "Upper Air",        label: "700mb RH (%)",               unit: "%",     convert: r0 },
  // Moisture
  { id: "vapour_pressure_deficit",         cat: "Moisture",    label: "Vapour Pressure Deficit (kPa)", unit: " kPa", convert: r1 },
  { id: "et0_fao_evapotranspiration",      cat: "Moisture",    label: "Evapotranspiration (mm)",    unit: " mm",   convert: r1 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function frameImageUrl(cycleId: string, productKey: string, fhr: number): string {
  const key = `${productKey}_f${fhr.toString().padStart(2, "0")}`;
  return `${MV_API}/api/hrrr/static/${key}?v=${cycleId}`;
}

function fmtValidTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
  } catch { return iso; }
}

function fmtGenTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
  } catch { return iso; }
}

function buildLegendGradient(stops: HrrrProduct["stops"]): string {
  const pcts = stops.map(s => `${s.color} ${Math.round(s.pos * 100)}%`);
  return `linear-gradient(to right, ${pcts.join(", ")})`;
}

const PRODUCT_ICONS: Record<string, React.ReactNode> = {
  refc:  <Radar className="w-3 h-3" />,
  t2m:   <Thermometer className="w-3 h-3" />,
  dpt2m: <Droplets className="w-3 h-3" />,
  gust:  <Wind className="w-3 h-3" />,
  cape:  <Zap className="w-3 h-3" />,
  uphl:  <TrendingUp className="w-3 h-3" />,
  apcp:  <CloudRain className="w-3 h-3" />,
};

const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  refc:  "Composite Reflectivity — Simulated radar. The strongest echo in any layer of the atmosphere, closest to what radar would show at that hour.",
  t2m:   "2-Meter Temperature — Air temperature at shelter height (2 m above ground) in °F.",
  dpt2m: "2-Meter Dew Point — Low-level moisture. Dew points in the 60s and 70s are fuel for summer thunderstorms.",
  gust:  "Surface Wind Gust — Peak expected gust at the surface, covering both gradient wind and thunderstorm outflow.",
  cape:  "Surface-Based CAPE — Convective Available Potential Energy. Above ~2,000 J/kg supports strong updrafts.",
  uphl:  "2-5 km Updraft Helicity — A rotation proxy in the mid-levels. High values mark where the model is producing supercell-like storms.",
  apcp:  "Total Precipitation — Accumulated liquid-equivalent precipitation since the model initialized, so the values build through the animation.",
};

// ─── HRRR Legend ────────────────────────────────────────────────────────────
function HrrrLegend({ product }: { product: HrrrProduct }) {
  const gradient = buildLegendGradient(product.stops);
  return (
    <div className="border-t border-border bg-[#0a0f1c] px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
        {product.name} ({product.unit})
      </div>
      <div className="h-4 rounded" style={{ background: gradient }} />
      <div className="flex justify-between mt-1">
        {product.ticks.map(t => (
          <span key={t.v} className="text-[10px] text-muted-foreground" style={{ marginLeft: `${t.pos * 100}%`, transform: "translateX(-50%)", position: "relative" }}>
            {t.v}
          </span>
        ))}
      </div>
      {product.note && (
        <p className="text-[10px] text-muted-foreground mt-2">{product.note}</p>
      )}
    </div>
  );
}

// ─── HRRR Map Viewer ────────────────────────────────────────────────────────
function HrrrViewer({ location }: { location: Location }) {
  const [selectedProductKey, setSelectedProductKey] = useState("refc");
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<keyof typeof SPEEDS>("Normal");
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const { data: run, isLoading, isError, refetch, dataUpdatedAt } = useQuery<HrrrRun>({
    queryKey: ["hrrr-run"],
    queryFn: async () => {
      const res = await fetch(`${MV_API}/api/hrrr`);
      if (!res.ok) throw new Error("HRRR API unavailable");
      return res.json();
    },
    refetchInterval: 10 * 60 * 1000,
    staleTime: 9 * 60 * 1000,
  });

  const product = run?.products.find(p => p.key === selectedProductKey) ?? run?.products[0];
  const frames  = run ? (run.frames[selectedProductKey] ?? run.frames[run.products[0]?.key] ?? []) : [];
  const currentFrame = frames[frameIdx] ?? null;

  // Reset frame when product changes
  useEffect(() => {
    setFrameIdx(0);
    setImgLoaded(false);
    setImgError(false);
  }, [selectedProductKey]);

  // Animation loop
  useEffect(() => {
    if (!playing || !frames.length) return;
    intervalRef.current = setInterval(() => {
      setFrameIdx(prev => {
        const next = prev + 1;
        return next >= frames.length ? 0 : next;
      });
    }, SPEEDS[speed]);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, speed, frames.length]);

  const handlePrev = useCallback(() => {
    setFrameIdx(prev => (prev - 1 + frames.length) % frames.length);
    setPlaying(false);
  }, [frames.length]);

  const handleNext = useCallback(() => {
    setFrameIdx(prev => (prev + 1) % frames.length);
    setPlaying(false);
  }, [frames.length]);

  const handlePlayPause = useCallback(() => setPlaying(p => !p), []);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  { handlePrev(); }
      if (e.key === "ArrowRight") { handleNext(); }
      if (e.key === " ")          { e.preventDefault(); handlePlayPause(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePrev, handleNext, handlePlayPause]);

  // Download current frame
  const handleDownload = useCallback(async () => {
    if (!run || !currentFrame) return;
    try {
      const url = frameImageUrl(run.cycleId, selectedProductKey, currentFrame.fhr);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedProductKey}_${run.cycleId}_f${currentFrame.fhr.toString().padStart(2, "0")}.png`;
      a.click();
    } catch { /* ignore */ }
  }, [run, selectedProductKey, currentFrame]);

  // Share current frame
  const handleShare = useCallback(async () => {
    if (!run || !currentFrame) return;
    const url = frameImageUrl(run.cycleId, selectedProductKey, currentFrame.fhr);
    try {
      if (navigator.share) {
        await navigator.share({ title: `HRRR ${product?.name} — ${currentFrame.label}`, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch { /* ignore */ }
  }, [run, selectedProductKey, currentFrame, product]);

  const imageUrl = run && currentFrame
    ? frameImageUrl(run.cycleId, selectedProductKey, currentFrame.fhr)
    : null;

  const generatedAt = run?.generatedAt ?? null;
  const isExtended  = run?.extended ?? false;
  const maxFhr      = run?.maxFhr ?? 18;

  return (
    <div className="space-y-0">
      {/* ── Run status bar ── */}
      {run && (
        <div className="bg-[#080e1a] border-b border-border/60 px-4 py-2.5">
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Model Run</div>
              <div className="text-sm font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
                {run.cycle.label} {new Date(run.cycle.runTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Maps Generated</div>
              <div className="text-sm font-semibold">{generatedAt ? fmtGenTime(generatedAt) : "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Forecast Range</div>
              <div className="text-sm font-semibold">{maxFhr} hours {isExtended ? "(extended)" : ""}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Resolution</div>
              <div className="text-sm font-semibold">3 km · hourly</div>
            </div>
            <div className="ml-auto flex items-center">
              <button
                onClick={() => refetch()}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Refresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product tabs ── */}
      {run && (
        <div className="overflow-x-auto border-b border-border/60 bg-[#0a0f1c]">
          <div className="flex min-w-max">
            {run.products.map(p => (
              <button
                key={p.key}
                onClick={() => { setSelectedProductKey(p.key); setPlaying(false); }}
                className={`
                  flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap
                  border-b-2 transition-all
                  ${selectedProductKey === p.key
                    ? "border-primary text-primary bg-primary/10"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5"
                  }
                `}
              >
                {PRODUCT_ICONS[p.key]}
                {p.short}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Image viewer ── */}
      <div className="relative bg-black" style={{ minHeight: 260 }}>
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <div className="text-sm text-muted-foreground">Loading the latest HRRR run…</div>
          </div>
        )}
        {isError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Radar className="w-8 h-8 text-muted-foreground opacity-40" />
            <div className="text-sm text-muted-foreground">HRRR data unavailable — check back shortly</div>
            <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Retry</button>
          </div>
        )}
        {imageUrl && (
          <>
            {!imgLoaded && !imgError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary/60 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {imgError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-6">
                <div className="text-muted-foreground text-sm">Frame unavailable — map is still generating</div>
                <button onClick={() => { setImgError(false); setImgLoaded(false); }} className="text-xs text-primary hover:underline">Retry</button>
              </div>
            )}
            <img
              ref={imgRef}
              src={imageUrl}
              alt={currentFrame?.label ?? "HRRR frame"}
              className={`w-full h-auto transition-opacity duration-200 ${imgLoaded && !imgError ? "opacity-100" : "opacity-0"}`}
              onLoad={() => { setImgLoaded(true); setImgError(false); }}
              onError={() => { setImgError(true); setImgLoaded(false); }}
              style={{ display: "block" }}
            />
          </>
        )}
        {/* Watermark */}
        <div className="absolute bottom-2 left-2 text-[9px] font-bold tracking-widest text-white/30 font-mono pointer-events-none">
          VIP.SSWX · HRRR via NOAA
        </div>
        {/* Updated time */}
        {dataUpdatedAt > 0 && (
          <div className="absolute top-2 right-2 text-[9px] text-white/40 bg-black/50 rounded px-1.5 py-0.5 pointer-events-none">
            Updated: {new Date(dataUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </div>
        )}
      </div>

      {/* ── Playback controls ── */}
      {run && frames.length > 0 && (
        <div className="bg-[#0d1322] border-t border-border/60 px-4 py-3 space-y-2.5">
          <div className="flex items-center gap-3">
            {/* Prev / Play / Next */}
            <button
              onClick={handlePrev}
              className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors"
              title="Previous (←)"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={handlePlayPause}
              className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors shadow-lg"
              title="Play/Pause (Space)"
            >
              {playing ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5" fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>
            <button
              onClick={handleNext}
              className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors"
              title="Next (→)"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Frame info */}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold truncate">
                {currentFrame ? `F${currentFrame.fhr.toString().padStart(2, "0")} — ${product?.short ?? ""}` : "—"}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">
                {currentFrame ? fmtValidTime(currentFrame.validTime) : ""}
              </div>
            </div>

            {/* Speed */}
            <div className="flex rounded-lg overflow-hidden border border-border text-[10px] font-bold shrink-0">
              {Object.keys(SPEEDS).map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s as keyof typeof SPEEDS)}
                  className={`px-2.5 py-1 transition-colors ${speed === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Scrubber */}
          <div>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={frameIdx}
              onChange={e => { setFrameIdx(Number(e.target.value)); setPlaying(false); }}
              className="w-full accent-primary h-1"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
              <span>F00</span>
              <span>F{run.maxFhr.toString().padStart(2, "0")}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      {product && <HrrrLegend product={product} />}

      {/* ── Actions ── */}
      {run && currentFrame && (
        <div className="flex gap-3 px-4 py-3 border-t border-border/60 bg-[#080e1a]">
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 transition-all"
          >
            <Download className="w-3.5 h-3.5" /> Download Image
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:border-primary/40 transition-all"
          >
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
        </div>
      )}

      {/* ── About HRRR ── */}
      <div className="border-t border-border/60">
        <button
          onClick={() => setAboutOpen(v => !v)}
          className="w-full px-4 py-3.5 flex items-center justify-between text-left hover:bg-white/3 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-bold">About the HRRR</span>
          </div>
          {aboutOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {aboutOpen && (
          <div className="px-4 pb-4 text-sm text-muted-foreground space-y-3 border-t border-border/40">
            <p className="pt-3">
              The High-Resolution Rapid Refresh (HRRR) is NOAA's storm-scale forecast model.
              It covers the continental US on a 3 km grid, initializes every single hour with
              the latest radar data, and forecasts out to 18 hours (48 hours on the 00Z, 06Z,
              12Z, and 18Z runs).
            </p>
            <div className="space-y-2">
              {Object.entries(PRODUCT_DESCRIPTIONS).map(([key, desc]) => (
                <div key={key} className="bg-card/40 border border-border/50 rounded-lg px-3 py-2.5">
                  <div className="font-semibold text-foreground text-xs mb-0.5">
                    {run?.products.find(p => p.key === key)?.name ?? key}
                  </div>
                  <div className="text-[11px] leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] border-t border-border/40 pt-2">
              Map images sourced from <strong className="text-foreground">NOAA HRRR via AWS Open Data</strong>,
              processed and rendered by Max Velocity Weather. Use for situational awareness only —
              always defer to official NWS forecasts and warnings.
            </p>
          </div>
        )}
      </div>
      {/* Unused location prop silencer */}
      <div style={{ display: "none" }}>{location.name}</div>
    </div>
  );
}

// ─── GFS Charts Viewer ───────────────────────────────────────────────────────
const TOOLTIP_STYLE = {
  background: "hsl(232 20% 10%)",
  border: "1px solid hsl(232 18% 16%)",
  borderRadius: 8,
  fontSize: 12,
};

function useGfsForecast(location: Location, modelId: string, paramId: string) {
  return useQuery({
    queryKey: ["gfs-model", location.lat, location.lon, modelId, paramId],
    queryFn: async () => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude",  String(location.lat));
      url.searchParams.set("longitude", String(location.lon));
      url.searchParams.set("hourly",    paramId);
      url.searchParams.set("models",    modelId);
      url.searchParams.set("timezone",  "auto");
      url.searchParams.set("wind_speed_unit", "ms");
      url.searchParams.set("forecast_days", "7");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Open-Meteo error");
      return res.json();
    },
    staleTime: 15 * 60 * 1000,
  });
}

function GfsChartsViewer({ location }: { location: Location }) {
  const [selectedParam, setSelectedParam] = useState("temperature_2m");
  const [selectedCategory, setSelectedCategory] = useState<GfsCategory>("Surface");
  const [selectedModels, setSelectedModels]  = useState<string[]>(["gfs_seamless", "ecmwf_ifs025", "icon_seamless"]);
  const [hours, setHours] = useState(72);

  const paramDef = GFS_PARAMS.find(p => p.id === selectedParam)!;

  const gfsQ    = useGfsForecast(location, "gfs_seamless",  selectedParam);
  const ecmwfQ  = useGfsForecast(location, "ecmwf_ifs025",  selectedParam);
  const iconQ   = useGfsForecast(location, "icon_seamless",  selectedParam);
  const gemQ    = useGfsForecast(location, "gem_seamless",   selectedParam);

  const queryMap: Record<string, typeof gfsQ> = {
    gfs_seamless:  gfsQ,
    ecmwf_ifs025:  ecmwfQ,
    icon_seamless: iconQ,
    gem_seamless:  gemQ,
  };

  const times = gfsQ.data?.hourly?.time ?? [];
  const displayHours = Math.min(hours, times.length);

  const chartData = times.slice(0, displayHours).map((t: string, i: number) => {
    const point: Record<string, string | number> = {
      time: format(parseISO(t), i % 24 === 0 ? "EEE" : "ha"),
    };
    for (const model of GFS_MODELS) {
      if (!selectedModels.includes(model.id)) continue;
      const raw = queryMap[model.id].data?.hourly?.[selectedParam]?.[i];
      if (raw !== undefined && raw !== null) {
        point[model.label] = paramDef.convert(raw);
      }
    }
    return point;
  });

  const isLoading = selectedModels.some(m => queryMap[m]?.isLoading);

  const toggleModel = (id: string) => {
    setSelectedModels(prev =>
      prev.includes(id)
        ? prev.length > 1 ? prev.filter(m => m !== id) : prev
        : [...prev, id]
    );
  };

  const stats = GFS_MODELS.filter(m => selectedModels.includes(m.id)).map(model => {
    const q = queryMap[model.id];
    const raw = q.data?.hourly?.[selectedParam]?.slice(0, 24) ?? [];
    if (!raw.length) return null;
    const converted = raw.map((v: number) => paramDef.convert(v));
    const min = Math.min(...converted);
    const max = Math.max(...converted);
    const avg = Math.round(converted.reduce((a: number, b: number) => a + b, 0) / converted.length);
    return { ...model, min, max, avg };
  }).filter(Boolean);

  const visibleParams = GFS_PARAMS.filter(p => p.cat === selectedCategory);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{location.name} · Multi-model comparison via Open-Meteo</p>
        </div>
        <button
          onClick={() => { gfsQ.refetch(); ecmwfQ.refetch(); iconQ.refetch(); gemQ.refetch(); }}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded border border-border hover:border-primary/40 transition-all"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="flex items-start gap-2 bg-muted/15 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <span>
          GFS chart data powered by Open-Meteo. Compare GFS, ECMWF IFS, ICON, and GEM output
          across surface, severe weather, and upper air parameters.
          Larger spreads between models indicate higher forecast uncertainty.
        </span>
      </div>

      {/* ── Model toggles ── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div>
          <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-widest font-semibold">Models</div>
          <div className="flex flex-wrap gap-2">
            {GFS_MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => toggleModel(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  selectedModels.includes(m.id) ? "opacity-100" : "opacity-35 border-transparent"
                }`}
                style={selectedModels.includes(m.id)
                  ? { backgroundColor: m.color + "22", color: m.color, borderColor: m.color + "55" }
                  : {}}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Category tabs ── */}
        <div>
          <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-widest font-semibold">Category</div>
          <div className="flex flex-wrap gap-1.5">
            {GFS_CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  const first = GFS_PARAMS.find(p => p.cat === cat);
                  if (first) setSelectedParam(first.id);
                }}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${
                  selectedCategory === cat
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted/20 text-muted-foreground border-transparent hover:border-border"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* ── Parameters ── */}
        <div>
          <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-widest font-semibold">Parameter</div>
          <div className="flex flex-wrap gap-1.5">
            {visibleParams.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedParam(p.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${
                  selectedParam === p.id
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted/20 text-muted-foreground border-transparent hover:border-border"
                }`}
              >
                {p.label.split(" (")[0]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Time range ── */}
        <div>
          <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-widest font-semibold">Time Range</div>
          <div className="flex flex-wrap gap-1.5">
            {[24, 48, 72, 120, 168].map(h => (
              <button
                key={h}
                onClick={() => setHours(h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  hours === h
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-muted/20 text-muted-foreground border-transparent hover:border-border"
                }`}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-0.5">{paramDef.label}</h3>
        <p className="text-[11px] text-muted-foreground mb-4">
          Next {hours}h · {location.name}
        </p>
        {isLoading ? (
          <div className="h-64 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="w-4 h-4 border border-primary border-t-transparent rounded-full animate-spin" />
            Loading model data…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="hsl(232 18% 16%)" strokeDasharray="3 3" opacity={0.4} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: "#6b7280" }}
                tickLine={false}
                interval={Math.floor(hours / 12)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                unit={paramDef.unit}
                width={58}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {GFS_MODELS.filter(m => selectedModels.includes(m.id)).map(model => (
                <Line
                  key={model.id}
                  type="monotone"
                  dataKey={model.label}
                  stroke={model.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── 24h stats table ── */}
      {stats.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Next 24h Model Statistics</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-4 font-medium">Model</th>
                  <th className="pb-2 pr-4 font-medium">Min</th>
                  <th className="pb-2 pr-4 font-medium">Max</th>
                  <th className="pb-2 pr-4 font-medium">Avg</th>
                  <th className="pb-2 font-medium">Spread</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stats.map(s => s && (
                  <tr key={s.id}>
                    <td className="py-2 pr-4 font-bold" style={{ color: s.color }}>{s.label}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.min}{paramDef.unit}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{s.max}{paramDef.unit}</td>
                    <td className="py-2 pr-4 font-medium">{s.avg}{paramDef.unit}</td>
                    <td className="py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        s.max - s.min > 15
                          ? "bg-red-500/15 text-red-400"
                          : s.max - s.min > 8
                            ? "bg-yellow-500/15 text-yellow-400"
                            : "bg-green-500/15 text-green-400"
                      }`}>
                        ±{s.max - s.min}{paramDef.unit}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            <span className="text-red-400 font-medium">Large spread</span> = higher uncertainty.{" "}
            <span className="text-green-400 font-medium">Small spread</span> = models agree well.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function ForecastRunComparator({ location }: Props) {
  const [activeModel, setActiveModel] = useState<"hrrr" | "gfs">("hrrr");

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0d1a2e 0%, #0f2040 50%, #0d1a2e 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="relative z-10 px-4 py-5 md:px-6">
          <div
            className="inline-block text-[10px] font-bold tracking-[0.2em] uppercase px-2.5 py-1 rounded mb-3"
            style={{ background: "#6d28d933", color: "#a78bfa", border: "1px solid #6d28d955" }}
          >
            STORMSYNC VIP MODEL RUNS
          </div>
          <h1
            className="font-black uppercase leading-none mb-1"
            style={{
              fontSize: "clamp(1.8rem, 7vw, 3rem)",
              fontFamily: "'Barlow Condensed', 'Inter', sans-serif",
              letterSpacing: "-0.01em",
              color: "#ffffff",
            }}
          >
            {activeModel === "hrrr" ? "HRRR MODEL MAPS" : "GFS CHARTS"}
          </h1>
          <p className="text-xs text-white/55 max-w-lg">
            {activeModel === "hrrr"
              ? "The High-Resolution Rapid Refresh runs every hour at 3 km resolution. Step or animate through the whole run."
              : "Multi-model forecast comparison across GFS, ECMWF, ICON, and GEM — surface, severe weather, and upper air parameters."}
          </p>
        </div>
      </div>

      {/* Model tabs */}
      <div className="flex border-b border-border bg-[#080e1a]">
        <button
          onClick={() => setActiveModel("hrrr")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeModel === "hrrr"
              ? "border-primary text-primary bg-primary/10"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          <Radar className="w-3.5 h-3.5" />
          HRRR Maps
        </button>
        <button
          onClick={() => setActiveModel("gfs")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
            activeModel === "gfs"
              ? "border-primary text-primary bg-primary/10"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5"
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          GFS Charts
        </button>
      </div>

      {/* Content */}
      <div className={activeModel === "gfs" ? "max-w-4xl mx-auto" : ""}>
        {activeModel === "hrrr"
          ? <HrrrViewer location={location} />
          : <GfsChartsViewer location={location} />
        }
      </div>
    </div>
  );
}
