import { useEffect, useState } from "react";
import { useNWSAlerts, useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { Car, ExternalLink, Zap, Wind, Thermometer, RefreshCw, Crosshair, Brain } from "lucide-react";
import { BASE_API } from "../config";
import { computeSRHFromProfile, compute06kmShear, computeSWTI, cToF, msToMph } from "../utils/weatherCalc";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { ChaseTargetMap } from "../components/ChaseTargetMap";

interface Props { location: Location }

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

interface ChaseTarget {
  name: string;
  lat: number;
  lon: number;
  cape: number;
  srh: number;
  shear: number;
  dewF: number;
  windMph: number;
  liftedIndex: number;
  swti: number;
  risk: "none" | "low" | "moderate" | "high" | "extreme";
  reasons: string[];
}

interface ChaseTargetsResponse {
  targets: ChaseTarget[];
  allCandidates: { name: string; swti: number }[];
  explanation: string;
  generatedAt: string;
}

const RISK_COLORS: Record<ChaseTarget["risk"], string> = {
  extreme:  "#d946ef",
  high:     "#ef4444",
  moderate: "#f97316",
  low:      "#fde047",
  none:     "#4ade80",
};
const TARGET_COLORS = ["#d946ef", "#f97316"];

function chasingLabel(swtiScore: number): { text: string; color: string; desc: string } {
  if (swtiScore >= 80) return { text: "PRIME CHASE DAY", color: "#d946ef", desc: "Exceptional parameters. Go chase!" };
  if (swtiScore >= 60) return { text: "GOOD CHASE DAY",  color: "#ef4444", desc: "Favorable conditions. Setups likely." };
  if (swtiScore >= 40) return { text: "MARGINAL SETUP",  color: "#f97316", desc: "Some potential. Monitor closely." };
  if (swtiScore >= 20) return { text: "SLIGHT POTENTIAL",color: "#fde047", desc: "Limited instability. Low-end possible." };
  return { text: "NO SETUP", color: "#4ade80", desc: "Quiet pattern. No chasing today." };
}

const CHASE_RESOURCES = [
  { label: "SPC Day 1 Outlook",   url: "https://www.spc.noaa.gov/products/outlook/day1otlk.html", desc: "Official convective outlook" },
  { label: "SPC Watches",         url: "https://www.spc.noaa.gov/products/watch/",                  desc: "Active tornado/severe watches" },
  { label: "SPC Mesoanalysis",    url: "https://www.spc.noaa.gov/exper/mesoanalysis/",              desc: "Real-time atmospheric analysis" },
  { label: "RadarScope",          url: "https://www.radarscope.app/",                               desc: "Professional radar app" },
  { label: "Spotter Network",     url: "https://www.spotternetwork.org/",                           desc: "Real-time spotter positions" },
  { label: "Pivotal Weather",     url: "https://www.pivotalweather.com/",                           desc: "Model data and maps" },
  { label: "College of DuPage",   url: "https://weather.cod.edu/satrad/",                           desc: "Satellite and radar imagery" },
  { label: "Windy.com",           url: "https://www.windy.com/",                                    desc: "Interactive wind/weather maps" },
];

const CHASE_TIPS = [
  { icon: "🗺️", tip: "Plan your escape route first. Always keep a 90-degree perpendicular escape path ready." },
  { icon: "📡", tip: "Monitor SPC MDs closely — they often precede watches by 1-2 hours." },
  { icon: "⛽", tip: "Keep your tank at least half full at all times during a chase." },
  { icon: "📱", tip: "Use spotternetwork.org to track other chasers and avoid crowding key intersections." },
  { icon: "🌪️", tip: "If a tornado becomes rain-wrapped, retreat immediately — visibility drops to zero." },
  { icon: "🚗", tip: "The vehicle is your safety. Never try to outrun a tornado on a perpendicular path." },
];

function buildMapQuery(targets: ChaseTarget[]): string {
  if (targets.length === 0) return "";
  const t = targets.map(x => `${x.lat.toFixed(3)},${x.lon.toFixed(3)},${encodeURIComponent(x.name)}`).join(";");
  const s = targets.map(x => x.swti).join(",");
  return `targets=${t}&swti=${s}`;
}

export default function StormChasingOutlook({ location }: Props) {
  const { data: weather, isLoading } = useOpenMeteo(location);
  const { data: alerts = [] } = useNWSAlerts(location);
  const [activeTab, setActiveTab] = useState<"outlook" | "targets" | "resources">("targets");

  const [aiData, setAiData] = useState<ChaseTargetsResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [mapReloadKey, setMapReloadKey] = useState(0);

  const hourly = weather?.hourly;
  const cape  = hourly?.cape?.[0] ?? 0;
  const li    = hourly?.lifted_index?.[0] ?? 0;
  const dewC  = hourly?.dew_point_2m?.[0] ?? 10;
  const ws10  = hourly?.wind_speed_10m?.[0] ?? 0;
  const wd10  = hourly?.wind_direction_10m?.[0] ?? 0;
  const ws925 = hourly?.wind_speed_925hPa?.[0] ?? 0;
  const wd925 = hourly?.wind_direction_925hPa?.[0] ?? 0;
  const ws850 = hourly?.wind_speed_850hPa?.[0] ?? 0;
  const wd850 = hourly?.wind_direction_850hPa?.[0] ?? 0;
  const ws700 = hourly?.wind_speed_700hPa?.[0] ?? 0;
  const wd700 = hourly?.wind_direction_700hPa?.[0] ?? 0;
  const ws500 = hourly?.wind_speed_500hPa?.[0] ?? 0;
  const wd500 = hourly?.wind_direction_500hPa?.[0] ?? 0;
  const srh   = !isLoading && hourly ? computeSRHFromProfile(ws10, wd10, ws925, wd925, ws850, wd850, ws700, wd700, ws500, wd500) : 0;
  const shear = !isLoading && hourly ? compute06kmShear(ws10, wd10, ws500, wd500) : 0;
  const swti  = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: dewC });
  const { text: chaseText, color: chaseColor, desc: chaseDesc } = chasingLabel(swti.score);
  const dewF    = Math.round(cToF(dewC));
  const windMph = Math.round(msToMph(ws10));

  const timeline = (hourly?.time as string[] | undefined)?.slice(0, 48).map((t: string, i: number) => {
    const c   = hourly!.cape?.[i] ?? 0;
    const l   = hourly!.lifted_index?.[i] ?? 0;
    const dC  = hourly!.dew_point_2m?.[i] ?? 10;
    const ws  = hourly!.wind_speed_10m?.[i] ?? 0;
    const wd  = hourly!.wind_direction_10m?.[i] ?? 0;
    const ws9 = hourly!.wind_speed_925hPa?.[i] ?? 0;
    const wd9 = hourly!.wind_direction_925hPa?.[i] ?? 0;
    const ws8 = hourly!.wind_speed_850hPa?.[i] ?? 0;
    const wd8 = hourly!.wind_direction_850hPa?.[i] ?? 0;
    const ws7 = hourly!.wind_speed_700hPa?.[i] ?? 0;
    const wd7 = hourly!.wind_direction_700hPa?.[i] ?? 0;
    const ws5 = hourly!.wind_speed_500hPa?.[i] ?? 0;
    const wd5 = hourly!.wind_direction_500hPa?.[i] ?? 0;
    const s   = computeSRHFromProfile(ws, wd, ws9, wd9, ws8, wd8, ws7, wd7, ws5, wd5);
    const sh  = compute06kmShear(ws, wd, ws5, wd5);
    const result = computeSWTI({ cape: c, srh: s, shear06km: sh, liftedIndex: l, dewPointC: dC });
    return { time: format(parseISO(t), "EEE ha"), swti: result.score, cape: Math.round(c) };
  }) ?? [];

  const severeAlerts = alerts.filter((a: { properties: { event: string } }) => {
    const ev = (a.properties.event ?? "").toLowerCase();
    return ev.includes("tornado") || ev.includes("severe thunderstorm");
  });

  // Fetch backend AI chase targets on mount + when user clicks Refresh
  useEffect(() => {
    let cancelled = false;
    setAiLoading(true);
    setAiError(null);
    fetch(`${BASE_API}/chase-targets`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<ChaseTargetsResponse>; })
      .then(d => { if (!cancelled) setAiData(d); })
      .catch(err => { if (!cancelled) setAiError(err instanceof Error ? err.message : "Could not load AI targets"); })
      .finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
  }, [mapReloadKey]);

  const targets = aiData?.targets ?? [];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Car className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold tracking-wide">Storm Chasing Outlook</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · AI-selected chase targets · Updated every 30 min</p>

      {severeAlerts.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3 flex items-start gap-2">
          <Zap className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold text-red-300">{severeAlerts.length} Severe Alert{severeAlerts.length > 1 ? "s" : ""} Active</div>
            <div className="text-xs text-muted-foreground">{severeAlerts.map((a: { properties: { event: string } }) => a.properties.event).join(" · ")}</div>
          </div>
        </div>
      )}

      <div className="bg-card border rounded-xl p-5 flex flex-col items-center text-center" style={{ borderColor: chaseColor + "50" }}>
        <div className="text-xs tracking-widest uppercase text-muted-foreground mb-3">Today's Chasing Assessment — {location.name.split(",")[0]}</div>
        <div className="text-4xl font-bold mb-2" style={{ color: chaseColor, textShadow: `0 0 20px ${chaseColor}40` }}>
          {chaseText}
        </div>
        <div className="text-sm text-muted-foreground mb-3">{chaseDesc}</div>
        <div className="text-5xl font-bold" style={{ color: chaseColor }}>
          {swti.score}<span className="text-lg text-muted-foreground">/100</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">SWTI Score</div>
      </div>

      <div className="flex gap-2">
        {(["targets", "outlook", "resources"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${activeTab === tab ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:border-primary/40"}`}>
            {tab === "targets" ? "AI Chase Targets" : tab === "outlook" ? "Local Outlook" : "Resources"}
          </button>
        ))}
      </div>

      {/* ============================ TARGETS TAB ============================ */}
      {activeTab === "targets" && (
        <div className="space-y-4">
          {/* Map card */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">AI-Selected Target Areas — CONUS</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMapReloadKey(k => k + 1)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  aria-label="Refresh AI targets"
                  disabled={aiLoading}
                >
                  <RefreshCw className={`w-3 h-3 ${aiLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>
            </div>

            <ChaseTargetMap targets={targets} loading={aiLoading && !aiData} />

            {aiError && (
              <div className="px-4 py-3 bg-destructive/10 border-t border-destructive/30 text-xs text-destructive">
                {aiError}
              </div>
            )}
          </div>

          {/* Target detail cards */}
          {targets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {targets.map((t, i) => {
                const color = TARGET_COLORS[i] ?? "#d946ef";
                return (
                  <div key={`${t.name}-${i}`} className="bg-card border rounded-xl overflow-hidden" style={{ borderColor: color + "60" }}>
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between" style={{ backgroundColor: color + "10" }}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
                        <h4 className="text-sm font-bold" style={{ color }}>Target {i + 1} — {t.name}</h4>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold" style={{ color }}>{t.swti}<span className="text-xs text-muted-foreground">/100</span></div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.risk}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-3">
                      {[
                        { label: "CAPE",          value: `${t.cape}`, unit: "J/kg",   color: "#f97316" },
                        { label: "0-3 km SRH",    value: `${t.srh}`,  unit: "m²/s²",  color: "#a78bfa" },
                        { label: "0-6 km Shear",  value: `${t.shear}`,unit: "kt",     color: "#22d3ee" },
                        { label: "Dew Point",     value: `${t.dewF}`, unit: "°F",     color: "#06b6d4" },
                        { label: "Lifted Index",  value: `${t.liftedIndex}`, unit: "", color: "#fde047" },
                        { label: "Sfc Wind",      value: `${t.windMph}`, unit: "mph", color: "#7B8FD9" },
                      ].map(m => (
                        <div key={m.label} className="bg-muted/20 rounded-lg p-2 text-center">
                          <div className="text-base font-bold" style={{ color: m.color }}>{m.value}<span className="text-[10px] text-muted-foreground ml-0.5">{m.unit}</span></div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{m.label}</div>
                        </div>
                      ))}
                    </div>
                    {t.reasons.length > 0 && (
                      <div className="px-4 pb-3">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Defining Parameters</div>
                        <ul className="space-y-1">
                          {t.reasons.map((r, ri) => (
                            <li key={ri} className="text-xs text-foreground/90 flex items-start gap-1.5">
                              <span style={{ color }} className="mt-0.5">▸</span>
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* AI briefing */}
          {aiData && (
            <div className="bg-card border border-primary/30 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-primary/10 flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-primary">AI Chase Briefing</h3>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  Generated {format(parseISO(aiData.generatedAt), "MMM d · h:mm a")}
                </span>
              </div>
              <div className="p-4 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {aiData.explanation}
              </div>
              <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
                Generated by AI · Not official NWS guidance · Always cross-check with SPC outlooks
              </div>
            </div>
          )}

          {!aiLoading && aiData && targets.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <div className="text-3xl mb-2">😴</div>
              <p className="text-sm font-semibold text-muted-foreground">No viable chase targets today</p>
              <p className="text-xs text-muted-foreground mt-1">Severe parameters across all 25 candidate cities are below chase threshold.</p>
            </div>
          )}

          {/* Candidate ranking */}
          {aiData && aiData.allCandidates.length > 0 && (
            <details className="bg-card border border-border rounded-xl overflow-hidden">
              <summary className="px-4 py-3 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">
                See all {aiData.allCandidates.length} candidate cities ranked by SWTI
              </summary>
              <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-3 gap-1.5 text-xs">
                {aiData.allCandidates.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between bg-muted/20 rounded px-2 py-1.5">
                    <span className="text-foreground/80 truncate">
                      <span className="text-muted-foreground mr-1.5">#{i + 1}</span>
                      {c.name.split(",")[0]}
                    </span>
                    <span className="font-bold tabular-nums" style={{ color: chasingLabel(c.swti).color }}>{c.swti}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ============================ LOCAL OUTLOOK TAB ============================ */}
      {activeTab === "outlook" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "CAPE",        value: `${Math.round(cape)} J/kg`, color: "#f97316", icon: Zap },
              { label: "0-3km SRH",   value: `${Math.round(srh)} m²/s²`, color: "#a78bfa", icon: Wind },
              { label: "Dew Point",   value: `${dewF}°F`,  color: "#06b6d4", icon: Thermometer },
              { label: "Surface Wind",value: `${windMph} mph`, color: "#7B8FD9", icon: Wind },
            ].map(m => (
              <div key={m.label} className="bg-card border border-border rounded-xl p-3 text-center">
                <div className="text-xl font-bold" style={{ color: m.color }}>{m.value}</div>
                <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wide">{m.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">48-Hour SWTI Timeline at {location.name.split(",")[0]}</h3>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={timeline}>
                <defs>
                  <linearGradient id="chaseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#d946ef" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#d946ef" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}/100`, "SWTI"]} />
                <Area type="monotone" dataKey="swti" stroke="#d946ef" fill="url(#chaseGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-3 border-b border-border"><h3 className="text-sm font-semibold">Chaser Safety Tips</h3></div>
            <div className="divide-y divide-border">
              {CHASE_TIPS.map((tip, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <span className="text-lg shrink-0">{tip.icon}</span>
                  <p className="text-sm text-muted-foreground leading-relaxed">{tip.tip}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ============================ RESOURCES TAB ============================ */}
      {activeTab === "resources" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CHASE_RESOURCES.map(r => (
            <a key={r.label} href={r.url} target="_blank" rel="noopener noreferrer"
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors flex items-start gap-3">
              <ExternalLink className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-semibold">{r.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export risk colors for testing/consumer convenience (not used internally)
export { RISK_COLORS };
