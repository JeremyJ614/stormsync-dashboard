import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Location } from "../hooks/useLocation";
import {
  Tornado, ExternalLink, Info, Database, Flame, BarChart3, Map as MapIcon,
  TrendingUp, Calendar, Ruler, Skull, Trophy, Layers, Globe2,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, Legend,
} from "recharts";

interface Props { location: Location }

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface ClimoData {
  meta: { minYear: number; maxYear: number; numYears: number; totalTornadoes: number; totalDeaths: number; totalInjuries: number; avgAnnual: number };
  byYear: [number, number][];
  monthlyAvg: number[];
  byState: [string, number, number, number][];
  regionMonth: Record<string, number[]>;
  pathLenBins: [string, number][];
  pathWidBins: [string, number][];
  casualtiesByYear: [number, number, number][];
  deadliest: [string, string, number, number][];
  densityGrid: [number, number, number][];
  densityGridEF2: [number, number, number][];
  tracks: [number, number, number, number, number, number][];
  cumAvgByMonth: number[];
}

const EF_COLOR: Record<number, string> = { 0: "#86efac", 1: "#fde047", 2: "#f59e0b", 3: "#f97316", 4: "#ef4444", 5: "#d946ef" };

// Density color ramp by count (descending thresholds).
const GRID_RAMP: [number, string][] = [
  [200, "#d946ef"], [100, "#ef4444"], [50, "#f97316"], [25, "#fde047"],
  [12, "#22c55e"], [6, "#06b6d4"], [3, "#2563eb"], [1, "#1e3a5f"],
];
function gridColor(n: number): string {
  for (const [t, c] of GRID_RAMP) if (n >= t) return c;
  return "#1e3a5f";
}

// ─── Shared Leaflet map for density grids + tracks ───────────────────────────
function ClimoMap({ mode, grid, tracks, minEF, sinceYear }: {
  mode: "grid" | "tracks";
  grid?: [number, number, number][];
  tracks?: [number, number, number, number, number, number][];
  minEF?: number;
  sinceYear?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { center: [39, -97], zoom: 4, zoomControl: true, attributionControl: false, scrollWheelZoom: false });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", { maxZoom: 10 }).addTo(map);
      map.createPane("labels");
      const lp = map.getPane("labels")!; lp.style.zIndex = "650"; lp.style.pointerEvents = "none";
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", { maxZoom: 10, pane: "labels" }).addTo(map);
      mapRef.current = map;
      draw(L, map);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => { if (mapRef.current) draw(L, mapRef.current); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, minEF, sinceYear, grid, tracks]);

  function draw(L: typeof import("leaflet"), map: import("leaflet").Map) {
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    const group = L.layerGroup();
    if (mode === "grid" && grid) {
      for (const [lat, lon, n] of grid) {
        L.rectangle([[lat, lon], [lat + 1, lon + 1]], { stroke: false, fillColor: gridColor(n), fillOpacity: 0.6 })
          .bindTooltip(`${n} tornadoes`, { sticky: true }).addTo(group);
      }
    } else if (mode === "tracks" && tracks) {
      let drawn = 0;
      for (const [slat, slon, elat, elon, mag, yr] of tracks) {
        if ((minEF && mag < minEF) || (sinceYear && yr < sinceYear)) continue;
        if (drawn++ > 6000) break;
        L.polyline([[slat, slon], [elat, elon]], { color: EF_COLOR[mag] ?? "#f59e0b", weight: mag >= 4 ? 2.5 : 1.5, opacity: 0.8 })
          .bindTooltip(`EF${mag} · ${yr}`, { sticky: true }).addTo(group);
      }
    }
    group.addTo(map);
    layerRef.current = group;
  }

  return <div ref={containerRef} style={{ height: 360, background: "#0a0e1a" }} className="rounded-xl" />;
}

type TabId = "annual" | "monthly" | "region" | "ytd" | "density" | "hotspots" | "tracks" | "states" | "pathsize" | "casualties" | "spcmaps" | "reference";
const NEW_TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "annual", label: "Annual Trend", icon: TrendingUp },
  { id: "monthly", label: "Monthly", icon: Calendar },
  { id: "region", label: "By Region", icon: Globe2 },
  { id: "ytd", label: "YTD vs Avg", icon: BarChart3 },
  { id: "density", label: "Density Map", icon: MapIcon },
  { id: "hotspots", label: "EF2+ Hotspots", icon: Flame },
  { id: "tracks", label: "Tornado Tracks", icon: Tornado },
  { id: "states", label: "State Rankings", icon: Trophy },
  { id: "pathsize", label: "Path Size", icon: Ruler },
  { id: "casualties", label: "Casualties", icon: Skull },
  { id: "spcmaps", label: "SPC Maps", icon: Database },
  { id: "reference", label: "Reference", icon: Layers },
];

