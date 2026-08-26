import { useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useOpenMeteo, useNWSAlerts, useNWSPoints } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { StatSkeleton, ChartSkeleton, AlertSkeleton } from "../components/WeatherSkeleton";
import { WMO_DESCRIPTIONS, WEATHER_ICONS } from "../config";
import {
  cToF, getWindDirection, msToMph, visibilityDescription,
  computeSRHFromProfile, compute06kmShear, computeSWTI,
} from "../utils/weatherCalc";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { AlertTriangle, Wind, Droplets, Thermometer, Eye, Gauge, Cloud, GripVertical, EyeOff, Plus, Settings2, RotateCcw, Check, Sunrise, Sunset } from "lucide-react";
import { format, parseISO } from "date-fns";
import { DASHBOARD_WIDGETS, WIDGET_LABELS, getLayout, saveLayout, type WidgetId, type DashboardLayout } from "../lib/dashboardLayout";
import {
  CloudCoverWidget, VisibilityWidget, HumidityPressureWidget, AqiWidget,
  SswxconWidget, IngredientsWidget, TimingWidget, MoonWidget, MosquitoWidget,
  WindWidget, WIDGET_CSS,
} from "../components/DashboardWidgets";
import { ConditionsHero } from "../components/dashboard/ConditionsHero";
import { CountUp } from "../components/dashboard/CountUp";
import { ROYAL, HEADING, EASE, panelStyle, topRule } from "../lib/royal";

interface Props { location: Location }

function StatCard({ label, value, unit, icon: Icon, sub, numeric }: {
  label: string; value: string | number; unit?: string; icon: React.ElementType;
  sub?: string; numeric?: number | null;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 26 }}
      className="relative rounded-xl p-3.5 overflow-hidden group"
      style={panelStyle}
    >
      {/* Gold rail that lights up on hover. */}
      <span className="absolute left-0 top-0 bottom-0 w-[2px] opacity-40 group-hover:opacity-100 transition-opacity"
            style={{ background: ROYAL.gold }} />
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9.5px] font-medium uppercase tracking-[0.16em]" style={{ color: ROYAL.dim }}>{label}</span>
        <Icon className="w-3.5 h-3.5" style={{ color: ROYAL.gold, opacity: 0.75 }} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums" style={{ fontFamily: HEADING, color: ROYAL.text }}>
          {numeric != null ? <CountUp value={numeric} /> : value}
        </span>
        {unit && <span className="text-[11px]" style={{ color: ROYAL.dim }}>{unit}</span>}
      </div>
      {sub && <div className="text-[10.5px] mt-0.5" style={{ color: ROYAL.dim }}>{sub}</div>}
    </motion.div>
  );
}

function WindCompass({ deg }: { deg: number }) {
  // Red arm points the way the wind is coming FROM; the blue tail shows where it's headed.
  return (
    <svg width="84" height="84" viewBox="0 0 100 100" className="shrink-0">
      <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(var(--border))" strokeWidth="2" />
      {["N", "E", "S", "W"].map((d, i) => {
        const a = ((i * 90 - 90) * Math.PI) / 180;
        return <text key={d} x={50 + 38 * Math.cos(a)} y={50 + 38 * Math.sin(a) + 3} textAnchor="middle" fontSize="10" fill="#9ca3af">{d}</text>;
      })}
      <g transform={`rotate(${deg} 50 50)`}>
        <polygon points="50,16 44,52 56,52" fill={ROYAL.gold} />
        <polygon points="50,84 44,48 56,48" fill={ROYAL.iris} opacity={0.55} />
      </g>
      <circle cx="50" cy="50" r="4" fill={ROYAL.text} />
    </svg>
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
            <div className="flex items-center gap-2 font-semibold text-sm"><AlertTriangle className="w-4 h-4" />{a.properties.event}</div>
            <div className="text-xs mt-1 opacity-80">{a.properties.headline}</div>
          </div>
        );
      })}
    </div>
  );
}

function AlertFeedDown({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border border-yellow-500/40 bg-yellow-500/10 text-yellow-200 rounded-lg p-3 flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="text-xs leading-relaxed">
        <span className="font-semibold block text-sm mb-0.5">Alerts could not be checked</span>
        We could not reach the Weather Service just now, so this is not an all-clear.
        <button onClick={onRetry} className="ml-1 underline underline-offset-2 hover:text-yellow-100">Try again</button>
      </div>
    </div>
  );
}

