import { useOpenMeteo, useNWSForecast, useNWSPoints } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { ChartSkeleton } from "../components/WeatherSkeleton";
import { cToF, msToMph, getWindDirection } from "../utils/weatherCalc";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ComposedChart,
} from "recharts";
import { format, parseISO } from "date-fns";
import { CalendarDays, Thermometer, Wind, CloudRain, ChevronRight } from "lucide-react";
import { useState } from "react";
import { WMO_DESCRIPTIONS, WEATHER_ICONS } from "../config";

interface Props { location: Location }

const TABS = ["Daily", "Hourly", "Wind", "Precipitation"] as const;
type Tab = typeof TABS[number];

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

export default function Forecast({ location }: Props) {
  const { data: weather, isLoading } = useOpenMeteo(location);
  const { data: nwsPoints } = useNWSPoints(location);
  const { data: nwsForecast } = useNWSForecast(nwsPoints?.properties?.forecast);
  const [activeTab, setActiveTab] = useState<Tab>("Daily");

  const hourly = weather?.hourly;
  const daily = weather?.daily;

  const hourlyData = (hourly?.time as string[] | undefined)?.slice(0, 48).map((t: string, i: number) => ({
    time: format(parseISO(t), "EEE ha"),
    temp: hourly!.temperature_2m ? Math.round(cToF(hourly!.temperature_2m[i])) : 0,
    feels: hourly!.apparent_temperature ? Math.round(cToF(hourly!.apparent_temperature[i])) : 0,
    precip: hourly!.precipitation_probability?.[i] ?? 0,
    precipAmt: hourly!.precipitation?.[i] ?? 0,
    wind: hourly!.wind_speed_10m ? Math.round(msToMph(hourly!.wind_speed_10m[i])) : 0,
    gust: hourly!.wind_gusts_10m ? Math.round(msToMph(hourly!.wind_gusts_10m[i])) : 0,
    windDir: hourly!.wind_direction_10m?.[i] ?? 0,
  })) ?? [];

  const dailyCards = (daily?.time as string[] | undefined)?.map((t: string, i: number) => ({
    date: format(parseISO(t), "EEE, MMM d"),
    dateShort: format(parseISO(t), "EEE"),
    hi: daily!.temperature_2m_max ? Math.round(cToF(Number(daily!.temperature_2m_max[i]))) : null,
    lo: daily!.temperature_2m_min ? Math.round(cToF(Number(daily!.temperature_2m_min[i]))) : null,
    precip: Number(daily!.precipitation_sum?.[i] ?? 0),
    precipProb: daily!.precipitation_probability_max?.[i] ?? 0,
    wind: daily!.wind_speed_10m_max ? Math.round(msToMph(Number(daily!.wind_speed_10m_max[i]))) : null,
    wmo: Number(daily!.weather_code?.[i] ?? 0),
    sunrise: daily!.sunrise?.[i],
    sunset: daily!.sunset?.[i],
  })) ?? [];

  const nwsPeriods = (Array.isArray(nwsForecast) ? nwsForecast : ((nwsForecast as unknown as { properties?: { periods?: unknown[] } })?.properties?.periods ?? [])).slice(0, 14) as Array<{ name: string; temperature: number; temperatureUnit: string; windSpeed: string; windDirection: string; shortForecast: string; detailedForecast: string }>;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <CalendarDays className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold tracking-wide">Forecast</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name}</p>

      <div className="flex gap-2">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-primary/15 text-primary border border-primary/30"
                : "bg-card border border-border text-muted-foreground hover:border-primary/40"
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Daily" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {isLoading ? (
              Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 h-32 animate-pulse" />
              ))
            ) : dailyCards.map((day, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{day.dateShort}</span>
                  <span className="text-xl">{WEATHER_ICONS[day.wmo] ?? "🌡️"}</span>
                </div>
                <div className="text-xs text-muted-foreground mb-1">{day.date}</div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-lg font-bold">{day.hi ?? "—"}°</span>
                  <span className="text-sm text-muted-foreground">{day.lo ?? "—"}°</span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <CloudRain className="w-3 h-3 text-blue-400" />
                    <span>{day.precipProb}% · {Number(day.precip).toFixed(2)}"</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Wind className="w-3 h-3 text-primary" />
                    <span>{day.wind ?? "—"} mph</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {nwsPeriods.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-3 border-b border-border">
                <h3 className="text-sm font-semibold">NWS Official Forecast</h3>
              </div>
              <div className="divide-y divide-border">
                {nwsPeriods.map((period, i: number) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{period.name}</span>
                      <span className="text-sm font-bold">{period.temperature}°{period.temperatureUnit}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{period.windSpeed} {period.windDirection} · {period.shortForecast ?? ""}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "Hourly" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-orange-400" /> Temperature & Feels Like (48h)
            </h3>
            {isLoading ? <ChartSkeleton /> : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={hourlyData}>
                  <defs>
                    <linearGradient id="tempG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval={5} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="°" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`${v}°F`, n === "temp" ? "Temp" : "Feels Like"]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="temp" name="Temp" stroke="#f97316" fill="url(#tempG)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="feels" name="Feels Like" stroke="#7B8FD9" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-3 border-b border-border"><h3 className="text-sm font-semibold">Hour-by-Hour</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {["Time", "Temp", "Feels", "Precip %", "Wind"].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hourlyData.slice(0, 24).map((h, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/10">
                      <td className="px-3 py-2 font-medium">{h.time}</td>
                      <td className="px-3 py-2 text-orange-400 font-bold">{h.temp}°F</td>
                      <td className="px-3 py-2 text-muted-foreground">{h.feels}°F</td>
                      <td className="px-3 py-2 text-blue-400">{h.precip}%</td>
                      <td className="px-3 py-2">{h.wind} mph {getWindDirection(h.windDir)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Wind" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Wind className="w-4 h-4 text-primary" /> Wind Speed & Gusts (48h)
            </h3>
            {isLoading ? <ChartSkeleton /> : (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={hourlyData}>
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval={5} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit=" mph" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [`${v} mph`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="wind" name="Wind" fill="#7B8FD9" opacity={0.5} radius={[2, 2, 0, 0]} />
                  <Line type="monotone" dataKey="gust" name="Gusts" stroke="#f97316" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {activeTab === "Precipitation" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CloudRain className="w-4 h-4 text-blue-400" /> Precip Probability (48h)
            </h3>
            {isLoading ? <ChartSkeleton /> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={hourlyData}>
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval={5} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, "Precip Prob"]} />
                  <Bar dataKey="precip" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Precipitation Amount (in)</h3>
            {isLoading ? <ChartSkeleton /> : (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={hourlyData}>
                  <defs>
                    <linearGradient id="precipG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval={5} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit='"' />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}"`, "Precip"]} />
                  <Area type="monotone" dataKey="precipAmt" stroke="#06b6d4" fill="url(#precipG)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
