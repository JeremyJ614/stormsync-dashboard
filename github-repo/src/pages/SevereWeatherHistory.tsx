import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, RefreshCw, Calendar, AlertTriangle, MapPin, Tag } from "lucide-react";
import { getSevereHistory, type HistoryPeriod, type PeriodHistory } from "../lib/severeHistory";

const PERIODS: { id: HistoryPeriod; label: string; sub: string }[] = [
  { id: "week", label: "Last Week", sub: "Past 7 days" },
  { id: "lastmonth", label: "Last Month", sub: "Previous calendar month" },
  { id: "thismonth", label: "This Month", sub: "So far this month" },
  { id: "thisyear", label: "This Year", sub: "Year-to-date" },
];

const CAT_COLORS: Record<string, string> = {
  Tornado: "#ef4444",
  "Severe Storms": "#fb923c",
  Hurricane: "#a855f7",
  Flood: "#3b82f6",
  Winter: "#60a5fa",
  Heat: "#fbbf24",
  Wildfire: "#dc2626",
  Other: "#7B8FD9",
};

export default function SevereWeatherHistory() {
  const [active, setActive] = useState<HistoryPeriod>("week");
  const { data: history, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["severe-history"],
    queryFn: getSevereHistory,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const cur: PeriodHistory | undefined = history?.[active];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-wide uppercase">Recent Severe Weather History</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> AI-summarized national severe-report totals, refreshed nightly</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40 disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Period tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setActive(p.id)}
            className={`px-3 py-3 rounded-xl text-left transition-all ${active === p.id ? "bg-gradient-to-br from-primary/25 to-purple-500/15 border-2 border-primary/50" : "bg-card border border-border hover:border-primary/30"}`}>
            <div className="text-sm font-bold">{p.label}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{p.sub}</div>
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="text-3xl mb-2 animate-pulse">📜</div>
          <p className="text-sm text-muted-foreground">Loading severe weather history…</p>
        </div>
      )}
      {isError && !isLoading && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
          Could not load history. Try again shortly.
        </div>
      )}
      {!isLoading && !isError && !cur && (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          This period's summary isn't ready yet — the Storm Engine publishes it each morning.
        </div>
      )}
      {!isLoading && cur && (
        <>
          <div className="bg-gradient-to-br from-card to-primary/5 border border-border rounded-2xl p-5 space-y-3">
            <h2 className="text-lg font-bold leading-snug">{cur.headline ?? cur.periodLabel}</h2>
            {cur.summary && <p className="text-sm text-muted-foreground leading-relaxed">{cur.summary}</p>}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: "Tornadoes", value: cur.stats.tornadoes, color: "#ef4444", icon: "🌪️" },
              { label: "Hail Reports", value: cur.stats.hail_reports, color: "#22d3ee", icon: "🧊" },
              { label: "Wind Reports", value: cur.stats.wind_reports, color: "#a855f7", icon: "💨" },
              { label: "Deaths", value: cur.stats.deaths, color: "#fb923c", icon: "⚠️" },
            ].map(s => (
              <div key={s.label} className="bg-card border rounded-xl p-3" style={{ borderColor: s.color + "40" }}>
                <div className="text-xl">{s.icon}</div>
                <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: s.color }}>
                  {s.value !== null ? s.value.toLocaleString() : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-widest">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Most-active days (real, from the report ledger) */}
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-primary" /> Most Active Days</h3>
            {cur.events.length === 0 && <p className="text-sm text-muted-foreground">No significant report days logged for this period.</p>}
            <div className="space-y-2">
              {cur.events.map((e, i) => {
                const c = CAT_COLORS[e.category] || "#7B8FD9";
                return (
                  <div key={i} className="rounded-xl p-3 border" style={{ borderColor: c + "50", background: `linear-gradient(135deg, ${c}10, transparent)` }}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest" style={{ background: c + "25", color: c }}><Tag className="w-2.5 h-2.5 inline mr-0.5" />{e.category}</span>
                      <span className="text-xs text-muted-foreground">{e.date}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> {e.location}</span>
                    </div>
                    <div className="text-sm font-semibold">{e.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{e.impact}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      <div className="bg-muted/20 border border-border rounded-xl p-3 text-[11px] text-muted-foreground leading-relaxed">
        Counts are aggregated from preliminary SPC storm reports and summarized by AI.
        {cur?.trackingSince && <> SSWX has tracked daily totals since {cur.trackingSince}, so longer periods fill in over time.</>}
        {" "}Cross-reference the NWS Storm Events Database for authoritative, finalized numbers.
      </div>
    </div>
  );
}
