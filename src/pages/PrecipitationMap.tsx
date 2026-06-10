import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { ChartSkeleton } from "../components/WeatherSkeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, Line } from "recharts";
import { format, parseISO } from "date-fns";
import { CloudRain } from "lucide-react";

interface Props { location: Location }

export default function PrecipitationMap({ location }: Props) {
  const { data: weather, isLoading } = useOpenMeteo(location);

  const hourly = weather?.hourly;
  const daily = weather?.daily;

  const hours = hourly?.time?.slice(0, 48).map((t: string, i: number) => ({
    time: format(parseISO(t), "MMM d ha"),
    timeShort: format(parseISO(t), "ha"),
    prob: hourly.precipitation_probability ? hourly.precipitation_probability[i] : 0,
    precip: hourly.precipitation ? +(hourly.precipitation[i] ?? 0).toFixed(3) : 0,
    humidity: hourly.relative_humidity_2m ? hourly.relative_humidity_2m[i] : 0,
    cloud: hourly.cloud_cover ? hourly.cloud_cover[i] : 0,
  })) ?? [];

  const days = daily?.time?.map((t: string | number, i: number) => ({
    date: format(parseISO(t as string), "MMM d"),
    precip: daily.precipitation_sum ? +(daily.precipitation_sum[i] as number).toFixed(2) : 0,
    prob: daily.precipitation_probability_max ? daily.precipitation_probability_max[i] : 0,
  })) ?? [];

  const totalLast24 = hours.slice(0, 24).reduce((s, h) => s + h.precip, 0).toFixed(2);
  const maxProb = Math.max(...hours.slice(0, 24).map(h => h.prob), 0);
  const totalWeek = days.reduce((s, d) => s + d.precip, 0).toFixed(2);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <CloudRain className="w-5 h-5 text-blue-400" />
        <h2 className="text-xl font-bold">Precipitation</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name}</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">Next 24h Total</div>
          <div className="text-2xl font-bold text-blue-400">{totalLast24}"</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">Max Prob (24h)</div>
          <div className="text-2xl font-bold text-blue-300">{maxProb}%</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground mb-1">7-Day Total</div>
          <div className="text-2xl font-bold text-blue-200">{totalWeek}"</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">48-Hour Precip Probability & Amount</h3>
        {isLoading ? <ChartSkeleton /> : (
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={hours}>
              <XAxis dataKey="timeShort" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval={5} />
              <YAxis yAxisId="prob" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
              <YAxis yAxisId="amt" orientation="right" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit='"' />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
              <Bar yAxisId="prob" dataKey="prob" name="Probability" fill="#3b82f6" opacity={0.5} radius={[2, 2, 0, 0]} />
              <Line yAxisId="amt" dataKey="precip" name="Amount (in)" stroke="#60a5fa" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">7-Day Daily Precipitation (inches)</h3>
        {isLoading ? <ChartSkeleton /> : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={days}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit='"' />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="precip" name="Total (in)" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">48-Hour Humidity & Cloud Cover</h3>
        {isLoading ? <ChartSkeleton /> : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={hours}>
              <XAxis dataKey="timeShort" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval={5} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="humidity" name="Humidity" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.2} dot={false} strokeWidth={2} />
              <Area type="monotone" dataKey="cloud" name="Cloud Cover" stroke="#6b7280" fill="#6b7280" fillOpacity={0.15} dot={false} strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
