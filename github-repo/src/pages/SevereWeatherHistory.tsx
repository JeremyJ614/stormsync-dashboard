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
import {
  fetchWarnings, fetchTornadoTracks, daysBackRange,
  WARN_TIERS, EF_ORDER, efHistoryColor,
} from "../lib/severeHistoryData";

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
const TOR_RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/** One headline figure. */
function Stat({ label, value, tone, i, still }: {
  label: string; value: string; tone?: string; i: number; still: boolean;
}) {
  return (
    <motion.div
      className="px-4 py-3"
      style={{ background: "rgba(8,8,18,0.72)" }}
      initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: still ? 0.2 : 0.38, delay: still ? 0 : 0.06 * i, ease: EASE }}
    >
      <div className="text-[9px] uppercase tracking-[0.24em]" style={{ color: ROYAL.dim }}>{label}</div>
      <div className="text-[26px] font-black tabular-nums leading-none mt-1"
           style={{ color: tone ?? ROYAL.text, fontFamily: HEADING }}>{value}</div>
    </motion.div>
  );
}

/**
 * What the period is made of, as one bar.
 *
 * A legend says which categories exist; this says how much of the period each
 * one IS. Thirty tornado warnings and one tornado emergency read very
 * differently from fifteen and sixteen, and a row of equal-sized swatches
 * cannot tell them apart.
 */
function Composition({ rows, still }: { rows: LegendRow[]; still: boolean }) {
  const total = rows.reduce((n, r) => n + r.count, 0);
  if (!total) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        {rows.filter((r) => r.count > 0).map((r, i) => (
          <motion.span
            key={r.label}
            title={`${r.label}: ${r.count}`}
            style={{ background: r.color }}
            initial={still ? { flexGrow: r.count } : { flexGrow: 0 }}
            animate={{ flexGrow: r.count }}
            transition={still ? { duration: 0 } : { duration: 0.6, delay: 0.1 + i * 0.06, ease: EASE }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {rows.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5 text-[11.5px]">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: l.color }} />
            <span style={{ color: ROYAL.dim }}>{l.label}</span>
            <span className="font-bold tabular-nums" style={{ color: ROYAL.text }}>{l.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const days = mode === "warnings" ? warnDays : torDays;
  const setDays = mode === "warnings" ? setWarnDays : setTorDays;

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
          <span className="text-[10px] uppercase tracking-[0.24em] mr-1" style={{ color: ROYAL.dim }}>Period</span>
          {ranges.map((r) => {
            const on = days === r.days;
            return (
              <button key={r.days} onClick={() => setDays(r.days)}
                className="relative px-3 py-1.5 rounded-lg text-[11.5px] font-bold transition-colors"
                style={{ color: on ? "#120f1e" : ROYAL.dim }}>
                {on && (
                  <motion.span aria-hidden layoutId="hist-range" className="absolute inset-0 rounded-lg"
                    transition={still ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
                    style={{ background: ROYAL.gold }} />
                )}
                <span className="relative">{r.label}</span>
              </button>
            );
          })}
          <span className="ml-auto text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>
            {active.isLoading
              ? <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> loading…</span>
              : active.isError
                ? <span className="flex items-center gap-1.5" style={{ color: "#ff8a8a" }}><AlertTriangle className="w-3 h-3" /> source unavailable</span>
                : `${fmt(range.start)} → ${fmt(range.end)}`}
          </span>
        </div>

        {/* the headline band */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={`${mode}-${days}`}
            className="relative rounded-2xl overflow-hidden"
            initial={still ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: still ? 0.15 : 0.3, ease: EASE }}
            style={{
              border: `1px solid ${ROYAL.hairline}`,
              background: `radial-gradient(70% 130% at 8% -20%, rgba(217,183,117,0.13), transparent 60%),`
                + `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
            }}
          >
            <span aria-hidden className="absolute inset-x-0 top-0 h-px"
                  style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px" style={{ background: ROYAL.hairline }}>
              {mode === "warnings" ? (
                <>
                  <Stat i={0} still={still} label="Warnings issued" value={String(warnings.data?.total ?? 0)} tone={ROYAL.gold} />
                  <Stat i={1} still={still} label="Tornado warnings" value={warnStats[0]?.value ?? "0"} tone="#ff5257" />
                  <Stat i={2} still={still} label="Severe thunderstorm" value={warnStats[1]?.value ?? "0"} tone="#c3d117" />
                </>
              ) : (
                <>
                  <Stat i={0} still={still} label="Tornado paths" value={String(tornadoes.data?.total ?? 0)} tone={ROYAL.gold} />
                  <Stat i={1} still={still} label="Strongest" value={tornadoes.data?.highestEf ?? "—"}
                        tone={tornadoes.data ? efHistoryColor(tornadoes.data.highestEf) : undefined} />
                  <Stat i={2} still={still} label="Fatalities · injuries"
                        value={tornadoes.data ? `${tornadoes.data.fatalities} · ${tornadoes.data.injuries}` : "—"}
                        tone={tornadoes.data && tornadoes.data.fatalities > 0 ? "#ff5257" : undefined} />
                </>
              )}
            </div>
            <div className="px-4 py-3.5" style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
              <Composition rows={mode === "warnings" ? warnLegend : torLegend} still={still} />
            </div>
          </motion.section>
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