const REGION_COLORS: Record<string, string> = {
  "Great Plains": "#f97316", "Midwest": "#22c55e", "South": "#ef4444",
  "Southeast": "#a855f7", "Northeast": "#38bdf8", "West": "#fbbf24",
};

const SPC_MAPS = [
  { title: "State Average Tornadoes (1996–2025)", url: "https://www.spc.noaa.gov/wcm/ustormaps/1996-2025-stateavgtornadoes.png" },
  { title: "State Average Fatalities (1996–2025)", url: "https://www.spc.noaa.gov/wcm/ustormaps/1996-2025-stateavgfatals.png" },
  { title: "U.S. Annual Tornado Trend", url: "https://www.spc.noaa.gov/wcm/torngraph-big.png" },
  { title: "U.S. Tornado Tracks Map", url: "https://www.spc.noaa.gov/wcm/maps.png" },
];

const EF_SCALE = [
  { scale: "EF0", winds: "65-85 mph", color: "#86efac", pct: "53%", desc: "Light damage" },
  { scale: "EF1", winds: "86-110 mph", color: "#fde047", pct: "32%", desc: "Moderate damage" },
  { scale: "EF2", winds: "111-135 mph", color: "#f97316", pct: "11%", desc: "Significant damage" },
  { scale: "EF3", winds: "136-165 mph", color: "#ef4444", pct: "3%", desc: "Severe damage" },
  { scale: "EF4", winds: "166-200 mph", color: "#b91c1c", pct: "0.7%", desc: "Devastating damage" },
  { scale: "EF5", winds: ">200 mph", color: "#7f1d1d", pct: "0.1%", desc: "Incredible damage" },
];

const NOTABLE_OUTBREAKS = [
  { date: "Apr 25–28, 2011", name: "Super Outbreak", tornadoes: 360, ef5: 4, deaths: 324, note: "Largest outbreak in U.S. history; included Tuscaloosa EF4 & Hackleburg EF5." },
  { date: "Apr 3–4, 1974", name: "1974 Super Outbreak", tornadoes: 148, ef5: 7, deaths: 335, note: "Held the single-day tornado record until 2011." },
  { date: "May 22, 2011", name: "Joplin, MO", tornadoes: 1, ef5: 1, deaths: 158, note: "Single EF5; deadliest U.S. tornado since 1947." },
  { date: "May 3, 1999", name: "Bridge Creek–Moore, OK", tornadoes: 74, ef5: 1, deaths: 50, note: "Highest measured surface wind on Earth: 318 mph (DOW)." },
  { date: "Dec 10–11, 2021", name: "Quad-State Outbreak", tornadoes: 71, ef5: 0, deaths: 89, note: "Mayfield, KY tornado track: 165 mi continuous." },
];

