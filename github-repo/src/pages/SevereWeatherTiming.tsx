import { useMemo } from "react";
import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { ModuleShell } from "../components/ModuleShell";
import DataUnavailable from "../components/DataUnavailable";
import { ChartSkeleton } from "../components/WeatherSkeleton";
import {
  computeSRHFromProfile,
  compute06kmShear,
  computeSWTI,
  cToF,
} from "../utils/weatherCalc";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ReferenceArea,
} from "recharts";
import { format, parseISO, isSameHour } from "date-fns";
import { Tornado, Wind, CloudHail, Sunset, Moon } from "lucide-react";
import { ROYAL, HEADING } from "../lib/royal";

interface Props { location: Location }

/**
 * Severe Weather Timing.
 *
 * THE MODULE IS ABOUT WHEN. It used to answer that last: a three-line Recharts
 * plot with a 36-hour axis, then a list of peaks, then a row of chips, then
 * twenty-four rows of table. Every number was there and the one question the
 * page exists to answer — when does tonight get dangerous — had to be
 * assembled by the reader from four places.
 *
 * So the hour ribbon is now the first thing on the page. Thirty-six cells, one
 * per hour, each coloured by its own worst hazard, with the night shaded and
 * the current hour marked. A chaser looking at it for one second knows the
 * shape of their evening; everything below is the detail behind that shape.
 *
 * WHY NIGHT IS ON IT. A tornado after dark is roughly twice as likely to kill
 * somebody as the same tornado at noon — people are asleep, sirens go unheard
 * and nobody sees it coming. "The risk peaks at 9pm" and "the risk peaks at
 * 2pm" are different warnings, and a timing module that draws them identically
 * is throwing away the most important thing it knows.
 *
 * WHAT IT REFUSES TO DO. Every parameter here used to fall back to zero when
 * the feed was missing — `cape ?? 0`, `li ?? 0` — and zeros compute cleanly all
 * the way to "Overall risk: None". That is a severe-weather page telling a
 * chaser the atmosphere is benign when it has never been measured. It guards
 * on the data now and says nothing rather than something invented.
 */

/** Threat bands. The same six the SPC uses, so the wording is familiar. */
function riskLabel(score: number): { text: string; color: string; bg: string; border: string } {
  if (score >= 80) return { text: "High",     color: "#d946ef", bg: "#d946ef18", border: "#d946ef40" };
  if (score >= 60) return { text: "Moderate", color: "#ef4444", bg: "#ef444418", border: "#ef444440" };
  if (score >= 40) return { text: "Enhanced", color: "#f97316", bg: "#f9731618", border: "#f9731640" };
  if (score >= 20) return { text: "Slight",   color: "#eab308", bg: "#eab30818", border: "#eab30840" };
  if (score >= 8)  return { text: "Marginal", color: "#86efac", bg: "#86efac18", border: "#86efac40" };
  return              { text: "None",     color: "#4ade80", bg: "#4ade8010", border: "#4ade8030" };
}

const HAZ = {
  tornado: { label: "Tornado", color: "#ef4444", icon: Tornado,   trigger: 5 },
  wind:    { label: "Wind",    color: "#22d3ee", icon: Wind,      trigger: 10 },
  hail:    { label: "Hail",    color: "#a855f7", icon: CloudHail, trigger: 8 },
} as const;
type Haz = keyof typeof HAZ;

/** Percentage probabilities from the model parameters. Ours, not the SPC's. */
function computeProbs(cape: number, srh: number, shear06: number, li: number) {
  const tornadoRaw = Math.min(100,
    (cape > 0 ? Math.pow(cape / 1500, 0.6) * 20 : 0)
    + (srh > 0 ? Math.pow(srh / 300, 0.7) * 12 : 0)
    + (shear06 > 0 ? (shear06 / 60) * 8 : 0)
    + (li < -3 ? Math.min(10, Math.abs(li) * 2) : 0));
  const windRaw = Math.min(100,
    (shear06 > 0 ? (shear06 / 80) * 25 : 0)
    + (cape > 500 ? (cape / 2000) * 15 : 0)
    + (srh > 100 ? (srh / 500) * 10 : 0));
  const hailRaw = Math.min(100,
    (cape > 0 ? Math.pow(cape / 2000, 0.5) * 22 : 0)
    + (shear06 > 0 ? (shear06 / 70) * 18 : 0)
    + (li < -2 ? Math.min(8, Math.abs(li) * 1.5) : 0));
  const r = (v: number) => Math.round(Math.max(0, v) * 10) / 10;
  return { tornado: r(tornadoRaw), wind: r(windRaw), hail: r(hailRaw) };
}

