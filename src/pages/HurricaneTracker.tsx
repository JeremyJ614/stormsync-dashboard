import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import "leaflet/dist/leaflet.css";
import { NHC_API } from "../config";
import { Wind, ExternalLink, RefreshCw, Navigation2, Gauge, Radio, Eye } from "lucide-react";

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

const KT_TO_MPH = 1.15078;

function category(ktRaw: number): { label: string; short: string; color: string } {
  const kt = ktRaw || 0;
  if (kt >= 137) return { label: "Category 5 Hurricane", short: "CAT 5", color: "#d946ef" };
  if (kt >= 113) return { label: "Category 4 Hurricane", short: "CAT 4", color: "#a855f7" };
  if (kt >= 96) return { label: "Category 3 Hurricane", short: "CAT 3", color: "#ef4444" };
  if (kt >= 83) return { label: "Category 2 Hurricane", short: "CAT 2", color: "#f97316" };
  if (kt >= 64) return { label: "Category 1 Hurricane", short: "CAT 1", color: "#fbbf24" };
  if (kt >= 34) return { label: "Tropical Storm", short: "TS", color: "#22d3ee" };
  return { label: "Tropical Depression", short: "TD", color: "#94a3b8" };
}

function stormLatLon(s: Storm): [number, number] | null {
  if (typeof s.latitudeNumeric === "number" && typeof s.longitudeNumeric === "number") return [s.latitudeNumeric, s.longitudeNumeric];
  const parse = (v?: string, neg?: RegExp) => { if (!v) return null; const n = parseFloat(v); return Number.isNaN(n) ? null : (neg && neg.test(v) ? -n : n); };
  const lat = parse(s.latitude, /S/i), lon = parse(s.longitude, /W/i);
  return lat !== null && lon !== null ? [lat, lon] : null;
}

function StormMap({ storms }: { storms: Storm[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      if (!mapRef.current) {
        const map = L.map(containerRef.current!, { center: [25, -60], zoom: 3, zoomControl: true, attributionControl: false, scrollWheelZoom: false });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 9 }).addTo(map);
        mapRef.current = map;
      }
      const map = mapRef.current!;
      if (layerRef.current) map.removeLayer(layerRef.current);
      const g = L.layerGroup().addTo(map);
      layerRef.current = g;
      const pts: [number, number][] = [];
      for (const s of storms) {
        const ll = stormLatLon(s); if (!ll) continue;
        pts.push(ll);
        const cat = category(Number(s.intensity) || 0);
        L.circleMarker(ll, { radius: 12, color: "#fff", weight: 2, fillColor: cat.color, fillOpacity: 0.85, className: "hurricane-dot" }).addTo(g)
          .bindTooltip(`${s.name} · ${cat.short} · ${Math.round((Number(s.intensity) || 0) * KT_TO_MPH)} mph`, { permanent: false, sticky: true });
        L.marker(ll, { icon: L.divIcon({ className: "", html: `<div style="font-size:18px;line-height:1;transform:translate(-2px,-2px)">🌀</div>`, iconSize: [18, 18] }) }).addTo(g);
      }
      if (pts.length === 1) map.setView(pts[0], 4);
      else if (pts.length > 1) map.fitBounds(pts as [number, number][], { padding: [40, 40] });
    });
    return () => { cancelled = true; };
  }, [storms]);

  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <style>{`.hurricane-dot{filter:drop-shadow(0 0 6px currentColor);animation:hurPulse 2.4s ease-in-out infinite}@keyframes hurPulse{0%,100%{opacity:.9}50%{opacity:.5}}`}</style>
      <div ref={containerRef} style={{ height: 360, background: "#05010f" }} />
    </div>
  );
}

// ── Preview (P-01): a baked demo of Hurricane Milton at peak Category 5 ──────────
// Real 2024 storm (peak ~180 mph / 897 mb in the SW Gulf). Shown so members can
// see exactly what the tracker displays during a live event. NOT a current system.
const MILTON = {
  name: "Hurricane Milton",
  catLabel: "Category 5 Hurricane",
  mph: 180, kt: 157, pressure: 897, movementDir: "NE", movementSpeed: 9,
  pos: [22.6, -93.2] as [number, number],
  track: [
    { ll: [22.6, -93.2] as [number, number], label: "Now", info: "Cat 5 · 180 mph", cone: 35 },
    { ll: [23.4, -90.8] as [number, number], label: "+12h", info: "Cat 5 · 175 mph", cone: 70 },
    { ll: [24.5, -88.0] as [number, number], label: "+24h", info: "Cat 4 · 150 mph", cone: 110 },
    { ll: [25.9, -85.0] as [number, number], label: "+36h", info: "Cat 3 · 125 mph", cone: 150 },
    { ll: [27.6, -82.6] as [number, number], label: "+48h", info: "Cat 3 landfall · 120 mph", cone: 190 },
  ],
  windRadii: [
    { kt: 34, nmi: 160, color: "#22d3ee", label: "Tropical-storm-force (39+ mph)" },
    { kt: 50, nmi: 90, color: "#fbbf24", label: "Strong (58+ mph)" },
    { kt: 64, nmi: 45, color: "#ef4444", label: "Hurricane-force (74+ mph)" },
  ],
};

function MiltonPreviewMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { center: [25, -87], zoom: 5, zoomControl: true, attributionControl: false, scrollWheelZoom: false });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 9 }).addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 60);
      // Cone of uncertainty — translucent circles growing along the track.
      for (const p of MILTON.track) L.circle(p.ll, { radius: p.cone * 1852, stroke: false, fillColor: "#ffffff", fillOpacity: 0.07 }).addTo(map);
      // Forecast track line.
      L.polyline(MILTON.track.map((p) => p.ll), { color: "#ffffff", weight: 2, dashArray: "4 5", opacity: 0.7 }).addTo(map);
      // Forecast points + time labels.
      MILTON.track.forEach((p, i) => {
        if (i > 0) L.circleMarker(p.ll, { radius: 5, color: "#fff", weight: 1.5, fillColor: "#a855f7", fillOpacity: 0.9 }).addTo(map).bindTooltip(`${p.label} · ${p.info}`, { sticky: true });
        L.marker(p.ll, { icon: L.divIcon({ className: "", html: `<div style="font-size:10px;color:#cbd5e1;text-shadow:0 0 3px #000;transform:translate(8px,-6px);white-space:nowrap">${p.label}</div>`, iconSize: [1, 1] }) }).addTo(map);
      });
      // Wind-field radii at the current position.
      for (const w of MILTON.windRadii) L.circle(MILTON.pos, { radius: w.nmi * 1852, color: w.color, weight: 1.5, fill: false, opacity: 0.85, dashArray: "2 4" }).addTo(map);
      // Current center.
      L.circleMarker(MILTON.pos, { radius: 13, color: "#fff", weight: 2, fillColor: "#d946ef", fillOpacity: 0.9, className: "hurricane-dot" }).addTo(map).bindTooltip("Hurricane Milton · Cat 5 · 180 mph", { sticky: true });
      L.marker(MILTON.pos, { icon: L.divIcon({ className: "", html: `<div style="font-size:20px;transform:translate(-3px,-3px)">🌀</div>`, iconSize: [20, 20] }) }).addTo(map);
      map.fitBounds(MILTON.track.map((p) => p.ll) as [number, number][], { padding: [60, 60] });
    });
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);
  return (
    <div className="rounded-xl overflow-hidden border border-border relative">
      <style>{`.hurricane-dot{filter:drop-shadow(0 0 8px currentColor);animation:hurPulse 2.4s ease-in-out infinite}@keyframes hurPulse{0%,100%{opacity:.95}50%{opacity:.55}}`}</style>
      <div ref={containerRef} style={{ height: 400, background: "#05010f" }} />
      <div className="absolute bottom-2 right-2 bg-black/80 rounded-lg px-3 py-2 space-y-1 pointer-events-none" style={{ zIndex: 1000 }}>
        <div className="text-[9px] uppercase tracking-[0.2em] text-white/55 mb-1">Wind field</div>
        {MILTON.windRadii.map((w) => (
          <div key={w.kt} className="flex items-center gap-2"><div className="w-3 h-0.5 rounded" style={{ background: w.color }} /><span className="text-[10px] text-white">{w.label}</span></div>
        ))}
        <div className="flex items-center gap-2 pt-0.5 border-t border-white/10 mt-1"><div className="w-3 h-2 rounded-sm bg-white/20" /><span className="text-[10px] text-white">Forecast cone</span></div>
      </div>
    </div>
  );
}

