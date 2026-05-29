import { useOpenMeteo, useNWSAlerts, useNWSPoints } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { StatSkeleton, ChartSkeleton, AlertSkeleton } from "../components/WeatherSkeleton";
import { WMO_DESCRIPTIONS, WEATHER_ICONS } from "../config";
import {
  cToF,
  getWindDirection,
  msToMph,
  visibilityDescription,
  computeSRHFromProfile,
  compute06kmShear,
  computeSWTI,
} from "../utils/weatherCalc";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { AlertTriangle, Wind, Droplets, Thermometer, Eye, Gauge, Cloud } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props { location: Location }

function StatCard({ label, value, unit, icon: Icon, sub }: {
  label: string; value: string | number; unit?: string;
  icon: React.ElementType; sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function AlertBanner({ alerts }: { alerts: ReturnType<typeof useNWSAlerts>["data"] }) {
  if (!alerts?.length) return null;
  const severeColors: Record<string, string> = {
    Extreme: "border-red-500 bg-red-500/10 text-red-300",
    Severe: "border-orange-500 bg-orange-500/10 text-orange-300",
    Moderate: "border-yellow-500 bg-yellow-500/10 text-yellow-300",
    Minor: "border-blue-500 bg-blue-500/10 text-blue-300",
  };
  return (
    <div className="space-y-2">
      {alerts.slice(0, 5).map((a) => {
        const cls = severeColors[a.properties.severity] ?? "border-muted bg-muted/10 text-muted-foreground";
        return (
          <div key={a.properties.id} className={`border rounded-lg p-3 ${cls}`}>
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4" />
              {a.properties.event}
            </div>
            <div className="text-xs mt-1 opacity-80">{a.properties.headline}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard({ location }: Props) {
  const { data: weather, isLoading, error } = useOpenMeteo(location);
  const { data: alerts, isLoading: alertsLoading } = useNWSAlerts(location);
  const { data: nwsPoints } = useNWSPoints(location);

  if (error) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-destructive" />
        <p>Could not load weather data. Check your connection and try again.</p>
      </div>
    );
  }

  const cur = weather?.current;
  const hourly = weather?.hourly;

  const tempF = cur ? Math.round(cToF(cur.temperature_2m)) : null;
  const feelsF = cur ? Math.round(cToF(cur.apparent_temperature)) : null;
  const windMph = cur ? Math.round(msToMph(cur.wind_speed_10m)) : null;
  const gustMph = cur ? Math.round(msToMph(cur.wind_gusts_10m)) : null;
  const windDir = cur ? getWindDirection(cur.wind_direction_10m) : "";
  const vis = cur ? visibilityDescription(cur.visibility ?? 16000) : "";
  const wmoCode = cur?.weather_code ?? 0;
  const wmoDesc = WMO_DESCRIPTIONS[wmoCode] ?? "Unknown";
  const emoji = WEATHER_ICONS[wmoCode] ?? "🌡️";

  const hourlyChart = hourly?.time?.slice(0, 24).map((t: string, i: number) => ({
    time: format(parseISO(t), "ha"),
    temp: hourly.temperature_2m ? Math.round(cToF(hourly.temperature_2m[i])) : 0,
    precip: hourly.precipitation_probability ? hourly.precipitation_probability[i] : 0,
    cape: hourly.cape ? Math.round(hourly.cape[i] ?? 0) : 0,
  })) ?? [];

  const srh = hourly && hourly.wind_speed_10m && hourly.wind_speed_925hPa
    ? computeSRHFromProfile(
        hourly.wind_speed_10m[0], hourly.wind_direction_10m[0],
        hourly.wind_speed_925hPa[0], hourly.wind_direction_925hPa[0],
        hourly.wind_speed_850hPa[0], hourly.wind_direction_850hPa[0],
        hourly.wind_speed_700hPa[0], hourly.wind_direction_700hPa[0],
        hourly.wind_speed_500hPa[0], hourly.wind_direction_500hPa[0],
      )
    : null;

  const shear06 = hourly && hourly.wind_speed_10m && hourly.wind_speed_500hPa
    ? compute06kmShear(
        hourly.wind_speed_10m[0], hourly.wind_direction_10m[0],
        hourly.wind_speed_500hPa[0], hourly.wind_direction_500hPa[0],
      )
    : null;

  const swti = srh !== null && shear06 !== null && hourly?.cape
    ? computeSWTI({
        cape: hourly.cape[0] ?? 0,
        srh,
        shear06km: shear06,
        liftedIndex: hourly.lifted_index?.[0] ?? 0,
        dewPointC: hourly.dew_point_2m?.[0] ?? 10,
      })
    : null;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="text-5xl">{emoji}</div>
        <div>
          <h2 className="text-3xl font-bold">{isLoading ? "—" : `${tempF}°F`}</h2>
          <p className="text-muted-foreground">{wmoDesc} · Feels like {isLoading ? "—" : `${feelsF}°F`}</p>
          <p className="text-xs text-muted-foreground">{location.name}</p>
        </div>
      </div>

      {alertsLoading ? <AlertSkeleton /> : <AlertBanner alerts={alerts} />}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Wind" value={`${windMph} ${windDir}`} unit="mph" icon={Wind} sub={`Gusts ${gustMph} mph`} />
            <StatCard label="Humidity" value={cur?.relative_humidity_2m ?? 0} unit="%" icon={Droplets} />
            <StatCard label="Dew Point" value={`${Math.round(cToF(cur?.dew_point_2m ?? 0))}°`} unit="F" icon={Thermometer} />
            <StatCard label="Pressure" value={Math.round(cur?.surface_pressure ?? 0)} unit="hPa" icon={Gauge} />
            <StatCard label="Visibility" value={vis} icon={Eye} />
            <StatCard label="Cloud Cover" value={cur?.cloud_cover ?? 0} unit="%" icon={Cloud} />
          </>
        )}
      </div>

      {swti && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Storm Threat Index (SWTI)</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: swti.color }}>{swti.score}</div>
              <div className="text-xs text-muted-foreground">Score / 100</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold" style={{ color: swti.color }}>{swti.label}</div>
              <div className="text-xs text-muted-foreground">Tornado Risk</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold capitalize">{swti.hailRisk}</div>
              <div className="text-xs text-muted-foreground">Hail Risk</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold capitalize">{swti.windRisk}</div>
              <div className="text-xs text-muted-foreground">Wind Risk</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="bg-muted/30 rounded p-2">
              <div className="text-muted-foreground">CAPE</div>
              <div className="font-medium">{Math.round(hourly?.cape?.[0] ?? 0)} J/kg</div>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <div className="text-muted-foreground">0-3km SRH</div>
              <div className="font-medium">{srh !== null ? Math.round(srh) : "—"} m²/s²</div>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <div className="text-muted-foreground">0-6km Shear</div>
              <div className="font-medium">{shear06 !== null ? Math.round(shear06) : "—"} kts</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">24-Hour Temperature Trend</h3>
          {isLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={hourlyChart}>
                <defs>
                  <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="°" />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${v}°F`, "Temp"]}
                />
                <Area type="monotone" dataKey="temp" stroke="#06b6d4" strokeWidth={2} fill="url(#tempGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">24-Hour Precip Probability</h3>
          {isLoading ? <ChartSkeleton /> : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourlyChart}>
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${v}%`, "Precip Prob"]}
                />
                <Bar dataKey="precip" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {nwsPoints && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-2">NWS Office</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Office: </span>
              <span className="font-medium">{nwsPoints.properties.cwa}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Grid: </span>
              <span className="font-medium">{nwsPoints.properties.gridX}, {nwsPoints.properties.gridY}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Location: </span>
              <span className="font-medium">{nwsPoints.properties.relativeLocation?.properties?.city}, {nwsPoints.properties.relativeLocation?.properties?.state}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Timezone: </span>
              <span className="font-medium">{nwsPoints.properties.timeZone}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
