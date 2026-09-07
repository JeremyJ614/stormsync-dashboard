import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ModuleShell } from "../components/ModuleShell";
import { useQuery } from "@tanstack/react-query";
import { History, Tornado, ShieldAlert, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { WeatherHistoryMap } from "../components/WeatherHistoryMap";
import { subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot } from "../lib/mapPalette";
import { StaticHistoryMap, type LegendRow, type StatBox } from "../components/StaticHistoryMap";
import {
  fetchWarnings, fetchTornadoTracks, daysBackRange,
  WARN_TIERS, EF_ORDER, efHistoryColor,
} from "../lib/severeHistoryData";

/**
 * Severe Weather History (P-3.2) — rebuilt for parity with ryanhallyall.com/history.
 *
 * Structure now matches his page: an interactive map on top, downloadable static
 * posters underneath. Two fixes that made the old version look broken:
 *  • Tornado History queried DAT with `BEGIN_DATE`/`EF_RATING`; the service uses
 *    lower-case `stormdate`/`efscale`, so every request errored and the tab was
 *    permanently empty.
 *  • The warning legend advertised seven severity categories while the map only
 *    ever painted two. Severity now comes from the real NWS impact-based-warning
 *    tags (damagetag / is_pds / is_emergency).
 *
 * Also: the page previously used `h-screen`, which fought the app shell and
 * produced a double scrollbar inside the dashboard chrome.
 */

type Mode = "warnings" | "tornadoes";

const WARN_RANGES = [
  { days: 1, label: "24 hours" },
  { days: 3, label: "3 days" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];
const TOR_RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function SevereWeatherHistory() {
  const [mode, setMode] = useState<Mode>("warnings");
  const [warnDays, setWarnDays] = useState(3);
  const [torDays, setTorDays] = useState(90);
  const [now, setNow] = useState(() => Date.now());

  // Recompute the range when the user switches, so the poster date stamp is fresh.
  useEffect(() => { setNow(Date.now()); }, [mode, warnDays, torDays]);

  const warnRange = useMemo(() => daysBackRange(warnDays), [warnDays, now]);
  const torRange = useMemo(() => daysBackRange(torDays), [torDays, now]);

  const warnings = useQuery({
    queryKey: ["hist-warnings", warnDays, now],
    queryFn: ({ signal }) => fetchWarnings(warnRange.start, warnRange.end, signal),
    staleTime: 5 * 60 * 1000, retry: 1,
  });
  const tornadoes = useQuery({
    queryKey: ["hist-tornadoes", torDays, now],
    queryFn: ({ signal }) => fetchTornadoTracks(torRange.start, torRange.end, signal),
    staleTime: 5 * 60 * 1000, retry: 1,
  });

  const updatedLabel = `Updated: ${new Date(now).toISOString().slice(0, 16).replace("T", " ")} UTC`;

  // ── static-poster inputs ──
  const warnPolys = useMemo(() => {
    const feats = warnings.data?.features ?? [];
    // draw the most severe last so tornado polygons sit on top
    const ordered = [...feats].sort((a, b) => {
      const oa = WARN_TIERS.find(t => t.id === a.properties.tier)!.order;
      const ob = WARN_TIERS.find(t => t.id === b.properties.tier)!.order;
      return ob - oa;
    });
    const out: { rings: number[][][]; color: string }[] = [];
    for (const f of ordered) {
      const g = f.geometry;
      const polys = g.type === "Polygon" ? [g.coordinates]
        : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const p of polys) out.push({ rings: p as number[][][], color: f.properties.color });
    }
    return out;
  }, [warnings.data]);

  // Track colour is admin-overridable, and an override has to reach the map
  // the moment it is saved — the editor's whole point is seeing the change.
  // Subscribing here re-runs the memos below, which is what recolours both the
  // legend and the lines.
  const palette = useSyncExternalStore(subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot);

  const torLines = useMemo(() => {
    const feats = tornadoes.data?.features ?? [];
    const ordered = [...feats].sort((a, b) => EF_ORDER.indexOf(a.properties.ef) - EF_ORDER.indexOf(b.properties.ef));
    const out: { coords: number[][]; color: string }[] = [];
    for (const f of ordered) {
      const g = f.geometry;
      // Recoloured from the rating rather than read off `properties.color`:
      // that was resolved when the survey was parsed, which is before any
      // override exists and never again afterwards.
      const colour = efHistoryColor(f.properties.ef);
      if (g.type === "LineString") out.push({ coords: g.coordinates as number[][], color: colour });
      else if (g.type === "MultiLineString") for (const l of g.coordinates) out.push({ coords: l as number[][], color: colour });
    }
    return out;
  }, [tornadoes.data, palette]);

  const warnLegend: LegendRow[] = WARN_TIERS
    .filter(t => t.id !== "other")
    .map(t => ({ label: t.label, color: t.color, count: warnings.data?.counts[t.id] ?? 0 }))
    .filter(r => r.count > 0 || ["severe", "considerable", "destructive", "tornado"].includes(
      WARN_TIERS.find(t => t.label === r.label)!.id));

  const torLegend: LegendRow[] = EF_ORDER
    .map(ef => ({ label: ef, color: efHistoryColor(ef), count: tornadoes.data?.counts[ef] ?? 0 }))
    .filter(r => r.count > 0);

  const torStats: StatBox[] = tornadoes.data ? [
    { label: "Fatalities", value: String(tornadoes.data.fatalities), color: "#ef4444" },
    { label: "Injuries", value: String(tornadoes.data.injuries), color: "#eab308" },
    // Colour this by the rating it is actually showing, not a fixed red.
    { label: "Highest EF", value: tornadoes.data.highestEf, color: efHistoryColor(tornadoes.data.highestEf) },
  ] : [];

  const warnStats: StatBox[] = warnings.data ? [
    { label: "Tornado", value: String(warnings.data.counts.tornado + warnings.data.counts["pds-tornado"] + warnings.data.counts["tornado-emergency"]), color: "#ef4444" },
    { label: "Severe", value: String(warnings.data.counts.severe + warnings.data.counts.considerable + warnings.data.counts.destructive), color: "#c3d117" },
  ] : [];

  const active = mode === "warnings" ? warnings : tornadoes;
  const range = mode === "warnings" ? warnRange : torRange;
  const ranges = mode === "warnings" ? WARN_RANGES : TOR_RANGES;
  const days = mode === "warnings" ? warnDays : torDays;
  const setDays = mode === "warnings" ? setWarnDays : setTorDays;

  return (
    <ModuleShell
      eyebrow="NWS · IEM · NOAA Damage Assessment Toolkit"
      title="Severe Weather History"
      subtitle="Warning history and surveyed tornado paths, live from NWS/IEM and the NOAA Damage Assessment Toolkit."
      actions={
        <button onClick={() => setNow(Date.now())}
          className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs font-semibold flex items-center gap-1.5 hover:border-primary/40 shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      }
    >

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2 bg-card border border-border rounded-xl p-1.5">
        <button onClick={() => setMode("warnings")}
          className={`py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ${mode === "warnings" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
          <ShieldAlert className="w-4 h-4" /> Warning History
        </button>
        <button onClick={() => setMode("tornadoes")}
          className={`py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ${mode === "tornadoes" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
          <Tornado className="w-4 h-4" /> Tornado History
        </button>
      </div>

      {/* Range picker + counts */}
      <div className="flex items-center gap-2 flex-wrap">
        {ranges.map(r => (
          <button key={r.days} onClick={() => setDays(r.days)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              days === r.days ? "bg-primary/15 border-primary/40 text-primary" : "bg-muted/20 border-border text-muted-foreground hover:text-foreground"}`}>
            {r.label}
          </button>
        ))}
        <div className="text-xs text-muted-foreground ml-auto tabular-nums">
          {active.isLoading ? <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> loading…</span>
            : active.isError ? <span className="text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" /> source unavailable</span>
            : mode === "warnings" ? `${warnings.data?.total ?? 0} warnings`
            : `${tornadoes.data?.total ?? 0} tornado paths`}
        </div>
      </div>

      {/* Interactive map */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-xs font-semibold text-muted-foreground">
          Interactive — {fmt(range.start)} → {fmt(range.end)}
        </div>
        <WeatherHistoryMap
          mode={mode}
          warnings={warnings.data?.features ?? []}
          tornadoes={tornadoes.data?.features ?? []}
          height={430}
        />
        {/* legend that finally matches what the map paints */}
        <div className="px-4 py-3 border-t border-border flex flex-wrap gap-x-4 gap-y-1.5">
          {(mode === "warnings" ? warnLegend : torLegend).map(l => (
            <div key={l.label} className="flex items-center gap-1.5 text-xs">
              <div className="w-3.5 h-3.5 rounded-sm" style={{ background: l.color }} />
              <span className="text-muted-foreground">{l.label}</span>
              <span className="text-foreground font-semibold tabular-nums">{l.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Static downloadable poster */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
          Shareable map
        </h2>
        {mode === "warnings" ? (
          <StaticHistoryMap
            title={`LAST ${warnDays === 1 ? "24 HOURS" : `${warnDays} DAYS`} OF WARNINGS`}
            subtitle={`${fmt(warnRange.start)} - ${fmt(warnRange.end)}  |  ${warnings.data?.total ?? 0} warnings`}
            updatedLabel={updatedLabel}
            polygons={warnPolys}
            stats={warnStats}
            legend={warnLegend}
            legendTitle="Warning Type"
            fileBase="sswx-warning-history"
            loading={warnings.isLoading}
          />
        ) : (
          <StaticHistoryMap
            title={`TORNADO PATHS - PAST ${torDays === 365 ? "YEAR" : `${torDays} DAYS`}`}
            subtitle={`${fmt(torRange.start)} - ${fmt(torRange.end)}  |  ${tornadoes.data?.total ?? 0} tornado paths`}
            updatedLabel={updatedLabel}
            lines={torLines}
            stats={torStats}
            legend={torLegend}
            legendTitle="EF Rating"
            fileBase="sswx-tornado-paths"
            loading={tornadoes.isLoading}
          />
        )}
      </div>

      {/* Source notes */}
      <div className="bg-card border border-border rounded-xl p-4 text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
        {mode === "warnings" ? (
          <p>
            Warnings from the <strong className="text-foreground">Iowa Environmental Mesonet</strong> storm-based warning archive.
            Severity uses the official NWS impact-based-warning tags — a Severe Thunderstorm Warning is upgraded to
            <em> Considerable</em> or <em>Destructive</em> by its damage threat tag, and Tornado Warnings are flagged
            <em> PDS</em> or <em>Tornado Emergency</em> where issued.
          </p>
        ) : (
          <p>
            Tornado paths from the <strong className="text-foreground">NOAA Damage Assessment Toolkit</strong> — these are
            <strong className="text-foreground"> survey-driven</strong>, so a tornado appears here as soon as the local NWS office
            publishes its damage survey. Very recent events may not be surveyed yet, and older years have sparser coverage.
          </p>
        )}
        <p className="text-muted-foreground/70">Always defer to official NWS products. Counts refresh when you change the range or tap Refresh.</p>
      </div>
    </ModuleShell>
  );
}
