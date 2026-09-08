import { useMemo } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from "recharts";
import { format, parseISO } from "date-fns";
import { AlertTriangle, RefreshCw, Radio, Clock } from "lucide-react";

import { useOpenMeteo, useNWSAlerts, useNWSPoints } from "../hooks/useWeatherQuery";
import { hourIndexNow } from "../lib/currentHour";
import DataUnavailable from "../components/DataUnavailable";
import { ModuleShell } from "../components/ModuleShell";
import { ScaleLadder, type Band } from "../components/sswxcon/ScaleLadder";
import { ROYAL, HEADING, EASE } from "../lib/royal";
import { useCalm } from "../lib/calm";
import type { Location } from "../hooks/useLocation";
import {
  computeSRHFromProfile, compute06kmShear, computeSWTI, swtiReading, cToF, msToMph,
} from "../utils/weatherCalc";

interface Props { location: Location }

/** The index's own scale, at its real proportions. */
const BANDS: Band[] = [
  { from: 0,  to: 10,  label: "Minimal",  color: "#4ade80" },
  { from: 10, to: 30,  label: "Low",      color: "#fde047" },
  { from: 30, to: 60,  label: "Moderate", color: "#f97316" },
  { from: 60, to: 80,  label: "High",     color: "#ef4444" },
  { from: 80, to: 100, label: "Extreme",  color: "#d946ef" },
];

/* ── the dial ──────────────────────────────────────────────────────────────── */

