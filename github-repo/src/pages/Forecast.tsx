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
 * before you read a single figure — and the hero states that day at display
 * size with its daylight arc beside it.
 *
 * WHERE THE CHARTS WENT
 * Hourly, Wind, Precipitation and Pressure were four re-plots of the series the
 * ribbon and the hero had already stated: the same point, the same day, drawn
 * again. What stands in their place is the other half of a forecast — what the
 * national centres think is going to happen, across the whole country, on
 * horizons a point forecast cannot reach. SPC's risk areas, WPC's rainfall and
 * heat, CPC's monthly and seasonal odds, and the autumn record. Each is fetched
 * from the issuing centre and drawn in the app's own projection, so they read as
 * part of this module rather than as embedded screenshots of somebody else's.
 */
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { CalendarDays, FileText } from "lucide-react";

import { useOpenMeteo, useNWSForecast, useNWSPoints } from "../hooks/useWeatherQuery";
import { ModuleShell, Panel } from "../components/ModuleShell";
import { DigestCard } from "../components/forecast/DigestCard";
import { SegmentedTabs, type Segment } from "../components/forecast/SegmentedTabs";
import { DayRibbon, type RibbonDay } from "../components/forecast/DayRibbon";
import { DayHero, type Readout } from "../components/forecast/DayHero";
import { Outlooks } from "../components/outlook/Outlooks";
import { useCalm } from "../lib/calm";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";
import type { Location } from "../hooks/useLocation";
import { cToF, msToMph, getWindDirection } from "../utils/weatherCalc";
import { WEATHER_ICONS, WMO_DESCRIPTIONS } from "../config";

interface Props { location: Location }

/**
 * The sections, and why the labels carry a second line.
 *
 * The outlooks were shipped as "SPC", "WPC", "CPC", "Other" sitting below a
 * full-height hero — which meant that unless you already knew what those
 * initials were and thought to scroll, the entire national half of this module
 * was invisible. The initials stay, because they are what the products are
 * actually called, but each now says in plain words what it is, and the whole
 * bar sits at the TOP of the page rather than a screen down.
 */
const TABS = [
  { id: "brief", label: "Brief", sub: "your digest" },
  { id: "daily", label: "NWS", sub: "official forecast" },
  { id: "spc", label: "SPC", sub: "storm risk" },
  { id: "wpc", label: "WPC", sub: "rain & heat" },
  { id: "cpc", label: "CPC", sub: "climate outlook" },
  { id: "other", label: "Seasonal", sub: "fall colour" },
] as const satisfies readonly Segment<string>[];
type TabId = typeof TABS[number]["id"];

/** The two sections that are about the member's own location. */
const LOCAL: readonly TabId[] = ["brief", "daily"];

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
  const { data: weather } = useOpenMeteo(location);
  const { data: nwsPoints } = useNWSPoints(location);
  const { data: nwsForecast } = useNWSForecast(nwsPoints?.properties?.forecast);
  const [tab, setTab] = useState<TabId>("brief");

  const { calm } = useCalm(location.lat, location.lon);
  const still = prefersReducedMotion() || calm;

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

  const isLocal = (LOCAL as readonly string[]).includes(tab);

  return (
    <ModuleShell
      eyebrow="Open-Meteo · NWS · SPC · WPC · CPC"
      title="Daily Brief"
      subtitle={`${location.name} — your brief, the week ahead, and what the national centres are watching.`}
      status={
        <SegmentedTabs segments={TABS} value={tab} onChange={setTab}
                       layoutId="forecast-tabs" controls="forecast-panel" label="Forecast sections" />
      }
    >
      {/* The week and the day belong to the local sections. On an outlook the
          hero is a screen of somebody else's weather standing between you and
          the map you came for. */}
      {isLocal && days.length > 0 && (
        <DayRibbon days={days} selected={activeKey} onSelect={setSelected} still={still} />
      )}

      {isLocal && day && (
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

            {tab === "spc" && <Outlooks group="spc" still={still} />}
            {tab === "wpc" && <Outlooks group="wpc" still={still} />}
            {tab === "cpc" && <Outlooks group="cpc" still={still} />}
            {tab === "other" && <Outlooks group="other" still={still} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-2 text-[10px] pt-1" style={{ color: ROYAL.dim }}>
        <CalendarDays className="w-3 h-3 shrink-0" />
        Seven-day guidance from Open-Meteo and the narrative forecast from the National Weather Service; every
        outlook is the issuing centre's own, fetched live and drawn here unaltered.
      </div>
    </ModuleShell>
  );
}
