import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { ChartSkeleton } from "../components/WeatherSkeleton";
import {
  computeSRHFromProfile,
  compute06kmShear,
  computeSWTI,
  cToF,
  msToMph,
} from "../utils/weatherCalc";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";
import { BarChart3, AlertTriangle, Sun } from "lucide-react";

interface Props { location: Location }

// Risk level label matching SPC categories
function riskLabel(score: number): { text: string; color: string; bg: string; border: string } {
  if (score >= 80) return { text: "High",     color: "#d946ef", bg: "#d946ef18", border: "#d946ef40" };
  if (score >= 60) return { text: "Moderate", color: "#ef4444", bg: "#ef444418", border: "#ef444440" };
  if (score >= 40) return { text: "Enhanced", color: "#f97316", bg: "#f9731618", border: "#f9731640" };
  if (score >= 20) return { text: "Slight",   color: "#eab308", bg: "#eab30818", border: "#eab30840" };
  if (score >= 8)  return { text: "Marginal", color: "#86efac", bg: "#86efac18", border: "#86efac40" };
  return              { text: "None",     color: "#4ade80", bg: "#4ade8010", border: "#4ade8030" };
}

// Derive percentage-based probabilities from model parameters
function computeProbs(cape: number, srh: number, shear06: number, li: number) {
  // Tornado probability: combine CAPE, SRH, shear, LI
  const tornadoRaw = Math.min(100,
    (cape > 0 ? Math.pow(cape / 1500, 0.6) * 20 : 0)
    + (srh > 0 ? Math.pow(srh / 300, 0.7) * 12 : 0)
    + (shear06 > 0 ? (shear06 / 60) * 8 : 0)
    + (li < -3 ? Math.min(10, Math.abs(li) * 2) : 0)
  );
  // Wind probability: driven mostly by shear and gusts proxy
  const windRaw = Math.min(100,
    (shear06 > 0 ? (shear06 / 80) * 25 : 0)
    + (cape > 500 ? (cape / 2000) * 15 : 0)
    + (srh > 100 ? (srh / 500) * 10 : 0)
  );
  // Hail probability: CAPE + shear driven
  const hailRaw = Math.min(100,
    (cape > 0 ? Math.pow(cape / 2000, 0.5) * 22 : 0)
    + (shear06 > 0 ? (shear06 / 70) * 18 : 0)
    + (li < -2 ? Math.min(8, Math.abs(li) * 1.5) : 0)
  );
  return {
    tornado: Math.round(Math.max(0, tornadoRaw * 10) / 10) / 10,
    wind:    Math.round(Math.max(0, windRaw * 10) / 10) / 10,
    hail:    Math.round(Math.max(0, hailRaw * 10) / 10) / 10,
  };
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0d1b2e] border border-[#1e2d42] rounded-lg px-3 py-2 shadow-xl text-xs">
      <div className="font-semibold mb-1 text-foreground">{label}</div>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-bold" style={{ color: p.color }}>{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
};

