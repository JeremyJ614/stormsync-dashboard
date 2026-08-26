import type { Location } from "../hooks/useLocation";
import { AlertCircle, RefreshCw, ExternalLink, AlertTriangle, Filter, Radio, Flame, Zap, Tornado } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useState, useMemo } from "react";
import { fetchAllUSAlerts, fetchStormReports, type NWSAlertFeature } from "../utils/weatherApi";
import { motion, LayoutGroup } from "framer-motion";
import { ModuleShell } from "../components/ModuleShell";
import { ShieldAlert } from "lucide-react";
import { WarningEntrance } from "../components/motion/WarningEntrance";
import { useCalm, isCalmEvent } from "../lib/calm";
import { ReportsTab } from "../components/warnings/ReportsTab";
import { ROYAL, prefersReducedMotion } from "../lib/royal";

interface Props { location: Location }

const EVENT_PRIORITY: Record<string, number> = {
  "Tornado Emergency": 0,
  "Tornado Warning": 1,
  "Flash Flood Emergency": 2,
  "Hurricane Warning": 2,
  "Typhoon Warning": 2,
  "Flash Flood Warning": 3,
  "Severe Thunderstorm Warning": 4,
  "Extreme Wind Warning": 5,
  "Special Marine Warning": 5,
  "Blizzard Warning": 6,
  "Ice Storm Warning": 6,
  "Winter Storm Warning": 7,
  "Flood Warning": 8,
  "High Wind Warning": 9,
  "Dust Storm Warning": 10,
  "Fire Warning": 10,
  "Red Flag Warning": 11,
  "Winter Weather Advisory": 12,
  "Wind Advisory": 13,
  "Flood Advisory": 14,
  "Tornado Watch": 15,
  "Severe Thunderstorm Watch": 16,
};

const SEVERITY_STYLES: Record<string, { badge: string; border: string; bg: string }> = {
  Extreme:  { badge: "bg-red-500 text-white",          border: "border-red-500/50",    bg: "bg-red-500/8" },
  Severe:   { badge: "bg-orange-500 text-white",       border: "border-orange-500/50", bg: "bg-orange-500/8" },
  Moderate: { badge: "bg-yellow-400 text-black",       border: "border-yellow-400/50", bg: "bg-yellow-400/8" },
  Minor:    { badge: "bg-blue-500 text-white",         border: "border-blue-500/50",   bg: "bg-blue-500/8" },
  Unknown:  { badge: "bg-muted text-muted-foreground", border: "border-border",        bg: "bg-muted/20" },
};

function EventIcon({ event }: { event: string }) {
  const e = event.toLowerCase();
  if (e.includes("tornado")) return <span className="text-base">🌪️</span>;
  if (e.includes("thunderstorm")) return <span className="text-base">⛈️</span>;
  if (e.includes("flash flood") || e.includes("flood")) return <span className="text-base">🌊</span>;
  if (e.includes("wind") || e.includes("high wind")) return <span className="text-base">💨</span>;
  if (e.includes("snow") || e.includes("winter") || e.includes("blizzard") || e.includes("ice")) return <span className="text-base">❄️</span>;
  if (e.includes("fire") || e.includes("red flag")) return <span className="text-base">🔥</span>;
  if (e.includes("heat")) return <span className="text-base">🥵</span>;
  if (e.includes("fog")) return <span className="text-base">🌫️</span>;
  if (e.includes("hurricane") || e.includes("typhoon")) return <span className="text-base">🌀</span>;
  return <span className="text-base">⚠️</span>;
}

