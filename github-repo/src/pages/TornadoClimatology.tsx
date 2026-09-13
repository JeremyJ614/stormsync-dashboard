/**
 * Tornado Climatology — rebuilt.
 *
 * WHAT WAS HERE
 * Twelve tabs, each one a recharts default with a sentence under it: annual
 * trend, monthly, by region, YTD, density, hotspots, tracks, states, path size,
 * casualties, SPC maps, reference. Every fact the dataset holds was on the page
 * and almost none of them were next to the fact that explains them. Twelve tabs
 * is not depth; it is a filing cabinet, and a filing cabinet makes the reader do
 * the analysis.
 *
 * WHAT IT IS NOW
 * Four tabs, each of which answers a question somebody actually arrives with:
 *
 *   WHEN     the season, as a ridgeline ordered by when each region peaks, so
 *            the march of the season north and west IS the reading order.
 *   WHERE    one map with three layers rather than three tabs with one map
 *            each, and the state table beside it instead of a tab away.
 *   RECORD   counts per year and deaths per year on one shared span. Apart,
 *            they are two charts. Together they are the argument: the count
 *            rises because detection improved, and the deaths fall because
 *            warning did — and the two lines cross in the 1970s.
 *   ANATOMY  what a tornado is, dimensionally: path length, path width, the EF
 *            scale, and where to go for more.
 *
 * The page also drops recharts entirely. Every chart here is bars, a histogram
 * or a filled curve, all of which are a few lines of SVG — and recharts is the
 * 370 kB chunk this route was pulling in to draw them.
 *
 * ONE HONEST NOTE THE OLD PAGE BURIED
 * The dataset ends in 2023, because that is where SPC's cleaned storm database
 * ends; the current year is not in it and never was. That now appears in the
 * header rather than being inferable from an axis label.
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tornado, ExternalLink, Database, Calendar, Map as MapIcon,
  History, Ruler, Flame, Route, Layers, Skull,
} from "lucide-react";
import type { Location } from "../hooks/useLocation";
import { ModuleShell } from "../components/ModuleShell";
import { ClimoMap, heatLegend, EF_COLOR } from "../components/climo/ClimoMap";
import { RidgeStack, type RidgeRow } from "../components/climo/SeasonRidge";
import { YearBars } from "../components/climo/YearBars";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

interface Props { location: Location }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface ClimoData {
  meta: { minYear: number; maxYear: number; numYears: number; totalTornadoes: number; totalDeaths: number; totalInjuries: number; avgAnnual: number };
  byYear: [number, number][];
  monthlyAvg: number[];
  byState: [string, number, number, number][];
  regionMonth: Record<string, number[]>;
  pathLenBins: [string, number][];
  pathWidBins: [string, number][];
  casualtiesByYear: [number, number, number][];
  deadliest: [string, string, number, number][];
  densityGrid: [number, number, number][];
  densityGridEF2: [number, number, number][];
  tracks: [number, number, number, number, number, number][];
  cumAvgByMonth: number[];
}

type TabId = "when" | "where" | "record" | "anatomy";
const TABS: { id: TabId; label: string; icon: typeof Calendar }[] = [
  { id: "when", label: "When", icon: Calendar },
  { id: "where", label: "Where", icon: MapIcon },
  { id: "record", label: "The record", icon: History },
  { id: "anatomy", label: "Anatomy", icon: Ruler },
];

type LayerId = "all" | "sig" | "tracks";
const LAYERS: { id: LayerId; label: string; icon: typeof MapIcon; note: string }[] = [
  { id: "all", label: "All tornadoes", icon: MapIcon,
    note: "Touchdown points binned into 0.25° (~17 mi) cells and smoothed into a continuous field. Tornado Alley and Dixie Alley separate cleanly." },
  { id: "sig", label: "EF2 and up", icon: Flame,
    note: "The same field restricted to strong and violent tornadoes — where the events that actually level buildings concentrate." },
  { id: "tracks", label: "Tracks", icon: Route,
    note: "Every EF2+ path in the database, start to end. Violent tornadoes are drawn last so they are not buried under the EF2 mass." },
];

const REGION_COLORS: Record<string, string> = {
  "Great Plains": "#f97316", "Midwest": "#22c55e", "South": "#ef4444",
  "Southeast": "#a855f7", "Northeast": "#38bdf8", "West": "#fbbf24",
};

const SPC_MAPS = [
  { title: "State average tornadoes, 1996–2025", url: "https://www.spc.noaa.gov/wcm/ustormaps/1996-2025-stateavgtornadoes.png" },
  { title: "State average fatalities, 1996–2025", url: "https://www.spc.noaa.gov/wcm/ustormaps/1996-2025-stateavgfatals.png" },
  { title: "U.S. annual tornado trend", url: "https://www.spc.noaa.gov/wcm/torngraph-big.png" },
  { title: "U.S. tornado tracks", url: "https://www.spc.noaa.gov/wcm/maps.png" },
];

const EF_SCALE = [
  { scale: "EF0", winds: "65–85 mph", color: EF_COLOR[0], pct: 53, desc: "Shingles, gutters, branches" },
  { scale: "EF1", winds: "86–110 mph", color: EF_COLOR[1], pct: 32, desc: "Roofs stripped, mobile homes overturned" },
  { scale: "EF2", winds: "111–135 mph", color: EF_COLOR[2], pct: 11, desc: "Roofs off frame houses, large trees snapped" },
  { scale: "EF3", winds: "136–165 mph", color: EF_COLOR[3], pct: 3, desc: "Storeys destroyed, trains overturned" },
  { scale: "EF4", winds: "166–200 mph", color: EF_COLOR[4], pct: 0.7, desc: "Well-built houses levelled" },
  { scale: "EF5", winds: "over 200 mph", color: EF_COLOR[5], pct: 0.1, desc: "Houses swept from their foundations" },
];

const NOTABLE = [
  { date: "25–28 Apr 2011", name: "Super Outbreak", tornadoes: 360, ef5: 4, deaths: 324, note: "The largest outbreak in U.S. history; Tuscaloosa EF4 and Hackleburg EF5 in the same afternoon." },
  { date: "3–4 Apr 1974", name: "1974 Super Outbreak", tornadoes: 148, ef5: 7, deaths: 335, note: "Held the single-day record for thirty-seven years. Seven F5s in eighteen hours." },
  { date: "22 May 2011", name: "Joplin, Missouri", tornadoes: 1, ef5: 1, deaths: 158, note: "One tornado. The deadliest single U.S. tornado since 1947." },
  { date: "3 May 1999", name: "Bridge Creek–Moore", tornadoes: 74, ef5: 1, deaths: 50, note: "318 mph measured by mobile Doppler — the highest wind speed ever recorded on Earth." },
  { date: "10–11 Dec 2021", name: "Quad-State Outbreak", tornadoes: 71, ef5: 0, deaths: 89, note: "December. The Mayfield track ran 165 miles continuous, which December is not supposed to do." },
];

const TOOLS = [
  { label: "SPC Data Viewer", url: "https://www.spc.noaa.gov/climo/dataviewer/?hl=en-US", desc: "Every U.S. tornado, hail and wind report since 1950." },
  { label: "SPC Outbreaks", url: "https://www.spc.noaa.gov/exper/outbreaks/", desc: "Every tornado day ranked by an objective severity index." },
  { label: "Environment Browser", url: "https://www.spc.noaa.gov/exper/envbrowser/", desc: "Composite CAPE, shear and STP for historical tornadoes." },
  { label: "Tornado Archive", url: "https://tornadoarchive.com/explorer/2.3.1/", desc: "Global tornado map with a filterable timeline." },
  { label: "USA Today Archive", url: "https://data.usatoday.com/tornado-archive/", desc: "Search U.S. tornadoes by ZIP, with narratives." },
];

/**
 * F or EF, by the year it happened.
 *
 * The database stores one magnitude column 0–5 for its whole span, but the
 * scale changed underneath it: everything before 1 February 2007 was rated on
 * Fujita's original scale and everything after on the Enhanced Fujita scale.
 * Printing "EF5" against a 1953 tornado is a small thing to get wrong and
 * exactly the kind of small thing a climatology module exists to get right.
 */