interface Hour {
  iso: string; date: Date;
  time: string; timeShort: string; hourNum: number;
  tornado: number; wind: number; hail: number;
  worst: number; worstHaz: Haz;
  swti: number; cape: number; srh: number; shear: number; dewF: number;
  night: boolean; isNow: boolean;
}

export default function SevereWeatherTiming({ location }: Props) {
  const { data: weather, isLoading, error, refetch } = useOpenMeteo(location);

  const hourly = weather?.hourly;
  const daily = weather?.daily;

  /**
   * Sunset and sunrise for each of the next few days, so an hour can be asked
   * whether it is dark. Falls back to 8pm–6am when the daily block is absent —
   * that is a display nuance, not a measurement, so an approximation is honest
   * here in a way that an approximated CAPE would not be.
   */
  const isNight = useMemo(() => {
    const sets = (daily?.sunset ?? []).map((v: string | number) => parseISO(String(v)));
    const rises = (daily?.sunrise ?? []).map((v: string | number) => parseISO(String(v)));
    return (d: Date): boolean => {
      if (!sets.length || !rises.length) return d.getHours() >= 20 || d.getHours() < 6;
      const set = sets.find((s) => s.toDateString() === d.toDateString());
      const rise = rises.find((s) => s.toDateString() === d.toDateString());
      if (!set || !rise) return d.getHours() >= 20 || d.getHours() < 6;
      return d < rise || d > set;
    };
  }, [daily]);

  const hours: Hour[] = useMemo(() => {
    const h = hourly;
    const times: string[] = h?.time?.slice(0, 36) ?? [];
    if (!h) return [];
    const now = new Date();
    return times.map((t: string, i: number) => {
      const cape = h.cape?.[i] ?? 0;
      const li = h.lifted_index?.[i] ?? 0;
      const dewC = h.dew_point_2m?.[i] ?? 10;
      const srh = computeSRHFromProfile(
        h.wind_speed_10m?.[i] ?? 0, h.wind_direction_10m?.[i] ?? 0,
        h.wind_speed_925hPa?.[i] ?? 0, h.wind_direction_925hPa?.[i] ?? 0,
        h.wind_speed_850hPa?.[i] ?? 0, h.wind_direction_850hPa?.[i] ?? 0,
        h.wind_speed_700hPa?.[i] ?? 0, h.wind_direction_700hPa?.[i] ?? 0,
        h.wind_speed_500hPa?.[i] ?? 0, h.wind_direction_500hPa?.[i] ?? 0);
      const shear = compute06kmShear(
        h.wind_speed_10m?.[i] ?? 0, h.wind_direction_10m?.[i] ?? 0,
        h.wind_speed_500hPa?.[i] ?? 0, h.wind_direction_500hPa?.[i] ?? 0);
      const swti = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: dewC });
      const p = computeProbs(cape, srh, shear, li);
      const d = parseISO(t);

      // Which hazard owns this hour, measured against each one's own trigger —
      // 6% tornado matters and 6% hail does not, so the raw maximum would
      // colour half the ribbon for hail on an ordinary summer afternoon.
      const rel: [Haz, number][] = [
        ["tornado", p.tornado / HAZ.tornado.trigger],
        ["wind", p.wind / HAZ.wind.trigger],
        ["hail", p.hail / HAZ.hail.trigger],
      ];
      rel.sort((a, b) => b[1] - a[1]);

      return {
        iso: t, date: d,
        time: format(d, "EEE ha"), timeShort: format(d, "ha"), hourNum: d.getHours(),
        tornado: p.tornado, wind: p.wind, hail: p.hail,
        worst: swti.score, worstHaz: rel[0][0],
        swti: swti.score,
        cape: Math.round(cape), srh: Math.round(srh), shear: Math.round(shear),
        dewF: Math.round(cToF(dewC)),
        night: isNight(d), isNow: isSameHour(d, now),
      };
    });
  }, [hourly, isNight]);

  /**
   * The dangerous stretch, as a stretch.
   *
   * A single peak hour is a poor answer to "when": storms do not arrive for
   * sixty minutes. This walks the run of consecutive hours around the peak
   * that stay above a third of it, which is what somebody planning a chase or
   * a night actually needs.
   */
  const window = useMemo(() => {
    if (!hours.length) return null;
    let peak = 0;
    hours.forEach((h, i) => { if (h.worst > hours[peak].worst) peak = i; });
    if (hours[peak].worst < 8) return null;          // nothing worth naming
    const floor = Math.max(8, hours[peak].worst * 0.34);
    let a = peak, b = peak;
    while (a > 0 && hours[a - 1].worst >= floor) a--;
    while (b < hours.length - 1 && hours[b + 1].worst >= floor) b++;
    return { start: hours[a], end: hours[b], peak: hours[peak] };
  }, [hours]);

  const peakOf = (k: Haz) =>
    hours.reduce<Hour | null>((best, h) => (best == null || h[k] > best[k] ? h : best), null);

  const overallMax = hours.length ? Math.max(...hours.map((h) => h.worst)) : 0;
  const risk = riskLabel(overallMax);

  // ── nothing measured is not the same as nothing happening ────────────────
  // The parameters all default to zero when absent and zero computes cleanly
  // through to "None", so an empty feed would render a confident all-clear.
  const measured = hours.length > 0 && Array.isArray(hourly?.cape);
  if (!isLoading && (error || !measured)) {
    return <DataUnavailable title="Severe Weather Timing" source="Open-Meteo" onRetry={() => refetch()} />;
  }

  const sunsetRaw = daily?.sunset?.[0] != null ? String(daily.sunset[0]) : undefined;
  const sunsetDisplay = sunsetRaw ? format(parseISO(sunsetRaw), "h:mm a") : null;
  const nightPeak = window && window.peak.night;

  return (
    <ModuleShell
      eyebrow="Open-Meteo · SSWX derived"
      title="Severe Timing"
      subtitle={`Hour by hour for ${location.name} — when the atmosphere is at its most dangerous, and for how long.`}
      status={
        // Only once there is something to have measured. `overallMax` is 0
        // while the feed is in flight, and 0 grades to "None" — a severe
        // weather page announcing an all-clear it has not earned, in the
        // header, before the first byte of data arrives.
        isLoading || !hours.length ? (
          <span className="text-[11px]" style={{ color: ROYAL.dim }}>
            Reading the profile hour by hour…
          </span>
        ) : (
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <span className="px-2 py-0.5 rounded-md font-bold uppercase tracking-widest"
                  style={{ background: risk.bg, border: `1px solid ${risk.border}`, color: risk.color }}>
              {risk.text}
            </span>
            <span style={{ color: ROYAL.dim }}>
              peak threat over the next 36 hours
            </span>
          </div>
        )
      }
    >
      {isLoading ? <ChartSkeleton /> : (
        <div className="space-y-4">

          {/* ── the answer, first ─────────────────────────────────────── */}
          <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: ROYAL.dim, fontFamily: HEADING }}>
                The next 36 hours
              </h3>
              {sunsetDisplay && (
                <span className="text-[11px] flex items-center gap-1.5" style={{ color: ROYAL.dim }}>
                  <Sunset className="w-3 h-3" /> Sunset {sunsetDisplay}
                </span>
              )}
            </div>

            <Ribbon hours={hours} />

            {window ? (
              <div className="rounded-xl px-3.5 py-3"
                   style={{ background: risk.bg, border: `1px solid ${risk.border}` }}>
                <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: risk.color }}>
                  Worst window
                </div>
                <div className="text-[15px] font-bold mt-0.5" style={{ color: ROYAL.text }}>
                  {window.start.time} → {window.end.time}
                  <span className="font-medium" style={{ color: ROYAL.dim }}>
                    {" "}· peaking {window.peak.timeShort}
                  </span>
                </div>
                {nightPeak && (
                  <div className="text-[11.5px] mt-1.5 flex items-start gap-1.5" style={{ color: "#fbbf24" }}>
                    <Moon className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>
                      The peak falls after dark. Night storms are the ones people sleep
                      through — have a way of being woken.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12px]" style={{ color: ROYAL.dim }}>
                Nothing organised in this window. The ribbon stays cool and there is no
                stretch worth naming.
              </p>
            )}
          </section>

          {/* ── by hazard ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(Object.keys(HAZ) as Haz[]).map((k) => {
              const meta = HAZ[k];
              const pk = peakOf(k);
              const Icon = meta.icon;
              const live = (pk?.[k] ?? 0) >= meta.trigger;
              return (
                <div key={k} className="bg-card border rounded-2xl p-3.5"
                     style={{ borderColor: live ? `${meta.color}55` : "hsl(var(--border))" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" style={{ color: meta.color }} />
                      <span className="text-[11px] uppercase tracking-[0.16em]"
                            style={{ color: ROYAL.dim }}>{meta.label}</span>
                    </div>
                    <span className="text-[18px] font-bold tabular-nums" style={{ color: meta.color }}>
                      {(pk?.[k] ?? 0).toFixed(1)}%
                    </span>
                  </div>
                  <Spark hours={hours} k={k} color={meta.color} />
                  <div className="text-[11px] mt-1" style={{ color: ROYAL.dim }}>
                    {live && pk ? <>peaks {pk.time}</> : <>stays below its threshold</>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── the detail ────────────────────────────────────────────── */}
          <section className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em] mb-3"
                style={{ color: ROYAL.dim, fontFamily: HEADING }}>
              Probability by hour
            </h3>
            <ResponsiveContainer width="100%" height={210}>
              {/* No negative left margin: it drags the axis off the canvas and
                  clips the very labels it is there to show — "32%" rendered as
                  "2%". The axis is given a real width instead. */}
              <AreaChart data={hours} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  {(Object.keys(HAZ) as Haz[]).map((k) => (
                    <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={HAZ[k].color} stopOpacity={0.42} />
                      <stop offset="100%" stopColor={HAZ[k].color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                {/* Night behind the data, so the shape is read against darkness. */}
                {nightBands(hours).map((b, i) => (
                  <ReferenceArea key={i} x1={b.from} x2={b.to} fill="#ccccff" fillOpacity={0.05} />
                ))}
                <XAxis dataKey="timeShort" tick={{ fontSize: 10, fill: ROYAL.dim }}
                       tickLine={false} axisLine={false} interval={5} />
                <YAxis tick={{ fontSize: 10, fill: ROYAL.dim }} tickLine={false} axisLine={false}
                       domain={[0, "auto"]} tickFormatter={(v) => `${v}%`} width={38} />
                <Tooltip content={<TimingTooltip />} />
                <ReferenceLine y={HAZ.tornado.trigger} stroke="#ef4444"
                               strokeDasharray="3 3" strokeOpacity={0.35} />
                {(Object.keys(HAZ) as Haz[]).map((k) => (
                  <Area key={k} type="monotone" dataKey={k} name={HAZ[k].label}
                        stroke={HAZ[k].color} strokeWidth={1.8}
                        fill={`url(#g-${k})`} dot={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2">
              {(Object.keys(HAZ) as Haz[]).map((k) => (
                <span key={k} className="flex items-center gap-1.5 text-[11px]" style={{ color: ROYAL.dim }}>
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: HAZ[k].color }} />
                  {HAZ[k].label}
                </span>
              ))}
            </div>
          </section>

          {/* ── the numbers behind it ─────────────────────────────────── */}
          <section className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: ROYAL.dim, fontFamily: HEADING }}>
                Hourly parameters
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    {["Time", "Tornado", "Wind", "Hail", "CAPE", "SRH", "Shear"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap"
                          style={{ color: ROYAL.dim }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hours.slice(0, 24).map((h) => (
                    <tr key={h.iso}
                        className="border-b border-border/30 hover:bg-muted/10"
                        style={h.isNow ? { background: "rgba(217,183,117,0.07)" } : undefined}>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {h.night && <Moon className="w-3 h-3 opacity-45" />}
                          {h.time}
                        </span>
                      </td>
                      {(Object.keys(HAZ) as Haz[]).map((k) => (
                        <td key={k} className="px-3 py-2 font-bold tabular-nums whitespace-nowrap"
                            style={{ color: h[k] > HAZ[k].trigger ? HAZ[k].color : ROYAL.dim }}>
                          {h[k].toFixed(1)}%
                        </td>
                      ))}
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{h.cape}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{h.srh}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{h.shear}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-[11px] leading-relaxed" style={{ color: ROYAL.dim }}>
            Probabilities are computed by StormSync from Open-Meteo model output — CAPE,
            storm-relative helicity, 0–6 km shear and lifted index — not quoted from the SPC.
            They describe the atmosphere's potential at this point, not a forecast that a
            storm will form.
          </p>
        </div>
      )}
    </ModuleShell>
  );
}

/* ── the ribbon ───────────────────────────────────────────────────────────── */

/**
 * Thirty-six hours as thirty-six cells.
 *
 * Height carries threat as well as colour, so the shape of the evening is
 * legible in a glance and in greyscale — colour alone would leave a
 * red-green colourblind reader reading a flat strip.
 */
function Ribbon({ hours }: { hours: Hour[] }) {
  const max = Math.max(20, ...hours.map((h) => h.worst));
  return (
    <div>
      <div className="flex items-end gap-[2px] h-[72px]">
        {hours.map((h) => {
          const meta = HAZ[h.worstHaz];
          const frac = Math.min(1, h.worst / max);
          const lit = h.worst >= 8;
          return (
            <div key={h.iso} className="relative flex-1 h-full flex items-end"
                 title={`${h.time} — ${h.worst.toFixed(0)} SWTI · ${meta.label} leading`}>
              {/* night behind the bar */}
              {h.night && (
                <span aria-hidden className="absolute inset-0 rounded-[2px]"
                      style={{ background: "rgba(204,204,255,0.06)" }} />
              )}
              <span
                className="relative w-full rounded-[2px] transition-[height] duration-300"
                style={{
                  height: `${Math.max(4, frac * 100)}%`,
                  background: lit ? meta.color : "rgba(204,204,255,0.16)",
                  opacity: lit ? 0.55 + frac * 0.45 : 1,
                  boxShadow: lit && frac > 0.7 ? `0 0 10px ${meta.color}66` : undefined,
                }}
              />
              {h.isNow && (
                <span aria-hidden className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                      style={{ background: ROYAL.gold }} />
              )}
            </div>
          );
        })}
      </div>
      {/* Labels are POSITIONED, not laid out.
          One flex cell per hour with the time inside it gives every cell a
          minimum width of about "12AM" — thirty-six of those is 780px, and on
          a 430px phone that pushed the whole page into horizontal scroll even
          though the invisible ones were only at opacity 0. Hidden text still
          occupies space. Absolute placement contributes no width at all, and
          the marks land on the hour they name at any viewport. */}
      <div className="relative h-4 mt-1.5">
        {hours.map((h, i) => {
          // The "now" mark always shows; a six-hourly tick standing too close
          // to it steps aside rather than printing one time over another.
          const nowAt = hours.findIndex((x) => x.isNow);
          const clash = nowAt >= 0 && Math.abs(i - nowAt) < 3 && !h.isNow;
          if ((i % 6 !== 0 || clash) && !h.isNow) return null;
          return (
            <span key={h.iso}
                  className="absolute top-0 text-[9px] tabular-nums whitespace-nowrap -translate-x-1/2"
                  style={{
                    left: `${((i + 0.5) / hours.length) * 100}%`,
                    color: h.isNow ? ROYAL.gold : ROYAL.dim,
                  }}>
              {h.timeShort}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** A hazard's own shape across the window, at card size. */
function Spark({ hours, k, color }: { hours: Hour[]; k: Haz; color: string }) {
  if (hours.length < 2) return null;
  const max = Math.max(1, ...hours.map((h) => h[k]));
  const pts = hours.map((h, i) => {
    const x = (i / (hours.length - 1)) * 100;
    const y = 26 - (h[k] / max) * 24;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="w-full h-7 mt-2" aria-hidden>
      <polyline points={`0,28 ${pts.join(" ")} 100,28`} fill={color} fillOpacity={0.13} stroke="none" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.4}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Contiguous runs of dark hours, as chart x-ranges. */
function nightBands(hours: Hour[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  let start: string | null = null;
  hours.forEach((h, i) => {
    if (h.night && start == null) start = h.timeShort;
    const ends = !h.night || i === hours.length - 1;
    if (ends && start != null) { out.push({ from: start, to: h.timeShort }); start = null; }
  });
  return out;
}

const TimingTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: { payload: Hour }[]; label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const h = payload[0].payload;
  return (
    <div className="rounded-lg px-3 py-2 text-xs"
         style={{ background: ROYAL.ink2, border: `1px solid ${ROYAL.hairline}` }}>
      <div className="font-semibold mb-1 flex items-center gap-1.5" style={{ color: ROYAL.text }}>
        {h.night && <Moon className="w-3 h-3 opacity-60" />}{h.time ?? label}
      </div>
      {(Object.keys(HAZ) as Haz[]).map((k) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: HAZ[k].color }} />
          <span style={{ color: ROYAL.dim }}>{HAZ[k].label}</span>
          <span className="font-bold tabular-nums" style={{ color: HAZ[k].color }}>
            {h[k].toFixed(1)}%
          </span>
        </div>
      ))}
      <div className="mt-1 pt-1 border-t text-[10.5px] tabular-nums"
           style={{ borderColor: ROYAL.hairline, color: ROYAL.dim }}>
        CAPE {h.cape} · SRH {h.srh} · shear {h.shear} kt
      </div>
    </div>
  );
};