export default function SevereWeatherTiming({ location }: Props) {
  const { data: weather, isLoading, error } = useOpenMeteo(location);

  const hourly = weather?.hourly;
  const daily = weather?.daily;

  const hours = hourly?.time?.slice(0, 36).map((t: string, i: number) => {
    const cape = hourly.cape?.[i] ?? 0;
    const li = hourly.lifted_index?.[i] ?? 0;
    const dewC = hourly.dew_point_2m?.[i] ?? 10;
    const ws10 = hourly.wind_speed_10m?.[i] ?? 0;
    const wd10 = hourly.wind_direction_10m?.[i] ?? 0;
    const ws925 = hourly.wind_speed_925hPa?.[i] ?? 0;
    const wd925 = hourly.wind_direction_925hPa?.[i] ?? 0;
    const ws850 = hourly.wind_speed_850hPa?.[i] ?? 0;
    const wd850 = hourly.wind_direction_850hPa?.[i] ?? 0;
    const ws700 = hourly.wind_speed_700hPa?.[i] ?? 0;
    const wd700 = hourly.wind_direction_700hPa?.[i] ?? 0;
    const ws500 = hourly.wind_speed_500hPa?.[i] ?? 0;
    const wd500 = hourly.wind_direction_500hPa?.[i] ?? 0;

    const srh = computeSRHFromProfile(ws10, wd10, ws925, wd925, ws850, wd850, ws700, wd700, ws500, wd500);
    const shear = compute06kmShear(ws10, wd10, ws500, wd500);
    const swti = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: dewC });
    const probs = computeProbs(cape, srh, shear, li);

    return {
      time: format(parseISO(t), "EEE ha"),
      timeShort: format(parseISO(t), "ha"),
      hour: parseISO(t).getHours(),
      isoTime: t,
      tornado: probs.tornado,
      wind: probs.wind,
      hail: probs.hail,
      swti: swti.score,
      risk: swti.tornadoRisk,
      cape: Math.round(cape),
      srh: Math.round(srh),
      shear: Math.round(shear),
      dewF: Math.round(cToF(dewC)),
      tempF: hourly.temperature_2m ? Math.round(cToF(hourly.temperature_2m[i])) : 0,
    };
  }) ?? [];

  // Peak times for each hazard
  const peakTornado = hours.reduce((best, h) => h.tornado > (best?.tornado ?? 0) ? h : best, hours[0]);
  const peakWind    = hours.reduce((best, h) => h.wind    > (best?.wind    ?? 0) ? h : best, hours[0]);
  const peakHail    = hours.reduce((best, h) => h.hail    > (best?.hail    ?? 0) ? h : best, hours[0]);

  const overallMaxSwti = Math.max(...hours.map(h => h.swti), 0);
  const risk = riskLabel(overallMaxSwti);

  // Sunset time from daily data
  const sunsetRaw: string | undefined = daily?.sunset?.[0] != null ? String(daily!.sunset![0]) : undefined;
  const sunsetDisplay = sunsetRaw ? format(parseISO(sunsetRaw), "h:mm a") : null;

  // Cities at risk proxy: count hours where tornado > 5%
  const riskHours = hours.filter(h => h.tornado > 5 || h.wind > 10 || h.hail > 8);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Severe Weather Timing</h2>
      </div>

      {/* Location header card */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-bold text-foreground">{location.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {location.lat.toFixed(3)}°{location.lat >= 0 ? "N" : "S"},{" "}
              {Math.abs(location.lon).toFixed(3)}°{location.lon >= 0 ? "E" : "W"}
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-right">
            <div>Day 1 Outlook</div>
            <div>{format(new Date(), "MMM d, yyyy")}</div>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive rounded-xl p-4 text-sm text-destructive">
          Could not load severe weather data.
        </div>
      )}

      {/* Overall Risk */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest text-center">Overall Risk</div>
        {isLoading ? (
          <div className="h-12 bg-muted/20 rounded-xl animate-pulse" />
        ) : (
          <div
            className="rounded-xl py-3 text-center text-2xl font-bold tracking-wide"
            style={{ background: risk.bg, border: `1px solid ${risk.border}`, color: risk.color }}
          >
            {risk.text}
          </div>
        )}
      </div>

      {/* Probability metric cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: "Tornado", value: isLoading ? null : peakTornado?.tornado, icon: "🌪️", color: "#ef4444", iconBg: "#ef444420" },
          { label: "Wind",    value: isLoading ? null : peakWind?.wind,       icon: "💨", color: "#6366f1", iconBg: "#6366f120" },
          { label: "Hail",    value: isLoading ? null : peakHail?.hail,       icon: "🌩️", color: "#22c55e", iconBg: "#22c55e20" },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0" style={{ background: m.iconBg }}>
              {m.icon}
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">{m.label}</div>
              <div className="text-2xl font-bold" style={{ color: m.color }}>
                {m.value === null || m.value === undefined ? "—" : `${m.value.toFixed(1)}%`}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Probability Timeline Chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-1">Probability Timeline</h3>
        <p className="text-xs text-muted-foreground mb-4">36-hour severe weather probability by hazard type</p>
        {isLoading ? <ChartSkeleton /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={hours} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <XAxis
                dataKey="timeShort"
                tick={{ fontSize: 10, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                interval={5}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                domain={[0, "auto"]}
                tickFormatter={v => `${v}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) => <span style={{ color: "#9ca3af" }}>{value}</span>}
              />
              <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.3} />
              <Line type="monotone" dataKey="tornado" name="Tornado" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="wind"    name="Wind"    stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="hail"    name="Hail"    stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Peak timing + sunset */}
      {!isLoading && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {[
            { label: "Peak Tornado", value: peakTornado?.time, icon: "🌪️", show: (peakTornado?.tornado ?? 0) > 0.1 },
            { label: "Peak Wind",    value: peakWind?.time,    icon: "💨", show: (peakWind?.wind    ?? 0) > 0.5 },
            { label: "Peak Hail",    value: peakHail?.time,    icon: "🌩️", show: (peakHail?.hail    ?? 0) > 0.5 },
          ].filter(r => r.show).map((row, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
              <span className="text-lg">{row.icon}</span>
              <span className="text-sm text-muted-foreground flex-1">{row.label}</span>
              <span className="text-sm font-bold text-foreground">{row.value}</span>
            </div>
          ))}
          {sunsetDisplay && (
            <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border-t border-amber-500/20">
              <Sun className="w-5 h-5 text-amber-400" />
              <span className="text-sm text-amber-300 flex-1">Sunset</span>
              <span className="text-sm font-bold text-amber-300">{sunsetDisplay}</span>
            </div>
          )}
        </div>
      )}

      {/* Risk hour count */}
      {!isLoading && riskHours.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Active Risk Windows</h3>
            <span className="text-xs text-muted-foreground">{riskHours.length} hours elevated</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {riskHours.map((h, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded text-[10px] font-medium"
                style={{
                  background: risk.bg,
                  border: `1px solid ${risk.border}`,
                  color: risk.color,
                }}
              >
                {h.timeShort}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Hourly threat table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold">Hourly Parameters</h3>
        </div>
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading...</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                  {["Time", "🌪️ Tornado", "💨 Wind", "🌩️ Hail", "CAPE", "SRH"].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hours.slice(0, 24).map((h, i) => (
                  <tr key={i} className="border-b border-border/30 hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{h.time}</td>
                    <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ color: h.tornado > 5 ? "#ef4444" : "#6b7280" }}>
                      {h.tornado.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ color: h.wind > 10 ? "#6366f1" : "#6b7280" }}>
                      {h.wind.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ color: h.hail > 8 ? "#22c55e" : "#6b7280" }}>
                      {h.hail.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{h.cape}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{h.srh}</td>
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
