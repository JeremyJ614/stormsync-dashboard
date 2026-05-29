import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { ChartSkeleton, StatSkeleton } from "../components/WeatherSkeleton";
import { msToMph, mpsToKnots, getWindDirection, compute06kmShear, windComponents } from "../utils/weatherCalc";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Legend } from "recharts";
import { format, parseISO } from "date-fns";
import { Wind } from "lucide-react";

interface Props { location: Location }

const COMPASS_DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

function WindRose({ hours }: { hours: Array<{ dir: number; speed: number }> }) {
  const bins = COMPASS_DIRS.map((dir, i) => {
    const low = i * 22.5 - 11.25;
    const high = low + 22.5;
    const inBin = hours.filter(h => {
      let d = h.dir;
      if (d < 0) d += 360;
      return d >= low && d < high;
    });
    const avgSpeed = inBin.length ? inBin.reduce((s, h) => s + h.speed, 0) / inBin.length : 0;
    return { dir, speed: Math.round(avgSpeed), count: inBin.length };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={bins} cx="50%" cy="50%" outerRadius="80%">
        <PolarGrid stroke="#1e293b" />
        <PolarAngleAxis dataKey="dir" tick={{ fontSize: 10, fill: "#6b7280" }} />
        <Radar name="Speed" dataKey="speed" stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.3} />
        <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export default function WindMap({ location }: Props) {
  const { data: weather, isLoading } = useOpenMeteo(location);

  const hourly = weather?.hourly;
  const hours = hourly?.time?.slice(0, 24).map((t: string, i: number) => ({
    time: format(parseISO(t), "ha"),
    speed: hourly.wind_speed_10m ? Math.round(msToMph(hourly.wind_speed_10m[i])) : 0,
    gust: hourly.wind_gusts_10m ? Math.round(msToMph(hourly.wind_gusts_10m[i])) : 0,
    dir: hourly.wind_direction_10m ? hourly.wind_direction_10m[i] : 0,
    dirLabel: hourly.wind_direction_10m ? getWindDirection(hourly.wind_direction_10m[i]) : "—",
  })) ?? [];

  const now = hours[0];

  const profileLevels = hourly && hourly.wind_speed_10m ? [
    { level: "10m (Surface)", speed: Math.round(msToMph(hourly.wind_speed_10m[0])), dir: getWindDirection(hourly.wind_direction_10m?.[0] ?? 0), knots: Math.round(mpsToKnots(hourly.wind_speed_10m[0])) },
    { level: "925 hPa (~750m)", speed: Math.round(msToMph(hourly.wind_speed_925hPa?.[0] ?? 0)), dir: getWindDirection(hourly.wind_direction_925hPa?.[0] ?? 0), knots: Math.round(mpsToKnots(hourly.wind_speed_925hPa?.[0] ?? 0)) },
    { level: "850 hPa (~1.5km)", speed: Math.round(msToMph(hourly.wind_speed_850hPa?.[0] ?? 0)), dir: getWindDirection(hourly.wind_direction_850hPa?.[0] ?? 0), knots: Math.round(mpsToKnots(hourly.wind_speed_850hPa?.[0] ?? 0)) },
    { level: "700 hPa (~3km)", speed: Math.round(msToMph(hourly.wind_speed_700hPa?.[0] ?? 0)), dir: getWindDirection(hourly.wind_direction_700hPa?.[0] ?? 0), knots: Math.round(mpsToKnots(hourly.wind_speed_700hPa?.[0] ?? 0)) },
    { level: "500 hPa (~5.5km)", speed: Math.round(msToMph(hourly.wind_speed_500hPa?.[0] ?? 0)), dir: getWindDirection(hourly.wind_direction_500hPa?.[0] ?? 0), knots: Math.round(mpsToKnots(hourly.wind_speed_500hPa?.[0] ?? 0)) },
    { level: "300 hPa (~9km)", speed: Math.round(msToMph(hourly.wind_speed_300hPa?.[0] ?? 0)), dir: getWindDirection(hourly.wind_direction_300hPa?.[0] ?? 0), knots: Math.round(mpsToKnots(hourly.wind_speed_300hPa?.[0] ?? 0)) },
  ] : [];

  const shear06 = hourly?.wind_speed_10m && hourly?.wind_speed_500hPa
    ? compute06kmShear(
        hourly.wind_speed_10m[0], hourly.wind_direction_10m?.[0] ?? 0,
        hourly.wind_speed_500hPa[0], hourly.wind_direction_500hPa?.[0] ?? 0
      )
    : null;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Wind className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Wind Analysis</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />) : (
          <>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted-foreground mb-1">Surface Wind</div>
              <div className="text-2xl font-bold">{now?.speed ?? 0} mph</div>
              <div className="text-sm text-muted-foreground">{now?.dirLabel}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted-foreground mb-1">Peak Gust</div>
              <div className="text-2xl font-bold">{now?.gust ?? 0} mph</div>
              <div className="text-sm text-muted-foreground">Surface</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted-foreground mb-1">0-6km Shear</div>
              <div className="text-2xl font-bold">{shear06 !== null ? Math.round(shear06) : "—"} kts</div>
              <div className="text-xs text-muted-foreground">{shear06 !== null ? (shear06 >= 40 ? "Sig. severe" : shear06 >= 25 ? "Marginal" : "Weak") : ""}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs text-muted-foreground mb-1">300hPa Jet</div>
              <div className="text-2xl font-bold">{hourly?.wind_speed_300hPa ? Math.round(msToMph(hourly.wind_speed_300hPa[0])) : "—"} mph</div>
              <div className="text-sm text-muted-foreground">{hourly?.wind_direction_300hPa ? getWindDirection(hourly.wind_direction_300hPa[0]) : ""} @ ~9km</div>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">24-Hour Wind Speed</h3>
          {isLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={hours}>
                <defs>
                  <linearGradient id="windGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} interval={3} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit=" mph" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="gust" name="Gust" stroke="#f97316" strokeWidth={1.5} fill="none" strokeDasharray="3 2" dot={false} />
                <Area type="monotone" dataKey="speed" name="Speed" stroke="#06b6d4" strokeWidth={2} fill="url(#windGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Wind Rose (24h)</h3>
          {isLoading ? <ChartSkeleton /> : <WindRose hours={hours} />}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold">Wind Profile (Current Hour)</h3>
        </div>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="divide-y divide-border">
            {profileLevels.map((lvl, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm font-medium w-40">{lvl.level}</span>
                <div className="flex items-center gap-6 text-sm">
                  <span className="font-bold">{lvl.speed} mph</span>
                  <span className="text-muted-foreground">{lvl.knots} kts</span>
                  <span className="text-muted-foreground">{lvl.dir}</span>
                  <div className="w-24 bg-muted/30 rounded-full h-1.5">
                    <div className="h-1.5 bg-cyan-500 rounded-full" style={{ width: `${Math.min(100, (lvl.speed / 80) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
