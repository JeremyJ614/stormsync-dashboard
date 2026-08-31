import { useState, useEffect } from "react";
import { ConGauge } from "../components/sswxcon/ConGauge";
import { ThreatRadar } from "../components/sswxcon/ThreatRadar";
import { ROYAL } from "../lib/royal";
import { useCalm } from "../lib/calm";
import { useQuery } from "@tanstack/react-query";
import { useOpenMeteo } from "../hooks/useWeatherQuery";
import { fetchAllUSAlerts } from "../utils/weatherApi";
import DataUnavailable from "../components/DataUnavailable";
import { useDailyBrief } from "../hooks/useDailyBrief";
import type { Location } from "../hooks/useLocation";
import { Activity, Info, RefreshCw, Sparkles } from "lucide-react";
import { computeSRHFromProfile, compute06kmShear, computeSWTI } from "../utils/weatherCalc";
import { computeComponents, scoreLabel, type AlertItem } from "../lib/sswxcon";
import { format } from "date-fns";

interface Props { location: Location }

const ACTIVATION_THRESHOLD = 107.5;
const GAUGE_MAX = 250;

const SCALE_RANGES = [
  { range: "0–30", label: "Quiet / Low", color: "#4ade80" },
  { range: "30–50", label: "Notable Activity", color: "#fbbf24" },
  { range: "50–70", label: "Elevated", color: "#f97316" },
  { range: "70–90", label: "Significant", color: "#ef4444" },
  { range: "90–120", label: "Severe Outbreak", color: "#cc2222" },
  { range: "120–150", label: "Major Event", color: "#b91c1c" },
  { range: "150–250", label: "Extreme", color: "#991b1b" },
  { range: "250+", label: "Historic", color: "#ff0000" },
];

function ComponentBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min(100, (score / Math.max(max, 1)) * 100);
  const color = score <= 0 ? "#374151" : score > 20 ? "#3b82f6" : score > 10 ? "#f97316" : "#fbbf24";
  return (
    <div className="w-full bg-muted/30 rounded-full h-1.5">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

type TabType = "components" | "breakdown" | "scale";

export default function SSWXCon({ location }: Props) {
  const { data: weather, isLoading: wxLoading, refetch: refetchWx } = useOpenMeteo(location);
  // SSWXCon is a NATIONAL "DEFCON for storms" score — it must aggregate every
  // active NWS warning across the U.S., not just the user's point (otherwise it
  // reads ~0 whenever no warning is firing on their exact location).
  const { data: alerts = [], isLoading: alertsLoading, isError: alertsFailed, refetch: refetchAlerts } = useQuery({
    queryKey: ["all-us-alerts"],
    queryFn: fetchAllUSAlerts,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
  const { data: brief } = useDailyBrief();
  const [activeTab, setActiveTab] = useState<TabType>("components");
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const isLoading = wxLoading || alertsLoading;

  const hourly = weather?.hourly;
  const cape = hourly?.cape?.[0] ?? 0;
  const li = hourly?.lifted_index?.[0] ?? 0;
  const ws10 = hourly?.wind_speed_10m?.[0] ?? 0;
  const wd10 = hourly?.wind_direction_10m?.[0] ?? 0;
  const ws925 = hourly?.wind_speed_925hPa?.[0] ?? 0;
  const wd925 = hourly?.wind_direction_925hPa?.[0] ?? 0;
  const ws850 = hourly?.wind_speed_850hPa?.[0] ?? 0;
  const wd850 = hourly?.wind_direction_850hPa?.[0] ?? 0;
  const ws700 = hourly?.wind_speed_700hPa?.[0] ?? 0;
  const wd700 = hourly?.wind_direction_700hPa?.[0] ?? 0;
  const ws500 = hourly?.wind_speed_500hPa?.[0] ?? 0;
  const wd500 = hourly?.wind_direction_500hPa?.[0] ?? 0;
  const srh = !isLoading && hourly ? computeSRHFromProfile(ws10, wd10, ws925, wd925, ws850, wd850, ws700, wd700, ws500, wd500) : 0;
  const shear = !isLoading && hourly ? compute06kmShear(ws10, wd10, ws500, wd500) : 0;

  const { components, total, tornadoWarnings, svrThunderstorm } = computeComponents(alerts as AlertItem[], cape, srh, shear, li);
  const { text: levelText, color: levelColor, bgColor: levelBg } = scoreLabel(total);
  const saturation = Math.round((total / ACTIVATION_THRESHOLD) * 100);
  const swti = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: hourly?.dew_point_2m?.[0] ?? 10 });

  // This score has two independent halves. The national one is NWS warning
  // counts; the LOCAL INSTABILITY term (capped at 12 of ~377) is Open-Meteo. So
  // the page still stands when either is down — but a component whose input has
  // not arrived must read as absent, never as a measured zero. The components
  // list renders outside the loading branch above, so this covers both the
  // in-flight case and the failed one.
  const localMissing = !hourly;
  // The dial and the radar are ornament on top of a number, so they hold still
  // during a warning for this member's own location — the app-wide rule — as
  // well as under reduced motion.
  const { calm: still } = useCalm(location.lat, location.lon);
  const componentState = (label: string) =>
    label === "LOCAL INSTABILITY"
      ? { missing: localMissing, why: wxLoading ? "Loading…" : "Unavailable — could not reach Open-Meteo" }
      : { missing: alertsLoading || alertsFailed, why: alertsLoading ? "Loading…" : "Unavailable — could not reach the NWS alert feed" };

  const refresh = () => {
    refetchWx();
    refetchAlerts();
    setLastUpdated(new Date());
  };

  useEffect(() => {
    const interval = setInterval(() => {
      refresh();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // The national warning counts are ~97% of this score's range; without them
  // there is no score, only a gauge that reads QUIET because nothing was
  // counted. The local half is not enough to stand in for it.
  if (!alertsLoading && alertsFailed) {
    return (
      <DataUnavailable
        title="SSWXCon Score"
        source="the national NWS alert feed"
        onRetry={() => { refetchAlerts(); refetchWx(); }}
      />
    );
  }

  const alertTypeBreakdown = [
    { label: "Tornado Warnings", count: tornadoWarnings, color: "#ef4444" },
    { label: "SVR Thunderstorm", count: svrThunderstorm, color: "#f97316" },
    { label: "Total Active Alerts", count: alerts.length, color: "#7B8FD9" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold tracking-wide uppercase">SSWXCon Score</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Real-time <span className="text-foreground/80 font-medium">nationwide</span> Severe & Significant Weather Conditions intensity score</p>
        </div>
        <button onClick={refresh}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {brief?.headline && (
        <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2">
          <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
          <div className="text-xs">
            <span className="font-semibold text-primary">National picture: </span>
            <span className="text-foreground/90">{brief.headline}</span>
            {brief.content.risk_overview?.day1_category_name && (
              <span className="text-muted-foreground"> · SPC Day 1: {brief.content.risk_overview.day1_category_name}</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 bg-muted/20 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <span>The SSWXCon Score is a situational awareness tool. It is <strong className="text-foreground">not</strong> an official NWS product. Always follow official NWS guidance. A low score does not mean your area is safe.</span>
      </div>

      <div className="bg-card border rounded-xl p-4" style={{ borderColor: levelColor + "50" }}>
        {/* Gated on the national feed alone, not on the local profile too. The
            warning counts are ~97% of this score's range and usually arrive
            first; waiting on the 12-point local term to draw the headline
            instrument left the whole card saying "Loading" over a score that
            was already known. The local term reads "—" until it lands. */}
        {alertsLoading ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground">Loading...</div>
        ) : (
          <>
            {/* The dial and the shape of the situation, side by side: the number
                says how bad, the polygon says what kind. A tornado outbreak and
                a landfalling hurricane can score the same and look nothing
                alike. */}
            <div className="flex flex-col lg:flex-row items-center justify-center gap-2 lg:gap-8 mb-4">
              <ConGauge
                score={total} max={GAUGE_MAX} threshold={ACTIVATION_THRESHOLD}
                color={levelColor} label={levelText} calm={still}
              />
              <div className="w-full lg:w-auto">
                <div className="text-[10px] uppercase tracking-[0.3em] text-center mb-1"
                     style={{ color: ROYAL.dim }}>Shape of it</div>
                <ThreatRadar
                  axes={components.map((c) => ({
                    label: (c as { short?: string }).short ?? c.label,
                    value: componentState(c.label).missing ? 0 : c.score,
                    cap: (c as { cap?: number }).cap ?? 100,
                  }))}
                  color={levelColor}
                  calm={still}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center mb-4">
              {[
                { label: "CURRENT SCORE", value: total.toFixed(1), color: levelColor },
                { label: "SATURATION", value: `${saturation}%`, color: "#fbbf24" },
                { label: "ACTIVATION THRESHOLD", value: ACTIVATION_THRESHOLD.toString(), color: "#7B8FD9" },
                { label: "ACTIVE NWS ALERTS", value: alerts.length.toString(), color: "#7B8FD9" },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-base font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide leading-tight mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <div className="relative h-3 rounded-full overflow-hidden bg-muted/30">
                <div className="absolute inset-0 rounded-full" style={{
                  background: "linear-gradient(to right, #4ade80 0%, #fbbf24 20%, #f97316 36%, #ef4444 52%, #cc2222 68%, #b91c1c 84%, #991b1b 100%)"
                }} />
                <div className="absolute top-0 h-full w-0.5 bg-white opacity-80"
                  style={{ left: `${Math.min(100, (ACTIVATION_THRESHOLD / GAUGE_MAX) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0</span>
                <div className="flex items-center gap-1">
                  <span className="text-yellow-400">▲</span>
                  <span className="text-yellow-400 font-medium">{ACTIVATION_THRESHOLD} THRESHOLD</span>
                </div>
                <span>250</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {alertTypeBreakdown.map(a => (
                <div key={a.label} className="bg-muted/20 border border-border rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold tabular-nums" style={{ color: a.color }}>{a.count}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1 leading-tight">{a.label}</div>
                </div>
              ))}
            </div>

            <div className="text-center text-xs text-muted-foreground">
              Updated {format(lastUpdated, "h:mm:ss aa")} · Auto-refreshes every 60s
            </div>
          </>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          { id: "components", label: "Components" },
          { id: "breakdown", label: "Alert Breakdown" },
          { id: "scale", label: "Score Scale" },
        ] as { id: TabType; label: string }[]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {tab.label}
            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />}
          </button>
        ))}
      </div>

      {activeTab === "components" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-widest font-medium">SCORE COMPONENTS</div>
          </div>
          <div className="divide-y divide-border">
            {components.map(comp => {
              const st = componentState(comp.label);
              return (
              <div key={comp.label} className="px-4 py-3 flex items-center gap-3">
                <div className="w-36 text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">{comp.label}</div>
                <div className="flex-1">
                  <ComponentBar score={st.missing ? 0 : comp.score} max={60} />
                </div>
                <div className="w-10 text-sm font-bold tabular-nums text-right shrink-0"
                  style={{ color: !st.missing && comp.score > 0 ? levelColor : "#6b7280" }}>
                  {st.missing ? "—" : comp.score.toFixed(1)}
                </div>
                <div className="w-10 text-xs text-muted-foreground text-right shrink-0 font-mono">{comp.multiplier}</div>
                <div className="text-xs text-muted-foreground min-w-0 truncate hidden sm:block">
                  {st.missing ? st.why : comp.desc}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "breakdown" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-widest font-medium">ALERT TYPE BREAKDOWN</div>
          </div>
          <div className="p-4 space-y-3">
            {[
              { label: "Tornado Warnings", count: tornadoWarnings, color: "#ef4444", weight: "2.5x multiplier" },
              { label: "SVR Thunderstorm Warnings", count: svrThunderstorm, color: "#f97316", weight: "2.0x multiplier" },
              { label: "Flash Flood Warnings", count: components.find(c => c.label === "FLOOD THREAT") ? Math.round((components.find(c => c.label === "FLOOD THREAT")!.score) / 15) : 0, color: "#3b82f6", weight: "15.0x multiplier" },
              { label: "Total Active Alerts", count: alerts.length, color: "#7B8FD9", weight: "Atmospheric boost" },
            ].map(a => (
              <div key={a.label} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{a.label}</div>
                  <div className="text-xs text-muted-foreground">{a.weight}</div>
                </div>
                <div className="text-2xl font-bold tabular-nums" style={{ color: a.color }}>{a.count}</div>
              </div>
            ))}
            <div className="mt-2 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">SWTI Score Contribution</div>
                  <div className="text-xs text-muted-foreground">Storm threat index factor</div>
                </div>
                <div className="text-xl font-bold tabular-nums text-primary">{localMissing ? "—" : swti.score.toFixed(1)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "scale" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-widest font-medium">SCORE REFERENCE SCALE</div>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SCALE_RANGES.map(s => (
              <div key={s.range} className="rounded-xl p-3 border"
                style={{ backgroundColor: s.color + "18", borderColor: s.color + "40" }}>
                <div className="text-sm font-bold" style={{ color: s.color }}>{s.range}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="mx-4 mb-4 p-3 bg-muted/20 rounded-xl border border-border text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Important:</strong> The SSWXCon Score is a situational awareness tool for understanding regional weather intensity. It is <strong className="text-foreground">not</strong> an official NWS product and should never replace official warnings or advisories. A low score does not mean your local area is safe — a single tornado warning in your county is life-threatening regardless of the national score. Always follow official NWS guidance.
          </div>
        </div>
      )}
    </div>
  );
}