export default function Dashboard({ location }: Props) {
  const { data: weather, isLoading, error } = useOpenMeteo(location);
  const { data: alerts, isLoading: alertsLoading, isError: alertsFailed, refetch: refetchAlerts } = useNWSAlerts(location);
  const { data: nwsPoints } = useNWSPoints(location);

  const [layout, setLayout] = useState<DashboardLayout>(getLayout);
  const [editing, setEditing] = useState(false);
  const [dragId, setDragId] = useState<WidgetId | null>(null);

  function update(next: DashboardLayout) { saveLayout(next); setLayout(next); }
  function moveWidget(from: WidgetId, to: WidgetId) {
    if (from === to) return;
    const order = [...layout.order];
    const fi = order.indexOf(from), ti = order.indexOf(to);
    if (fi < 0 || ti < 0) return;
    order.splice(fi, 1); order.splice(ti, 0, from);
    update({ ...layout, order });
  }
  const hide = (id: WidgetId) => update({ ...layout, hidden: [...layout.hidden, id] });
  const show = (id: WidgetId) => update({ ...layout, hidden: layout.hidden.filter((w) => w !== id) });
  const reset = () => update({ order: [...DASHBOARD_WIDGETS], hidden: [] });

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
  })) ?? [];

  const srh = hourly && hourly.wind_speed_10m && hourly.wind_speed_925hPa
    ? computeSRHFromProfile(
        hourly.wind_speed_10m[0], hourly.wind_direction_10m[0],
        hourly.wind_speed_925hPa[0], hourly.wind_direction_925hPa[0],
        hourly.wind_speed_850hPa[0], hourly.wind_direction_850hPa[0],
        hourly.wind_speed_700hPa[0], hourly.wind_direction_700hPa[0],
        hourly.wind_speed_500hPa[0], hourly.wind_direction_500hPa[0],
      ) : null;
  const shear06 = hourly && hourly.wind_speed_10m && hourly.wind_speed_500hPa
    ? compute06kmShear(hourly.wind_speed_10m[0], hourly.wind_direction_10m[0], hourly.wind_speed_500hPa[0], hourly.wind_direction_500hPa[0]) : null;
  const swti = srh !== null && shear06 !== null && hourly?.cape
    ? computeSWTI({ cape: hourly.cape[0] ?? 0, srh, shear06km: shear06, liftedIndex: hourly.lifted_index?.[0] ?? 0, dewPointC: hourly.dew_point_2m?.[0] ?? 10 }) : null;

  const daily = weather?.daily;
  const dCode = (i: number) => (daily?.weather_code?.[i] as number) ?? 0;
  const todayHi = daily?.temperature_2m_max ? Math.round(cToF(daily.temperature_2m_max[0] as number)) : null;
  const todayLo = daily?.temperature_2m_min ? Math.round(cToF(daily.temperature_2m_min[0] as number)) : null;
  const todayPop = (daily?.precipitation_probability_max?.[0] as number) ?? 0;
  const sunrise = daily?.sunrise?.[0] as string | undefined;
  const sunset = daily?.sunset?.[0] as string | undefined;
  const sevenDay = (daily?.time as string[] | undefined)?.slice(0, 7).map((t, i) => ({
    day: i === 0 ? "Today" : format(parseISO(t), "EEE"),
    hi: daily!.temperature_2m_max ? Math.round(cToF(daily!.temperature_2m_max[i] as number)) : 0,
    lo: daily!.temperature_2m_min ? Math.round(cToF(daily!.temperature_2m_min[i] as number)) : 0,
    code: dCode(i),
    pop: (daily!.precipitation_probability_max?.[i] as number) ?? 0,
  })) ?? [];

  const TOOLTIP = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

  // Each widget's inner content (null = nothing to show right now).
  const content: Record<WidgetId, React.ReactNode> = {
    hero: (
      <ConditionsHero
        tempF={tempF} feelsF={feelsF}
        condition={wmoDesc} place={location.name} glyph={emoji}
        hiF={todayHi} loF={todayLo}
        windMph={windMph} windDir={windDir}
        humidity={cur?.relative_humidity_2m ?? null}
        loading={isLoading}
      />
    ),
    alerts: alertsLoading
      ? <AlertSkeleton />
      : alertsFailed
        // An empty alerts slot on the dashboard reads as "nothing is out for
        // you". When the feed is down we have not checked, so say that rather
        // than render nothing and let the silence make the claim.
        ? <AlertFeedDown onRetry={() => refetchAlerts()} />
        : (alerts?.length ? <AlertBanner alerts={alerts} /> : null),
    stats: (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {isLoading ? Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />) : (
          <>
            <StatCard label="Wind" value={`${windMph} ${windDir}`} unit="mph" icon={Wind} sub={`Gusts ${gustMph} mph`} />
            <StatCard label="Humidity" value={cur?.relative_humidity_2m ?? 0} numeric={cur?.relative_humidity_2m ?? 0} unit="%" icon={Droplets} />
            <StatCard label="Dew Point" value={`${Math.round(cToF(cur?.dew_point_2m ?? 0))}°`} unit="F" icon={Thermometer} />
            <StatCard label="Pressure" value={Math.round(cur?.surface_pressure ?? 0)} numeric={Math.round(cur?.surface_pressure ?? 0)} unit="hPa" icon={Gauge} />
            <StatCard label="Visibility" value={vis} icon={Eye} />
            <StatCard label="Cloud Cover" value={cur?.cloud_cover ?? 0} numeric={cur?.cloud_cover ?? 0} unit="%" icon={Cloud} />
          </>
        )}
      </div>
    ),
    today: daily ? (
      <div className="relative rounded-xl p-4 overflow-hidden" style={panelStyle}>
        <span className="absolute inset-x-0 top-0 h-px" style={topRule} />
        <h3 className="text-[11px] font-semibold mb-3 uppercase tracking-[0.16em]" style={{ fontFamily: HEADING, color: ROYAL.gold }}>Today — {location.name}</h3>
        <div className="flex items-center gap-4">
          <div className="text-5xl">{WEATHER_ICONS[dCode(0)] ?? "🌡️"}</div>
          <div className="flex items-baseline gap-4">
            <div><span className="text-3xl font-bold">{isLoading ? "—" : `${todayHi}°`}</span><span className="text-xs text-muted-foreground ml-1">High</span></div>
            <div><span className="text-2xl font-semibold text-muted-foreground">{isLoading ? "—" : `${todayLo}°`}</span><span className="text-xs text-muted-foreground ml-1">Low</span></div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Droplets className="w-3.5 h-3.5 text-blue-400" /> {todayPop}% chance of precip · {WMO_DESCRIPTIONS[dCode(0)] ?? "—"}
        </div>
      </div>
    ) : null,
    sevenDay: sevenDay.length ? (
      <div className="relative rounded-xl p-4 overflow-hidden" style={panelStyle}>
        <span className="absolute inset-x-0 top-0 h-px" style={topRule} />
        <h3 className="text-[11px] font-semibold mb-3 uppercase tracking-[0.16em]" style={{ fontFamily: HEADING, color: ROYAL.gold }}>7-Day Forecast</h3>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {sevenDay.map((d) => (
            <div key={d.day} className="flex flex-col items-center gap-1 rounded-lg bg-muted/20 py-2">
              <span className="text-[11px] text-muted-foreground font-medium">{d.day}</span>
              <span className="text-2xl">{WEATHER_ICONS[d.code] ?? "🌡️"}</span>
              <span className="text-xs"><span className="font-bold">{d.hi}°</span> <span className="text-muted-foreground">{d.lo}°</span></span>
              {d.pop > 0 && <span className="text-[10px] text-blue-400">{d.pop}%</span>}
            </div>
          ))}
        </div>
      </div>
    ) : null,
    sunMoon: (sunrise && sunset) ? (
      <div className="relative rounded-xl p-4 overflow-hidden" style={panelStyle}>
        <span className="absolute inset-x-0 top-0 h-px" style={topRule} />
        <h3 className="text-[11px] font-semibold mb-3 uppercase tracking-[0.16em]" style={{ fontFamily: HEADING, color: ROYAL.gold }}>Sunrise & Sunset</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 rounded-lg bg-muted/20 p-3">
            <Sunrise className="w-6 h-6 text-amber-400 shrink-0" />
            <div><div className="text-xs text-muted-foreground">Sunrise</div><div className="text-lg font-bold">{format(parseISO(sunrise), "h:mm a")}</div></div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted/20 p-3">
            <Sunset className="w-6 h-6 text-orange-400 shrink-0" />
            <div><div className="text-xs text-muted-foreground">Sunset</div><div className="text-lg font-bold">{format(parseISO(sunset), "h:mm a")}</div></div>
          </div>
        </div>
      </div>
    ) : null,
    windCompass: cur ? (
      <div className="relative rounded-xl p-4 overflow-hidden" style={panelStyle}>
        <span className="absolute inset-x-0 top-0 h-px" style={topRule} />
        <h3 className="text-[11px] font-semibold mb-3 uppercase tracking-[0.16em]" style={{ fontFamily: HEADING, color: ROYAL.gold }}>Wind</h3>
        <div className="flex items-center gap-5">
          <WindCompass deg={cur.wind_direction_10m} />
          <div>
            <div className="text-3xl font-bold">{isLoading ? "—" : windMph} <span className="text-base font-normal text-muted-foreground">mph</span></div>
            <div className="text-sm text-muted-foreground">From the {windDir} ({Math.round(cur.wind_direction_10m)}°)</div>
            <div className="text-xs text-muted-foreground mt-1">Gusting {gustMph} mph</div>
          </div>
        </div>
      </div>
    ) : null,
    swti: swti ? (
      <div className="relative rounded-xl p-4 overflow-hidden" style={panelStyle}>
        <span className="absolute inset-x-0 top-0 h-px" style={topRule} />
        <h3 className="text-[11px] font-semibold mb-3 uppercase tracking-[0.16em]" style={{ fontFamily: HEADING, color: ROYAL.gold }}>Storm Threat Index (SWTI)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center"><div className="text-2xl font-bold" style={{ color: swti.color }}>{swti.score}</div><div className="text-xs text-muted-foreground">Score / 100</div></div>
          <div className="text-center"><div className="text-sm font-semibold" style={{ color: swti.color }}>{swti.label}</div><div className="text-xs text-muted-foreground">Tornado Risk</div></div>
          <div className="text-center"><div className="text-sm font-semibold capitalize">{swti.hailRisk}</div><div className="text-xs text-muted-foreground">Hail Risk</div></div>
          <div className="text-center"><div className="text-sm font-semibold capitalize">{swti.windRisk}</div><div className="text-xs text-muted-foreground">Wind Risk</div></div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="bg-muted/30 rounded p-2"><div className="text-muted-foreground">CAPE</div><div className="font-medium">{Math.round(hourly?.cape?.[0] ?? 0)} J/kg</div></div>
          <div className="bg-muted/30 rounded p-2"><div className="text-muted-foreground">0-3km SRH</div><div className="font-medium">{srh !== null ? Math.round(srh) : "—"} m²/s²</div></div>
          <div className="bg-muted/30 rounded p-2"><div className="text-muted-foreground">0-6km Shear</div><div className="font-medium">{shear06 !== null ? Math.round(shear06) : "—"} kts</div></div>
        </div>
      </div>
    ) : null,
    tempChart: (
      <div className="relative rounded-xl p-4 overflow-hidden" style={panelStyle}>
        <span className="absolute inset-x-0 top-0 h-px" style={topRule} />
        <h3 className="text-[11px] font-semibold mb-3 uppercase tracking-[0.16em]" style={{ fontFamily: HEADING, color: ROYAL.gold }}>24-Hour Temperature Trend</h3>
        {isLoading ? <ChartSkeleton /> : (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={hourlyChart}>
              <defs><linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={ROYAL.gold} stopOpacity={0.34} /><stop offset="95%" stopColor={ROYAL.gold} stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="°" />
              <Tooltip contentStyle={TOOLTIP} formatter={(v) => [`${v}°F`, "Temp"]} />
              <Area type="monotone" dataKey="temp" stroke={ROYAL.gold} strokeWidth={2} fill="url(#tempGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    ),
    precipChart: (
      <div className="relative rounded-xl p-4 overflow-hidden" style={panelStyle}>
        <span className="absolute inset-x-0 top-0 h-px" style={topRule} />
        <h3 className="text-[11px] font-semibold mb-3 uppercase tracking-[0.16em]" style={{ fontFamily: HEADING, color: ROYAL.gold }}>24-Hour Precip Probability</h3>
        {isLoading ? <ChartSkeleton /> : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={hourlyChart}>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
              <Tooltip contentStyle={TOOLTIP} formatter={(v) => [`${v}%`, "Precip Prob"]} />
              <Bar dataKey="precip" fill={ROYAL.iris} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    ),
    nwsOffice: nwsPoints ? (
      <div className="relative rounded-xl p-4 overflow-hidden" style={panelStyle}>
        <span className="absolute inset-x-0 top-0 h-px" style={topRule} />
        <h3 className="text-[11px] font-semibold mb-2 uppercase tracking-[0.16em]" style={{ fontFamily: HEADING, color: ROYAL.gold }}>NWS Office</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Office: </span><span className="font-medium">{nwsPoints.properties.cwa}</span></div>
          <div><span className="text-muted-foreground">Grid: </span><span className="font-medium">{nwsPoints.properties.gridX}, {nwsPoints.properties.gridY}</span></div>
          <div><span className="text-muted-foreground">Location: </span><span className="font-medium">{nwsPoints.properties.relativeLocation?.properties?.city}, {nwsPoints.properties.relativeLocation?.properties?.state}</span></div>
          <div><span className="text-muted-foreground">Timezone: </span><span className="font-medium">{nwsPoints.properties.timeZone}</span></div>
        </div>
      </div>
    ) : null,

    // ── Relaunch mini-widgets ──
    // These are compact and animated, so they read as a phone-weather-app tile
    // wall rather than a stack of panels. Each links through to its full module.
    cloudCover: <CloudCoverWidget wx={weather} />,
    visibility: <VisibilityWidget wx={weather} />,
    humidityPressure: <HumidityPressureWidget wx={weather} />,
    aqi: <AqiWidget location={location} />,
    sswxcon: <SswxconWidget wx={weather} />,
    ingredients: <IngredientsWidget wx={weather} />,
    timing: <TimingWidget wx={weather} />,
    moon: <MoonWidget />,
    mosquito: <MosquitoWidget wx={weather} />,
  };

  // Compact widgets tile two-up on phones and four-up on desktop; the original
  // full-width panels keep their own row.
  const COMPACT = new Set<WidgetId>([
    "cloudCover", "visibility", "humidityPressure", "aqi",
    "sswxcon", "ingredients", "timing", "moon", "mosquito",
  ]);

  const visible = layout.order.filter((id) => !layout.hidden.includes(id));
  const hiddenList = layout.order.filter((id) => layout.hidden.includes(id));

  return (
    <div className="p-4 md:p-6 space-y-4">
      <style>{WIDGET_CSS}</style>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] mb-0.5" style={{ color: ROYAL.gold }}>
            StormSync VIP
          </div>
          <h1 className="text-xl font-bold tracking-[0.02em]" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            Your Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {editing && <button onClick={reset} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary px-2 py-1.5"><RotateCcw className="w-3.5 h-3.5" /> Reset</button>}
          <button onClick={() => setEditing(e => !e)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${editing ? "bg-primary/15 border-primary/40 text-primary" : "pulse-glow bg-primary/10 border-primary/50 text-primary hover:bg-primary/20"}`}>
            {editing ? <><Check className="w-3.5 h-3.5" /> Done</> : <><Settings2 className="w-3.5 h-3.5" /> Customize</>}
          </button>
        </div>
      </div>

      {editing && hiddenList.length > 0 && (
        <div className="bg-muted/20 border border-border rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Hidden widgets — tap to add back</div>
          <div className="flex flex-wrap gap-2">
            {hiddenList.map(id => (
              <button key={id} onClick={() => show(id)} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-card border border-border hover:border-primary/40 text-muted-foreground hover:text-primary">
                <Plus className="w-3 h-3" /> {WIDGET_LABELS[id]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* A grid rather than a stack: compact tiles sit two-up on phones and
          four-up on desktop, while the original full-width panels span the row.
          Drag-and-drop ordering is unchanged. */}
      <LayoutGroup id="dashboard">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
        {visible.map((id, idx) => {
          const inner = content[id];
          if (inner == null && !editing) return null;
          const compact = COMPACT.has(id);
          return (
            <motion.div
              key={id}
              layout
              // Tiles rise in sequence on first paint, and `layout` means a
              // re-order during customise animates to its new slot rather than
              // teleporting there.
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                layout: { type: "spring", stiffness: 320, damping: 32 },
                delay: Math.min(idx, 10) * 0.045,
                duration: 0.45,
                ease: EASE,
              }}
              draggable={editing}
              onDragStart={() => setDragId(id)}
              onDragOver={(e) => { if (editing && dragId && dragId !== id) e.preventDefault(); }}
              onDrop={() => { if (dragId) moveWidget(dragId, id); setDragId(null); }}
              onDragEnd={() => setDragId(null)}
              className={`${compact ? "col-span-1" : "col-span-2 md:col-span-4"} ${
                editing ? `relative rounded-xl border border-dashed border-primary/30 p-2 transition-opacity ${dragId === id ? "opacity-40" : ""}` : ""}`}
            >
              {editing && (
                <div className="flex items-center justify-between mb-2 px-1 gap-1">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-grab active:cursor-grabbing min-w-0"><GripVertical className="w-4 h-4 shrink-0" /> <span className="truncate">{WIDGET_LABELS[id]}</span></span>
                  <button onClick={() => hide(id)} className="text-muted-foreground hover:text-red-400 flex items-center gap-1 text-[11px]"><EyeOff className="w-3.5 h-3.5" /> Hide</button>
                </div>
              )}
              {inner ?? <div className="text-xs text-muted-foreground italic px-2 py-3">Nothing to show here right now.</div>}
            </motion.div>
          );
        })}
      </div>
      </LayoutGroup>
    </div>
  );
}