function MiltonPreview() {
  const cat = category(MILTON.kt);
  return (
    <div className="space-y-4">
      <div className="bg-fuchsia-500/10 border border-fuchsia-500/40 rounded-xl p-3 flex items-start gap-2 text-sm">
        <Eye className="w-4 h-4 text-fuchsia-300 shrink-0 mt-0.5" />
        <div><span className="font-bold text-fuchsia-300">PREVIEW — sample storm.</span> <span className="text-muted-foreground">This is Hurricane Milton at peak Category 5 (a real 2024 storm), shown so you can see exactly what the tracker displays during a live event. This is <strong className="text-foreground">not</strong> a current system.</span></div>
      </div>
      <MiltonPreviewMap />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-card border rounded-xl overflow-hidden" style={{ borderColor: cat.color + "55" }}>
          <div className="px-4 py-3 border-b border-border flex items-center justify-between" style={{ backgroundColor: cat.color + "12" }}>
            <div className="flex items-center gap-2"><span className="text-lg">🌀</span><div><div className="font-bold">{MILTON.name}</div><div className="text-[11px]" style={{ color: cat.color }}>{MILTON.catLabel}</div></div></div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest" style={{ background: cat.color + "22", color: cat.color }}>{cat.short}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 p-3">
            <div className="bg-muted/20 rounded-lg p-2 text-center"><Wind className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" /><div className="text-base font-bold">{MILTON.mph}</div><div className="text-[10px] text-muted-foreground">mph winds</div></div>
            <div className="bg-muted/20 rounded-lg p-2 text-center"><Gauge className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" /><div className="text-base font-bold">{MILTON.pressure}</div><div className="text-[10px] text-muted-foreground">mb pressure</div></div>
            <div className="bg-muted/20 rounded-lg p-2 text-center"><Navigation2 className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" /><div className="text-base font-bold">{MILTON.movementSpeed}</div><div className="text-[10px] text-muted-foreground">mph {MILTON.movementDir}</div></div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-sm space-y-2">
          <h3 className="font-semibold text-sm">What you'd see during a live storm</h3>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside leading-relaxed">
            <li>Real-time position, category, winds, pressure &amp; movement</li>
            <li>The forecast track and NHC cone of uncertainty</li>
            <li>Wind-field radii (tropical-storm &amp; hurricane-force)</li>
            <li>A direct link to the official NHC advisory &amp; cone graphic</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function HurricaneTracker() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["nhc-active"],
    queryFn: async () => {
      const r = await fetch(`${NHC_API}/active`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ activeStorms?: Storm[] }>;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const storms = (data?.activeStorms ?? []).filter((s) => stormLatLon(s));
  const [view, setView] = useState<"live" | "preview">("live");

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🌀</span>
            <h1 className="text-xl font-bold tracking-wide uppercase">Hurricane &amp; Tropical Tracker</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">NOAA National Hurricane Center · Atlantic &amp; East Pacific · Live</p>
        </div>
        {view === "live" && (
          <button onClick={() => refetch()} disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40 disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 bg-card border border-border rounded-xl p-1.5">
        <button onClick={() => setView("live")} className={`py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${view === "live" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}><Radio className="w-4 h-4" /> Active Storms</button>
        <button onClick={() => setView("preview")} className={`py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${view === "preview" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}><Eye className="w-4 h-4" /> Preview</button>
      </div>

      {view === "preview" && <MiltonPreview />}

      {view === "live" && isLoading && <div className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted-foreground">Loading tropical outlook…</div>}
      {view === "live" && isError && !isLoading && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">Could not load NHC data. Try again shortly.</div>}

      {view === "live" && !isLoading && !isError && storms.length === 0 && (
        <div className="aurora-bg glass rounded-2xl p-10 text-center">
          <div className="relative">
            <div className="text-4xl mb-3">🌤️</div>
            <h2 className="text-lg font-bold">No active tropical systems</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              The NHC is not currently tracking any named storms in the Atlantic or East Pacific basins.
              The Atlantic hurricane season runs June 1 – November 30.
            </p>
            <a href="https://www.nhc.noaa.gov" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-4">
              <ExternalLink className="w-3 h-3" /> NHC Tropical Weather Outlook
            </a>
          </div>
        </div>
      )}

      {view === "live" && storms.length > 0 && (
        <>
          <StormMap storms={storms} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {storms.map((s) => {
              const kt = Number(s.intensity) || 0;
              const cat = category(kt);
              const mph = Math.round(kt * KT_TO_MPH);
              const coneUrl = s.forecastGraphics?.url || s.publicAdvisory?.url;
              return (
                <div key={s.id} className="bg-card border rounded-xl overflow-hidden" style={{ borderColor: cat.color + "55" }}>
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between" style={{ backgroundColor: cat.color + "12" }}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🌀</span>
                      <div>
                        <div className="font-bold">{s.name}</div>
                        <div className="text-[11px]" style={{ color: cat.color }}>{cat.label}</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest" style={{ background: cat.color + "22", color: cat.color }}>{cat.short}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-3">
                    <div className="bg-muted/20 rounded-lg p-2 text-center"><Wind className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" /><div className="text-base font-bold">{mph}</div><div className="text-[10px] text-muted-foreground">mph winds</div></div>
                    <div className="bg-muted/20 rounded-lg p-2 text-center"><Gauge className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" /><div className="text-base font-bold">{s.pressure || "—"}</div><div className="text-[10px] text-muted-foreground">mb pressure</div></div>
                    <div className="bg-muted/20 rounded-lg p-2 text-center"><Navigation2 className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" /><div className="text-base font-bold">{s.movementSpeed || "—"}</div><div className="text-[10px] text-muted-foreground">{s.movementDir ? `mph ${s.movementDir}` : "movement"}</div></div>
                  </div>
                  {coneUrl && (
                    <a href={coneUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-border text-xs text-primary hover:bg-primary/10 transition-colors">
                      <ExternalLink className="w-3 h-3" /> Official forecast cone &amp; advisory
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="bg-muted/20 border border-border rounded-xl p-3 text-[11px] text-muted-foreground leading-relaxed">
        Positions and intensities are the latest NHC public advisory. For the official forecast cone, watches/warnings,
        and life-safety guidance, always defer to <a href="https://www.nhc.noaa.gov" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">nhc.noaa.gov</a>.
      </div>
    </div>
  );
}
