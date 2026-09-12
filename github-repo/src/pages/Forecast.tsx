/**
 * Daily Brief & Forecast.
 *
 * REDESIGNED, not rearranged. What was here before was a row of pill buttons
 * over seven identical cards and four Recharts panels in default colours. Every
 * number was set at the same size as every other number, so the page had no
 * opinion about what a person had come for.
 *
 * The structure now has a subject. A day is selected — the ribbon shows the
 * whole week as one shared-scale chart, so the shape of the week is legible
 * before you read a single figure — and everything below is about *that day*.
 * The hero states the day at display size with its daylight arc beside it. The
 * subtabs then go deeper into the same day rather than jumping back to "the
 * next 48 hours" regardless of what you pressed.
 *
 * That last point is the substantive change, not a cosmetic one: the charts
 * used to ignore the selection entirely. Choosing Thursday and being shown
 * Tuesday afternoon is what makes a forecast feel like a dashboard.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";
import { CalendarDays, Thermometer, Wind, CloudRain, Gauge, FileText } from "lucide-react";

import { useOpenMeteo, useNWSForecast, useNWSPoints } from "../hooks/useWeatherQuery";
import { ModuleShell, Panel } from "../components/ModuleShell";
import { DigestCard } from "../components/forecast/DigestCard";
import { SegmentedTabs, type Segment } from "../components/forecast/SegmentedTabs";
import { DayRibbon, type RibbonDay } from "../components/forecast/DayRibbon";
import { DayHero, type Readout } from "../components/forecast/DayHero";
import { Barograph, type BaroPoint } from "../components/motion/WeatherMotion";
import { useCalm } from "../lib/calm";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";
import type { Location } from "../hooks/useLocation";
import { ChartSkeleton } from "../components/WeatherSkeleton";
import { cToF, msToMph, getWindDirection } from "../utils/weatherCalc";
import { WEATHER_ICONS, WMO_DESCRIPTIONS } from "../config";

interface Props { location: Location }

const TABS = [
  { id: "brief", label: "Brief" },
  { id: "daily", label: "Daily" },
  { id: "hourly", label: "Hourly" },
  { id: "wind", label: "Wind" },
  { id: "precip", label: "Precipitation" },
  { id: "pressure", label: "Pressure" },
] as const satisfies readonly Segment<string>[];
type TabId = typeof TABS[number]["id"];

// ── chart furniture ──────────────────────────────────────────────────────────
// Recharts' defaults are a light-mode grid on a dark panel. These are the
// module's own, so every chart here reads as part of the same instrument.
const AXIS = { fontSize: 10, fill: ROYAL.dim } as const;
const axisProps = { tick: AXIS, tickLine: false, axisLine: false, stroke: ROYAL.hairline } as const;
const GRID = <CartesianGrid stroke={ROYAL.hairline} strokeDasharray="2 6" vertical={false} />;

function ChartTip({ active, payload, label, unit = "" }: {
  active?: boolean;
  payload?: { dataKey?: string | number; name?: string; value?: unknown; stroke?: string; fill?: string }[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 text-[11px]"
      style={{
        background: "rgba(10,10,22,0.94)",
        border: `1px solid ${ROYAL.goldSoft}`,
        boxShadow: "0 18px 40px -24px rgba(0,0,0,1)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="font-semibold mb-1" style={{ color: ROYAL.gold }}>{label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 tabular-nums">
          <span className="w-2 h-2 rounded-full" style={{ background: p.stroke || p.fill }} />
          <span style={{ color: ROYAL.dim }}>{p.name}</span>
          <span className="ml-auto font-bold" style={{ color: ROYAL.text }}>{String(p.value)}{unit}</span>
        </div>
      ))}
    </div>
  );
}

interface NWSPeriod {
  name: string; temperature: number; temperatureUnit: string;
  windSpeed: string; windDirection: string;
  shortForecast: string; detailedForecast: string; isDaytime?: boolean;
}

/** One NWS period on a rail: day in champagne, night in periwinkle. */
function PeriodRow({ period, i, still }: { period: NWSPeriod; i: number; still: boolean }) {
  const day = period.isDaytime !== false;
  return (
    <motion.li
      initial={still ? { opacity: 0 } : { opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: still ? 0.2 : 0.4, delay: still ? 0 : Math.min(i, 8) * 0.04, ease: EASE }}
      className="relative pl-7 pr-4 py-3"
    >
      <span
        aria-hidden
        className="absolute left-[9px] top-[18px] w-2 h-2 rounded-full"
        style={{
          background: day ? ROYAL.gold : ROYAL.iris,
          boxShadow: `0 0 12px -2px ${day ? ROYAL.gold : ROYAL.iris}`,
        }}
      />
      <div className="flex items-baseline gap-3">
        <span className="text-sm font-semibold" style={{ color: ROYAL.text }}>{period.name}</span>
        <span className="ml-auto text-base font-bold tabular-nums"
              style={{ color: day ? ROYAL.gold : ROYAL.iris, fontFamily: HEADING }}>
          {period.temperature}°{period.temperatureUnit}
        </span>
      </div>
      <div className="text-[12px] mt-0.5" style={{ color: ROYAL.text }}>{period.shortForecast}</div>
      <div className="text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>
        {period.windSpeed} {period.windDirection}
      </div>
    </motion.li>
  );
}

