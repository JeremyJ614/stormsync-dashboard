import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { ChartSkeleton, StatSkeleton } from "../components/WeatherSkeleton";
import { cToF, msToMph } from "../utils/weatherCalc";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { format, parseISO } from "date-fns";
import { Snowflake } from "lucide-react";

interface Props { location: Location }

function snowLikelihood(tempF: number, precipProb: number, humidity: number): number {
  if (tempF > 35) return 0;
  let score = precipProb * 0.5;
  if (tempF <= 32) score += 30;
  else if (tempF <= 34) score += 15;
  score += Math.max(0, humidity - 50) * 0.2;
  return Math.min(100, Math.round(score));
}

function iceLikelihood(tempF: number, precipProb: number, dewF: number): number {
  if (tempF > 36 || tempF < 10) return 0;
  let score = 0;
  if (tempF >= 28 && tempF <= 36) score += 40;
  if (dewF >= 28 && dewF <= 36) score += 30;
  score += precipProb * 0.3;
  return Math.min(100, Math.round(score));
}

export default function SnowIceStorm({ location }: Props) {
  const { data: weather, isLoading } = useOpenMeteo(location);

  const hourly = weather?.hourly;

  const hours = hourly?.time?.slice(0, 48).map((t: string, i: number) => {
    const tempF = hourly.temperature_2m ? cToF(hourly.temperature_2m[i]) : 40;
    const dewF = hourly.dew_point_2m ? cToF(hourly.dew_point_2m[i]) : 30;
    const prob = hourly.precipitation_probability?.[i] ?? 0;
    const humidity = hourly.relative_humidity_2m?.[i] ?? 50;
    return {
      time: format(parseISO(t), "EEE ha"),
      timeShort: format(parseISO(t), "ha"),
      tempF: Math.round(tempF),
      dewF: Math.round(dewF),
      precipIn: +(hourly.precipitation?.[i] ?? 0).toFixed(3),
      snowChance: snowLikelihood(tempF, prob, humidity),
      iceChance: iceLikelihood(tempF, prob, dewF),
      precipProb: prob,
      wind: hourly.wind_speed_10m ? Math.round(msToMph(hourly.wind_speed_10m[i])) : 0,
      gust: hourly.wind_gusts_10m ? Math.round(msToMph(hourly.wind_gusts_10m[i])) : 0,
    };
  }) ?? [];

  const maxSnow = Math.max(...hours.map(h => h.snowChance));
  const maxIce = Math.max(...hours.map(h => h.iceChance));
  const peakSnowHour = hours.find(h => h.snowChance === maxSnow);
  const peakIceHour = hours.find(h => h.iceChance === maxIce);

  const cur = weather?.current;
  const curTempF = cur ? cToF(cur.temperature_2m) : null;
  const curDewF = cur ? cToF(cur.dew_point_2m) : null;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Snowflake className="w-5 h-5 text-blue-300" />
        <h2 className="text-xl font-bold">Snow & Ice Storm Analysis</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />) : (
          <>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted-foreground mb-1">Current Temp</div>
              <div className="text-2xl font-bold">{curTempF !== null ? Math.round(curTempF) : "—"}°F</div>
              <div className="text-xs text-muted-foreground">{curTempF !== null && curTempF <= 32 ? "At/below freezing ❄️" : "Above freezing"}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted-foreground mb-1">Dew Point</div>
              <div className="text-2xl font-bold">{curDewF !== null ? Math.round(curDewF) : "—"}°F</div>
              <div className="text-xs text-muted-foreground">{curDewF !== null && curDewF <= 32 ? "Freezing dew point 🧊" : ""}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted-foreground mb-1">Peak Snow Chance</div>
              <div className="text-2xl font-bold text-blue-300">{maxSnow}%</div>
              <div className="text-xs text-muted-foreground">{peakSnowHour?.time}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted-foreground mb-1">Peak Ice Chance</div>
              <div className="text-2xl font-bold text-cyan-300">{maxIce}%</div>
              <div className="text-xs text-muted-foreground">{peakIceHour?.time}</div>
            </div>
          </>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Snow & Ice Probability (48h)</h3>
        {isLoading ? <ChartSkeleton /> : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={hours}>
              <defs>
                <linearGradient id="snowGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#93c5fd" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#93c5fd" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="iceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#67e8f9" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#67e8f9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="timeShort" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval={5} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="snowChance" name="Snow%" stroke="#93c5fd" strokeWidth={2} fill="url(#snowGrad)" dot={false} />
              <Area type="monotone" dataKey="iceChance" name="Ice%" stroke="#67e8f9" strokeWidth={2} fill="url(#iceGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Temperature & Dew Point (48h)</h3>
        {isLoading ? <ChartSkeleton /> : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={hours}>
              <XAxis dataKey="timeShort" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval={5} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="°F" />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="tempF" name="Temp" stroke="#f97316" fill="none" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="dewF" name="Dew Point" stroke="#06b6d4" fill="none" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              {/* Freezing line reference */}
            </AreaChart>
          </ResponsiveContainer>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-3 h-0.5 bg-muted-foreground/30" style={{ borderTop: "1px dashed #6b7280" }} />
          <span>32°F freezing threshold</span>
        </div>
      </div>
    </div>
  );
}
