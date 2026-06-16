import { useState } from "react";
import type { Location } from "../hooks/useLocation";
import { Tornado, ExternalLink, Info, Database, Layers, Flame, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Props { location: Location }

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

type TabId = "dataviewer" | "outbreaks" | "envbrowser" | "climo";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }>; url: string; openUrl: string; description: string }[] = [
  {
    id: "dataviewer",
    label: "SPC Data Viewer",
    icon: Database,
    url: "https://www.spc.noaa.gov/climo/dataviewer/?hl=en-US",
    openUrl: "https://www.spc.noaa.gov/climo/dataviewer/?hl=en-US",
    description:
      "Interactive map of every U.S. tornado, hail, and wind report 1950–present. Filter by EF rating, year, county. Click a point for the full Storm Data narrative.",
  },
  {
    id: "outbreaks",
    label: "SPC Outbreaks",
    icon: Flame,
    url: "https://www.spc.noaa.gov/exper/outbreaks/",
    openUrl: "https://www.spc.noaa.gov/exper/outbreaks/",
    description:
      "SPC's experimental Outbreak Composite — ranks every U.S. tornado day since 1950 by an objective severity index combining tornado counts, EF distribution, casualties, and damage path lengths.",
  },
  {
    id: "envbrowser",
    label: "Environment Browser",
    icon: Layers,
    url: "https://www.spc.noaa.gov/exper/envbrowser/",
    openUrl: "https://www.spc.noaa.gov/exper/envbrowser/",
    description:
      "Composite environmental parameters (CAPE, shear, STP, helicity) for every U.S. tornado in the historical record. See what a textbook EF4 environment looks like vs. a marginal spinup.",
  },
  {
    id: "climo",
    label: "Climatology Maps",
    icon: BarChart3,
    url: "https://www.spc.noaa.gov/climo/online/",
    openUrl: "https://www.spc.noaa.gov/climo/online/",
    description:
      "SPC monthly and annual tornado climatology maps. Heatmaps of where tornadoes are statistically most common in each calendar month.",
  },
];

const MONTHLY_TORNADO_AVG = [
  { month: "Jan", avg: 38,  color: "#4b9cd3" },
  { month: "Feb", avg: 52,  color: "#5ba3d9" },
  { month: "Mar", avg: 105, color: "#7fb5e0" },
  { month: "Apr", avg: 198, color: "#a3c7e8" },
  { month: "May", avg: 276, color: "#f97316" },
  { month: "Jun", avg: 243, color: "#ef4444" },
  { month: "Jul", avg: 155, color: "#fde047" },
  { month: "Aug", avg: 109, color: "#86efac" },
  { month: "Sep", avg: 74,  color: "#5ba3d9" },
  { month: "Oct", avg: 55,  color: "#4b9cd3" },
  { month: "Nov", avg: 66,  color: "#4b9cd3" },
  { month: "Dec", avg: 41,  color: "#4b9cd3" },
];

const EF_SCALE = [
  { scale: "EF0", winds: "65-85 mph",   color: "#86efac", pct: "53%",   desc: "Light damage" },
  { scale: "EF1", winds: "86-110 mph",  color: "#fde047", pct: "32%",   desc: "Moderate damage" },
  { scale: "EF2", winds: "111-135 mph", color: "#f97316", pct: "11%",   desc: "Significant damage" },
  { scale: "EF3", winds: "136-165 mph", color: "#ef4444", pct: "3%",    desc: "Severe damage" },
  { scale: "EF4", winds: "166-200 mph", color: "#b91c1c", pct: "0.7%",  desc: "Devastating damage" },
  { scale: "EF5", winds: ">200 mph",    color: "#7f1d1d", pct: "0.1%",  desc: "Incredible damage" },
];

const NOTABLE_OUTBREAKS = [
  { date: "Apr 25–28, 2011", name: "Super Outbreak", tornadoes: 360, ef5: 4, deaths: 324, note: "Largest outbreak in U.S. history; included Tuscaloosa EF4 & Hackleburg EF5." },
  { date: "Apr 3–4, 1974", name: "1974 Super Outbreak", tornadoes: 148, ef5: 7, deaths: 335, note: "Held the single-day tornado record until 2011." },
  { date: "May 22, 2011", name: "Joplin, MO", tornadoes: 1, ef5: 1, deaths: 158, note: "Single EF5; deadliest U.S. tornado since 1947." },
  { date: "May 3, 1999", name: "Bridge Creek–Moore, OK", tornadoes: 74, ef5: 1, deaths: 50, note: "Highest measured surface wind on Earth: 318 mph (DOW)." },
  { date: "Dec 10–11, 2021", name: "Quad-State Outbreak", tornadoes: 71, ef5: 0, deaths: 89, note: "Mayfield, KY tornado track: 165 mi continuous." },
];