export default function Forecast({ location }: Props) {
  const { data: weather, isLoading } = useOpenMeteo(location);
  const { data: nwsPoints } = useNWSPoints(location);
  const { data: nwsForecast } = useNWSForecast(nwsPoints?.properties?.forecast);
  const [tab, setTab] = useState<TabId>("brief");

  const { calm } = useCalm(location.lat, location.lon);
  const still = prefersReducedMotion() || calm;

  const hourly = weather?.hourly;
  const daily = weather?.daily;
  const current = weather?.current;

  // ── the week ───────────────────────────────────────────────────────────────
  const days = useMemo<RibbonDay[]>(() => {
    const times = daily?.time as string[] | undefined;
    if (!times) return [];
    const today = format(new Date(), "yyyy-MM-dd");
    return times.map((t, i) => ({
      key: t,
      dow: format(parseISO(t), "EEE"),
      dayNum: format(parseISO(t), "MMM d"),
      hi: daily!.temperature_2m_max ? Math.round(cToF(Number(daily!.temperature_2m_max[i]))) : null,
      lo: daily!.temperature_2m_min ? Math.round(cToF(Number(daily!.temperature_2m_min[i]))) : null,
      icon: WEATHER_ICONS[Number(daily!.weather_code?.[i] ?? 0)] ?? "🌡️",
      precipProb: Number(daily!.precipitation_probability_max?.[i] ?? 0),
      isToday: t === today,
    }));
  }, [daily]);

  const [selected, setSelected] = useState<string | null>(null);
  const activeKey = selected && days.some((d) => d.key === selected)
    ? selected
    : (days.find((d) => d.isToday)?.key ?? days[0]?.key ?? "");
  const dayIdx = Math.max(0, days.findIndex((d) => d.key === activeKey));
  const day = days[dayIdx];
  const isToday = !!day?.isToday;

  // ── the selected day's hours ───────────────────────────────────────────────
  // Scoped to the day on the ribbon. On today it rolls forward from the current
  // hour into tomorrow, because "the rest of today" is what today means; on any
  // other day it is that day's own midnight to midnight.
  const dayHours = useMemo(() => {
    const times = hourly?.time as string[] | undefined;
    if (!times || !activeKey) return [];
    const rows = times.map((t, i) => ({
      t,
      date: t.slice(0, 10),
      time: format(parseISO(t), "ha"),
      full: format(parseISO(t), "EEE ha"),
      temp: hourly!.temperature_2m ? Math.round(cToF(hourly!.temperature_2m[i])) : 0,
      feels: hourly!.apparent_temperature ? Math.round(cToF(hourly!.apparent_temperature[i])) : 0,
      precip: hourly!.precipitation_probability?.[i] ?? 0,
      precipAmt: Number((hourly!.precipitation?.[i] ?? 0).toFixed(2)),
      wind: hourly!.wind_speed_10m ? Math.round(msToMph(hourly!.wind_speed_10m[i])) : 0,
      gust: hourly!.wind_gusts_10m ? Math.round(msToMph(hourly!.wind_gusts_10m[i])) : 0,
      windDir: hourly!.wind_direction_10m?.[i] ?? 0,
      mb: hourly!.surface_pressure?.[i],
    }));
    if (isToday) {
      const nowIso = format(new Date(), "yyyy-MM-dd'T'HH:00");
      const at = rows.findIndex((r) => r.t >= nowIso);
      const start = at < 0 ? 0 : at;
      return rows.slice(start, start + 30);
    }
    return rows.filter((r) => r.date === activeKey);
  }, [hourly, activeKey, isToday]);

  const baro = useMemo<BaroPoint[]>(
    () => dayHours.filter((r) => typeof r.mb === "number").map((r) => ({ t: r.t, mb: r.mb as number })),
    [dayHours],
  );

  // ── the hero ───────────────────────────────────────────────────────────────
  const wmo = Number(daily?.weather_code?.[dayIdx] ?? 0);
  const heroTemp = isToday && typeof current?.temperature_2m === "number"
    ? Math.round(cToF(current.temperature_2m))
    : day?.hi ?? null;
  const feels = isToday && typeof current?.apparent_temperature === "number"
    ? Math.round(cToF(current.apparent_temperature))
    : daily?.apparent_temperature_max
      ? Math.round(cToF(Number(daily.apparent_temperature_max[dayIdx])))
      : null;

  const readouts = useMemo<Readout[]>(() => {
    if (!daily || !day) return [];
    const windMax = daily.wind_speed_10m_max ? Math.round(msToMph(Number(daily.wind_speed_10m_max[dayIdx]))) : null;
    const gustMax = daily.wind_gusts_10m_max ? Math.round(msToMph(Number(daily.wind_gusts_10m_max[dayIdx]))) : null;
    const dir = daily.wind_direction_10m_dominant?.[dayIdx];
    const total = Number(daily.precipitation_sum?.[dayIdx] ?? 0);
    const humid = isToday && typeof current?.relative_humidity_2m === "number";
    return [
      {
        label: "Rain chance", value: `${day.precipProb}%`,
        sub: total > 0 ? `${total.toFixed(2)}" expected` : "nothing expected", tone: "rain",
      },
      {
        label: "Wind", value: windMax === null ? "—" : `${windMax} mph`,
        sub: typeof dir === "number" ? `from the ${getWindDirection(Number(dir))}` : undefined, tone: "iris",
      },
      {
        label: "Gusts", value: gustMax === null ? "—" : `${gustMax} mph`,
        sub: gustMax !== null && gustMax >= 35 ? "strong" : "peak for the day",
        tone: gustMax !== null && gustMax >= 35 ? "gold" : "plain",
      },
      humid
        ? {
            label: "Humidity", value: `${Math.round(current!.relative_humidity_2m as number)}%`,
            sub: typeof current?.dew_point_2m === "number" ? `dew point ${Math.round(cToF(current.dew_point_2m))}°` : undefined,
            tone: "plain",
          }
        : { label: "Low", value: day.lo === null ? "—" : `${day.lo}°`, sub: "overnight", tone: "plain" },
    ];
  }, [daily, day, dayIdx, isToday, current]);

  const nwsPeriods = (Array.isArray(nwsForecast)
    ? nwsForecast
    : ((nwsForecast as unknown as { properties?: { periods?: unknown[] } })?.properties?.periods ?? [])
  ).slice(0, 14) as NWSPeriod[];

  const xKey: "full" | "time" = isToday ? "full" : "time";
  const spanLabel = isToday ? "next 30 hours" : activeKey ? format(parseISO(activeKey), "EEEE") : "";

  return (
    <ModuleShell
      eyebrow="Open-Meteo · NWS"
      title="Daily Brief"
      subtitle={`${location.name} — your brief, the week ahead, and the hour-by-hour behind it.`}
      status={days.length > 0
        ? <DayRibbon days={days} selected={activeKey} onSelect={setSelected} still={still} />
        : undefined}
    >
      {day && (
        <DayHero
          key={activeKey}
          eyebrow={isToday ? "Right now" : "Forecast"}
          title={format(parseISO(activeKey), "EEEE, MMMM d")}
          condition={WMO_DESCRIPTIONS[wmo] ?? "—"}
          icon={day.icon}
          temp={heroTemp}
          tempCaption={isToday ? "current temperature" : "daytime high"}
          hi={day.hi}
          lo={day.lo}
          feels={feels}
          sunrise={daily?.sunrise?.[dayIdx] as string | undefined}
          sunset={daily?.sunset?.[dayIdx] as string | undefined}
          isToday={isToday}
          readouts={readouts}
          still={still}
        />
      )}

      <SegmentedTabs segments={TABS} value={tab} onChange={setTab}
                     layoutId="forecast-tabs" controls="forecast-panel" label="Forecast sections" />

      <div id="forecast-panel" role="tabpanel">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={still ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: still ? 0.15 : 0.28, ease: EASE }}
            className="space-y-4"
          >
            {tab === "brief" && (
              <DigestCard lat={location.lat} lon={location.lon} place={location.name} />
            )}

            {tab === "daily" && (
              <Panel
                title={<span className="flex items-center gap-2"><FileText className="w-4 h-4" style={{ color: ROYAL.gold }} /> NWS official forecast</span>}
                aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>day and night, in the forecaster's words</span>}
                padded={false}
              >
                {nwsPeriods.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm" style={{ color: ROYAL.dim }}>
                    The National Weather Service has not returned a narrative forecast for this point.
                  </div>
                ) : (
                  <ol className="relative divide-y" style={{ borderColor: ROYAL.hairline }}>
                    <span aria-hidden className="absolute left-[13px] top-5 bottom-5 w-px"
                          style={{ background: `linear-gradient(180deg, ${ROYAL.goldSoft}, transparent)` }} />
                    {nwsPeriods.map((p, i) => <PeriodRow key={`${p.name}-${i}`} period={p} i={i} still={still} />)}
                  </ol>
                )}
              </Panel>
            )}

            {tab === "hourly" && (
              <>
                <Panel
                  title={<span className="flex items-center gap-2"><Thermometer className="w-4 h-4" style={{ color: "#ff9d4d" }} /> Temperature and feels-like</span>}
                  aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>{spanLabel}</span>}
                >
                  {isLoading ? <ChartSkeleton /> : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={dayHours} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="tempG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ff9d4d" stopOpacity={0.42} />
                            <stop offset="100%" stopColor="#ff9d4d" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        {GRID}
                        <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" minTickGap={28} />
                        <YAxis {...axisProps} unit="°" width={44} />
                        <Tooltip content={<ChartTip unit="°F" />} cursor={{ stroke: ROYAL.goldSoft }} />
                        <Area type="monotone" dataKey="temp" name="Temp" stroke="#ff9d4d" fill="url(#tempG)" strokeWidth={2.25} dot={false} />
                        <Line type="monotone" dataKey="feels" name="Feels like" stroke={ROYAL.iris} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </Panel>

                <Panel title="Hour by hour" padded={false} defer>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
                          {["Time", "Temp", "Feels", "Rain", "Wind"].map((h) => (
                            <th key={h} className="text-left px-4 py-2 font-semibold uppercase tracking-[0.14em] text-[10px] whitespace-nowrap"
                                style={{ color: ROYAL.dim }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dayHours.slice(0, 24).map((h) => (
                          <tr key={h.t} className="transition-colors hover:bg-white/[0.03]"
                              style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
                            <td className="px-4 py-2 font-semibold whitespace-nowrap" style={{ color: ROYAL.text }}>{h[xKey]}</td>
                            <td className="px-4 py-2 font-bold tabular-nums" style={{ color: "#ff9d4d" }}>{h.temp}°</td>
                            <td className="px-4 py-2 tabular-nums" style={{ color: ROYAL.dim }}>{h.feels}°</td>
                            <td className="px-4 py-2 tabular-nums" style={{ color: h.precip >= 40 ? "#6fb6ff" : ROYAL.dim }}>{h.precip}%</td>
                            <td className="px-4 py-2 tabular-nums whitespace-nowrap" style={{ color: ROYAL.text }}>
                              {h.wind} mph {getWindDirection(h.windDir)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </>
            )}

            {tab === "wind" && (
              <Panel
                title={<span className="flex items-center gap-2"><Wind className="w-4 h-4" style={{ color: ROYAL.iris }} /> Wind and gusts</span>}
                aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>{spanLabel}</span>}
              >
                {isLoading ? <ChartSkeleton /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={dayHours} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                      {GRID}
                      <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" minTickGap={28} />
                      <YAxis {...axisProps} unit=" mph" width={52} />
                      <Tooltip content={<ChartTip unit=" mph" />} cursor={{ fill: "rgba(204,204,255,0.05)" }} />
                      <Bar dataKey="wind" name="Sustained" fill={ROYAL.iris} fillOpacity={0.35} radius={[3, 3, 0, 0]} />
                      <Line type="monotone" dataKey="gust" name="Gusts" stroke={ROYAL.gold} strokeWidth={2.25} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </Panel>
            )}

            {tab === "precip" && (
              <>
                <Panel
                  title={<span className="flex items-center gap-2"><CloudRain className="w-4 h-4" style={{ color: "#6fb6ff" }} /> Chance of rain</span>}
                  aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>{spanLabel}</span>}
                >
                  {isLoading ? <ChartSkeleton /> : (
                    <ResponsiveContainer width="100%" height={190}>
                      <BarChart data={dayHours} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                        {GRID}
                        <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" minTickGap={28} />
                        <YAxis {...axisProps} unit="%" domain={[0, 100]} width={44} />
                        <Tooltip content={<ChartTip unit="%" />} cursor={{ fill: "rgba(111,182,255,0.08)" }} />
                        <Bar dataKey="precip" name="Chance" fill="#4f9df0" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Panel>

                <Panel title="How much" aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>inches per hour</span>} defer>
                  {isLoading ? <ChartSkeleton /> : (
                    <ResponsiveContainer width="100%" height={190}>
                      <AreaChart data={dayHours} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="precipG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#37c5dd" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#37c5dd" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        {GRID}
                        <XAxis dataKey={xKey} {...axisProps} interval="preserveStartEnd" minTickGap={28} />
                        <YAxis {...axisProps} unit='"' width={52} />
                        <Tooltip content={<ChartTip unit='"' />} cursor={{ stroke: ROYAL.goldSoft }} />
                        <Area type="monotone" dataKey="precipAmt" name="Rain" stroke="#37c5dd" fill="url(#precipG)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </Panel>
              </>
            )}

            {tab === "pressure" && (
              <Panel
                title={<span className="flex items-center gap-2"><Gauge className="w-4 h-4" style={{ color: ROYAL.gold }} /> Barograph</span>}
                aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>surface pressure · {spanLabel}</span>}
              >
                <Barograph points={baro} calm={still} height={150} />
                <p className="text-[11px] mt-3 leading-relaxed" style={{ color: ROYAL.dim }}>
                  A falling barometer is the oldest storm signal there is, and the rate matters more than the
                  number: a drop of more than about a millibar an hour is what a forecaster looks for, and it is
                  invisible on an ordinary line chart unless something points at it. Any such hour is marked.
                </p>
              </Panel>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2 text-[10px] pt-1" style={{ color: ROYAL.dim }}>
        <CalendarDays className="w-3 h-3 shrink-0" />
        Seven-day and hourly guidance from Open-Meteo; the narrative forecast is the National Weather Service's own.
      </div>
    </ModuleShell>
  );
}
