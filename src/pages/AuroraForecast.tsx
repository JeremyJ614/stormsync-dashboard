import { useQuery } from "@tanstack/react-query";
import type { Location } from "../hooks/useLocation";
import { Sparkles, ExternalLink, RefreshCw, Info } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format } from "date-fns";
import { AuroraViewMap } from "../components/AuroraViewMap";

interface Props { location: Location }

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

function kpLabel(kp: number): { text: string; color: string; bgColor: string; vis: string } {
  if (kp >= 8) return { text: "EXTREME STORM", color: "#d946ef", bgColor: "#1a0020", vis: "Visible at most latitudes" };
  if (kp >= 6) return { text: "MAJOR STORM", color: "#ef4444", bgColor: "#2d0000", vis: "Visible to 50°N" };
  if (kp >= 5) return { text: "GEOMAGNETIC STORM", color: "#f97316", bgColor: "#2a1000", vis: "Visible to 55°N" };
  if (kp >= 4) return { text: "ACTIVE", color: "#fde047", bgColor: "#1a1400", vis: "Visible at high latitudes" };
  if (kp >= 3) return { text: "UNSETTLED", color: "#86efac", bgColor: "#001a06", vis: "Possible at 65°N+" };
  if (kp >= 2) return { text: "QUIET", color: "#4ade80", bgColor: "#001208", vis: "Polar regions only" };
  return { text: "VERY QUIET", color: "#06b6d4", bgColor: "#001a20", vis: "Polar cap only" };
}