export default function TornadoClimatology({ location }: Props) {
  const [tab, setTab] = useState<TabId>("dataviewer");
  const current = TABS.find(t => t.id === tab)!;
  const TabIcon = current.icon;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Tornado className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold tracking-wide uppercase">Tornado Climatology</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {location.name} · Live SPC tools · 75 years of U.S. tornado data
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 bg-muted/20 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <span>
          The best interactive tornado tools from the NOAA Storm Prediction Center. Pick a tab to preview each
          one, then launch it in a clean full window — plus native SSWX climatology, the EF scale, and notable
          outbreaks below.
        </span>
      </div>

      {/* Tab Switcher */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${tab === t.id ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:border-primary/30"}`}>
              <Icon className="w-3.5 h-3.5" /> <span className="truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Featured SPC tool — clean launcher (no embedded site chrome) */}
      <div className="bg-gradient-to-br from-card to-primary/5 border border-primary/20 rounded-xl overflow-hidden">
        <div className="p-5 flex flex-col md:flex-row md:items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
            <TabIcon className="w-7 h-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold">{current.label}</h3>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">NOAA SPC</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{current.description}</p>
          </div>
          <a href={current.openUrl} target="_blank" rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
            <ExternalLink className="w-4 h-4" /> Launch tool
          </a>
        </div>
        <div className="px-5 py-2.5 border-t border-border bg-muted/10 text-[11px] text-muted-foreground">
          Opens in a clean full window — SPC's interactive tools don't embed well inside other sites, so we link
          straight to the real thing.
        </div>
      </div>

      {/* Note about external archives */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-2">More Interactive Tornado Archives</h3>
        <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
          These third-party archives don't allow direct embedding (Cloudflare / X-Frame protection) — but they're
          two of the best historical tornado tools on the web. Open them in a new tab:
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <a href="https://tornadoarchive.com/explorer/2.3.1/" target="_blank" rel="noopener noreferrer"
            className="flex items-start gap-3 bg-muted/20 hover:bg-muted/40 transition-colors rounded-lg p-3 group">
            <Tornado className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold flex items-center gap-1 group-hover:text-primary">
                Tornado Archive <ExternalLink className="w-3 h-3" />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Daniel Sheehan's beautifully designed global tornado map. Every reported tornado worldwide
                1950–present, with filterable timeline, EF/F scale, deaths/injuries, path length.
              </div>
            </div>
          </a>
          <a href="https://data.usatoday.com/tornado-archive/" target="_blank" rel="noopener noreferrer"
            className="flex items-start gap-3 bg-muted/20 hover:bg-muted/40 transition-colors rounded-lg p-3 group">
            <Database className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold flex items-center gap-1 group-hover:text-primary">
                USA Today Tornado Archive <ExternalLink className="w-3 h-3" />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Searchable U.S. tornado database by ZIP code — narrative summaries, casualties, EF rating, path
                width, and direct links to NWS Storm Data publications.
              </div>
            </div>
          </a>
        </div>
      </div>

      {/* Monthly chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Average U.S. Tornado Count by Month</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={MONTHLY_TORNADO_AVG}>
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}`, "Avg. Tornadoes"]} />
            <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
              {MONTHLY_TORNADO_AVG.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">Based on SPC historical records 1950–present. Peak activity April–June.</p>
      </div>

      {/* EF scale */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start gap-2 mb-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <h3 className="text-sm font-semibold">Enhanced Fujita (EF) Scale</h3>
        </div>
        <div className="space-y-2">
          {EF_SCALE.map(e => (
            <div key={e.scale} className="flex items-center gap-3">
              <div className="w-10 text-xs font-bold shrink-0" style={{ color: e.color }}>{e.scale}</div>
              <div className="text-xs text-muted-foreground w-24 shrink-0">{e.winds}</div>
              <div className="flex-1 bg-muted rounded-full h-2">
                <div className="h-2 rounded-full" style={{ width: e.pct, backgroundColor: e.color, minWidth: 4 }} />
              </div>
              <div className="text-xs text-muted-foreground w-10 text-right shrink-0">{e.pct}</div>
              <div className="text-xs text-muted-foreground hidden md:block w-36 shrink-0">{e.desc}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Percentage of U.S. tornadoes in each EF category (SPC, 2000–present).</p>
      </div>

      {/* Notable outbreaks */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Notable U.S. Tornado Events</h3>
        <div className="space-y-2">
          {NOTABLE_OUTBREAKS.map(o => (
            <div key={o.date} className="bg-muted/20 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Tornado className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm font-semibold">{o.name}</span>
                  <span className="text-[11px] text-muted-foreground">{o.date}</span>
                </div>
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

      {/* Key stats */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Tornado Alley — Key Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Avg. Annual U.S.", value: "~1,200", sub: "tornadoes per year", color: "#f97316" },
            { label: "Peak Month", value: "May", sub: "~276 avg. tornadoes", color: "#ef4444" },
            { label: "Most Dangerous", value: "EF3–EF5", sub: "3.8% of all tornadoes", color: "#b91c1c" },
            { label: "Peak Hours", value: "3–9 PM", sub: "local time", color: "#a78bfa" },
          ].map(s => (
            <div key={s.label} className="bg-muted/20 rounded-xl p-3 text-center">
              <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              <div className="text-[10px] text-muted-foreground/60 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
