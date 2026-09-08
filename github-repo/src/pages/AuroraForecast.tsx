import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { format } from "date-fns";
import { Sparkles, ExternalLink, RefreshCw, Star, Moon, Compass, Activity } from "lucide-react";

import type { Location } from "../hooks/useLocation";
import { NightSkyMap, SKY_LEGEND, AURORA_LEGEND, viewLineLat } from "../components/NightSkyMap";
import { useOpenMeteo } from "../hooks/useWeatherQuery";
import { ModuleShell } from "../components/ModuleShell";
import { TonightPanel } from "../components/sky/TonightPanel";
import { DeepSkyTonight } from "../components/sky/DeepSkyTonight";
import { AuroraCurtain } from "../components/sky/AuroraCurtain";
import { ROYAL, HEADING, EASE } from "../lib/royal";
import { useCalm } from "../lib/calm";
import { useSticky } from "../lib/stickyState";
import { sunTimes } from "../lib/astro";
import { BASE_API } from "../config";

interface Props { location: Location }

type Tab = "stargazing" | "aurora" | "both";

const TOOLTIP_STYLE = {
  background: ROYAL.ink2,
  border: `1px solid ${ROYAL.hairline}`,
  borderRadius: 10,
  fontSize: 12,
};

/* ── Kp ─────────────────────────────────────────────────────────────────── */

function kpLabel(kp: number): { text: string; color: string; vis: string } {
  if (kp >= 8) return { text: "EXTREME STORM",     color: "#f472b6", vis: "Visible at most latitudes" };
  if (kp >= 6) return { text: "MAJOR STORM",       color: "#e879f9", vis: "Visible to 50°N" };
  if (kp >= 5) return { text: "GEOMAGNETIC STORM", color: "#c084fc", vis: "Visible to 55°N" };
  if (kp >= 4) return { text: "ACTIVE",            color: "#f0abfc", vis: "Visible at high latitudes" };
  if (kp >= 3) return { text: "UNSETTLED",         color: "#d8b4fe", vis: "Possible at 65°N+" };
  if (kp >= 2) return { text: "QUIET",             color: "#c084fc", vis: "Polar regions only" };
  return               { text: "VERY QUIET",       color: "#a78bfa", vis: "Polar cap only" };
}

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
      // SWPC retired /products/solar-wind/* — every path under it 404s now, so
      // this chart had been empty. Served through the app's proxy, which trims
      // the 1-minute real-time feed (~1.6 MB/day) to the window we chart.
      const res = await fetch(`${BASE_API}/swpc/solar-wind?points=24`);
      if (!res.ok) throw new Error("Solar wind error");
      const data = await res.json() as { series: { time: string; bz: number | null; bt: number | null }[] };
      return data.series.map((r) => ({ time: r.time, bz: r.bz ?? 0, bt: r.bt ?? 0 }));
    },
    staleTime: 5 * 60 * 1000, retry: 2,
  });
}

/* ── the latitude ladder ─────────────────────────────────────────────────── */

/**
 * Where you sit relative to tonight's aurora.
 *
 * "Kp 4, visible at high latitudes" is true and unusable — it does not say
 * whether YOU are at a high latitude. This puts the viewer's own line on the
 * same ruler as the view lines, so the answer is a distance in degrees rather
 * than a category to interpret.
 *
 * The bands and lines are SVG; every word on it is HTML. Drawn entirely in SVG
 * the labels scaled with the viewBox, which meant ten-point type rendering at
 * about five points on a phone. Text that has to be legible does not belong in
 * a coordinate space that stretches.
 */
