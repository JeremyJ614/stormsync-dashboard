/**
 * SSWX VIP — Tropical Storm History
 * Mirrors Ryan Hall Y'all's /tropical/history layout:
 * - Searchable storm list with year / intensity sort
 * - MapLibre GL map with color-coded best track
 * - Animate Track / Reset View / Fullscreen controls
 * - Storm detail card + Final Advisory accordion + NHC graphics grid
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { STORMSYNC_DARK } from "../lib/basemap";
import { NHC_API } from "../config";
import {
  ArrowLeft, Search, ChevronDown, ChevronUp,
  Play, Pause, RotateCcw, Maximize2, Grid3X3
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TrackPoint {
  lat: number;
  lon: number;
  winds_kt: number;
  pressure?: number;
  timestamp: string;
  type?: string;
}

interface HistoricalStorm {
  id: string;
  name: string;
  year: number;
  basin: string;
  peak_intensity: string;
  peak_winds: number;
  last_advisory_num: string;
  final_status: string;
  track_points: TrackPoint[];
  graphics_urls: string[];
  final_advisory_text?: string;
  archived_at?: string;
}

type SortMode = "season" | "intensity";

// ─── Constants ────────────────────────────────────────────────────────────────
const KT_TO_MPH = 1.15078;

function trackColor(winds_kt: number): string {
  if (winds_kt >= 137) return "#d946ef";
  if (winds_kt >= 113) return "#a855f7";
  if (winds_kt >= 96)  return "#ef4444";
  if (winds_kt >= 83)  return "#f97316";
  if (winds_kt >= 64)  return "#fbbf24";
  if (winds_kt >= 34)  return "#22d3ee";
  return "#94a3b8";
}

const INTENSITY_SCALE = [
  { label: "TD",    desc: "< 39 mph",    color: "#94a3b8" },
  { label: "TS",    desc: "39–73 mph",   color: "#22d3ee" },
  { label: "Cat 1", desc: "74–95 mph",   color: "#fbbf24" },
  { label: "Cat 2", desc: "96–110 mph",  color: "#f97316" },
  { label: "Cat 3", desc: "111–129 mph", color: "#ef4444" },
  { label: "Cat 4", desc: "130–156 mph", color: "#a855f7" },
  { label: "Cat 5", desc: "≥ 157 mph",   color: "#d946ef" },
];

// ─── Storm track map ──────────────────────────────────────────────────────────
interface TrackMapProps {
  storm: HistoricalStorm | null;
  animateStep: number | null;
  onResetView?: () => void;
  onFullscreen?: () => void;
}

function TrackMap({ storm, animateStep, onResetView, onFullscreen }: TrackMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);

  // Init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STORMSYNC_DARK,
      center: [-60, 25],
      zoom: 3,
      attributionControl: false,
      scrollZoom: true,
    });

    map.on("load", () => {
      mapRef.current = map;
      setReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Draw track
  useEffect(() => {
    if (!ready || !mapRef.current || !storm) return;
    const map = mapRef.current;
    const pts = storm.track_points;
    const visiblePts = animateStep !== null ? pts.slice(0, animateStep + 1) : pts;

    // Build GeoJSON segments colored by intensity
    const segmentFeatures: GeoJSON.Feature[] = [];
    for (let i = 0; i < visiblePts.length - 1; i++) {
      const a = visiblePts[i], b = visiblePts[i + 1];
      segmentFeatures.push({
        type: "Feature",
        properties: { color: trackColor(a.winds_kt), winds_kt: a.winds_kt },
        geometry: { type: "LineString", coordinates: [[a.lon, a.lat], [b.lon, b.lat]] },
      });
    }

    const pointFeatures: GeoJSON.Feature[] = visiblePts.map((p, i) => ({
      type: "Feature",
      properties: {
        color: trackColor(p.winds_kt),
        winds: Math.round(p.winds_kt * KT_TO_MPH),
        pressure: p.pressure ?? null,
        time: p.timestamp,
        stype: p.type ?? "",
        isCurrent: i === visiblePts.length - 1,
      },
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    }));

    const trackGeo: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: segmentFeatures };
    const pointGeo: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: pointFeatures };

    // Remove old layers/sources
    ["track-line", "track-points"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    ["track", "track-pts"].forEach((id) => {
      if (map.getSource(id)) map.removeSource(id);
    });

    map.addSource("track", { type: "geojson", data: trackGeo });
    map.addLayer({
      id: "track-line",
      type: "line",
      source: "track",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": ["get", "color"], "line-width": 2.5, "line-opacity": 0.85 },
    });

    map.addSource("track-pts", { type: "geojson", data: pointGeo });
    map.addLayer({
      id: "track-points",
      type: "circle",
      source: "track-pts",
      paint: {
        "circle-radius": 5,
        "circle-color": ["get", "color"],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });

    // Fit bounds to visible track
    if (visiblePts.length > 0) {
      const lons = visiblePts.map((p) => p.lon);
      const lats = visiblePts.map((p) => p.lat);
      try {
        map.fitBounds(
          [[Math.min(...lons) - 3, Math.min(...lats) - 3], [Math.max(...lons) + 3, Math.max(...lats) + 3]],
          { padding: { top: 50, bottom: 60, left: 40, right: 40 }, duration: 600 }
        );
      } catch { /* ignore */ }
    }
  }, [ready, storm, animateStep]);

  // Expose reset + fullscreen via callbacks
  useEffect(() => {
    if (!mapRef.current || !storm) return;
    // Expose imperative handles via external callbacks — see parent component
  }, [storm]);

  return (
    <div className="relative w-full h-full bg-[#080f1e]">
      <div ref={containerRef} className="w-full h-full" />

      {/* Intensity scale legend */}
      <div className="absolute bottom-12 left-2 bg-black/80 rounded-lg p-2 text-[9px] pointer-events-none">
        <div className="font-bold text-white/70 mb-1.5 uppercase tracking-wider">Intensity Scale</div>
        {INTENSITY_SCALE.map((row) => (
          <div key={row.label} className="flex items-center gap-1.5 mb-0.5">
            <div className="w-3 h-2 rounded-sm shrink-0" style={{ background: row.color }} />
            <span className="text-white/70">{row.label}</span>
            <span className="text-white/40">{row.desc}</span>
          </div>
        ))}
      </div>

      {/* Attribution */}
      <div className="absolute bottom-1 right-1 text-[9px] text-white/30 bg-black/40 rounded px-1 pointer-events-none">
        © CartoDB © OpenStreetMap
      </div>

      {/* Controls bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-3 py-2 flex items-center gap-4">
        <button
          className="flex items-center gap-1.5 text-[11px] text-white/70 hover:text-white transition-colors"
          onClick={onResetView}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset View
        </button>
        <button
          className="flex items-center gap-1.5 text-[11px] text-white/70 hover:text-white transition-colors ml-auto"
          onClick={onFullscreen}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          Fullscreen
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TropicalHistory() {
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>("season");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [advisoryOpen, setAdvisoryOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [animateStep, setAnimateStep] = useState<number | null>(null);
  const animIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<{ storms: HistoricalStorm[] }>({
    queryKey: ["nhc-historical"],
    queryFn: async () => {
      const res = await fetch(`${NHC_API}/historical`);
      if (!res.ok) return { storms: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const allStorms = data?.storms ?? [];

  // Available years
  const years = [...new Set(allStorms.map((s) => s.year))].sort((a, b) => b - a);

  // Filter + sort
  const filtered = allStorms
    .filter((s) => {
      if (yearFilter !== "all" && s.year !== yearFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!s.name.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortMode === "intensity") return b.peak_winds - a.peak_winds;
      if (b.year !== a.year) return b.year - a.year;
      return parseInt(a.last_advisory_num || "0") - parseInt(b.last_advisory_num || "0");
    });

  const selected = selectedId ? allStorms.find((s) => s.id === selectedId) ?? null : null;

  // Auto-select first
  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].id);
  }, [filtered.length]);

  // Stop animation when storm changes
  useEffect(() => {
    stopAnimation();
    setAnimateStep(null);
    setAdvisoryOpen(false);
  }, [selectedId]);

  function stopAnimation() {
    setAnimating(false);
    if (animIntervalRef.current) { clearInterval(animIntervalRef.current); animIntervalRef.current = null; }
  }

  function handleAnimateToggle() {
    if (!selected) return;
    if (animating) { stopAnimation(); return; }
    const pts = selected.track_points;
    if (!pts.length) return;
    let step = 0;
    setAnimateStep(0);
    setAnimating(true);
    animIntervalRef.current = setInterval(() => {
      step++;
      if (step >= pts.length - 1) {
        setAnimateStep(pts.length - 1);
        stopAnimation();
        return;
      }
      setAnimateStep(step);
    }, 180);
  }

  function handleResetTrack() {
    stopAnimation();
    setAnimateStep(null);
  }

  const handleResetView = useCallback(() => {
    // The TrackMap component handles reset internally via its own map ref
    // We trigger a re-render with null animateStep which causes the map to re-fit
    setAnimateStep(null);
  }, []);

  const handleFullscreen = useCallback(() => {
    if (!mapContainerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      mapContainerRef.current.requestFullscreen?.();
    }
  }, []);

  const archivedTime = selected?.archived_at
    ? new Date(selected.archived_at).toLocaleString("en-US", {
        month: "numeric", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit"
      })
    : null;

  const peakMphSelected = selected ? Math.round(selected.peak_winds * KT_TO_MPH) : 0;

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
        <div className="relative z-10 px-4 py-6 md:px-8">
          <div
            className="inline-block text-[10px] font-bold tracking-[0.2em] uppercase px-2.5 py-1 rounded mb-3"
            style={{ background: "#00c8ff33", color: "#00c8ff", border: "1px solid #00c8ff55" }}
          >
            EVERY STORM WE'VE COVERED
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
            TROPICAL STORM HISTORY
          </h1>
          <p className="text-sm text-white/60 max-w-lg">
            Every system we've covered, archived with its best track, peak intensity, and graphics.
          </p>
        </div>
      </div>

      {/* Back link */}
      <div className="px-4 py-3 border-b border-border bg-card/30">
        <Link href="/hurricane">
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to live tropical tracker
          </button>
        </Link>
      </div>

      {/* ── Main layout ── */}
      <div className="flex flex-col md:flex-row" style={{ minHeight: "70vh" }}>
        {/* ── Left: storm list ── */}
        <div
          className="md:w-52 shrink-0 border-r border-border bg-card/20 flex flex-col"
          style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}
        >
          {/* Search + filters */}
          <div className="p-3 space-y-2 border-b border-border sticky top-0 bg-background z-10">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-input border border-border rounded-lg focus:outline-none focus:border-primary/50"
              />
            </div>
            <select
              value={yearFilter === "all" ? "all" : String(yearFilter)}
              onChange={(e) => setYearFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="w-full text-xs bg-input border border-border rounded-lg px-2 py-1.5 focus:outline-none"
            >
              <option value="all">All years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <div className="flex rounded-lg overflow-hidden border border-border text-[10px] font-bold">
              <button
                onClick={() => setSortMode("season")}
                className={`flex-1 py-1.5 transition-colors ${sortMode === "season" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
              >
                By Season
              </button>
              <button
                onClick={() => setSortMode("intensity")}
                className={`flex-1 py-1.5 transition-colors ${sortMode === "intensity" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
              >
                By Intensity
              </button>
            </div>
          </div>

          {/* Storm list */}
          {isLoading ? (
            <div className="p-4 text-xs text-muted-foreground text-center animate-pulse">Loading storms...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-xs text-muted-foreground text-center">No storms found.</div>
          ) : (
            <div className="flex-1">
              {filtered.map((s) => {
                const peakMph = Math.round(s.peak_winds * KT_TO_MPH);
                const isActive = s.id === selectedId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left px-3 py-2.5 border-b border-border/40 transition-colors ${isActive ? "bg-primary/15 border-l-2 border-l-primary" : "hover:bg-card/60"}`}
                  >
                    <div className={`text-xs font-bold truncate ${isActive ? "text-primary" : "text-foreground"}`}>
                      {s.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {s.basin} · {peakMph} mph
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: map + detail ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Map */}
          <div ref={mapContainerRef} style={{ height: "380px" }}>
            {selected ? (
              <TrackMap
                storm={selected}
                animateStep={animateStep}
                onResetView={handleResetView}
                onFullscreen={handleFullscreen}
              />
            ) : (
              <div className="w-full h-full bg-[#080f1e] flex items-center justify-center text-muted-foreground text-sm">
                {isLoading ? "Loading storm data..." : "Select a storm to view its track"}
              </div>
            )}
          </div>

          {/* Animate track controls */}
          {selected && (
            <div className="px-4 py-2.5 border-t border-b border-border bg-card/30 flex items-center gap-4">
              <button
                onClick={handleAnimateToggle}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {animating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {animating ? "Pause Track" : "Animate Track"}
              </button>
              <button
                onClick={handleResetTrack}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset View
              </button>
            </div>
          )}

          {/* Storm detail */}
          {selected && (
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: trackColor(selected.peak_winds) }}
                  />
                  <div>
                    <span className="font-bold text-base">{selected.name}</span>
                    <span className="text-muted-foreground text-sm ml-2">
                      {selected.year} · {selected.basin}
                    </span>
                  </div>
                </div>
                {archivedTime && (
                  <div className="text-[10px] text-muted-foreground shrink-0">
                    Archived as of {archivedTime}
                  </div>
                )}
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-card border border-border rounded-xl p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Peak Intensity</div>
                  <div className="text-sm font-bold">{selected.peak_intensity}</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Peak Winds</div>
                  <div className="text-sm font-bold">{peakMphSelected} mph</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Last Advisory</div>
                  <div className="text-sm font-bold">#{selected.last_advisory_num}</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-3">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Final Status</div>
                  <div className="text-sm font-bold">{selected.final_status}</div>
                </div>
              </div>

              {/* Final Advisory accordion */}
              {selected.final_advisory_text && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setAdvisoryOpen((v) => !v)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-card/50 hover:bg-card/70 transition-colors text-sm font-medium"
                  >
                    <span>Final Public Advisory</span>
                    {advisoryOpen
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {advisoryOpen && (
                    <div className="px-4 py-4 border-t border-border">
                      <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                        {selected.final_advisory_text}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Storm graphics */}
              {selected.graphics_urls && selected.graphics_urls.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Grid3X3 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-bold">Storm Graphics</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {selected.graphics_urls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="aspect-video bg-card border border-border rounded-lg overflow-hidden hover:border-primary/40 transition-colors block"
                      >
                        <img
                          src={url}
                          alt={`${selected.name} graphic ${i + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer disclaimer */}
      <div className="px-4 py-4 border-t border-border text-[11px] text-muted-foreground text-center">
        History is archived from launch forward — no backfill of past seasons.
        Tracks and stats reflect the last data we held before each system dissipated.
      </div>
    </div>
  );
}