function ScoreGauge({ score, color, calm }: { score: number; color: string; calm: boolean }) {
  const cx = 110, cy = 110, r = 88;
  const START = 135, SWEEP = 270; // open-bottom dial
  const polar = (deg: number, radius: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  const arc = (startDeg: number, endDeg: number, radius: number) => {
    const s = polar(startDeg, radius), e = polar(endDeg, radius);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  };
  const frac = Math.max(0, Math.min(1, score / 100));
  const endDeg = START + SWEEP * frac;
  const tip = polar(endDeg, r);

  const ticks = Array.from({ length: 28 }, (_, i) => START + (SWEEP / 27) * i);

  return (
    <svg width="220" height="212" viewBox="0 0 220 212" role="img"
         aria-label={`Threat index ${score} out of 100`}>
      <defs>
        <filter id="swtiGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="swtiCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="68%" stopColor={color} stopOpacity="0.05" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d={arc(START, START + SWEEP, r)} stroke={ROYAL.hairline} strokeWidth="13" fill="none" strokeLinecap="round" />
      {/* The bands drawn on the track itself, at their true widths, so the dial
          and the ladder below it cannot disagree about where "High" starts. */}
      {BANDS.map((b) => (
        <path key={b.label}
              d={arc(START + SWEEP * (b.from / 100), START + SWEEP * (b.to / 100), r)}
              stroke={b.color} strokeWidth="13" fill="none" opacity={0.2} />
      ))}
      {ticks.map((t, i) => {
        const a = polar(t, r - 14), b = polar(t, r - 20);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ROYAL.dim} strokeWidth={i % 9 === 0 ? 2 : 1} opacity={0.5} />;
      })}
      <circle cx={cx} cy={cy} r="62" fill="url(#swtiCore)" />
      <motion.path d={arc(START, endDeg, r)} stroke={color} strokeWidth="13" fill="none"
        strokeLinecap="round" filter="url(#swtiGlow)"
        initial={calm ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={calm ? { duration: 0 } : { duration: 1, ease: EASE }} />
      <circle cx={tip.x} cy={tip.y} r="6" fill="#fff" filter="url(#swtiGlow)" />
      <circle cx={tip.x} cy={tip.y} r="3" fill={color} />
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="50" fontWeight="bold" fill={color} filter="url(#swtiGlow)">{score}</text>
      <text x={cx} y={cy + 38} textAnchor="middle" fontSize="12" fill={ROYAL.dim} letterSpacing="2">/ 100</text>
      <text x={polar(START, r + 13).x} y={polar(START, r + 13).y + 4} textAnchor="middle" fontSize="9" fill={ROYAL.dim}>0</text>
      <text x={polar(START + SWEEP, r + 13).x} y={polar(START + SWEEP, r + 13).y + 4} textAnchor="middle" fontSize="9" fill={ROYAL.dim}>100</text>
    </svg>
  );
}

/* ── the page ──────────────────────────────────────────────────────────────── */

export default function SWTIPage({ location }: Props) {
  const { data: weather, isLoading, refetch } = useOpenMeteo(location);
  const { data: alerts = [] } = useNWSAlerts(location);
  const { data: nwsPoints } = useNWSPoints(location);
  const { calm: still } = useCalm(location.lat, location.lon);

  const hourly = weather?.hourly;
  // The hour we are actually in. `hourly[0]` is midnight local — the series
  // starts at 00:00 on the current day — so every reading on this page was the
  // atmosphere as it had been overnight, up to twenty-three hours stale.
  const now = hourIndexNow(weather);

  const ws10 = hourly?.wind_speed_10m?.[now] ?? 0;
  const wd10 = hourly?.wind_direction_10m?.[now] ?? 0;
  const ws925 = hourly?.wind_speed_925hPa?.[now] ?? 0;
  const wd925 = hourly?.wind_direction_925hPa?.[now] ?? 0;
  const ws850 = hourly?.wind_speed_850hPa?.[now] ?? 0;
  const wd850 = hourly?.wind_direction_850hPa?.[now] ?? 0;
  const ws700 = hourly?.wind_speed_700hPa?.[now] ?? 0;
  const wd700 = hourly?.wind_direction_700hPa?.[now] ?? 0;
  const ws500 = hourly?.wind_speed_500hPa?.[now] ?? 0;
  const wd500 = hourly?.wind_direction_500hPa?.[now] ?? 0;

  const srh = !isLoading && hourly
    ? computeSRHFromProfile(ws10, wd10, ws925, wd925, ws850, wd850, ws700, wd700, ws500, wd500)
    : 0;
  const shear = !isLoading && hourly ? compute06kmShear(ws10, wd10, ws500, wd500) : 0;

  const cape = hourly?.cape?.[now] ?? 0;
  const li = hourly?.lifted_index?.[now] ?? 0;
  const dewC = hourly?.dew_point_2m?.[now] ?? 10;

  const swti = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: dewC });

  /**
   * The next 48 hours, scored the same way the gauge is.
   *
   * It used to pass `srh: 100` for every hour — a constant, not a measurement,
   * and one of the five inputs to the index. So the curve under the dial was a
   * DIFFERENT index from the number above it: on a day when helicity was the
   * story the timeline flattened it out, and on a day with none it invented
   * some. Every hour now gets its own helicity from the same wind profile the
   * current reading uses, so the line the gauge sits on is the gauge.
   *
   * It also starts at the current hour rather than at midnight. Half of a
   * "48-hour outlook" being hours that have already happened is not an outlook.
   */
  const timeline = useMemo(() => {
    const times = hourly?.time as string[] | undefined;
    if (!times) return [];
    return times.slice(now, now + 48).map((t, k) => {
      const i = now + k;
      const sh = compute06kmShear(
        hourly!.wind_speed_10m?.[i] ?? 0, hourly!.wind_direction_10m?.[i] ?? 0,
        hourly!.wind_speed_500hPa?.[i] ?? 0, hourly!.wind_direction_500hPa?.[i] ?? 0);
      const hr = computeSRHFromProfile(
        hourly!.wind_speed_10m?.[i] ?? 0, hourly!.wind_direction_10m?.[i] ?? 0,
        hourly!.wind_speed_925hPa?.[i] ?? 0, hourly!.wind_direction_925hPa?.[i] ?? 0,
        hourly!.wind_speed_850hPa?.[i] ?? 0, hourly!.wind_direction_850hPa?.[i] ?? 0,
        hourly!.wind_speed_700hPa?.[i] ?? 0, hourly!.wind_direction_700hPa?.[i] ?? 0,
        hourly!.wind_speed_500hPa?.[i] ?? 0, hourly!.wind_direction_500hPa?.[i] ?? 0);
      const r = computeSWTI({
        cape: hourly!.cape?.[i] ?? 0, srh: hr, shear06km: sh,
        liftedIndex: hourly!.lifted_index?.[i] ?? 0,
        dewPointC: hourly!.dew_point_2m?.[i] ?? 10,
      });
      return { time: format(parseISO(t), "EEE ha"), short: format(parseISO(t), "ha"), swti: r.score, hoursOut: k };
    });
  }, [hourly, now]);

  /** When it peaks, and how high — the question a chaser actually has. */
  const peak = useMemo(() => {
    if (timeline.length === 0) return null;
    return timeline.reduce((hi, p) => (p.swti > hi.swti ? p : hi));
  }, [timeline]);

  const severeAlerts = alerts.filter((a: { properties: { event: string } }) =>
    (a.properties.event ?? "").toLowerCase().includes("tornado") ||
    (a.properties.event ?? "").toLowerCase().includes("severe"));

  // Every parameter above defaults to 0 when the profile is missing, and 0 CAPE
  // with 0 shear scores as BENIGN. That is a reading we have not taken.
  if (!isLoading && !hourly) {
    return <DataUnavailable title="Severe Threat Index" source="Open-Meteo" onRetry={() => refetch()} />;
  }

  const partsSum = swti.parts.reduce((a, p) => a + p.score, 0);

  const rise = (d: number) => ({
    initial: still ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: still ? { duration: 0.2 } : { duration: 0.5, delay: d, ease: EASE },
  });

  return (
    <ModuleShell
      eyebrow="Open-Meteo · NWS"
      title="Severe Threat Index"
      subtitle={`Everything a storm needs, scored together, for ${location.name}.`}
      actions={
        <button onClick={() => refetch()}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors"
          style={{ color: ROYAL.dim, border: `1px solid ${ROYAL.hairline}` }}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      }
      status={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
          <span className="font-bold uppercase tracking-[0.16em]" style={{ color: swti.color }}>
            {isLoading ? "Reading" : swti.label}
          </span>
          <span style={{ color: ROYAL.dim }}>{isLoading ? "—" : swti.score} of 100</span>
          {peak && !isLoading && (
            <span style={{ color: ROYAL.dim }}>
              peaks at {peak.swti} · {peak.hoursOut === 0 ? "now" : peak.time}
            </span>
          )}
          <span style={{ color: ROYAL.dim }}>
            hail {swti.hailRisk} · wind {swti.windRisk}
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {severeAlerts.length > 0 && (
          <motion.div {...rise(0)}
            className="rounded-xl p-3 flex items-start gap-2"
            style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.4)" }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
            <div>
              <div className="font-bold text-sm" style={{ color: "#fca5a5" }}>
                {severeAlerts.length} severe alert{severeAlerts.length > 1 ? "s" : ""} in force here
              </div>
              <div className="text-xs" style={{ color: ROYAL.dim }}>
                {severeAlerts.map((a: { properties: { event: string } }) => a.properties.event).join(" · ")}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── the instrument ──────────────────────────────────────────────── */}
        <motion.section {...rise(0.04)}
          className="relative rounded-2xl overflow-hidden"
          style={{
            border: `1px solid ${swti.color}44`,
            background:
              `radial-gradient(90% 130% at 50% -20%, ${swti.color}1f, transparent 62%),` +
              `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
          }}>
          <span aria-hidden className="absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${swti.color}, transparent)` }} />
          <div className="p-4 sm:p-5 flex flex-col items-center">
            <div className="text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: ROYAL.dim }}>
              Right now
            </div>
            {isLoading
              ? <div className="h-52 w-52 rounded-full animate-pulse" style={{ background: "rgba(204,204,255,0.06)" }} />
              : <ScoreGauge score={swti.score} color={swti.color} calm={still} />}
            <div className="text-2xl font-bold mt-1" style={{ color: swti.color, fontFamily: HEADING }}>
              {isLoading ? "—" : swti.label}
            </div>
            {!isLoading && (
              <p className="text-[12.5px] leading-relaxed text-center max-w-xl mt-2.5" style={{ color: ROYAL.text }}>
                {swtiReading(swti)}
              </p>
            )}
          </div>
        </motion.section>

        {/* ── what is building it ─────────────────────────────────────────── */}
        <motion.section {...rise(0.08)} className="rounded-2xl p-4"
          style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <div className="flex items-baseline justify-between mb-2.5">
            <span className="text-[10px] uppercase tracking-[0.24em]" style={{ color: ROYAL.dim }}>
              The five ingredients
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>
              {isLoading ? "—" : `${partsSum} points of a possible 100`}
            </span>
          </div>

          {/* Each bar is scaled to its OWN ceiling, because the ceilings differ —
              helicity can contribute 30 and moisture only 8, so a shared axis
              would make a maxed-out moisture term look like a failure. */}
          <div className="space-y-2">
            {swti.parts.map((p, i) => {
              const frac = p.max > 0 ? p.score / p.max : 0;
              return (
                <div key={p.key} className="flex items-center gap-2.5">
                  <span className="w-[86px] shrink-0 text-[11px]" style={{ color: ROYAL.text }}>{p.label}</span>
                  <div className="flex-1 h-2.5 rounded-full overflow-hidden"
                       style={{ background: "rgba(204,204,255,0.06)" }}>
                    <motion.div className="h-full rounded-full"
                      initial={still ? false : { width: 0 }}
                      animate={{ width: `${frac * 100}%` }}
                      transition={still ? { duration: 0 } : { duration: 0.6, delay: 0.1 + i * 0.06, ease: EASE }}
                      style={{ background: p.color, boxShadow: `0 0 10px -2px ${p.color}` }} />
                  </div>
                  <span className="w-[76px] shrink-0 text-right text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>
                    {isLoading ? "—" : `${p.key === "li" ? p.value.toFixed(1) : Math.round(p.value)} ${p.unit}`}
                  </span>
                  <span className="w-[48px] shrink-0 text-right text-[11px] font-bold tabular-nums"
                        style={{ color: p.score > 0 ? p.color : ROYAL.dim }}>
                    {isLoading ? "—" : `${p.score}/${p.max}`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Moisture and surface wind are context, not scored terms beyond the
              dew point above — kept here so the reading has its surroundings. */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-xl px-3 py-2"
                 style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
              <div className="text-[9.5px] uppercase tracking-[0.14em]" style={{ color: ROYAL.dim }}>Dew point</div>
              <div className="text-lg font-bold tabular-nums" style={{ color: ROYAL.text }}>
                {isLoading ? "—" : `${Math.round(cToF(dewC))}°F`}
              </div>
            </div>
            <div className="rounded-xl px-3 py-2"
                 style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
              <div className="text-[9.5px] uppercase tracking-[0.14em]" style={{ color: ROYAL.dim }}>Surface wind</div>
              <div className="text-lg font-bold tabular-nums" style={{ color: ROYAL.text }}>
                {isLoading ? "—" : `${Math.round(msToMph(ws10))} mph`}
                <span className="text-[11px] font-normal ml-1.5" style={{ color: ROYAL.dim }}>from {Math.round(wd10)}°</span>
              </div>
            </div>
          </div>
        </motion.section>

        {/* ── the next two days ───────────────────────────────────────────── */}
        <motion.section {...rise(0.12)} className="rounded-2xl p-4"
          style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <span className="text-[10px] uppercase tracking-[0.24em] flex items-center gap-1.5" style={{ color: ROYAL.dim }}>
              <Clock className="w-3.5 h-3.5" /> The next 48 hours
            </span>
            {peak && (
              <span className="text-[10px]" style={{ color: ROYAL.dim }}>
                peak {peak.swti} at {peak.time}
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={timeline} margin={{ top: 10, right: 6, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="swtiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={swti.color} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={swti.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="short" tick={{ fontSize: 9, fill: ROYAL.dim }} tickLine={false} axisLine={false} interval={7} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: ROYAL.dim }} tickLine={false} axisLine={false} width={26} />
              <Tooltip
                cursor={{ stroke: "rgba(204,204,255,0.2)" }}
                contentStyle={{ background: ROYAL.ink2, border: `1px solid ${ROYAL.hairline}`, borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: ROYAL.text }}
                formatter={(v: number) => [`${v} / 100`, "Threat index"]}
                labelFormatter={(_l, pl) => (pl?.[0]?.payload as { time?: string })?.time ?? ""} />
              {/* Where the named bands begin, so a rise can be read against the
                  scale rather than against the shape of the curve. */}
              {BANDS.slice(1).map((b) => (
                <ReferenceLine key={b.label} y={b.from} stroke={b.color} strokeOpacity={0.28} strokeDasharray="3 5" />
              ))}
              <Area type="monotone" dataKey="swti" stroke={swti.color} fill="url(#swtiGrad)"
                    strokeWidth={2} dot={false} isAnimationActive={!still} />
              {peak && peak.swti > 0 && (
                <ReferenceDot x={peak.short} y={peak.swti} r={4} fill="#fff" stroke={swti.color} strokeWidth={2} />
              )}
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[10.5px] leading-relaxed mt-1" style={{ color: ROYAL.dim }}>
            Every hour is scored from its own profile — instability, helicity, shear, lifted index and
            moisture — by the same arithmetic as the dial above, so the curve and the number agree.
            Starts at the hour you are in, not at midnight.
          </p>
        </motion.section>

        {/* ── where it sits on the scale ──────────────────────────────────── */}
        <motion.section {...rise(0.16)} className="rounded-2xl p-4"
          style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <div className="text-[10px] uppercase tracking-[0.24em] mb-3" style={{ color: ROYAL.dim }}>
            Where this reading sits
          </div>
          <ScaleLadder bands={BANDS} score={isLoading ? 0 : swti.score} threshold={60} max={100}
                       calm={still} thresholdLabel="significant above" />
        </motion.section>

        {/* ── who forecasts here ──────────────────────────────────────────── */}
        {nwsPoints && (
          <motion.section {...rise(0.2)} className="rounded-2xl p-4"
            style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
            <div className="text-[10px] uppercase tracking-[0.24em] mb-2.5 flex items-center gap-1.5" style={{ color: ROYAL.dim }}>
              <Radio className="w-3.5 h-3.5" /> Your NWS office
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Office", value: nwsPoints.properties.cwa },
                { label: "Grid", value: `${nwsPoints.properties.gridX}, ${nwsPoints.properties.gridY}` },
                { label: "Nearest town", value: nwsPoints.properties.relativeLocation?.properties?.city ?? "—" },
                { label: "Time zone", value: nwsPoints.properties.timeZone },
              ].map((s) => (
                <div key={s.label} className="rounded-xl px-3 py-2"
                     style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
                  <div className="text-[9.5px] uppercase tracking-[0.14em]" style={{ color: ROYAL.dim }}>{s.label}</div>
                  <div className="text-[13px] font-semibold truncate" style={{ color: ROYAL.text }}>{s.value}</div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        <p className="text-[10.5px] leading-relaxed text-center max-w-2xl mx-auto" style={{ color: ROYAL.dim }}>
          A composite of model fields for one point, not an NWS product and not a warning. It says what
          the atmosphere has available; whether a storm actually forms is a different question. Follow
          official NWS guidance.
        </p>
      </div>
    </ModuleShell>
  );
}