function useSwpc() {
  return useQuery({
    queryKey: ["swpc-kp"],
    queryFn: async () => {
      const res = await fetch("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json");
      if (!res.ok) throw new Error("SWPC API error");
      const data = await res.json();
      // Real fields: estimated_kp (fractional), kp_index (integer); `kp` is a label like "1M".
      return data as Array<{ time_tag: string; kp_index: number; estimated_kp: number; kp: string }>;
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

function useSwpcForecast() {
  return useQuery({
    queryKey: ["swpc-kp-forecast"],
    queryFn: async () => {
      const res = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json");
      if (!res.ok) throw new Error("SWPC forecast error");
      const data = await res.json();
      // SWPC returns an array of objects: { time_tag, kp, observed, noaa_scale }.
      return (data as Array<{ time_tag: string; kp: number; observed: string; noaa_scale: string | null }>).map(r => ({
        time: r.time_tag, kp: Number(r.kp), observed: r.observed, noaaScale: r.noaa_scale ?? "",
      }));
    },
    staleTime: 15 * 60 * 1000,
    retry: 2,
  });
}

function useSwpcSolarWind() {
  return useQuery({
    queryKey: ["swpc-solar-wind"],
    queryFn: async () => {
      const res = await fetch("https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json");
      if (!res.ok) throw new Error("Solar wind error");
      const data = await res.json();
      const rows = (data as string[][]).slice(1).slice(-12);
      return rows.map(r => ({ time: r[0], bz: parseFloat(r[3]), bt: parseFloat(r[6]) }));
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
}

export default function AuroraForecast({ location }: Props) {
  const { data: kpHistory, isLoading: histLoading, refetch } = useSwpc();
  const { data: kpForecast, isLoading: fcLoading } = useSwpcForecast();
  const { data: solarWind } = useSwpcSolarWind();

  const latestKp = Number(kpHistory?.at(-1)?.estimated_kp ?? kpHistory?.at(-1)?.kp_index ?? 0) || 0;
  const { text: kpText, color: kpColor, bgColor: kpBg, vis: kpVis } = kpLabel(latestKp);

  const canSeeAtLat = (kp: number, lat: number) => Math.abs(lat) >= (90 - kp * 5);
  const visible = canSeeAtLat(latestKp, location.lat);

  const safeFormat = (value: unknown, fmt: string): string => {
    if (value == null) return "";
    const d = new Date(value as string | number | Date);
    return Number.isNaN(d.getTime()) ? "" : format(d, fmt);
  };

  const recentKp = (kpHistory ?? [])
    .slice(-24)
    .map((d) => ({
      time: safeFormat(d.time_tag, "ha"),
      kp: Number(d.estimated_kp ?? d.kp_index ?? 0) || 0,
    }))
    .filter((d) => d.time !== "");

  // Only the predicted rows (the rest are already-observed history).
  const futureForecast = (kpForecast ?? []).filter((d) => d.observed !== "observed");
  // Peak includes the current value so the "peak" line is never weaker than "now".
  const futureMax = futureForecast.length ? Math.max(...futureForecast.map((d) => Number(d.kp ?? 0))) : 0;
  const peakKp = Math.max(latestKp, futureMax);
  const forecastKp = futureForecast
    .slice(0, 24)
    .map((d) => ({
      time: safeFormat(d.time, "EEE ha"),
      kp: Number(d.kp ?? 0),
      color: kpLabel(Number(d.kp ?? 0)).color,
    }))
    .filter((d) => d.time !== "");

  const latestBz = solarWind?.at(-1)?.bz ?? null;
  const latestBt = solarWind?.at(-1)?.bt ?? null;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold tracking-wide uppercase">Aurora Forecast</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{location.name} · NOAA Space Weather Prediction Center</p>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="flex items-start gap-2 bg-muted/20 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <span>Data from NOAA SWPC. Kp index updates every minute. Aurora visibility also depends on dark skies, cloud cover, and local light pollution.</span>
      </div>

      {/* Main Kp Card */}
      <div className="bg-card border rounded-xl p-5 text-center" style={{ borderColor: kpColor + "50" }}>
        {histLoading ? (
          <div className="h-40 flex items-center justify-center text-muted-foreground animate-pulse">Loading SWPC data...</div>
        ) : (
          <>
            <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">Current Kp Index</div>
            <div className="text-6xl font-bold mb-2" style={{ color: kpColor, textShadow: `0 0 30px ${kpColor}40` }}>
              {latestKp.toFixed(1)}
            </div>
            <div className="inline-block px-5 py-1.5 rounded font-bold text-base tracking-widest mb-3"
              style={{ color: kpColor, backgroundColor: kpBg, border: `1px solid ${kpColor}40` }}>
              {kpText}
            </div>
            <div className="text-sm text-muted-foreground mb-4">{kpVis}</div>
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${visible ? "border-green-500/50 bg-green-500/10 text-green-400" : "border-muted bg-muted/20 text-muted-foreground"}`}>
              <span className={`w-2 h-2 rounded-full ${visible ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`} />
              {visible ? `Aurora potentially visible at ${location.name}` : `Aurora not expected at ${location.name} (${Math.abs(location.lat).toFixed(1)}°${location.lat >= 0 ? "N" : "S"})`}
            </div>
          </>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        {[
          { label: "Your Latitude", value: histLoading ? "—" : `${Math.abs(location.lat).toFixed(1)}°${location.lat >= 0 ? "N" : "S"}`, color: "#7B8FD9" },
          { label: "Min Kp for Visibility", value: histLoading ? "—" : `Kp ${Math.max(0, Math.round((90 - Math.abs(location.lat)) / 5))}`, color: "#a78bfa" },
          { label: "Geomagnetic Scale", value: histLoading ? "—" : latestKp >= 5 ? `G${Math.min(5, Math.floor(latestKp - 4))}` : "G0", color: kpColor },
          { label: "Bz (IMF)", value: latestBz !== null ? `${latestBz.toFixed(1)} nT` : "—", color: latestBz !== null && latestBz < -5 ? "#ef4444" : "#4ade80" },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-3">
            <div className="text-lg font-bold" style={{ color: m.color }}>{m.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Aurora View-Line Map (derived from the SWPC Kp forecast) */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Aurora View Line — North America</span>
          </div>
          <a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> SWPC
          </a>
        </div>
        {(histLoading || fcLoading) ? (
          <div className="h-60 bg-muted/20 animate-pulse" />
        ) : (
          <div className="p-3">
            <AuroraViewMap peakKp={peakKp} currentKp={latestKp} userLat={location.lat} userLon={location.lon} userName={location.name} />
          </div>
        )}
        <div className="px-4 pb-3 text-xs text-muted-foreground">
          The solid line is the southern extent where the aurora may appear low on the northern horizon at the peak forecast Kp ({peakKp.toFixed(1)}); the dashed line tracks the current Kp ({latestKp.toFixed(1)}). Derived from the NOAA SWPC planetary-Kp forecast — clear, dark skies still required.
        </div>
      </div>

      {/* OVATION oval image */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold">Aurora Oval (OVATION Prime — NOAA)</span>
          <a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> Full Map
          </a>
        </div>
        <div className="p-3 bg-black/40 flex items-center justify-center min-h-[200px]">
          <img
            src={`https://services.swpc.noaa.gov/images/animations/ovation/global/latest.jpg?t=${Math.floor(Date.now() / 300000)}`}
            alt="NOAA Aurora Oval OVATION"
            className="w-full rounded-lg object-contain"
            style={{ maxHeight: 380 }}
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.display = "none";
              const parent = img.parentElement;
              if (parent) {
                const div = document.createElement("div");
                div.className = "text-center p-6";
                div.innerHTML = `<p class="text-sm text-muted-foreground mb-3">Aurora oval imagery requires direct NOAA access.</p><a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener noreferrer" class="text-primary text-sm hover:underline">View Aurora Forecast on NOAA SWPC →</a>`;
                parent.appendChild(div);
              }
            }}
          />
        </div>
        <p className="px-4 pb-3 text-xs text-muted-foreground">Global aurora oval — updated every ~5 minutes. Shows probability of aurora activity by region.</p>
      </div>

      {/* Solar Wind Bz */}
      {solarWind && solarWind.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-1">IMF Bz — Solar Wind (Last 60 min)</h3>
          <p className="text-xs text-muted-foreground mb-3">Negative Bz (southward) enhances aurora activity</p>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={solarWind.map(d => ({ time: d.time.slice(11, 16), bz: d.bz, bt: d.bt }))}>
              <defs>
                <linearGradient id="bzGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v?.toFixed(1)} nT`, "Bz"]} />
              <Area type="monotone" dataKey="bz" stroke="#a78bfa" fill="url(#bzGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          {latestBz !== null && (
            <div className="flex items-center gap-3 mt-2 text-xs">
              <span className="text-muted-foreground">Bz: <span className="font-bold" style={{ color: latestBz < -5 ? "#ef4444" : latestBz < 0 ? "#f97316" : "#4ade80" }}>{latestBz.toFixed(1)} nT</span></span>
              {latestBt !== null && <span className="text-muted-foreground">Bt: <span className="font-bold text-foreground">{latestBt.toFixed(1)} nT</span></span>}
              <span className="text-muted-foreground">{latestBz < -10 ? "🟣 Strong southward — excellent aurora conditions" : latestBz < -5 ? "🟠 Moderate southward — good aurora conditions" : latestBz < 0 ? "🟡 Slightly southward" : "🟢 Northward — aurora suppressed"}</span>
            </div>
          )}
        </div>
      )}

      {/* Recent Kp Activity */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Recent Kp Activity (Last 24 Hours)</h3>
        {histLoading ? <div className="h-36 bg-muted/20 rounded animate-pulse" /> : recentKp.length > 0 ? (
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={recentKp}>
              <defs>
                <linearGradient id="kpGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={5} />
              <YAxis domain={[0, 9]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}`, "Kp"]} />
              <Area type="monotone" dataKey="kp" stroke="#a78bfa" fill="url(#kpGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="p-4 text-center text-sm text-muted-foreground">No recent data available. <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Check NOAA SWPC →</a></div>
        )}
      </div>

      {/* Kp Forecast */}
      {!fcLoading && forecastKp.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Kp Forecast (Next 24 Hours)</h3>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={forecastKp}>
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={5} />
              <YAxis domain={[0, 9]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}`, "Kp"]} />
              <Bar dataKey="kp" radius={[3, 3, 0, 0]}>
                {forecastKp.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Kp Scale Reference */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start gap-2 mb-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <h3 className="text-sm font-semibold">Kp Scale Reference</h3>
        </div>
        <div className="space-y-1.5">
          {[
            { kp: "0–1", label: "Very Quiet", color: "#06b6d4", desc: "Polar cap — no display" },
            { kp: "2–3", label: "Quiet to Unsettled", color: "#4ade80", desc: "Visible 65°N+" },
            { kp: "4", label: "Active", color: "#fde047", desc: "Visible at auroral zone" },
            { kp: "5 (G1)", label: "Minor Storm", color: "#f97316", desc: "Visible to 60°N" },
            { kp: "6 (G2)", label: "Moderate Storm", color: "#ef4444", desc: "Visible to 55°N" },
            { kp: "7 (G3)", label: "Strong Storm", color: "#b91c1c", desc: "Visible to 50°N" },
            { kp: "8–9 (G4–G5)", label: "Severe–Extreme", color: "#d946ef", desc: "Visible at mid-latitudes" },
          ].map(r => (
            <div key={r.kp} className="flex items-center gap-3">
              <div className="w-20 text-xs font-bold shrink-0" style={{ color: r.color }}>Kp {r.kp}</div>
              <div className="text-xs font-medium w-32 shrink-0">{r.label}</div>
              <div className="text-xs text-muted-foreground">{r.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "NOAA SWPC", url: "https://www.swpc.noaa.gov/", desc: "Space Weather Prediction Center" },
          { label: "Aurora Alert", url: "https://www.aurora-service.eu/", desc: "Real-time aurora alerts" },
          { label: "SpaceWeather.com", url: "https://www.spaceweather.com/", desc: "Solar activity news" },
          { label: "Soft Serve News", url: "https://softservenews.com/", desc: "Aurora chasing community" },
        ].map(r => (
          <a key={r.label} href={r.url} target="_blank" rel="noopener noreferrer"
            className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors">
            <div className="text-sm font-medium flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5 text-primary" /> {r.label}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{r.desc}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
