import { useOpenMeteo, useNWSPoints, useNWSForecast } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { WMO_DESCRIPTIONS, WEATHER_ICONS } from "../config";
import { cToF, msToMph, getWindDirection } from "../utils/weatherCalc";
import { format, parseISO } from "date-fns";
import { ChartSkeleton, CardSkeleton } from "../components/WeatherSkeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { AlertTriangle, Sunrise, Sunset } from "lucide-react";

interface Props { location: Location }

export default function ExtendedForecast({ location }: Props) {
  const { data: weather, isLoading } = useOpenMeteo(location);
  const { data: nwsPoints } = useNWSPoints(location);
  const { data: nwsForecast, isLoading: nwsLoading } = useNWSForecast(nwsPoints?.properties?.forecast);

  const daily = weather?.hourly;
  const d = weather?.daily;

  const days = d?.time?.map((t: string, i: number) => ({
    date: format(parseISO(t as string), "EEE, MMM d"),
    dateShort: format(parseISO(t as string), "EEE"),
    high: d.temperature_2m_max ? Math.round(cToF(d.temperature_2m_max[i] as number)) : 0,
    low: d.temperature_2m_min ? Math.round(cToF(d.temperature_2m_min[i] as number)) : 0,
    precip: d.precipitation_probability_max ? d.precipitation_probability_max[i] : 0,
    precipSum: d.precipitation_sum ? (d.precipitation_sum[i] as number).toFixed(2) : "0.00",
    windMax: d.wind_speed_10m_max ? Math.round(msToMph(d.wind_speed_10m_max[i] as number)) : 0,
    gustMax: d.wind_gusts_10m_max ? Math.round(msToMph(d.wind_gusts_10m_max[i] as number)) : 0,
    windDir: d.wind_direction_10m_dominant ? getWindDirection(d.wind_direction_10m_dominant[i] as number) : "",
    code: d.weather_code ? d.weather_code[i] as number : 0,
    sunrise: d.sunrise ? format(parseISO(d.sunrise[i] as string), "h:mm a") : "",
    sunset: d.sunset ? format(parseISO(d.sunset[i] as string), "h:mm a") : "",
  })) ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h2 className="text-xl font-bold">7-Day Extended Forecast</h2>
      <p className="text-sm text-muted-foreground">{location.name}</p>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Temperature Range</h3>
        {isLoading ? <ChartSkeleton /> : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={days}>
              <XAxis dataKey="dateShort" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="°F" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="high" name="High" fill="#f97316" radius={[4, 4, 0, 0]} />
              <Bar dataKey="low" name="Low" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 7 }).map((_, i) => <CardSkeleton key={i} rows={3} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {days.map((day, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{WEATHER_ICONS[day.code] ?? "🌡️"}</span>
                  <div>
                    <div className="font-semibold">{day.date}</div>
                    <div className="text-sm text-muted-foreground">{WMO_DESCRIPTIONS[day.code] ?? "Unknown"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-bold text-orange-400">{day.high}°F</span>
                  <span className="text-blue-400">{day.low}°F</span>
                  <span className="text-blue-300">{day.precip}%</span>
                  <span className="text-muted-foreground">{day.windMax} {day.windDir} mph</span>
                </div>
              </div>
              {(day.sunrise || day.sunset) && (
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  {day.sunrise && <span className="flex items-center gap-1"><Sunrise className="w-3 h-3 text-yellow-400" />{day.sunrise}</span>}
                  {day.sunset && <span className="flex items-center gap-1"><Sunset className="w-3 h-3 text-orange-400" />{day.sunset}</span>}
                  {parseFloat(day.precipSum) > 0 && <span>🌧️ {day.precipSum} in</span>}
                  {day.gustMax > 0 && <span>💨 Gusts {day.gustMax} mph</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!nwsLoading && nwsForecast && nwsForecast.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-3 border-b border-border">
            <h3 className="text-sm font-semibold">NWS Detailed Forecast</h3>
          </div>
          <div className="divide-y divide-border">
            {nwsForecast.slice(0, 14).map((period) => (
              <div key={period.number} className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{period.name}</span>
                  <span className="text-sm font-bold">{period.temperature}°{period.temperatureUnit}</span>
                </div>
                <p className="text-xs text-muted-foreground">{period.detailedForecast}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
