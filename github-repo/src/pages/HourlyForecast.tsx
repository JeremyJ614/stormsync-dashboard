import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { WMO_DESCRIPTIONS, WEATHER_ICONS } from "../config";
import { cToF, msToMph, getWindDirection } from "../utils/weatherCalc";
import { format, parseISO } from "date-fns";
import { ChartSkeleton } from "../components/WeatherSkeleton";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ComposedChart, Bar } from "recharts";
import { AlertTriangle } from "lucide-react";

interface Props { location: Location }

export default function HourlyForecast({ location }: Props) {
  const { data: weather, isLoading, error } = useOpenMeteo(location);

  if (error) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-destructive" />
        <p>Could not load hourly forecast data.</p>
      </div>
    );
  }

  const hourly = weather?.hourly;
  const hours = hourly?.time?.slice(0, 48).map((t: string, i: number) => ({
    time: format(parseISO(t), "EEE ha"),
    timeShort: format(parseISO(t), "ha"),
    temp: hourly.temperature_2m ? Math.round(cToF(hourly.temperature_2m[i])) : 0,
    feelsLike: hourly.apparent_temperature ? Math.round(cToF(hourly.apparent_temperature[i])) : 0,
    precip: hourly.precipitation_probability ? hourly.precipitation_probability[i] : 0,
    precipAmt: hourly.precipitation ? (hourly.precipitation[i] ?? 0).toFixed(2) : "0.00",
    wind: hourly.wind_speed_10m ? Math.round(msToMph(hourly.wind_speed_10m[i])) : 0,
    gust: hourly.wind_gusts_10m ? Math.round(msToMph(hourly.wind_gusts_10m[i])) : 0,
    windDir: hourly.wind_direction_10m ? getWindDirection(hourly.wind_direction_10m[i]) : "—",
    humidity: hourly.relative_humidity_2m ? hourly.relative_humidity_2m[i] : 0,
    cloud: hourly.cloud_cover ? hourly.cloud_cover[i] : 0,
    code: hourly.weather_code ? hourly.weather_code[i] : 0,
  })) ?? [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <h2 className="text-xl font-bold">48-Hour Hourly Forecast</h2>
      <p className="text-sm text-muted-foreground">{location.name}</p>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Temperature & Feels Like</h3>
        {isLoading ? <ChartSkeleton /> : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={hours}>
              <defs>
                <linearGradient id="hTemp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="timeShort" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="°" />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
              />
              <Area type="monotone" dataKey="temp" name="Temp" stroke="#f97316" strokeWidth={2} fill="url(#hTemp)" dot={false} />
              <Area type="monotone" dataKey="feelsLike" name="Feels Like" stroke="#fb923c" strokeWidth={1.5} fill="none" strokeDasharray="4 2" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Precipitation Probability (%)</h3>
        {isLoading ? <ChartSkeleton /> : (
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={hours}>
              <XAxis dataKey="timeShort" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="precip" name="Precip %" fill="#3b82f6" opacity={0.7} radius={[2, 2, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold">Hourly Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Time", "Cond", "Temp", "Feels", "Wind", "Gust", "Precip%", "Humidity", "Cloud"].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hours.map((h, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{h.time}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span title={WMO_DESCRIPTIONS[h.code] ?? ""}>{WEATHER_ICONS[h.code] ?? "🌡️"}</span>
                    </td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{h.temp}°F</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{h.feelsLike}°F</td>
                    <td className="px-3 py-2 whitespace-nowrap">{h.wind} {h.windDir}</td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{h.gust} mph</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={h.precip >= 60 ? "text-blue-400" : h.precip >= 30 ? "text-blue-300" : ""}>{h.precip}%</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{h.humidity}%</td>
                    <td className="px-3 py-2 whitespace-nowrap">{h.cloud}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
