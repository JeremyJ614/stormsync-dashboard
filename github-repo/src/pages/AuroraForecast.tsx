import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Location } from "../hooks/useLocation";
import { Sparkles, ExternalLink, RefreshCw, Info, Star, Moon } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format, parseISO } from "date-fns";
import { NightSkyMap, SKY_LEGEND, AURORA_LEGEND } from "../components/NightSkyMap";
import { useOpenMeteo } from "../hooks/useWeatherQuery";

interface Props { location: Location }

type Tab = "stargazing" | "aurora" | "both";

const TOOLTIP_STYLE = {
  background: "hsl(270 30% 8%)",
  border: "1px solid hsl(270 25% 18%)",
  borderRadius: 8,
  fontSize: 12,
};

// ─── Kp helpers ──────────────────────────────────────────────────────────────
function kpLabel(kp: number): { text: string; color: string; bgColor: string; vis: string } {
  if (kp >= 8) return { text: "EXTREME STORM",      color: "#f472b6", bgColor: "#2d0030", vis: "Visible at most latitudes" };
  if (kp >= 6) return { text: "MAJOR STORM",        color: "#e879f9", bgColor: "#1e0028", vis: "Visible to 50°N" };
  if (kp >= 5) return { text: "GEOMAGNETIC STORM",  color: "#c084fc", bgColor: "#160023", vis: "Visible to 55°N" };
  if (kp >= 4) return { text: "ACTIVE",             color: "#f0abfc", bgColor: "#1a0020", vis: "Visible at high latitudes" };
  if (kp >= 3) return { text: "UNSETTLED",          color: "#d8b4fe", bgColor: "#13001e", vis: "Possible at 65°N+" };
  if (kp >= 2) return { text: "QUIET",              color: "#c084fc", bgColor: "#0f0018", vis: "Polar regions only" };
  return               { text: "VERY QUIET",        color: "#a78bfa", bgColor: "#0c0016", vis: "Polar cap only" };
}

// ─── Sky-condition helpers ────────────────────────────────────────────────────
function skygazingScore(cloud: number, humidity: number, precip: number): number {
  return Math.max(0, Math.round(100 - cloud * 0.85 - Math.max(0, humidity - 50) * 0.15 - (precip > 0 ? 40 : 0)));
}
function skygazingLabel(score: number): { text: string; color: string } {
  if (score >= 85) return { text: "PERFECT",   color: "#fde047" };
  if (score >= 70) return { text: "EXCELLENT", color: "#e879f9" };
  if (score >= 55) return { text: "CLEAR",     color: "#c084fc" };
  if (score >= 35) return { text: "FAIR",      color: "#818cf8" };
  return                   { text: "POOR",     color: "#4c1d95" };
}

// ─── SWPC data hooks ──────────────────────────────────────────────────────────
function useSwpc() {
  return useQuery({
    queryKey: ["swpc-kp"],
    queryFn: async () => {
      const res = await fetch("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json");
      if (!res.ok) throw new Error("SWPC API error");
      return res.json() as Promise<Array<{ time_tag: string; kp_index: number; estimated_kp: number; kp: string }>>;
    },
    staleTime: 5 * 60 * 1000, retry: 2,
  });
}
function useSwpcForecast() {
  return useQuery({
    queryKey: ["swpc-kp-forecast"],
    queryFn: async () => {
      const res = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json");
      if (!res.ok) throw new Error("SWPC forecast error");
      const data = await res.json() as Array<{ time_tag: string; kp: number; observed: string; noaa_scale: string | null }>;
      return data.map(r => ({ time: r.time_tag, kp: Number(r.kp), observed: r.observed, noaaScale: r.noaa_scale ?? "" }));
    },
    staleTime: 15 * 60 * 1000, retry: 2,
  });
}
function useSwpcSolarWind() {
  return useQuery({
    queryKey: ["swpc-solar-wind"],
    queryFn: async () => {
      const res = await fetch("https://services.swpc.noaa.gov/products/solar-wind/mag-5-minute.json");
      if (!res.ok) throw new Error("Solar wind error");
      const data = await res.json() as string[][];
      return data.slice(1).slice(-12).map(r => ({ time: r[0], bz: parseFloat(r[3]), bt: parseFloat(r[6]) }));
    },
    staleTime: 5 * 60 * 1000, retry: 2,
  });
}