const EF_ERA = 2007;
function ratingLabel(mag: number, year: number): string {
  if (mag < 0) return year < EF_ERA ? "F?" : "EF?";
  return `${year < EF_ERA ? "F" : "EF"}${mag}`;
}

/** "1953-06-08" → "8 Jun 1953". Falls back to the raw string if it is not one. */
function prettyDate(iso: string): string {
  const mt = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!mt) return iso;
  return `${Number(mt[3])} ${MONTHS[Number(mt[2]) - 1]} ${mt[1]}`;
}

const card: React.CSSProperties = {
  background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}`, borderRadius: 16,
};

export default function TornadoClimatology({ location }: Props) {
  const [tab, setTab] = useState<TabId>("when");
  const [layer, setLayer] = useState<LayerId>("all");
  const [minEF, setMinEF] = useState(3);
  const [sinceYear, setSinceYear] = useState(1950);
  const still = prefersReducedMotion();

  const { data, isLoading, error } = useQuery<ClimoData>({
    queryKey: ["tornado-climo"],
    queryFn: async () => {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const r = await fetch(`${base}/data/tornadoClimo.json`);
      if (!r.ok) throw new Error("load failed");
      return r.json();
    },
    staleTime: Infinity,
  });

  const m = data?.meta;
  const monthIdx = new Date().getMonth();
  const peakYear = useMemo(
    () => (data ? data.byYear.reduce((a, b) => (b[1] > a[1] ? b : a)) : null), [data]);

  /**
   * The ridge rows. The national average goes first as its own row in
   * champagne — it is the sum the regions decompose, and having it in the same
   * idiom rather than as a separate bar chart is what lets you see that the
   * national peak is the Plains peak with the Southeast's shoulder on it.
   */
  const rows = useMemo<RidgeRow[]>(() => {
    if (!data) return [];
    /*
     * `regionMonth` holds SEVENTY-FOUR-YEAR TOTALS while `monthlyAvg` holds a
     * per-year average, and the two were plotted on the same page in the old
     * module without anything to give it away. Here the national row sits
     * directly above the regional ones, so the mismatch would have been an
     * outright lie — the Plains would have read 8,418 tornadoes in a May
     * against a national average of 206. Dividing by the number of years puts
     * every row in the same unit, and the regions then sum to the national
     * curve month for month, which is the check that it is right.
     */
    const ny = data.meta.numYears || 1;
    return Object.entries(data.regionMonth).map(([reg, totals]) => {
      const vals = totals.map((v) => v / ny);
      let pm = 0;
      vals.forEach((v, i) => { if (v > vals[pm]) pm = i; });
      return {
        key: reg, label: reg, vals, color: REGION_COLORS[reg] ?? ROYAL.iris,
        peak: vals[pm], peakMonth: pm,
      };
    });
  }, [data]);

  const national = useMemo<RidgeRow[]>(() => {
    if (!data) return [];
    let pm = 0;
    data.monthlyAvg.forEach((v, i) => { if (v > data.monthlyAvg[pm]) pm = i; });
    return [{
      key: "us", label: "United States", vals: data.monthlyAvg,
      color: ROYAL.gold, peak: data.monthlyAvg[pm], peakMonth: pm,
    }];
  }, [data]);

  const ytdAvg = data ? data.cumAvgByMonth[monthIdx] : 0;
  const gridForLayer = layer === "sig" ? data?.densityGridEF2 : data?.densityGrid;
  const layerDef = LAYERS.find((l) => l.id === layer)!;

  return (
    <ModuleShell
      eyebrow="SPC · NOAA storm database"
      title="Tornado Climatology"
      subtitle={`Seventy-four years of U.S. tornadoes — when the season runs, where it runs, and what has changed. ${location.name}.`}
      wide
      status={
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { k: "Average year", v: m ? m.avgAnnual.toLocaleString() : "—", s: "tornadoes", c: ROYAL.gold },
            { k: "By end of " + MONTHS[monthIdx], v: ytdAvg ? Math.round(ytdAvg).toLocaleString() : "—", s: "in an average year", c: ROYAL.iris },
            { k: "Busiest year", v: peakYear ? String(peakYear[0]) : "—", s: peakYear ? `${peakYear[1].toLocaleString()} tornadoes` : "", c: "#f97316" },
            { k: "Deaths on record", v: m ? m.totalDeaths.toLocaleString() : "—", s: m ? `${m.minYear}–${m.maxYear}` : "", c: "#ff5257" },
          ].map((s) => (
            <div key={s.k} className="px-3 py-2.5" style={card}>
              <div className="text-[9px] uppercase tracking-[0.18em] truncate" style={{ color: ROYAL.dim }}>{s.k}</div>
              <div className="text-[21px] leading-none font-bold tabular-nums mt-1.5"
                   style={{ fontFamily: HEADING, color: s.c }}>{s.v}</div>
              <div className="text-[10px] mt-1 truncate" style={{ color: ROYAL.dim }}>{s.s}</div>
            </div>
          ))}
        </div>
      }
    >
      {/* ── tabs ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3 py-2 rounded-xl text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
              style={{
                background: on ? ROYAL.goldFaint : "transparent",
                border: `1px solid ${on ? ROYAL.goldSoft : ROYAL.hairline}`,
                color: on ? ROYAL.gold : ROYAL.dim,
              }}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="px-4 py-6 text-sm text-center" style={{ ...card, color: "#ff8a8e" }}>
          The tornado dataset could not be loaded.
        </div>
      )}
      {isLoading && (
        <div className="grid place-items-center py-20" style={card}>
          <div className="w-7 h-7 rounded-full animate-spin"
               style={{ border: `2px solid ${ROYAL.hairline}`, borderTopColor: ROYAL.gold }} />
        </div>
      )}

      {data && m && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: still ? 0.2 : 0.35, ease: EASE }}
            className="space-y-4"
          >
            {/* ══ WHEN ═══════════════════════════════════════════════════════ */}
            {tab === "when" && (
              <>
                <section className="px-4 py-4" style={card}>
                  <Head title="The season, region by region"
                        note="The national curve, then the regions that make it up, ordered by the month each one peaks — so reading down the page is watching the season travel. Each curve is scaled to its own peak; the figure on the right is that peak, in tornadoes per month in an average year." />
                  <div className="mt-3">
                    <RidgeStack rows={national} todayMonth={monthIdx} still={still} axis={false} />
                  </div>
                  <div className="my-2 h-px" style={{ background: ROYAL.hairline }} />
                  <RidgeStack rows={rows} todayMonth={monthIdx} still={still} unit="per mo" />
                </section>

                <section className="px-4 py-4" style={card}>
                  <Head title="Where an average year stands today" />
                  <p className="text-[13px] leading-relaxed mt-2" style={{ color: ROYAL.dim }}>
                    By the end of <strong style={{ color: ROYAL.text }}>{MONTHS[monthIdx]}</strong>, a
                    climatologically average year has produced{" "}
                    <strong style={{ color: ROYAL.gold }}>{Math.round(ytdAvg).toLocaleString()}</strong> tornadoes
                    of the roughly <strong style={{ color: ROYAL.text }}>{m.avgAnnual.toLocaleString()}</strong> it
                    will finish with — {Math.round((ytdAvg / m.avgAnnual) * 100)}% of the year's total.
                  </p>
                  <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "rgba(204,204,255,0.10)" }}>
                    <motion.span className="block h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${ROYAL.gold}, #f97316)` }}
                      initial={still ? false : { width: 0 }}
                      animate={{ width: `${Math.round((ytdAvg / m.avgAnnual) * 100)}%` }}
                      transition={still ? { duration: 0 } : { duration: 0.7, ease: EASE }} />
                  </div>
                  <div className="flex justify-between text-[9.5px] mt-1.5" style={{ color: ROYAL.dim }}>
                    <span>1 Jan</span><span>31 Dec</span>
                  </div>
                </section>
              </>
            )}

            {/* ══ WHERE ══════════════════════════════════════════════════════ */}
            {tab === "where" && (
              <>
                <section className="px-4 py-4" style={card}>
                  <div className="flex gap-1.5 flex-wrap mb-3">
                    {LAYERS.map((l) => {
                      const Icon = l.icon;
                      const on = layer === l.id;
                      return (
                        <button key={l.id} onClick={() => setLayer(l.id)}
                          className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold flex items-center gap-1.5 transition-colors"
                          style={{
                            background: on ? ROYAL.goldFaint : "transparent",
                            border: `1px solid ${on ? ROYAL.goldSoft : ROYAL.hairline}`,
                            color: on ? ROYAL.gold : ROYAL.dim,
                          }}>
                          <Icon className="w-3.5 h-3.5" /> {l.label}
                        </button>
                      );
                    })}
                    {layer === "tracks" && (
                      <div className="flex gap-1.5 items-center ml-auto flex-wrap">
                        {[2, 3, 4, 5].map((ef) => (
                          <button key={ef} onClick={() => setMinEF(ef)}
                            className="px-2 py-1 rounded text-[11px] font-bold"
                            style={{
                              background: minEF === ef ? `${EF_COLOR[ef]}22` : "transparent",
                              border: `1px solid ${minEF === ef ? EF_COLOR[ef] : ROYAL.hairline}`,
                              color: minEF === ef ? EF_COLOR[ef] : ROYAL.dim,
                            }}>
                            EF{ef}{ef < 5 ? "+" : ""}
                          </button>
                        ))}
                        <select value={sinceYear} onChange={(e) => setSinceYear(+e.target.value)}
                          className="rounded px-2 py-1 text-[11px] outline-none"
                          style={{ background: ROYAL.ink2, border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}>
                          {[1950, 1980, 2000, 2010, 2020].map((y) => <option key={y} value={y}>since {y}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="relative rounded-xl overflow-hidden">
                    <ClimoMap
                      mode={layer === "tracks" ? "tracks" : "grid"}
                      grid={gridForLayer}
                      tracks={data.tracks}
                      minEF={minEF}
                      sinceYear={sinceYear}
                      height={400}
                    />
                    <div className="absolute bottom-2 right-2 rounded-lg px-2.5 py-2 space-y-1 pointer-events-none"
                         style={{ zIndex: 10, background: "rgba(7,7,19,0.86)", border: `1px solid ${ROYAL.hairline}` }}>
                      <div className="text-[8.5px] uppercase tracking-[0.2em] mb-1" style={{ color: ROYAL.dim }}>
                        {layer === "tracks" ? "EF rating" : layer === "sig" ? "EF2+ per cell" : "Tornadoes per cell"}
                      </div>
                      {layer === "tracks"
                        ? [2, 3, 4, 5].map((ef) => (
                            <div key={ef} className="flex items-center gap-2">
                              <span className="w-3.5 h-[3px] rounded-sm" style={{ background: EF_COLOR[ef] }} />
                              <span className="text-[10px]" style={{ color: ROYAL.text }}>EF{ef}</span>
                            </div>
                          ))
                        : heatLegend(Math.max(...(gridForLayer ?? []).map((g) => g[2]))).map((l) => (
                            <div key={l.label} className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
                              <span className="text-[10px]" style={{ color: ROYAL.text }}>{l.label}</span>
                            </div>
                          ))}
                    </div>
                  </div>
                  <p className="text-[11.5px] leading-relaxed mt-2.5" style={{ color: ROYAL.dim }}>{layerDef.note}</p>
                </section>

                <section className="px-4 py-4" style={card}>
                  <Head title="By state"
                        note={`Ranked by total tornadoes, ${m.minYear}–${m.maxYear}. The bar is the state's share of the busiest state's count; the figures beside it are the violent ones and the deaths.`} />
                  <div className="mt-3 space-y-1">
                    {data.byState.slice(0, 20).map(([st, c, v, d], i) => {
                      const top = data.byState[0][1];
                      return (
                        <div key={st} className="grid items-center gap-2"
                             style={{ gridTemplateColumns: "18px 34px 1fr 46px 44px" }}>
                          <span className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>{i + 1}</span>
                          <span className="text-[12px] font-bold" style={{ color: ROYAL.text }}>{st}</span>
                          <span className="relative h-[18px] rounded-md overflow-hidden"
                                style={{ background: "rgba(204,204,255,0.07)" }}>
                            <motion.span className="absolute inset-y-0 left-0 rounded-md"
                              style={{ background: `linear-gradient(90deg, rgba(217,183,117,0.55), rgba(249,115,22,0.55))` }}
                              initial={still ? false : { width: 0 }}
                              animate={{ width: `${(c / top) * 100}%` }}
                              transition={still ? { duration: 0 } : { duration: 0.6, delay: Math.min(i * 0.02, 0.4), ease: EASE }} />
                            <span className="absolute left-2 inset-y-0 flex items-center text-[10.5px] tabular-nums font-semibold"
                                  style={{ color: ROYAL.text }}>{c.toLocaleString()}</span>
                          </span>
                          <span className="text-[10.5px] tabular-nums text-right" style={{ color: "#f97316" }}>{v.toLocaleString()}</span>
                          <span className="text-[10.5px] tabular-nums text-right" style={{ color: "#ff8a8e" }}>{d.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid gap-2 mt-2 text-[9px] uppercase tracking-[0.16em]"
                       style={{ gridTemplateColumns: "18px 34px 1fr 46px 44px", color: ROYAL.dim }}>
                    <span /><span /><span>total</span>
                    <span className="text-right">EF3+</span><span className="text-right">deaths</span>
                  </div>
                </section>
              </>
            )}

            {/* ══ THE RECORD ═════════════════════════════════════════════════ */}
            {tab === "record" && (
              <>
                <section className="px-4 py-4" style={card}>
                  <Head title="Seventy-four years, twice"
                        note="The same span, drawn twice. It is the pair that says something neither half can say alone." />
                  <div className="mt-4 space-y-4">
                    <YearBars
                      rows={data.byYear.map(([year, value]) => ({ year, value }))}
                      color={ROYAL.iris} label="Tornadoes reported" unit="tornadoes"
                      mean={m.avgAnnual} still={still} height={96}
                    />
                    <YearBars
                      rows={data.casualtiesByYear.map(([year, value]) => ({ year, value }))}
                      color="#ff5257" label="Deaths" unit="deaths"
                      still={still} height={80} delay={0.12}
                    />
                  </div>
                  <p className="text-[12px] leading-relaxed mt-4" style={{ color: ROYAL.dim }}>
                    Reports climb and deaths fall, and the reason is not that tornadoes became gentler. Doppler radar,
                    spotter networks and a national warning system arrived across the same decades — and the same
                    period is when everything smaller than an EF1 started being <em>found</em> at all. The violent end
                    of the scale, which was always counted because it always left evidence, is close to flat.
                  </p>
                </section>

                <section className="px-4 py-4" style={card}>
                  <Head title="Deadliest single tornadoes on record" icon={Skull}
                        note="Ratings are on the scale in force at the time: F before February 2007, EF after." />
                  <div className="mt-3 space-y-1.5">
                    {data.deadliest.map(([date, st, fat, mag], i) => {
                      const yr = Number(date.slice(0, 4)) || m.maxYear;
                      return (
                        <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                             style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 tabular-nums"
                                style={{ background: `${EF_COLOR[mag] ?? "#666"}22`, color: EF_COLOR[mag] ?? ROYAL.dim }}>
                            {ratingLabel(mag, yr)}
                          </span>
                          <span className="text-[12.5px]" style={{ color: ROYAL.text }}>{prettyDate(date)}</span>
                          <span className="text-[11px]" style={{ color: ROYAL.dim }}>{st}</span>
                          <span className="ml-auto text-[12.5px] font-bold tabular-nums" style={{ color: "#ff8a8e" }}>
                            {fat} deaths
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="px-4 py-4" style={card}>
                  <Head title="The days everybody remembers" />
                  <div className="mt-3 space-y-2">
                    {NOTABLE.map((o) => (
                      <div key={o.date} className="px-3 py-2.5 rounded-lg"
                           style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            <Tornado className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.gold }} />
                            <span className="text-[13px] font-semibold truncate" style={{ color: ROYAL.text }}>{o.name}</span>
                            <span className="text-[10.5px] shrink-0" style={{ color: ROYAL.dim }}>{o.date}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10.5px] tabular-nums shrink-0">
                            <span style={{ color: ROYAL.dim }}>{o.tornadoes} tornadoes</span>
                            {o.ef5 > 0 && <span style={{ color: EF_COLOR[5] }}>{o.ef5} × EF5</span>}
                            <span style={{ color: "#ff8a8e" }}>{o.deaths} deaths</span>
                          </div>
                        </div>
                        <p className="text-[11.5px] leading-relaxed mt-1" style={{ color: ROYAL.dim }}>{o.note}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* ══ ANATOMY ════════════════════════════════════════════════════ */}
            {tab === "anatomy" && (
              <>
                <section className="px-4 py-4" style={card}>
                  <Head title="How big is a tornado, actually"
                        note="Both distributions run the same way, and it is the shape a newcomer never expects: almost all of them are small, and almost all of the damage is done by the ones that are not." />
                  <div className="grid md:grid-cols-2 gap-5 mt-4">
                    <Histogram title="Path length" sub="miles" bins={data.pathLenBins} color={ROYAL.gold} still={still} />
                    <Histogram title="Path width" sub="yards" bins={data.pathWidBins} color="#a855f7" still={still} />
                  </div>
                </section>

                <section className="px-4 py-4" style={card}>
                  <Head title="The Enhanced Fujita scale"
                        note="A damage scale, not a wind scale: the rating is assigned after the fact from what was destroyed, and the wind range is what that damage implies. In force since February 2007; everything before that was rated on Fujita's original scale." />
                  <div className="mt-3 space-y-2">
                    {EF_SCALE.map((e, i) => (
                      <div key={e.scale} className="grid items-center gap-2.5"
                           style={{ gridTemplateColumns: "34px 74px 1fr 38px" }}>
                        <span className="text-[12px] font-bold" style={{ color: e.color }}>{e.scale}</span>
                        <span className="text-[10.5px]" style={{ color: ROYAL.dim }}>{e.winds}</span>
                        <span className="relative h-[16px] rounded-md overflow-hidden"
                              style={{ background: "rgba(204,204,255,0.07)" }}>
                          <motion.span className="absolute inset-y-0 left-0 rounded-md" style={{ background: e.color }}
                            initial={still ? false : { width: 0 }}
                            animate={{ width: `${Math.max(1.5, e.pct)}%` }}
                            transition={still ? { duration: 0 } : { duration: 0.6, delay: i * 0.05, ease: EASE }} />
                        </span>
                        <span className="text-[10.5px] tabular-nums text-right" style={{ color: ROYAL.dim }}>{e.pct}%</span>
                        <span className="col-span-4 text-[10.5px] -mt-1 pl-[34px]" style={{ color: ROYAL.dim }}>{e.desc}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="px-4 py-4" style={card}>
                  <Head title="SPC's own climatology graphics" icon={Layers} />
                  <div className="grid sm:grid-cols-2 gap-2.5 mt-3">
                    {SPC_MAPS.map((img) => (
                      <a key={img.url} href={img.url} target="_blank" rel="noopener noreferrer"
                         className="block rounded-xl overflow-hidden transition-colors"
                         style={{ border: `1px solid ${ROYAL.hairline}`, background: "rgba(0,0,0,0.25)" }}>
                        <img src={img.url} alt={img.title} loading="lazy" decoding="async"
                             className="w-full h-44 object-contain" style={{ background: "rgba(0,0,0,0.35)" }} />
                        <div className="px-3 py-2 flex items-center justify-between gap-2">
                          <span className="text-[11.5px] truncate" style={{ color: ROYAL.text }}>{img.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" style={{ color: ROYAL.gold }} />
                        </div>
                      </a>
                    ))}
                  </div>
                </section>

                <section className="px-4 py-4" style={card}>
                  <Head title="Where to go deeper"
                        note="These do not embed well, so they open in their own window." />
                  <div className="grid sm:grid-cols-2 gap-2 mt-3">
                    {TOOLS.map((t) => (
                      <a key={t.url} href={t.url} target="_blank" rel="noopener noreferrer"
                         className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 group"
                         style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
                        <Database className="w-4 h-4 shrink-0 mt-0.5" style={{ color: ROYAL.gold }} />
                        <span className="min-w-0">
                          <span className="text-[12.5px] font-semibold flex items-center gap-1" style={{ color: ROYAL.text }}>
                            {t.label} <ExternalLink className="w-3 h-3" style={{ color: ROYAL.gold }} />
                          </span>
                          <span className="block text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>{t.desc}</span>
                        </span>
                      </a>
                    ))}
                  </div>
                </section>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </ModuleShell>
  );
}

/** One section heading, so every panel on the page opens the same way. */
function Head({ title, note, icon: Icon }: { title: string; note?: string; icon?: typeof Calendar }) {
  return (
    <div>
      <h3 className="text-[13.5px] font-semibold flex items-center gap-1.5"
          style={{ fontFamily: HEADING, color: ROYAL.text }}>
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: ROYAL.gold }} />}
        {title}
      </h3>
      {note && <p className="text-[11px] leading-relaxed mt-1" style={{ color: ROYAL.dim }}>{note}</p>}
    </div>
  );
}

/** Six bins, drawn as a column each, with the count on top of it. */
function Histogram({
  title, sub, bins, color, still,
}: { title: string; sub: string; bins: [string, number][]; color: string; still: boolean }) {
  const max = Math.max(1, ...bins.map((b) => b[1]));
  const total = bins.reduce((n, b) => n + b[1], 0);
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-[11.5px] font-semibold" style={{ color: ROYAL.text }}>{title}</span>
        <span className="text-[10px]" style={{ color: ROYAL.dim }}>{sub}</span>
      </div>
      <div className="flex items-end gap-1.5 mt-3" style={{ height: 132 }}>
        {bins.map(([label, n], i) => (
          <div key={label} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
            <span className="text-[9.5px] tabular-nums" style={{ color: ROYAL.dim }}>
              {Math.round((n / total) * 100)}%
            </span>
            {/* Pixels, not percent: the column also carries two labels, so a
                100%-tall bar would push them out of the box. */}
            <motion.span className="w-full rounded-t-md"
              title={`${label}: ${n.toLocaleString()} tornadoes`}
              style={{ background: `linear-gradient(180deg, ${color}, ${color}55)` }}
              initial={still ? false : { height: 0 }}
              animate={{ height: Math.max(2, (n / max) * 92) }}
              transition={still ? { duration: 0 } : { duration: 0.5, delay: i * 0.05, ease: EASE }} />
            <span className="text-[9.5px] truncate w-full text-center" style={{ color: ROYAL.dim }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