const US_STATES: Record<string, string> = {
  "": "All States",
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const WARN_TYPES = [
  { value: "", label: "All Types" },
  { value: "Tornado", label: "Tornado" },
  { value: "Severe Thunderstorm", label: "Severe Thunderstorm" },
  { value: "Flash Flood", label: "Flash Flood" },
  { value: "Flood", label: "Flood" },
  { value: "Winter", label: "Winter Weather" },
  { value: "Wind", label: "Wind" },
  { value: "Fire", label: "Fire" },
  { value: "Heat", label: "Heat" },
  { value: "Hurricane", label: "Hurricane" },
];

function getRadarUrl(areaDesc: string): string {
  const stateMatch = areaDesc.match(/\b([A-Z]{2})\b/);
  if (!stateMatch) return "https://radar.weather.gov/";
  return `https://radar.weather.gov/?state=${stateMatch[1]}`;
}

function useNationwideWarnings() {
  return useQuery({
    queryKey: ["nationwide-warnings-v2"],
    queryFn: fetchAllUSAlerts,
    staleTime: 60_000,
    refetchInterval: 90_000,
  });
}

function useStormReportsQ() {
  return useQuery({
    queryKey: ["storm-reports-v1"],
    queryFn: fetchStormReports,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });
}

export default function WarningCenter({ location }: Props) {
  const [tab, setTab] = useState<"warnings" | "reports">("warnings");
  // Nothing on this page is allowed to animate while a warning is live for the
  // member's own location. See lib/calm — it is a rule, not a preference.
  const { calm, reason, event: calmEvent } = useCalm(location.lat, location.lon);
  const { data: alerts = [], isLoading, error, refetch, isFetching } = useNationwideWarnings();
  const { data: reports } = useStormReportsQ();
  const [selectedState, setSelectedState] = useState("");
  const [selectedType, setSelectedType] = useState("");

  const activeAlerts = useMemo(() => {
    let filtered = (alerts as NWSAlertFeature[]).filter(a => a.properties.messageType !== "Cancel");
    if (selectedState) filtered = filtered.filter(a => a.properties.areaDesc?.toUpperCase().includes(selectedState));
    if (selectedType) filtered = filtered.filter(a => a.properties.event?.toLowerCase().includes(selectedType.toLowerCase()));
    filtered.sort((a, b) => {
      const pa = EVENT_PRIORITY[a.properties.event] ?? 99;
      const pb = EVENT_PRIORITY[b.properties.event] ?? 99;
      if (pa !== pb) return pa - pb;
      const sevOrder: Record<string, number> = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
      return (sevOrder[a.properties.severity] ?? 4) - (sevOrder[b.properties.severity] ?? 4);
    });
    return filtered;
  }, [alerts, selectedState, selectedType]);

  // TOP 5 = most serious (lowest priority number) overall, ignoring state filter
  const top5 = useMemo(() => {
    const all = (alerts as NWSAlertFeature[])
      .filter(a => a.properties.messageType !== "Cancel")
      .sort((a, b) => (EVENT_PRIORITY[a.properties.event] ?? 99) - (EVENT_PRIORITY[b.properties.event] ?? 99));
    return all.slice(0, 5);
  }, [alerts]);

  const tornadoWarnings = activeAlerts.filter(a => a.properties.event?.toLowerCase().includes("tornado warning"));
  const severeThunderstorm = activeAlerts.filter(a => a.properties.event?.toLowerCase().includes("severe thunderstorm warning"));
  const flashFlood = activeAlerts.filter(a => a.properties.event?.toLowerCase().includes("flash flood warning"));

  return (
    <ModuleShell
      eyebrow="NWS Active Alerts · IEM Local Storm Reports"
      title={<>Warnings &amp; Reports</>}
      subtitle="What the Weather Service has warned, and what people on the ground have actually reported."
      actions={
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary px-2 py-1 rounded border border-border hover:border-primary/40 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
      status={
        // A warning says what a radar expects; a report says what somebody
        // standing outside saw. During an event you want to flip between the
        // two without leaving the page — hence subtabs rather than two modules.
        <LayoutGroup id="wc-tabs">
          <div className="grid grid-cols-2 gap-1 rounded-xl p-1.5"
               style={{ background: "hsl(var(--muted) / 0.3)", border: "1px solid hsl(var(--border))" }}>
            {([
              { id: "warnings", label: "Active Warnings", icon: AlertCircle, count: activeAlerts.length },
              { id: "reports", label: "Storm Reports", icon: Radio, count: null },
            ] as const).map((t) => {
              const Icon = t.icon;
              const on = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="relative py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ color: on ? "#17141f" : "hsl(var(--muted-foreground))", zIndex: 1 }}>
                  {on && (
                    <motion.span layoutId="wc-tab-slab"
                      transition={prefersReducedMotion() ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }}
                      className="absolute inset-0 rounded-lg -z-10"
                      style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)` }} />
                  )}
                  <Icon className="w-4 h-4" /> {t.label}
                  {t.count !== null && t.count > 0 && (
                    <span className="tabular-nums text-[11px] opacity-80">{t.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      }
    >
      {calm && reason === "warning" && (
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2.5 text-xs"
             style={{ background: "rgba(226,55,60,0.1)", border: "1px solid rgba(226,55,60,0.3)" }}>
          <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: "#e2373c" }} />
          <span style={{ color: "#f0b8ba" }}>
            <strong>{calmEvent} in effect for your location.</strong>{" "}
            <span style={{ color: "hsl(var(--muted-foreground))" }}>
              Animations are off across the app while it stands — nothing on screen will move while you read.
            </span>
          </span>
        </div>
      )}

      {tab === "reports" ? (
        <ReportsTab lat={location.lat} lon={location.lon} place={location.name} />
      ) : (
      <div className="space-y-5">

      {/* Summary counts */}
      {!isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Tornado Warnings", count: tornadoWarnings.length, color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: "🌪️" },
            { label: "Svr Tstm Warnings", count: severeThunderstorm.length, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", icon: "⛈️" },
            { label: "Flash Flood Warnings", count: flashFlood.length, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", icon: "🌊" },
            { label: "All Active Alerts", count: activeAlerts.length, color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30", icon: "⚠️" },
          ].map(s => (
            <div key={s.label} className={`border rounded-xl p-3 ${s.bg}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <span>{s.icon}</span>
                <span className={`text-2xl font-bold ${s.color}`}>{s.count}</span>
              </div>
              <div className="text-xs text-muted-foreground leading-tight">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* TOP 5 MOST SERIOUS */}
      {!isLoading && top5.length > 0 && (
        <div className="bg-gradient-to-br from-red-950/40 to-card border-2 border-red-500/40 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-red-500/30 bg-red-500/10 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-widest text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 animate-pulse" /> Top 5 Most Serious U.S. Warnings
            </h3>
            <span className="text-[10px] text-red-200/70">Updates every 90s</span>
          </div>
          <div className="divide-y divide-red-500/20">
            {top5.map((alert, i) => {
              const sev = alert.properties.severity ?? "Unknown";
              const styles = SEVERITY_STYLES[sev] ?? SEVERITY_STYLES.Unknown;
              const expires = alert.properties.expires ? format(parseISO(alert.properties.expires), "EEE h:mm a") : null;
              return (
                <div key={alert.properties.id} className="p-3 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center font-bold text-red-300 text-xs shrink-0">#{i + 1}</div>
                  <EventIcon event={alert.properties.event} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-bold">{alert.properties.event}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${styles.badge}`}>{sev}</span>
                    </div>
                    {alert.properties.headline && <div className="text-xs text-muted-foreground line-clamp-2">{alert.properties.headline}</div>}
                    {alert.properties.areaDesc && <div className="text-[11px] text-muted-foreground/70 line-clamp-1 mt-0.5">{alert.properties.areaDesc}</div>}
                    {expires && <div className="text-[10px] text-muted-foreground mt-0.5">Expires: {expires}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Storm reports */}
      {reports && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest mb-3 flex items-center gap-2">
            <Flame className="w-4 h-4 text-primary" /> Today's SPC Storm Reports
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <ReportStat icon={Tornado} label="Tornado" count={reports.today.tornado} color="#ef4444" />
            <ReportStat icon={AlertTriangle} label="Hail" count={reports.today.hail} color="#fbbf24" />
            <ReportStat icon={Zap} label="Wind" count={reports.today.wind} color="#a855f7" />
          </div>
          <div className="text-[11px] text-muted-foreground border-t border-border pt-2">
            Yesterday: <strong>{reports.yesterday.tornado}</strong> tornado · <strong>{reports.yesterday.hail}</strong> hail · <strong>{reports.yesterday.wind}</strong> wind
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Filter className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Filter All Active Alerts</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-widest">State</label>
            <select value={selectedState} onChange={e => setSelectedState(e.target.value)} className="bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-sm">
              {Object.entries(US_STATES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground uppercase tracking-widest">Type</label>
            <select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-sm">
              {WARN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {(selectedState || selectedType) && (
            <button onClick={() => { setSelectedState(""); setSelectedType(""); }} className="self-end px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/40">Clear</button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl h-20 animate-pulse" />)}
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive rounded-xl p-4 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Could not load NWS alerts. Check your internet connection and try again.
        </div>
      )}

      {!isLoading && activeAlerts.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="font-semibold text-lg mb-1">No Active Alerts{selectedState ? ` in ${US_STATES[selectedState]}` : ""}</h3>
          <p className="text-sm text-muted-foreground">
            {selectedState || selectedType ? "No alerts match the current filters." : "No NWS watches, warnings, or advisories currently in effect nationwide."}
          </p>
        </div>
      )}

      {!isLoading && activeAlerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">All Active Alerts ({activeAlerts.length})</h3>
          {activeAlerts.map((alert, i) => {
            const sev = alert.properties.severity ?? "Unknown";
            const styles = SEVERITY_STYLES[sev] ?? SEVERITY_STYLES.Unknown;
            const expires = alert.properties.expires ? format(parseISO(alert.properties.expires), "EEE h:mm a") : null;
            const radarUrl = getRadarUrl(alert.properties.areaDesc ?? "");
            return (
              <WarningEntrance key={alert.properties.id} index={i} calm={calm}
                               tone={isCalmEvent(alert.properties.event) ? "#e2373c" : "#e8bb4d"}>
              <div className={`border rounded-xl p-4 ${styles.bg} ${styles.border}`}>
                <div className="flex items-start gap-3">
                  <EventIcon event={alert.properties.event} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-bold">{alert.properties.event}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${styles.badge}`}>{sev}</span>
                      {EVENT_PRIORITY[alert.properties.event] !== undefined && EVENT_PRIORITY[alert.properties.event] <= 4 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-600 text-white animate-pulse">PRIORITY</span>
                      )}
                    </div>
                    {alert.properties.headline && <p className="text-xs text-muted-foreground mb-1 leading-relaxed">{alert.properties.headline}</p>}
                    {alert.properties.areaDesc && <div className="text-xs text-muted-foreground/70 mb-2 line-clamp-2">{alert.properties.areaDesc}</div>}
                    <div className="flex items-center gap-3 flex-wrap">
                      {expires && <div className="text-xs text-muted-foreground">Expires: {expires}</div>}
                      <a href={radarUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline"><Radio className="w-3 h-3" /> Radar</a>
                      <a href="https://alerts.weather.gov/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><ExternalLink className="w-3 h-3" /> NWS</a>
                    </div>
                  </div>
                </div>
              </div>
              </WarningEntrance>
            );
          })}
        </div>
      )}
      </div>
      )}
    </ModuleShell>
  );
}

function ReportStat({ icon: Icon, label, count, color }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; count: number; color: string }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ background: color + "15", border: `1px solid ${color}40` }}>
      <Icon className="w-5 h-5 mx-auto mb-1" style={{ color }} />
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{count}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{label}</div>
    </div>
  );
}