// ─── Tab button ───────────────────────────────────────────────────────────────
function TabBtn({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all"
      style={active
        ? { background: "linear-gradient(135deg,#9333ea,#f472b6)", color: "#fff", boxShadow: "0 0 16px rgba(244,114,182,0.4)" }
        : { background: "rgba(147,51,234,0.12)", color: "#c084fc", border: "1px solid rgba(147,51,234,0.3)" }
      }
    >
      {icon}{label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AuroraForecast({ location }: Props) {
  const [tab, setTab] = useState<Tab>("both");

  const { data: kpHistory, isLoading: histLoading, refetch } = useSwpc();
  const { data: kpForecast, isLoading: fcLoading } = useSwpcForecast();
  const { data: solarWind } = useSwpcSolarWind();
  const { data: weather, isLoading: wxLoading } = useOpenMeteo(location);

  // Kp values
  const latestKp = Number(kpHistory?.at(-1)?.estimated_kp ?? kpHistory?.at(-1)?.kp_index ?? 0) || 0;
  const { text: kpText, color: kpColorStr, bgColor: kpBg, vis: kpVis } = kpLabel(latestKp);
  const futureForecast = (kpForecast ?? []).filter(d => d.observed !== "observed");
  const futureMax = futureForecast.length ? Math.max(...futureForecast.map(d => Number(d.kp ?? 0))) : 0;
  const peakKp = Math.max(latestKp, futureMax);

  const canSeeAtLat = (kp: number, lat: number) => Math.abs(lat) >= (90 - kp * 5);
  const visible = canSeeAtLat(latestKp, location.lat);

  // Sky conditions
  const hourly = weather?.hourly;
  const cc     = hourly?.cloud_cover?.[0] ?? 80;
  const hum    = hourly?.relative_humidity_2m?.[0] ?? 60;
  const precip = hourly?.precipitation?.[0] ?? 0;
  const currentScore = skygazingScore(cc, hum, precip);
  const { text: condText, color: condColor } = skygazingLabel(currentScore);

  const safeFormat = (value: unknown, fmt: string): string => {
    if (value == null) return "";
    const d = new Date(value as string | number | Date);
    return Number.isNaN(d.getTime()) ? "" : format(d, fmt);
  };

  const recentKp = (kpHistory ?? []).slice(-24).map(d => ({
    time: safeFormat(d.time_tag, "ha"),
    kp: Number(d.estimated_kp ?? d.kp_index ?? 0) || 0,
  })).filter(d => d.time !== "");

  const forecastKp = futureForecast.slice(0, 24).map(d => ({
    time: safeFormat(d.time, "EEE ha"),
    kp: Number(d.kp ?? 0),
    color: kpLabel(Number(d.kp ?? 0)).color,
  })).filter(d => d.time !== "");

  const timeline = (hourly?.time as string[] | undefined)?.slice(0, 48).map((t: string, i: number) => {
    const c  = hourly!.cloud_cover?.[i] ?? 80;
    const h  = hourly!.relative_humidity_2m?.[i] ?? 60;
    const p  = hourly!.precipitation?.[i] ?? 0;
    return { time: format(parseISO(t), "EEE ha"), score: skygazingScore(c, h, p) };
  }) ?? [];

  const latestBz = solarWind?.at(-1)?.bz ?? null;
  const latestBt = solarWind?.at(-1)?.bt ?? null;

  const loading = histLoading || fcLoading;

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" style={{ color: "#f472b6" }} />
            <h2 className="text-xl font-bold tracking-wide uppercase" style={{
              background: "linear-gradient(90deg,#c084fc,#f472b6)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>Night Sky</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {location.name} · Stargazing &amp; aurora outlook
          </p>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-purple-400 transition-colors px-2 py-1 rounded border border-border hover:border-purple-500/40">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {/* ── Subtabs ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <TabBtn label="Stargazing" icon={<Star className="w-3.5 h-3.5" />} active={tab === "stargazing"} onClick={() => setTab("stargazing")} />
        <TabBtn label="Aurora"     icon={<Sparkles className="w-3.5 h-3.5" />} active={tab === "aurora"}     onClick={() => setTab("aurora")} />
        <TabBtn label="Both"       icon={<Moon className="w-3.5 h-3.5" />}     active={tab === "both"}       onClick={() => setTab("both")} />
      </div>

      {/* ── Disclaimer ── */}
      <div className="flex items-start gap-2 bg-purple-950/30 border border-purple-800/30 rounded-xl px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-purple-400" />
        <span>
          {tab === "stargazing"
            ? "Experimental sky clarity forecast — cloud cover, humidity, and precipitation. Not an official product."
            : "Aurora data from NOAA SWPC. Kp updates every minute. Clear, dark skies still required for visibility."}
        </span>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Combined Night Sky Map (all tabs) ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-card border border-purple-800/40 rounded-xl overflow-hidden"
        style={{ boxShadow: "0 0 30px rgba(244,114,182,0.06)" }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-purple-800/30">
          <div className="flex items-center gap-2">
            {tab === "stargazing"
              ? <Star className="w-4 h-4 text-purple-400" />
              : <Sparkles className="w-4 h-4" style={{ color: "#f472b6" }} />}
            <span className="text-sm font-semibold">
              {tab === "stargazing" ? "Stargazing Outlook — Tonight" : tab === "aurora" ? "Aurora View Lines — North America" : "Night Sky — Stargazing & Aurora"}
            </span>
          </div>
          {tab !== "stargazing" && (
            <a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-purple-400 hover:underline">
              <ExternalLink className="w-3 h-3" /> SWPC
            </a>
          )}
        </div>

        <div className="p-3">
          {loading ? (
            <div className="h-[360px] flex items-center justify-center bg-purple-950/20 rounded-xl animate-pulse">
              <div className="flex items-center gap-3 text-sm text-purple-300">
                <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                Loading…
              </div>
            </div>
          ) : (
            <NightSkyMap
              mode={tab}
              peakKp={peakKp}
              currentKp={latestKp}
              userLat={location.lat}
              userLon={location.lon}
              userName={location.name}
              height={360}
            />
          )}
        </div>

        {/* Legend strip below map */}
        <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {(tab === "aurora" || tab === "both") && AURORA_LEGEND.map(l => (
            <div key={l.label} className="flex items-center gap-1.5 text-xs">
              <div className="w-5 h-[2px]" style={{ background: l.color }} />
              <span className="text-muted-foreground">{l.label}</span>
            </div>
          ))}
          {(tab === "stargazing" || tab === "both") && SKY_LEGEND.map(l => (
            <div key={l.label} className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
              <span className="text-muted-foreground">{l.label}</span>
            </div>
          ))}
        </div>

        <div className="px-4 pb-3 text-xs text-muted-foreground">
          {tab === "stargazing" && "Sky clarity derived from cloud cover, humidity & precipitation. Experimental — not an official product."}
          {tab === "aurora"     && `Solid line = peak Kp ${peakKp.toFixed(1)} naked-eye view line; dashed = current Kp ${latestKp.toFixed(1)}. Overhead & camera-only lines also shown.`}
          {tab === "both"       && "Combined stargazing conditions (state fill) and aurora view lines. Clear, dark skies required. NOAA SWPC data."}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── AURORA tab / BOTH tab: Kp + Aurora data ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {(tab === "aurora" || tab === "both") && (
        <>
          {/* Kp Card */}
          <div className="bg-card border rounded-xl p-5 text-center" style={{ borderColor: kpColorStr + "50" }}>
            {histLoading ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground animate-pulse">Loading SWPC data…</div>
            ) : (
              <>
                <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">Current Kp Index</div>
                <div className="text-6xl font-bold mb-2" style={{ color: kpColorStr, textShadow: `0 0 30px ${kpColorStr}50` }}>
                  {latestKp.toFixed(1)}
                </div>
                <div className="inline-block px-5 py-1.5 rounded font-bold text-base tracking-widest mb-3"
                  style={{ color: kpColorStr, backgroundColor: kpBg, border: `1px solid ${kpColorStr}40` }}>
                  {kpText}
                </div>
                <div className="text-sm text-muted-foreground mb-4">{kpVis}</div>
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${visible
                  ? "border-pink-500/50 bg-pink-500/10 text-pink-300"
                  : "border-muted bg-muted/20 text-muted-foreground"}`}>
                  <span className={`w-2 h-2 rounded-full ${visible ? "bg-pink-400 animate-pulse" : "bg-muted-foreground"}`} />
                  {visible
                    ? `Aurora potentially visible at ${location.name}`
                    : `Aurora not expected at ${location.name} (${Math.abs(location.lat).toFixed(1)}°${location.lat >= 0 ? "N" : "S"})`}
                </div>
              </>
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            {[
              { label: "Your Latitude",       value: `${Math.abs(location.lat).toFixed(1)}°${location.lat >= 0 ? "N" : "S"}`, color: "#c084fc" },
              { label: "Min Kp for Visibility", value: `Kp ${Math.max(0, Math.round((90 - Math.abs(location.lat)) / 5))}`,   color: "#f0abfc" },
              { label: "Geomagnetic Scale",   value: latestKp >= 5 ? `G${Math.min(5, Math.floor(latestKp - 4))}` : "G0",     color: kpColorStr },
              { label: "Bz (IMF)",            value: latestBz !== null ? `${latestBz.toFixed(1)} nT` : "—",                 color: latestBz !== null && latestBz < -5 ? "#f472b6" : "#c084fc" },
            ].map(m => (
              <div key={m.label} className="bg-card border border-border rounded-xl p-3">
                <div className="text-lg font-bold" style={{ color: m.color }}>{histLoading ? "—" : m.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Aurora Oval */}
          <div className="bg-card border border-purple-800/40 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold">Aurora Oval (OVATION Prime — NOAA)</span>
              <a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-purple-400 hover:underline">
                <ExternalLink className="w-3 h-3" /> Full Map
              </a>
            </div>
            <div className="p-3 bg-black/40 flex items-center justify-center min-h-[200px]">
              <img
                src={`https://services.swpc.noaa.gov/images/animations/ovation/global/latest.jpg?t=${Math.floor(Date.now() / 300000)}`}
                alt="NOAA Aurora Oval OVATION" className="w-full rounded-lg object-contain" style={{ maxHeight: 340 }}
                onError={(e) => {
                  const img = e.target as HTMLImageElement; img.style.display = "none";
                  const parent = img.parentElement;
                  if (parent) {
                    const div = document.createElement("div"); div.className = "text-center p-6";
                    div.innerHTML = `<p class="text-sm text-muted-foreground mb-3">Aurora oval imagery requires direct NOAA access.</p><a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener noreferrer" class="text-purple-400 text-sm hover:underline">View on NOAA SWPC →</a>`;
                    parent.appendChild(div);
                  }
                }}
              />
            </div>
            <p className="px-4 pb-3 text-xs text-muted-foreground">Global aurora oval — updated every ~5 minutes.</p>
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
                      <stop offset="5%"  stopColor="#f472b6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f472b6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v?.toFixed(1)} nT`, "Bz"]} />
                  <Area type="monotone" dataKey="bz" stroke="#f472b6" fill="url(#bzGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              {latestBz !== null && (
                <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                  <span className="text-muted-foreground">Bz: <span className="font-bold" style={{ color: latestBz < -5 ? "#f472b6" : latestBz < 0 ? "#c084fc" : "#a78bfa" }}>{latestBz.toFixed(1)} nT</span></span>
                  {latestBt !== null && <span className="text-muted-foreground">Bt: <span className="font-bold text-foreground">{latestBt.toFixed(1)} nT</span></span>}
                  <span className="text-muted-foreground">{latestBz < -10 ? "🟣 Strong southward — excellent aurora conditions" : latestBz < -5 ? "🩷 Moderate southward — good aurora conditions" : latestBz < 0 ? "💜 Slightly southward" : "🌑 Northward — aurora suppressed"}</span>
                </div>
              )}
            </div>
          )}

          {/* Recent Kp */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Recent Kp Activity (Last 24 Hours)</h3>
            {histLoading ? <div className="h-36 bg-muted/20 rounded animate-pulse" /> : recentKp.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={recentKp}>
                  <defs>
                    <linearGradient id="kpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f472b6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#c084fc" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={5} />
                  <YAxis domain={[0, 9]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}`, "Kp"]} />
                  <Area type="monotone" dataKey="kp" stroke="#f472b6" fill="url(#kpGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">No recent data available.</div>
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
              <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <h3 className="text-sm font-semibold">Kp Scale Reference</h3>
            </div>
            <div className="space-y-1.5">
              {[
                { kp: "0–1",      label: "Very Quiet",      color: "#a78bfa", desc: "Polar cap — no display" },
                { kp: "2–3",      label: "Quiet–Unsettled", color: "#c084fc", desc: "Visible 65°N+" },
                { kp: "4",        label: "Active",          color: "#f0abfc", desc: "Visible at auroral zone" },
                { kp: "5 (G1)",   label: "Minor Storm",     color: "#e879f9", desc: "Visible to 60°N" },
                { kp: "6 (G2)",   label: "Moderate Storm",  color: "#d946ef", desc: "Visible to 55°N" },
                { kp: "7 (G3)",   label: "Strong Storm",    color: "#c026d3", desc: "Visible to 50°N" },
                { kp: "8–9 (G4–G5)", label: "Severe–Extreme", color: "#f472b6", desc: "Visible at mid-latitudes" },
              ].map(r => (
                <div key={r.kp} className="flex items-center gap-3">
                  <div className="w-20 text-xs font-bold shrink-0" style={{ color: r.color }}>Kp {r.kp}</div>
                  <div className="text-xs font-medium w-32 shrink-0">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── STARGAZING tab / BOTH tab: sky conditions ── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {(tab === "stargazing" || tab === "both") && (
        <>
          {/* Score card */}
          <div className="bg-card border rounded-xl p-6 text-center" style={{ borderColor: condColor + "50" }}>
            <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">Tonight's Conditions — {location.name}</div>
            <div className="text-6xl font-bold mb-2" style={{ color: condColor, textShadow: `0 0 24px ${condColor}50` }}>
              {wxLoading ? "—" : currentScore}
              <span className="text-2xl font-normal text-muted-foreground">/100</span>
            </div>
            <div className="inline-block px-5 py-1.5 rounded font-bold text-base tracking-widest uppercase mb-3"
              style={{ color: condColor, backgroundColor: condColor + "18", border: `1px solid ${condColor}40` }}>
              {condText}
            </div>
          </div>

          {/* Condition metrics */}
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: "Cloud Cover",    value: `${cc}%`,     color: cc <= 20 ? "#e879f9" : cc <= 50 ? "#fde047" : "#f472b6",  good: cc <= 20,    bad: cc > 70 },
              { label: "Humidity",       value: `${hum}%`,    color: hum <= 60 ? "#e879f9" : hum <= 80 ? "#c084fc" : "#f472b6",good: hum <= 60,   bad: hum > 85 },
              { label: "Precipitation",  value: precip > 0 ? `${(precip * 25.4).toFixed(1)}mm` : "None", color: precip > 0 ? "#f472b6" : "#e879f9", good: precip === 0, bad: precip > 0 },
            ].map(m => (
              <div key={m.label} className="bg-card border border-border rounded-xl p-3">
                <div className="text-lg font-bold" style={{ color: m.color }}>{wxLoading ? "—" : m.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
                <div className="text-[10px] mt-1" style={{ color: m.color }}>{m.good ? "✓ Good" : m.bad ? "✗ Bad" : "Acceptable"}</div>
              </div>
            ))}
          </div>

          {/* 48-hour observing chart */}
          {timeline.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-1">48-Hour Observing Window</h3>
              <p className="text-xs text-muted-foreground mb-3">Sky clarity score by hour</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={timeline}>
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}/100`, "Clarity"]} />
                  <Bar dataKey="score" radius={[2, 2, 0, 0]}>
                    {timeline.map((entry, i) => <Cell key={i} fill={skygazingLabel(entry.score).color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                {SKY_LEGEND.map(l => (
                  <div key={l.label} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
                    <span className="text-muted-foreground">{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deep-sky objects */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-3 border-b border-border flex items-center gap-1.5">
              <Moon className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold">Notable Deep-Sky Objects</h3>
            </div>
            <div className="divide-y divide-border">
              {[
                { name: "Orion Nebula (M42)",       type: "Nebula",             season: "Winter/Spring", mag: "4.0" },
                { name: "Andromeda Galaxy (M31)",    type: "Galaxy",             season: "Fall/Winter",   mag: "3.4" },
                { name: "Pleiades (M45)",            type: "Open Cluster",       season: "Winter",        mag: "1.2" },
                { name: "Hercules Cluster (M13)",    type: "Glob. Cluster",      season: "Summer",        mag: "5.8" },
                { name: "Beehive Cluster (M44)",     type: "Open Cluster",       season: "Spring",        mag: "3.1" },
                { name: "Whirlpool Galaxy (M51)",    type: "Galaxy",             season: "Spring/Summer", mag: "8.4" },
                { name: "Ring Nebula (M57)",         type: "Planetary Nebula",   season: "Summer",        mag: "8.8" },
                { name: "Lagoon Nebula (M8)",        type: "Emission Nebula",    season: "Summer",        mag: "6.0" },
              ].map(obj => (
                <div key={obj.name} className="flex items-center gap-3 px-4 py-3">
                  <Star className="w-4 h-4 text-purple-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{obj.name}</div>
                    <div className="text-xs text-muted-foreground">{obj.type} · {obj.season}</div>
                  </div>
                  <div className="text-xs font-semibold text-foreground shrink-0">Mag {obj.mag}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Links ── */}
      <div className="grid grid-cols-2 gap-3">
        {(tab === "aurora" || tab === "both") && [
          { label: "NOAA SWPC",       url: "https://www.swpc.noaa.gov/",                          desc: "Space Weather Prediction Center" },
          { label: "SpaceWeather.com", url: "https://www.spaceweather.com/",                      desc: "Solar activity news" },
        ].map(r => (
          <a key={r.label} href={r.url} target="_blank" rel="noopener noreferrer"
            className="bg-card border border-border rounded-xl p-3 hover:border-purple-500/40 transition-colors">
            <div className="text-sm font-medium flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5 text-purple-400" /> {r.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{r.desc}</div>
          </a>
        ))}
        {(tab === "stargazing" || tab === "both") && [
          { label: "Stellarium Web", url: "https://stellarium-web.org/",         desc: "Online planetarium" },
          { label: "Clear Outside",  url: "https://clearoutside.com/",            desc: "Detailed sky conditions" },
        ].map(r => (
          <a key={r.label} href={r.url} target="_blank" rel="noopener noreferrer"
            className="bg-card border border-border rounded-xl p-3 hover:border-purple-500/40 transition-colors">
            <div className="text-sm font-medium flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5 text-purple-400" /> {r.label}</div>
            <div className="text-xs text-muted-foreground mt-1">{r.desc}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