export default function TornadoClimatology({ location }: Props) {
  const [tab, setTab] = useState<TabId>("annual");
  const [minEF, setMinEF] = useState(3);
  const [sinceYear, setSinceYear] = useState(1950);

  const { data, isLoading, error } = useQuery<ClimoData>({
    queryKey: ["tornado-climo"],
    queryFn: async () => { const r = await fetch("/data/tornadoClimo.json"); if (!r.ok) throw new Error("load failed"); return r.json(); },
    staleTime: Infinity,
  });

  const m = data?.meta;
  const annualAvg = m?.avgAnnual ?? 0;
  const peakYear = useMemo(() => data ? data.byYear.reduce((a, b) => b[1] > a[1] ? b : a) : null, [data]);

  const monthIdx = new Date().getMonth(); // 0-11
  const ytdAvg = data ? data.cumAvgByMonth[monthIdx] : 0;

  const regionLineData = useMemo(() => {
    if (!data) return [];
    return MONTHS.map((mo, i) => {
      const row: Record<string, number | string> = { month: mo };
      for (const [reg, arr] of Object.entries(data.regionMonth)) row[reg] = arr[i];
      return row;
    });
  }, [data]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Tornado className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold tracking-wide uppercase">Tornado Climatology</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {location.name} · {m ? `${m.minYear}–${m.maxYear}` : "1950–2023"} SPC database · {m ? m.totalTornadoes.toLocaleString() : "70,000+"} tornadoes
          </p>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Avg / Year", value: annualAvg.toLocaleString(), color: "#f97316" },
          { label: "Total Deaths", value: m ? m.totalDeaths.toLocaleString() : "—", color: "#ef4444" },
          { label: "Busiest Year", value: peakYear ? `${peakYear[0]}` : "—", sub: peakYear ? `${peakYear[1].toLocaleString()} tornadoes` : "", color: "#a855f7" },
          { label: "Avg Through Today", value: ytdAvg ? Math.round(ytdAvg).toLocaleString() : "—", sub: `by end of ${MONTHS[monthIdx]}`, color: "#38bdf8" },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-3 text-center" style={{ borderColor: s.color + "33" }}>
            <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            {s.sub && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Subtabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {NEW_TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${tab === t.id ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:border-primary/30"}`}>
              <Icon className="w-3.5 h-3.5" /> <span className="whitespace-nowrap">{t.label}</span>
            </button>
          );
        })}
      </div>

      {error && <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">Could not load the tornado dataset.</div>}
      {isLoading && <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}

      {data && (
        <div className="glass rounded-xl p-4">
          {tab === "annual" && (
            <>
              <h3 className="text-sm font-semibold mb-3">U.S. Tornadoes per Year ({m!.minYear}–{m!.maxYear})</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.byYear.map(([y, n]) => ({ y, n }))}>
                  <XAxis dataKey="y" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={9} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}`, "Tornadoes"]} />
                  <ReferenceLine y={annualAvg} stroke="#f97316" strokeDasharray="4 4" label={{ value: `avg ${annualAvg}`, fill: "#f97316", fontSize: 10, position: "insideTopRight" }} />
                  <Bar dataKey="n" radius={[2, 2, 0, 0]}>
                    {data.byYear.map(([, n], i) => <Cell key={i} fill={n >= annualAvg ? "#f97316" : "#3b82f6"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">Improved detection inflates recent counts; the long-term violent-tornado trend is roughly flat.</p>
            </>
          )}

          {tab === "monthly" && (
            <>
              <h3 className="text-sm font-semibold mb-3">Average Tornadoes by Month</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.monthlyAvg.map((v, i) => ({ mo: MONTHS[i], v }))}>
                  <XAxis dataKey="mo" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}`, "Avg tornadoes"]} />
                  <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                    {data.monthlyAvg.map((v, i) => <Cell key={i} fill={v > 100 ? "#ef4444" : v > 50 ? "#f97316" : "#4b9cd3"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">Peak season is April–June; a secondary uptick comes in late fall across the South.</p>
            </>
          )}

          {tab === "region" && (
            <>
              <h3 className="text-sm font-semibold mb-3">Tornado Season Timing by Region</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={regionLineData}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {Object.keys(data.regionMonth).map(reg => (
                    <Line key={reg} type="monotone" dataKey={reg} stroke={REGION_COLORS[reg] ?? "#7B8FD9"} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2">Watch the peak march north and west through spring — the Great Plains lead, the Southeast peaks earlier.</p>
            </>
          )}

          {tab === "ytd" && (
            <>
              <h3 className="text-sm font-semibold mb-3">Climatological Average — Cumulative Through the Year</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={data.cumAvgByMonth.map((v, i) => ({ mo: MONTHS[i], v }))}>
                  <XAxis dataKey="mo" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}`, "Cumulative avg"]} />
                  <ReferenceLine x={MONTHS[monthIdx]} stroke="#38bdf8" strokeDasharray="4 4" label={{ value: "today", fill: "#38bdf8", fontSize: 10 }} />
                  <Line type="monotone" dataKey="v" stroke="#f97316" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-3 text-xs text-muted-foreground">
                By the end of <strong className="text-foreground">{MONTHS[monthIdx]}</strong>, a climatologically average year has produced
                <strong className="text-foreground"> {Math.round(ytdAvg).toLocaleString()}</strong> tornadoes (of ~{annualAvg.toLocaleString()} for the full year).
                Busiest year on record: <strong className="text-foreground">{peakYear?.[0]}</strong> ({peakYear?.[1].toLocaleString()}).
              </div>
            </>
          )}

          {tab === "density" && (
            <>
              <h3 className="text-sm font-semibold mb-3">Tornado Density — All Tornadoes ({m!.minYear}–{m!.maxYear})</h3>
              <div className="relative">
                <ClimoMap mode="grid" grid={data.densityGrid} />
                <div className="absolute bottom-2 right-2 bg-black/80 rounded-lg px-3 py-2 space-y-1 pointer-events-none" style={{ zIndex: 1000 }}>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-white/55 mb-1">Tornadoes / cell</div>
                  {GRID_RAMP.slice().reverse().map(([t, c]) => (
                    <div key={t} className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ background: c }} /><span className="text-[10px] text-white">{t}+</span></div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Counts are aggregated into 1° latitude/longitude cells by touchdown point. Tornado Alley and Dixie Alley light up clearly.</p>
            </>
          )}

          {tab === "hotspots" && (
            <>
              <h3 className="text-sm font-semibold mb-3">Significant Tornado Hotspots — EF2+ only</h3>
              <div className="relative">
                <ClimoMap mode="grid" grid={data.densityGridEF2} />
                <div className="absolute bottom-2 right-2 bg-black/80 rounded-lg px-3 py-2 space-y-1 pointer-events-none" style={{ zIndex: 1000 }}>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-white/55 mb-1">EF2+ / cell</div>
                  {GRID_RAMP.slice().reverse().map(([t, c]) => (
                    <div key={t} className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ background: c }} /><span className="text-[10px] text-white">{t}+</span></div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Restricting to strong/violent (EF2+) tornadoes reveals where the truly dangerous events concentrate.</p>
            </>
          )}

          {tab === "tracks" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold">Historical Tornado Tracks</h3>
                <div className="flex flex-wrap gap-2">
                  <div className="flex gap-1">
                    {[2, 3, 4, 5].map(ef => (
                      <button key={ef} onClick={() => setMinEF(ef)} className={`px-2 py-1 rounded text-[11px] font-medium ${minEF === ef ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}>EF{ef}{ef < 5 ? "+" : ""}</button>
                    ))}
                  </div>
                  <select value={sinceYear} onChange={e => setSinceYear(+e.target.value)} className="bg-card border border-border rounded px-2 py-1 text-[11px] outline-none">
                    {[1950, 1980, 2000, 2010, 2020].map(y => <option key={y} value={y}>since {y}</option>)}
                  </select>
                </div>
              </div>
              <div className="relative">
                <ClimoMap mode="tracks" tracks={data.tracks} minEF={minEF} sinceYear={sinceYear} />
                <div className="absolute bottom-2 right-2 bg-black/80 rounded-lg px-3 py-2 space-y-1 pointer-events-none" style={{ zIndex: 1000 }}>
                  <div className="text-[9px] uppercase tracking-[0.2em] text-white/55 mb-1">EF rating</div>
                  {[2, 3, 4, 5].map(ef => (
                    <div key={ef} className="flex items-center gap-2"><div className="w-3 h-1.5 rounded-sm" style={{ background: EF_COLOR[ef] }} /><span className="text-[10px] text-white">EF{ef}</span></div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Each line is a tornado's start-to-end path (EF2+ in the database). Filter by intensity and era above.</p>
            </>
          )}

          {tab === "states" && (
            <>
              <h3 className="text-sm font-semibold mb-3">State Rankings — Most Tornadoes ({m!.minYear}–{m!.maxYear})</h3>
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="grid grid-cols-[2rem_1fr_5rem_5rem_5rem] gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/20">
                  <span>#</span><span>State</span><span className="text-right">Total</span><span className="text-right">EF3+</span><span className="text-right">Deaths</span>
                </div>
                <div className="divide-y divide-border">
                  {data.byState.slice(0, 25).map(([st, c, v, d], i) => (
                    <div key={st} className="grid grid-cols-[2rem_1fr_5rem_5rem_5rem] gap-2 px-3 py-1.5 text-sm items-center">
                      <span className="text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="font-medium">{st}</span>
                      <span className="text-right tabular-nums">{c.toLocaleString()}</span>
                      <span className="text-right tabular-nums text-orange-400">{v.toLocaleString()}</span>
                      <span className="text-right tabular-nums text-red-400">{d.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === "pathsize" && (
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <h3 className="text-sm font-semibold mb-3">Path Length (miles)</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.pathLenBins.map(([label, n]) => ({ label, n }))}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${(v as number).toLocaleString()}`, "Tornadoes"]} />
                    <Bar dataKey="n" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-3">Path Width (yards)</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.pathWidBins.map(([label, n]) => ({ label, n }))}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${(v as number).toLocaleString()}`, "Tornadoes"]} />
                    <Bar dataKey="n" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="md:col-span-2 text-xs text-muted-foreground">Most tornadoes are short and narrow; the rare long-track, wide wedges cause the majority of deaths.</p>
            </div>
          )}

          {tab === "casualties" && (
            <>
              <h3 className="text-sm font-semibold mb-3">Tornado Fatalities by Year</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.casualtiesByYear.map(([y, f]) => ({ y, f }))}>
                  <XAxis dataKey="y" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={9} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}`, "Deaths"]} />
                  <Bar dataKey="f" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <h4 className="text-xs font-semibold mt-4 mb-2 text-muted-foreground uppercase tracking-wide">Deadliest single tornadoes on record</h4>
              <div className="space-y-1.5">
                {data.deadliest.map(([date, st, fat, mag], i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-muted/20 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2"><span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: (EF_COLOR[mag] ?? "#666") + "22", color: EF_COLOR[mag] ?? "#999" }}>EF{mag < 0 ? "?" : mag}</span><span>{date}</span><span className="text-muted-foreground text-xs">{st}</span></div>
                    <span className="font-bold text-red-400 tabular-nums">{fat} deaths</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "spcmaps" && (
            <div className="grid sm:grid-cols-2 gap-3">
              {SPC_MAPS.map(img => (
                <a key={img.url} href={img.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors bg-black/20">
                  <img src={img.url} alt={img.title} loading="lazy" className="w-full h-44 object-contain bg-black/30" />
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium">{img.title}</span>
                    <ExternalLink className="w-3 h-3 text-primary" />
                  </div>
                </a>
              ))}
              <p className="sm:col-span-2 text-xs text-muted-foreground">Official NOAA SPC climatology graphics. Tap any map to open full size.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Reference & external tools (now its own tab to keep the page short) ── */}
      {tab === "reference" && (
      <div className="space-y-5">
      <div className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 rounded-xl p-4">
        <div className="flex items-start gap-2 mb-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            For deeper interactive research, these NOAA SPC tools and third-party archives don't embed well, so
            they open in a clean window:
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            { label: "SPC Data Viewer", url: "https://www.spc.noaa.gov/climo/dataviewer/?hl=en-US", desc: "Every U.S. tornado/hail/wind report, 1950–present." },
            { label: "SPC Outbreaks", url: "https://www.spc.noaa.gov/exper/outbreaks/", desc: "Ranks every tornado day by an objective severity index." },
            { label: "Environment Browser", url: "https://www.spc.noaa.gov/exper/envbrowser/", desc: "Composite CAPE/shear/STP for historical tornadoes." },
            { label: "Tornado Archive", url: "https://tornadoarchive.com/explorer/2.3.1/", desc: "Beautiful global tornado map, filterable timeline." },
            { label: "USA Today Archive", url: "https://data.usatoday.com/tornado-archive/", desc: "Search U.S. tornadoes by ZIP with narratives." },
          ].map(t => (
            <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 bg-muted/20 hover:bg-muted/40 rounded-lg p-3 group">
              <Database className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-semibold group-hover:text-primary flex items-center gap-1">{t.label} <ExternalLink className="w-3 h-3" /></div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </div>
            </a>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start gap-2 mb-3"><Info className="w-4 h-4 text-primary shrink-0 mt-0.5" /><h3 className="text-sm font-semibold">Enhanced Fujita (EF) Scale</h3></div>
        <div className="space-y-2">
          {EF_SCALE.map(e => (
            <div key={e.scale} className="flex items-center gap-3">
              <div className="w-10 text-xs font-bold shrink-0" style={{ color: e.color }}>{e.scale}</div>
              <div className="text-xs text-muted-foreground w-24 shrink-0">{e.winds}</div>
              <div className="flex-1 bg-muted rounded-full h-2"><div className="h-2 rounded-full" style={{ width: e.pct, backgroundColor: e.color, minWidth: 4 }} /></div>
              <div className="text-xs text-muted-foreground w-10 text-right shrink-0">{e.pct}</div>
              <div className="text-xs text-muted-foreground hidden md:block w-36 shrink-0">{e.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Notable U.S. Tornado Events</h3>
        <div className="space-y-2">
          {NOTABLE_OUTBREAKS.map(o => (
            <div key={o.date} className="bg-muted/20 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <div className="flex items-center gap-2"><Tornado className="w-3.5 h-3.5 text-primary" /><span className="text-sm font-semibold">{o.name}</span><span className="text-[11px] text-muted-foreground">{o.date}</span></div>
                <div className="flex items-center gap-3 text-[11px] tabular-nums">
                  <span className="text-muted-foreground">Tornadoes: <span className="text-foreground font-semibold">{o.tornadoes}</span></span>
                  {o.ef5 > 0 && <span className="text-red-400">EF5: <span className="font-semibold">{o.ef5}</span></span>}
                  <span className="text-orange-400">Deaths: <span className="font-semibold">{o.deaths}</span></span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{o.note}</p>
            </div>
          ))}
        </div>
      </div>
      </div>
      )}
    </div>
  );
}
