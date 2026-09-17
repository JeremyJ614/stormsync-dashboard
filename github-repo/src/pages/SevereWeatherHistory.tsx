import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ModuleShell, Panel } from "../components/ModuleShell";
import { SegmentedTabs } from "../components/forecast/SegmentedTabs";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { WeatherHistoryMap } from "../components/WeatherHistoryMap";
import { subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot } from "../lib/mapPalette";
import { StaticHistoryMap, type LegendRow, type StatBox } from "../components/StaticHistoryMap";
import { StatBank, type BankRow } from "../components/history/StatBank";
import {
  fetchWarnings, fetchTornadoTracks, daysBackRange,
  periodRanges, periodLabel, periodClipped, periodPartialSurvey,
  filterTornadoes, countByState, US_STATE_NAMES,
  TOR_YEARS_BACK, TOR_FULL_SURVEY_YEAR,
  WARN_TIERS, EF_ORDER, efHistoryColor, type TorPeriod,
} from "../lib/severeHistoryData";
import { PeriodPicker } from "../components/history/PeriodPicker";
import { TornadoFilters } from "../components/history/TornadoFilters";

/**
 * Severe Weather History.
 *
 * REDESIGNED. The page held the right data in the wrong order: the numbers
 * anybody opens it for — how many warnings, how many tornadoes, how bad the
 * worst one was — existed only inside the downloadable poster, three screens
 * down, while the top of the page was two buttons and a row of range pills.
 *
 * Now the count leads. A stat band states the period's totals at display size,
 * a composition bar underneath shows what those totals are made of (proportion,
 * which a row of legend swatches cannot show), and the map runs full-bleed with
 * its legend floating on it rather than stacked underneath. The poster keeps
 * its place at the bottom, which is where a thing you download belongs.
 *
 * Everything the module did, it still does. What changed is which fact is
 * largest.
 *
 * ─── the original notes, still true ────────────────────────────────────────
 * Rebuilt for parity with ryanhallyall.com/history.
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
// Tornado spans go as deep as the archive window. The warning list stays short
// on purpose — IEM keeps weeks of storm-based warnings, not years.
const TOR_RANGES = [
  { days: 30, label: "30 days" },
  { days: 365, label: "1 year" },
  { days: 365 * 3, label: "3 years" },
  { days: 365 * TOR_YEARS_BACK, label: `${TOR_YEARS_BACK} years` },
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function SevereWeatherHistory() {
  const [mode, setMode] = useState<Mode>("warnings");
  const [warnDays, setWarnDays] = useState(3);
  // Tornado history is an archive, not a rolling window, so its period is a
  // richer thing than a number of days — see `TorPeriod`.
  const [torPeriod, setTorPeriod] = useState<TorPeriod>({ kind: "days", days: 30 });
  // Rating and state cuts, applied to the fetched period rather than to the
  // query. Empty means "everything", which is why both default to empty rather
  // than to a full list — "no filter" and "all seven ticked" look the same on
  // screen and are not the same thing when the period changes underneath them.
  const [efFilter, setEfFilter] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  // Recompute the range when the user switches, so the poster date stamp is fresh.
  useEffect(() => { setNow(Date.now()); }, [mode, warnDays, torPeriod]);

  const warnRange = useMemo(() => daysBackRange(warnDays), [warnDays, now]);
  const torSpans = useMemo(() => periodRanges(torPeriod, new Date(now)), [torPeriod, now]);
  // The spans as one bracket, for date stamps and captions. "Every May" really
  // does run from the first May in the window to the last one, and saying so is
  // more use than printing ten separate brackets.
  //
  // Reduced rather than read off the ends: the cross-year spans arrive
  // newest-first, because the year list they are built from is, so taking
  // `[0]` and `[last]` printed the bracket backwards — "May 1 2026 → May 31
  // 2017".
  const torRange = useMemo(() => {
    const iso = new Date(now).toISOString();
    if (!torSpans.length) return { start: iso, end: iso };
    return torSpans.reduce(
      (acc, s) => ({
        start: s.start < acc.start ? s.start : acc.start,
        end: s.end > acc.end ? s.end : acc.end,
      }),
      { start: torSpans[0].start, end: torSpans[0].end },
    );
  }, [torSpans, now]);
  const torKey = torPeriod.kind === "days" ? `d${torPeriod.days}`
    : torPeriod.kind === "year" ? `y${torPeriod.year}`
    : torPeriod.kind === "month" ? `m${torPeriod.year}-${torPeriod.month}`
    : `ma${torPeriod.month}`;

  const warnings = useQuery({
    queryKey: ["hist-warnings", warnDays, now],
    queryFn: ({ signal }) => fetchWarnings(warnRange.start, warnRange.end, signal),
    staleTime: 5 * 60 * 1000, retry: 1,
  });
  const torQuery = useQuery({
    queryKey: ["hist-tornadoes", torKey, now],
    queryFn: ({ signal }) => fetchTornadoTracks(torSpans, signal),
    staleTime: 5 * 60 * 1000, retry: 1,
  });

  /*
   * The filter chips read the WHOLE period; everything else reads the cut.
   *
   * Keeping those two apart is the difference between a filter you can use and
   * one you have to fight. If the state list were recomputed against the rating
   * filter, ticking EF4 would change the number next to Kansas, and the only
   * way to find out what Kansas actually holds would be to untick everything.
   */
  const efCounts = torQuery.data?.counts ?? {};
  const stateCounts = useMemo(
    () => (torQuery.data ? countByState(torQuery.data) : {}),
    [torQuery.data],
  );
  const torFiltered = useMemo(
    () => (torQuery.data ? filterTornadoes(torQuery.data, { ef: efFilter, states: stateFilter }) : undefined),
    [torQuery.data, efFilter, stateFilter],
  );
  const tornadoes = {
    data: torFiltered,
    isLoading: torQuery.isLoading,
    isError: torQuery.isError,
  };
  const filtered = efFilter.length > 0 || stateFilter.length > 0;

  /*
   * Drop filter values the new period cannot satisfy.
   *
   * Without this, picking EF5 and then switching to thirty days leaves the map
   * empty and the EF5 chip gone — the row only renders ratings the period
   * actually holds — so there is nothing left to click to get back. Pruning
   * keeps as much of the intent as still applies and never strands anyone
   * behind a filter they cannot see.
   */
  useEffect(() => {
    if (!torQuery.data) return;
    setEfFilter((prev) => {
      const next = prev.filter((r) => (efCounts[r] ?? 0) > 0);
      return next.length === prev.length ? prev : next;
    });
    setStateFilter((prev) => {
      const next = prev.filter((s) => (stateCounts[s] ?? 0) > 0);
      return next.length === prev.length ? prev : next;
    });
    // Runs on each new result; the counts are derived from exactly that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [torQuery.data]);

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

  /**
   * The same recolour, for the interactive map.
   *
   * That map paints from each feature's `color` property, which the survey
   * parser stamps once from the shipped EF ramp when the fetch lands and never
   * touches again. So an admin's EF colour reached the poster, the legend and
   * the stat boxes while the interactive map sitting above all three kept
   * painting the shipped ramp — which is what "the tornado tracks don't ever
   * change" was: not the override failing to arrive, but the one map that
   * ignored it being the one you look at.
   */
  const torFeatures = useMemo(() => {
    const feats = tornadoes.data?.features ?? [];
    return feats.map((f) => {
      const colour = efHistoryColor(f.properties.ef);
      return colour === f.properties.color
        ? f
        : { ...f, properties: { ...f.properties, color: colour } };
    });
    // `palette` is the dependency that matters: it is what changes when a
    // colour is edited, and the features themselves have not moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tornadoes.data, palette]);

  const warnLegend: LegendRow[] = WARN_TIERS
    .filter(t => t.id !== "other")
    .map(t => ({ label: t.label, color: t.color, count: warnings.data?.counts[t.id] ?? 0 }))
    .filter(r => r.count > 0 || ["severe", "considerable", "destructive", "tornado"].includes(
      WARN_TIERS.find(t => t.label === r.label)!.id));

  const torLegend: LegendRow[] = EF_ORDER
    .map(ef => ({ label: ef, color: efHistoryColor(ef), count: tornadoes.data?.counts[ef] ?? 0 }))
    .filter(r => r.count > 0);

  /**
   * The breakdown, in the order the categories escalate.
   *
   * Warnings are proportional — they add up to the total — so each row carries
   * its count and gets a bar. Tornado ratings are too, so they do as well; the
   * human cost is not a proportion of anything and is shown beneath as its own
   * pair of readings rather than pretending to be a share.
   */
  const bankRows: BankRow[] = mode === "warnings"
    ? warnLegend.map((l) => ({ label: l.label, value: l.count.toLocaleString(), color: l.color, count: l.count }))
    : [
        ...torLegend.map((l) => ({ label: l.label, value: l.count.toLocaleString(), color: l.color, count: l.count })),
        ...(tornadoes.data
          ? [
              { label: "Fatalities", value: tornadoes.data.fatalities.toLocaleString(),
                color: tornadoes.data.fatalities > 0 ? "#ff5257" : ROYAL.dim },
              { label: "Injuries", value: tornadoes.data.injuries.toLocaleString(), color: "#eab308" },
            ]
          : []),
      ];

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

  const still = prefersReducedMotion();
  const active = mode === "warnings" ? warnings : tornadoes;
  const range = mode === "warnings" ? warnRange : torRange;
  const ranges = mode === "warnings" ? WARN_RANGES : TOR_RANGES;
  // One period for whichever tab is showing, so everything below — the stat
  // band's eyebrow, the animation key, the poster heading — reads from one
  // value rather than each working it out again from `mode`.
  const period: TorPeriod = mode === "warnings"
    ? { kind: "days", days: warnDays }
    : torPeriod;
  const spanLabel = mode === "warnings"
    ? (ranges.find((r) => r.days === warnDays)?.label ?? "")
    : periodLabel(torPeriod);
  const spanKey = mode === "warnings" ? `w${warnDays}`
    : `${torKey}|${efFilter.join(",")}|${stateFilter.join(",")}`;
  // A year the window only partly covers should say so rather than presenting
  // eight months as twelve.
  const clipped = mode === "tornadoes" && periodClipped(torPeriod, new Date(now));
  const partialSurvey = mode === "tornadoes" && periodPartialSurvey(torPeriod, new Date(now));

  return (
    <ModuleShell
      eyebrow="NWS · IEM · NOAA Damage Assessment Toolkit"
      title="Severe Weather History"
      subtitle="Warning history and surveyed tornado paths, live from NWS/IEM and the NOAA Damage Assessment Toolkit."
      actions={
        <button onClick={() => setNow(Date.now())}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}>
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      }
    >

      {/* ── what happened, in numbers ───────────────────────────────────── */}
      <SegmentedTabs
        segments={[
          { id: "warnings", label: "Warning history", badge: warnings.data?.total ?? "" },
          { id: "tornadoes", label: "Tornado history", badge: tornadoes.data?.total ?? "" },
        ] as const}
        value={mode}
        onChange={(v) => setMode(v as Mode)}
        layoutId="hist-mode"
        controls="hist-panel"
        label="History type"
      />

      <div id="hist-panel" className="space-y-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          <PeriodPicker
            spans={ranges}
            value={period}
            onChange={(p) => {
              if (mode === "warnings") { if (p.kind === "days") setWarnDays(p.days); }
              else setTorPeriod(p);
            }}
            archive={mode === "tornadoes"}
            layoutId={mode === "warnings" ? "hist-range-warn" : "hist-range-tor"}
            still={still}
          />
          <span className="ml-auto text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>
            {active.isLoading
              ? <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> loading…</span>
              : active.isError
                ? <span className="flex items-center gap-1.5" style={{ color: "#ff8a8a" }}><AlertTriangle className="w-3 h-3" /> source unavailable</span>
                : `${fmt(range.start)} → ${fmt(range.end)}`}
          </span>
        </div>

        {mode === "tornadoes" && torQuery.data && torQuery.data.features.length > 0 && (
          <TornadoFilters
            efCounts={efCounts}
            stateCounts={stateCounts}
            stateNames={US_STATE_NAMES}
            ef={efFilter}
            states={stateFilter}
            onEf={setEfFilter}
            onStates={setStateFilter}
            still={still}
          />
        )}

        {mode === "tornadoes" && partialSurvey && (
          <p className="text-[11px] leading-relaxed rounded-xl px-3 py-2"
             style={{ background: ROYAL.goldFaint, border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.dim }}>
            <strong style={{ color: ROYAL.gold }}>Partial survey.</strong>{" "}
            This period reaches years before {TOR_FULL_SURVEY_YEAR}, when the Damage Assessment
            Toolkit was still being adopted — 2016 holds 503 surveyed tracks against 2024's 1,692.
            Those are real tornadoes, but a smaller number in an earlier year means a smaller survey,
            not a quieter season. Compare {TOR_FULL_SURVEY_YEAR} onward for like with like.
          </p>
        )}

        {/* the headline band */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${mode}-${spanKey}`}
            initial={still ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: still ? 0.15 : 0.3, ease: EASE }}
          >
            <StatBank
              still={still}
              // The cut belongs in the eyebrow, not a footnote: a total of 41
              // beside the heading "10 years" is alarming until you remember
              // you ticked EF4.
              eyebrow={`${spanLabel}${clipped ? " (from " + fmt(torRange.start) + ")" : ""} · ${
                mode === "warnings" ? "warnings"
                  : filtered ? [efFilter.join("/"), stateFilter.join("/")].filter(Boolean).join(" · ")
                  : "tornadoes"
              }`}
              total={(mode === "warnings" ? warnings.data?.total : tornadoes.data?.total) ?? 0}
              unit={mode === "warnings" ? "warnings issued" : "tornado paths"}
              caption={`${fmt(range.start)} → ${fmt(range.end)}`}
              rows={bankRows}
            />
          </motion.div>
        </AnimatePresence>

        {/* ── the map ───────────────────────────────────────────────────── */}
        <div className="relative rounded-2xl overflow-hidden"
             style={{ border: `1px solid ${ROYAL.hairline}`, boxShadow: "0 24px 56px -40px rgba(0,0,0,1)" }}>
          <WeatherHistoryMap
            mode={mode}
            warnings={warnings.data?.features ?? []}
            tornadoes={torFeatures}
            height={520}
          />
          <div className="absolute top-2 left-2 z-10 px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-[0.2em] pointer-events-none"
               style={{ background: "rgba(6,6,14,0.78)", color: ROYAL.gold, border: `1px solid ${ROYAL.hairline}` }}>
            {mode === "warnings" ? "Warnings" : "Surveyed tornado paths"}
          </div>
          <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap gap-x-3 gap-y-1 px-2.5 py-1.5 rounded-xl pointer-events-none"
               style={{ background: "rgba(6,6,14,0.78)", border: `1px solid ${ROYAL.hairline}`, backdropFilter: "blur(8px)" }}>
            {(mode === "warnings" ? warnLegend : torLegend).map((l) => (
              <span key={l.label} className="flex items-center gap-1.5 text-[10.5px]">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
                <span style={{ color: ROYAL.dim }}>{l.label}</span>
                <span className="font-bold tabular-nums" style={{ color: ROYAL.text }}>{l.count}</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── the poster ────────────────────────────────────────────────── */}
        <Panel
          title="Shareable map"
          aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>download or share as an image</span>}
          defer
        >
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
              title={`TORNADO PATHS - ${periodLabel(torPeriod).toUpperCase()}`}
              // The poster is the thing that leaves the site, so the cut has to
              // travel with it. A shared image reading "10 years | 41 tornado
              // paths" with no mention of EF4 is a wrong fact in someone's feed.
              subtitle={`${fmt(torRange.start)} - ${fmt(torRange.end)}  |  ${tornadoes.data?.total ?? 0} tornado paths${
                filtered ? `  |  ${[efFilter.join("/"), stateFilter.join("/")].filter(Boolean).join(", ")}` : ""
              }`}
              updatedLabel={updatedLabel}
              lines={torLines}
              stats={torStats}
              legend={torLegend}
              legendTitle="EF Rating"
              fileBase="sswx-tornado-paths"
              loading={tornadoes.isLoading}
            />
          )}
        </Panel>
      </div>

      {/* Source notes */}
      <div className="rounded-2xl p-4 text-[11px] leading-relaxed space-y-1.5"
           style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
        {mode === "warnings" ? (
          <p>
            Warnings from the <strong style={{ color: ROYAL.text }}>Iowa Environmental Mesonet</strong> storm-based warning archive.
            Severity uses the official NWS impact-based-warning tags — a Severe Thunderstorm Warning is upgraded to
            <em> Considerable</em> or <em>Destructive</em> by its damage threat tag, and Tornado Warnings are flagged
            <em> PDS</em> or <em>Tornado Emergency</em> where issued.
          </p>
        ) : (
          <p>
            Tornado paths from the <strong style={{ color: ROYAL.text }}>NOAA Damage Assessment Toolkit</strong> — these are
            <strong style={{ color: ROYAL.text }}> survey-driven</strong>, so a tornado appears here as soon as the local NWS office
            publishes its damage survey. Very recent events may not be surveyed yet, and older years have sparser coverage.
          </p>
        )}
        <p style={{ opacity: 0.75 }}>Always defer to official NWS products. Counts refresh when you change the range or tap Refresh.</p>
      </div>
    </ModuleShell>
  );
}