function LatitudeLadder({ peakKp, currentKp, lat, calm }: {
  peakKp: number; currentKp: number; lat: number; calm: boolean;
}) {
  const you = Math.abs(lat);
  // The ruler always contains the viewer, however far south they are.
  const TOP = 75;
  const BOTTOM = Math.min(25, Math.floor((you - 4) / 5) * 5);

  const H = 246, PAD = 14, GUT = 30;
  const y = (l: number) => {
    const c = Math.max(BOTTOM, Math.min(TOP, l));
    return PAD + ((TOP - c) / (TOP - BOTTOM)) * (H - PAD * 2);
  };

  const naked = viewLineLat(peakKp);
  const nowLine = viewLineLat(currentKp);
  const reach = you - naked;

  // North to south: under the oval, then the naked-eye view line, then the
  // stretch only a long exposure reaches.
  const lines = [
    { key: "overhead", label: "Overhead", at: viewLineLat(Math.max(0, peakKp - 1.5)), color: "#c084fc", dash: "6 5" },
    { key: "naked", label: `Naked eye · peak Kp ${peakKp.toFixed(1)}`, at: naked, color: "#f472b6", dash: undefined },
    { key: "camera", label: "Camera only", at: viewLineLat(Math.min(9, peakKp + 1.5)), color: "#818cf8", dash: "6 5" },
    ...(Math.abs(nowLine - naked) > 0.6
      ? [{ key: "now", label: `Right now · Kp ${currentKp.toFixed(1)}`, at: nowLine, color: "#a78bfa", dash: "2 4" }]
      : []),
    { key: "you", label: `You · ${you.toFixed(1)}°N`, at: you, color: ROYAL.gold, dash: undefined },
  ].sort((a, b) => b.at - a.at);

  // Chips sit on their line where they can and are pushed down where they
  // cannot — 19px is the smallest gap that keeps them from overlapping.
  const chipY: number[] = [];
  lines.forEach((l, i) => {
    const want = y(l.at) - 8;
    chipY[i] = i === 0 ? want : Math.max(want, chipY[i - 1] + 19);
  });

  const ticks: number[] = [];
  for (let t = Math.ceil(BOTTOM / 10) * 10; t <= TOP; t += 10) ticks.push(t);

  return (
    <div className="rounded-2xl p-4" style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
      <div className="text-[10px] uppercase tracking-[0.24em] mb-2.5 flex items-center gap-1.5" style={{ color: ROYAL.dim }}>
        <Compass className="w-3.5 h-3.5" /> How far the aurora has to come
      </div>

      <div className="relative" style={{ height: H }}
           role="img" aria-label={`Your latitude ${you.toFixed(1)} degrees north against tonight's aurora view lines`}>
        {/* the ruler's own numbers */}
        {ticks.map((t) => (
          <div key={t} className="absolute text-[9.5px] tabular-nums text-right"
               style={{ top: y(t) - 6, left: 0, width: GUT - 6, color: ROYAL.dim }}>{t}°</div>
        ))}

        {/* The height has to be explicit. An absolutely positioned SVG is a
            replaced element, so `top: 0; bottom: 0` does not stretch it — it
            takes its intrinsic ratio from the viewBox and, at this width, grew
            to about three thousand pixels with the plot far below the frame. */}
        <svg className="absolute left-0 top-0" style={{ left: GUT, width: `calc(100% - ${GUT}px)`, height: H }}
             viewBox={`0 0 100 ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="llSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.16" />
              <stop offset="55%" stopColor="#6366f1" stopOpacity="0.07" />
              <stop offset="100%" stopColor="#070713" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="llSeen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f472b6" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#f472b6" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          <rect x="0" y={PAD} width="100" height={H - PAD * 2} fill="url(#llSky)" />

          {/* everyone north of the naked-eye line sees it tonight */}
          <motion.rect x="0" width="100" y={PAD} fill="url(#llSeen)"
            initial={calm ? false : { height: 0 }}
            animate={{ height: Math.max(0, y(naked) - PAD) }}
            transition={calm ? { duration: 0 } : { duration: 0.8, ease: EASE }} />

          {ticks.map((t) => (
            <line key={t} x1="0" x2="100" y1={y(t)} y2={y(t)} stroke={ROYAL.hairline} strokeWidth="1"
                  vectorEffect="non-scaling-stroke" />
          ))}

          {lines.map((l) => (
            <line key={l.key} x1="0" x2="100" y1={y(l.at)} y2={y(l.at)} stroke={l.color}
                  strokeWidth={l.key === "naked" || l.key === "you" ? 2.4 : 1.4}
                  strokeDasharray={l.dash} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>

        {/* the words, at their real size */}
        {lines.map((l, i) => (
          <motion.div key={l.key} className="absolute flex items-center gap-1.5 px-1.5 py-0.5 rounded-md whitespace-nowrap"
            initial={calm ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            transition={calm ? { duration: 0 } : { duration: 0.4, delay: 0.2 + i * 0.06, ease: EASE }}
            style={{ top: chipY[i], left: GUT + 6, background: "rgba(7,7,19,0.78)", border: `1px solid ${l.color}44` }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: l.color }} />
            <span className="text-[10.5px] tabular-nums"
                  style={{ color: l.color, fontWeight: l.key === "you" ? 700 : 500 }}>
              {l.label}{l.key === "you" ? "" : ` · ${Math.round(l.at)}°N`}
            </span>
          </motion.div>
        ))}
      </div>

      <p className="text-[11.5px] mt-2.5 leading-relaxed" style={{ color: ROYAL.dim }}>
        {reach >= 0
          ? <>At tonight's peak the naked-eye line reaches {Math.round(naked)}°N — <strong style={{ color: "#f472b6" }}>{reach.toFixed(1)}° past you</strong>. Get away from town lights and look north.</>
          : <>Tonight's peak brings the naked-eye line down to {Math.round(naked)}°N, still <strong style={{ color: ROYAL.text }}>{Math.abs(reach).toFixed(1)}° north of you</strong>. A long exposure pointed at the northern horizon is the realistic chance.</>}
      </p>
    </div>
  );
}

/* ── the page ───────────────────────────────────────────────────────────── */

export default function AuroraForecast({ location }: Props) {
  const [tab, setTab] = useSticky<Tab>("aurora.tab", "both",
    (v): v is Tab => v === "stargazing" || v === "aurora" || v === "both");

  const { calm } = useCalm(location.lat, location.lon);
  const { data: kpHistory, isLoading: histLoading, refetch, isFetching } = useSwpc();
  const { data: kpForecast, isLoading: fcLoading } = useSwpcForecast();
  const { data: solarWind } = useSwpcSolarWind();
  const { data: weather } = useOpenMeteo(location);

  const latestKp = Number(kpHistory?.at(-1)?.estimated_kp ?? kpHistory?.at(-1)?.kp_index ?? 0) || 0;
  const kp = kpLabel(latestKp);
  const futureForecast = (kpForecast ?? []).filter(d => d.observed !== "observed");
  const futureMax = futureForecast.length ? Math.max(...futureForecast.map(d => Number(d.kp ?? 0))) : 0;
  const peakKp = Math.max(latestKp, futureMax);
  const visible = Math.abs(location.lat) >= viewLineLat(latestKp);
  const needed = kpNeeded(Math.abs(location.lat));

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

  const latestBz = solarWind?.at(-1)?.bz ?? null;
  const latestBt = solarWind?.at(-1)?.bt ?? null;

  /**
   * Tonight's astronomically dark window, which is what the target list is
   * placed across. Dusk belongs to today and dawn to tomorrow — reading this
   * at nine in the evening, today's dawn is sixteen hours in the past.
   */
  const dark = useMemo(() => {
    const now = new Date();
    const today = sunTimes(now, location.lat, location.lon);
    const tomorrow = sunTimes(new Date(now.getTime() + 86400_000), location.lat, location.lon);
    return { start: today.astronomicalDusk, end: tomorrow.astronomicalDawn };
  }, [location.lat, location.lon]);

  const showSky = tab === "stargazing" || tab === "both";
  const showAurora = tab === "aurora" || tab === "both";

  const tabs: { key: Tab; label: string; icon: typeof Star }[] = [
    { key: "stargazing", label: "Stargazing", icon: Star },
    { key: "aurora",     label: "Aurora",     icon: Sparkles },
    { key: "both",       label: "Both",       icon: Moon },
  ];

  return (
    <ModuleShell
      wide
      eyebrow="NOAA SWPC · Open-Meteo · USNO algorithms"
      title="Aurora & Star Gazing"
      subtitle={<>Whether tonight over {location.name} is worth going outside for — and, if it is, when and which way to face.</>}
      actions={
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
          style={{ color: ROYAL.dim, border: `1px solid ${ROYAL.hairline}` }}>
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
      status={
        <div className="flex items-center gap-1.5 flex-wrap">
          {tabs.map(t => {
            const on = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-colors"
                style={on
                  ? { background: `${ROYAL.gold}1f`, color: ROYAL.gold, border: `1px solid ${ROYAL.gold}59` }
                  : { background: "transparent", color: ROYAL.dim, border: `1px solid ${ROYAL.hairline}` }}>
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            );
          })}
        </div>
      }
    >
      {/* ── tonight, at a glance ─────────────────────────────────────────── */}
      {showSky && (
        <TonightPanel weather={weather} lat={location.lat} lon={location.lon}
                      placeName={location.name} calm={calm} />
      )}

      {/* ── the aurora hero ──────────────────────────────────────────────── */}
      {showAurora && (
        <motion.section
          initial={calm ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={calm ? { duration: 0.2 } : { duration: 0.55, ease: EASE }}
          className="relative rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${kp.color}44`,
                   background: `linear-gradient(180deg, #0a0620, ${ROYAL.ink})` }}>
          <AuroraCurtain kp={peakKp} calm={calm} height={230} />

          <div className="relative p-5 md:p-6">
            <div className="flex flex-col md:flex-row md:items-end gap-5">
              <div className="shrink-0">
                <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: ROYAL.dim }}>Planetary K index</div>
                <div className="flex items-baseline gap-3">
                  <span className="text-[64px] leading-none font-black tabular-nums"
                        style={{ color: kp.color, textShadow: `0 0 34px ${kp.color}66` }}>
                    {histLoading ? "—" : latestKp.toFixed(1)}
                  </span>
                  <span className="text-sm font-bold tracking-[0.16em]"
                        style={{ color: kp.color, fontFamily: HEADING }}>{kp.text}</span>
                </div>
                <div className="text-[12px] mt-1" style={{ color: ROYAL.dim }}>{kp.vis}</div>
              </div>

              <div className="flex-1 min-w-0">
                <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold border`}
                     style={visible
                       ? { borderColor: "#f472b680", background: "rgba(244,114,182,0.10)", color: "#f9a8d4" }
                       : { borderColor: ROYAL.hairline, background: "rgba(204,204,255,0.04)", color: ROYAL.dim }}>
                  <span className={`w-2 h-2 rounded-full ${visible && !calm ? "animate-pulse" : ""}`}
                        style={{ background: visible ? "#f472b6" : ROYAL.dim }} />
                  {visible
                    ? `Aurora potentially visible at ${location.name}`
                    : `Not expected at ${location.name} (${Math.abs(location.lat).toFixed(1)}°${location.lat >= 0 ? "N" : "S"})`}
                </div>
                <p className="text-[12.5px] leading-relaxed mt-2.5" style={{ color: ROYAL.text }}>
                  SWPC's forecast peaks at <strong style={{ color: kpLabel(peakKp).color }}>Kp {peakKp.toFixed(1)}</strong> over
                  the next day{latestBz !== null && <>, with the interplanetary field currently at <strong style={{ color: latestBz < -5 ? "#f472b6" : ROYAL.text }}>Bz {latestBz.toFixed(1)} nT</strong>
                  {latestBz < -5 ? " — southward, which is the condition that opens the door" : latestBz < 0 ? " — slightly southward" : " — northward, which suppresses it"}</>}.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
              {[
                { label: "Your latitude",  value: `${Math.abs(location.lat).toFixed(1)}°${location.lat >= 0 ? "N" : "S"}`, color: ROYAL.gold },
                { label: "Kp you need",    value: needed === null ? "off the scale" : `Kp ${needed.toFixed(1)}`, color: "#f0abfc" },
                { label: "NOAA G-scale",   value: latestKp >= 5 ? `G${Math.min(5, Math.floor(latestKp - 4))}` : "G0", color: kp.color },
                { label: "Bt (field)",     value: latestBt !== null ? `${latestBt.toFixed(1)} nT` : "—", color: "#c084fc" },
              ].map((m, i) => (
                <motion.div key={m.label}
                  initial={calm ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                  transition={calm ? { duration: 0 } : { duration: 0.35, delay: 0.15 + i * 0.05, ease: EASE }}
                  className="rounded-xl px-3 py-2.5"
                  style={{ background: "rgba(7,7,19,0.55)", border: `1px solid ${ROYAL.hairline}` }}>
                  <div className="text-[17px] font-bold tabular-nums" style={{ color: m.color }}>
                    {histLoading ? "—" : m.value}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.12em] mt-0.5" style={{ color: ROYAL.dim }}>{m.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>
      )}

      {showAurora && (
        <LatitudeLadder peakKp={peakKp} currentKp={latestKp} lat={location.lat} calm={calm} />
      )}

      {/* ── the map ──────────────────────────────────────────────────────── */}
      <section className="rounded-2xl overflow-hidden"
               style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <span aria-hidden className="block h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: ROYAL.hairline }}>
          <div className="flex items-center gap-2">
            {tab === "stargazing" ? <Star className="w-4 h-4" style={{ color: ROYAL.gold }} />
                                  : <Sparkles className="w-4 h-4" style={{ color: "#f472b6" }} />}
            <span className="text-sm font-semibold" style={{ color: ROYAL.text }}>
              {tab === "stargazing" ? "Stargazing outlook — tonight"
                : tab === "aurora" ? "Aurora view lines — North America"
                : "Night sky — stargazing and aurora"}
            </span>
          </div>
          {showAurora && (
            <a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener noreferrer"
               className="flex items-center gap-1 text-xs hover:underline" style={{ color: ROYAL.gold }}>
              <ExternalLink className="w-3 h-3" /> SWPC
            </a>
          )}
        </div>

        <div className="p-3">
          <NightSkyMap mode={tab} peakKp={peakKp} currentKp={latestKp}
                       userLat={location.lat} userLon={location.lon} userName={location.name} height={360} />
        </div>

        <div className="px-4 pb-3 space-y-2">
          {showSky && <Legend title="Sky clarity" rows={SKY_LEGEND} />}
          {showAurora && <Legend title="Aurora visibility" rows={AURORA_LEGEND} />}
        </div>

        <p className="px-4 pb-3 text-[11px] leading-relaxed" style={{ color: ROYAL.dim }}>
          {tab === "stargazing" && "State fill is the sky score at its best over the next few hours — darkness, cloud, moon and air, on the same scale as the panel above."}
          {tab === "aurora" && `Solid line is the naked-eye view line at the forecast peak of Kp ${peakKp.toFixed(1)}; dashed lines are the overhead and camera-only limits, and "now" is the current Kp ${latestKp.toFixed(1)}.`}
          {tab === "both" && "State fill is stargazing conditions; the lines are aurora view latitudes. Both need the same thing to pay off — a clear sky and no moon."}
        </p>
      </section>

      {/* ── targets ──────────────────────────────────────────────────────── */}
      {showSky && (
        <DeepSkyTonight lat={location.lat} lon={location.lon}
                        darkStart={dark.start} darkEnd={dark.end} calm={calm} />
      )}

      {/* ── aurora detail ────────────────────────────────────────────────── */}
      {showAurora && (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Aurora oval — OVATION Prime"
                  aside={<a href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs hover:underline" style={{ color: ROYAL.gold }}>
                            <ExternalLink className="w-3 h-3" /> Full map</a>}>
              <div className="flex items-center justify-center min-h-[200px] rounded-xl" style={{ background: "rgba(0,0,0,0.4)" }}>
                <img
                  // NOAA retired the `global/` frame; the directory now holds only
                  // `north/` and `south/`. The old path 404'd and the fallback
                  // reported it as an access problem, so a dead URL read as a
                  // permissions failure.
                  src={`https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg?t=${Math.floor(Date.now() / 300000)}`}
                  alt="NOAA OVATION Prime aurora oval, northern hemisphere"
                  className="w-full rounded-lg object-contain" style={{ maxHeight: 320 }} />
              </div>
              <p className="text-[11px] mt-2" style={{ color: ROYAL.dim }}>
                NOAA's 30-minute forecast of where the oval sits, refreshed about every five minutes.
              </p>
            </Card>

            <Card title="IMF Bz — the switch that opens the door">
              {solarWind && solarWind.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={solarWind.map(d => ({ time: d.time.slice(11, 16), bz: d.bz }))}>
                      <defs>
                        <linearGradient id="bzGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f472b6" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#f472b6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" tick={{ fontSize: 9, fill: ROYAL.dim }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: ROYAL.dim }} tickLine={false} axisLine={false} width={30} />
                      <ReferenceLine y={0} stroke={ROYAL.hairline} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: ROYAL.text }}
                               formatter={(v: number) => [`${v?.toFixed(1)} nT`, "Bz"]} />
                      <Area type="monotone" dataKey="bz" stroke="#f472b6" fill="url(#bzGrad)"
                            strokeWidth={2} dot={false} isAnimationActive={!calm} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: ROYAL.dim }}>
                    Earth's field points north. When the sun's field turns south — negative Bz — the two connect and
                    energy pours in. It is the single best short-term predictor there is, and it can flip in minutes.
                    {latestBz !== null && <> Currently <strong style={{ color: latestBz < -5 ? "#f472b6" : ROYAL.text }}>{latestBz.toFixed(1)} nT</strong>.</>}
                  </p>
                </>
              ) : (
                <div className="h-[150px] grid place-items-center text-[12px]" style={{ color: ROYAL.dim }}>
                  Solar-wind feed unavailable right now.
                </div>
              )}
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title="Last 24 hours, observed">
              {histLoading ? <div className="h-[150px] rounded animate-pulse" style={{ background: "rgba(204,204,255,0.06)" }} />
                : recentKp.length > 0 ? (
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={recentKp}>
                    <defs>
                      <linearGradient id="kpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f472b6" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#c084fc" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: ROYAL.dim }} tickLine={false} axisLine={false} interval={5} />
                    <YAxis domain={[0, 9]} tick={{ fontSize: 10, fill: ROYAL.dim }} tickLine={false} axisLine={false} width={22} />
                    <ReferenceLine y={5} stroke="#c084fc" strokeDasharray="3 3"
                                   label={{ value: "storm", fill: "#c084fc", fontSize: 9, position: "insideTopRight" }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: ROYAL.text }} formatter={(v) => [`${v}`, "Kp"]} />
                    <Area type="monotone" dataKey="kp" stroke="#f472b6" fill="url(#kpGrad)"
                          strokeWidth={2} dot={false} isAnimationActive={!calm} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : <div className="h-[150px] grid place-items-center text-[12px]" style={{ color: ROYAL.dim }}>No recent data.</div>}
            </Card>

            <Card title="Next 24 hours, forecast">
              {fcLoading ? <div className="h-[150px] rounded animate-pulse" style={{ background: "rgba(204,204,255,0.06)" }} />
                : forecastKp.length > 0 ? (
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={forecastKp}>
                    <XAxis dataKey="time" tick={{ fontSize: 9, fill: ROYAL.dim }} tickLine={false} axisLine={false} interval={5} />
                    <YAxis domain={[0, 9]} tick={{ fontSize: 10, fill: ROYAL.dim }} tickLine={false} axisLine={false} width={22} />
                    {needed !== null && (
                      <ReferenceLine y={needed} stroke={ROYAL.gold} strokeDasharray="3 3"
                                     label={{ value: "your latitude", fill: ROYAL.gold, fontSize: 9, position: "insideTopRight" }} />
                    )}
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: ROYAL.text }} formatter={(v) => [`${v}`, "Kp"]} />
                    <Bar dataKey="kp" radius={[3, 3, 0, 0]} isAnimationActive={!calm}>
                      {forecastKp.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-[150px] grid place-items-center text-[12px]" style={{ color: ROYAL.dim }}>No forecast available.</div>}
            </Card>
          </div>

          <Card title="The Kp scale, and what each step actually means">
            <div className="space-y-1">
              {[
                { kp: "0–1", label: "Very quiet",     color: "#a78bfa", desc: "Polar cap only. Nothing to see from the lower 48." },
                { kp: "2–3", label: "Quiet–unsettled", color: "#c084fc", desc: "A band across northern Canada and Alaska." },
                { kp: "4",   label: "Active",         color: "#f0abfc", desc: "The auroral zone proper — northern Minnesota on a good night." },
                { kp: "5",   label: "G1 minor storm", color: "#e879f9", desc: "Reaches roughly 50°N. Watch-worthy across the northern tier." },
                { kp: "6",   label: "G2 moderate",    color: "#d946ef", desc: "About 47°N. Photographable much further south than that." },
                { kp: "7",   label: "G3 strong",      color: "#c026d3", desc: "About 43°N — Chicago, Boston, Portland." },
                { kp: "8–9", label: "G4–G5 severe",   color: "#f472b6", desc: "Mid-latitudes. A few nights a solar cycle." },
              ].map((r) => (
                <div key={r.kp} className="flex items-start gap-3 py-1">
                  <div className="w-14 text-[11.5px] font-bold shrink-0 tabular-nums" style={{ color: r.color }}>Kp {r.kp}</div>
                  <div className="text-[11.5px] font-medium w-28 shrink-0" style={{ color: ROYAL.text }}>{r.label}</div>
                  <div className="text-[11.5px] leading-snug" style={{ color: ROYAL.dim }}>{r.desc}</div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {/* ── elsewhere ────────────────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 gap-3">
        {[
          ...(showAurora ? [
            { label: "NOAA SWPC", url: "https://www.swpc.noaa.gov/", desc: "The source behind every number on this page" },
            { label: "SpaceWeather.com", url: "https://www.spaceweather.com/", desc: "Daily solar activity, written for humans" },
          ] : []),
          ...(showSky ? [
            { label: "Stellarium Web", url: "https://stellarium-web.org/", desc: "Point-and-identify planetarium in the browser" },
            { label: "Clear Outside", url: "https://clearoutside.com/", desc: "Cloud forecast broken out by altitude" },
          ] : []),
        ].map(r => (
          <a key={r.label} href={r.url} target="_blank" rel="noopener noreferrer"
             className="rounded-xl p-3 transition-colors hover:border-[#d9b775]/40"
             style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
            <div className="text-[13px] font-medium flex items-center gap-1.5" style={{ color: ROYAL.text }}>
              <ExternalLink className="w-3.5 h-3.5" style={{ color: ROYAL.gold }} /> {r.label}
            </div>
            <div className="text-[11px] mt-1" style={{ color: ROYAL.dim }}>{r.desc}</div>
          </a>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed flex items-start gap-2" style={{ color: ROYAL.dim }}>
        <Activity className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: ROYAL.gold }} />
        <span>
          Kp and the solar wind come from NOAA SWPC; cloud, humidity and precipitation from Open-Meteo. Sun and moon
          positions, twilights and rise/set times are computed here from standard astronomical series and check out
          against the U.S. Naval Observatory to within a minute or two. Not an official product — a forecast aid.
        </span>
      </p>
    </ModuleShell>
  );
}

/* ── small pieces ───────────────────────────────────────────────────────── */

/**
 * The Kp a latitude needs before the naked-eye view line reaches it, or null
 * where no Kp does.
 *
 * The scale stops at 9, and 9 only brings the line to 37°N. Anywhere south of
 * that, the honest answer is "there isn't one" — the old card said "Kp 11",
 * which is not a value the index can take, and the first version of this said
 * "Kp 9.0", which is a number that would not work.
 */
function kpNeeded(absLat: number): number | null {
  for (let k = 0; k <= 9; k += 0.1) if (viewLineLat(k) <= absLat) return Math.round(k * 10) / 10;
  return null;
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl overflow-hidden"
             style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
      <span aria-hidden className="block h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
      <header className="px-4 py-3 flex items-center gap-3 border-b" style={{ borderColor: ROYAL.hairline }}>
        <h3 className="text-sm font-semibold min-w-0" style={{ color: ROYAL.text }}>{title}</h3>
        {aside && <div className="ml-auto shrink-0">{aside}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Legend({ title, rows }: { title: string; rows: readonly { label: string; color: string; stroke: string; range?: string }[] }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1" style={{ color: ROYAL.dim }}>{title}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {rows.map(l => (
          <div key={l.label} className="flex items-center gap-1.5 text-[11px]">
            <span className="flex items-center gap-[3px]">
              <span className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
              <span className="w-3 h-3 rounded-sm" style={{ background: l.stroke }} />
            </span>
            <span style={{ color: ROYAL.dim }}>{l.label}</span>
            {l.range && <span className="text-[10px] tabular-nums" style={{ color: ROYAL.dim, opacity: 0.6 }}>{l.range}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
