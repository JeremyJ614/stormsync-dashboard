import { useQuery } from "@tanstack/react-query";
import type { Location } from "../hooks/useLocation";
import { useNWSAlerts, useOpenMeteo } from "../hooks/useWeatherQuery";
import { cToF, msToMph, getWindDirection } from "../utils/weatherCalc";
import { FileText, RefreshCw, Bot, AlertTriangle, Thermometer, Wind, Droplets, Eye, TrendingUp, TrendingDown } from "lucide-react";
import { WMO_DESCRIPTIONS, WEATHER_ICONS } from "../config";
import { format, parseISO } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";

interface Props { location: Location }

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

// Fetch nationwide active alert count for the summary
function useNationwideAlertCount() {
  return useQuery({
    queryKey: ["nationwide-count"],
    queryFn: async () => {
      const res = await fetch("https://api.weather.gov/alerts/active?status=actual&limit=500", {
        headers: { "User-Agent": "StormSync/1.0" },
      });
      if (!res.ok) return { total: 0, tornado: 0, svr: 0, flood: 0 };
      const data = await res.json();
      const features = data.features ?? [];
      return {
        total:   features.length,
        tornado: features.filter((f: { properties: { event: string } }) => f.properties.event?.toLowerCase().includes("tornado warning")).length,
        svr:     features.filter((f: { properties: { event: string } }) => f.properties.event?.toLowerCase().includes("severe thunderstorm warning")).length,
        flood:   features.filter((f: { properties: { event: string } }) => f.properties.event?.toLowerCase().includes("flash flood warning")).length,
      };
    },
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

/**
 * Generate a comprehensive weather history and current situation briefing
 * that reads like a real meteorologist's summary.
 */
function generateBriefing(data: {
  tempF: number;
  feelsF: number;
  condition: string;
  windMph: number;
  windDir: string;
  gustMph: number;
  humidity: number;
  dewF: number;
  location: string;
  alerts: number;
  alertEvents: string[];
  highF: number | null;
  lowF: number | null;
  temp6hAgoF: number;
  temp24hAgoF: number;
  precipLast24h: number;
  nationwideTotal: number;
  nationwideTornado: number;
  nationwideSvr: number;
  nationwideFlood: number;
}): string {
  const {
    tempF, feelsF, condition, windMph, windDir, gustMph, humidity, dewF,
    location, alerts, alertEvents, highF, lowF, temp6hAgoF, temp24hAgoF,
    precipLast24h, nationwideTotal, nationwideTornado, nationwideSvr, nationwideFlood,
  } = data;

  const now = format(new Date(), "EEEE, MMMM d 'at' h:mm a");
  const tempTrend6h  = tempF - temp6hAgoF;
  const tempTrend24h = tempF - temp24hAgoF;

  const paragraphs: string[] = [];

  // === OPENING: Current local conditions ===
  paragraphs.push(
    `As of ${now}, conditions at ${location} are ${condition.toLowerCase()} with a temperature of ${tempF}°F (feels like ${feelsF}°F). ` +
    `Winds are out of the ${windDir} at ${windMph} mph${gustMph > windMph + 5 ? `, gusting to ${gustMph} mph` : ""}. ` +
    `Relative humidity stands at ${humidity}% with a dew point of ${dewF}°F${dewF >= 65 ? " — conditions feel noticeably muggy" : dewF <= 30 ? " — very dry air is in place" : ""}.`
  );

  // === TEMPERATURE HISTORY ===
  const trend24hText = Math.abs(tempTrend24h) >= 2
    ? `temperatures have ${tempTrend24h > 0 ? "risen" : "fallen"} about ${Math.abs(Math.round(tempTrend24h))}°F over the past 24 hours`
    : "temperatures have held fairly steady over the past 24 hours";
  const trend6hText = Math.abs(tempTrend6h) >= 3
    ? `The past 6 hours have seen a ${tempTrend6h > 0 ? "notable warm-up" : "notable cool-down"} of ${Math.abs(Math.round(tempTrend6h))}°F.`
    : "";
  paragraphs.push(
    `Looking at recent temperature history, ${trend24hText}. ` +
    (highF !== null ? `Today's high has reached ${highF}°F with a low of ${lowF}°F. ` : "") +
    trend6hText
  );

  // === PRECIPITATION HISTORY ===
  if (precipLast24h > 0.01) {
    paragraphs.push(
      `Recent precipitation: ${precipLast24h.toFixed(2)} inches of rain have fallen over the past 24 hours at ${location}. ` +
      (precipLast24h > 1 ? "Significant rainfall totals may be contributing to elevated runoff or local flooding concerns." :
       precipLast24h > 0.25 ? "A moderate soaking has helped soil moisture this period." :
       "Light precipitation has been recorded, bringing minimal impacts.")
    );
  } else {
    paragraphs.push(
      `No significant precipitation has been recorded in the past 24 hours at ${location}. ` +
      (dewF <= 35 ? "Dry conditions combined with low humidity may support elevated fire weather concerns in parts of the region." :
       "Conditions remain dry for now with no precipitation in the immediate forecast.")
    );
  }

  // === LOCAL ALERTS ===
  if (alerts > 0) {
    paragraphs.push(
      `⚠️ There are ${alerts} active NWS alert${alerts > 1 ? "s" : ""} for the ${location} area: ` +
      `${alertEvents.slice(0, 3).join(", ")}${alertEvents.length > 3 ? `, and ${alertEvents.length - 3} more` : ""}. ` +
      "Residents should stay weather-aware and heed any official guidance from the National Weather Service."
    );
  }

  // === NATIONAL SITUATION SUMMARY ===
  if (nationwideTotal > 0) {
    let nationalSummary = `Across the United States, the NWS currently has ${nationwideTotal} active alert${nationwideTotal !== 1 ? "s" : ""} in effect. `;
    const items: string[] = [];
    if (nationwideTornado > 0) items.push(`${nationwideTornado} tornado warning${nationwideTornado > 1 ? "s" : ""}`);
    if (nationwideSvr     > 0) items.push(`${nationwideSvr} severe thunderstorm warning${nationwideSvr > 1 ? "s" : ""}`);
    if (nationwideFlood   > 0) items.push(`${nationwideFlood} flash flood warning${nationwideFlood > 1 ? "s" : ""}`);
    if (items.length > 0) {
      nationalSummary += `This includes ${items.join(", ")}. `;
    }
    nationalSummary += nationwideTornado > 0 || nationwideSvr > 0
      ? "Active severe weather is occurring across portions of the country. Check the Warning Center for the full nationwide alert feed."
      : "Severe weather activity is relatively limited nationally at this time.";
    paragraphs.push(nationalSummary);
  } else {
    paragraphs.push(
      "Across the nation, no significant active weather alerts are currently in effect — a relatively quiet pattern persists for most of the continental United States."
    );
  }

  // === CLOSING OUTLOOK ===
  const dewSeverity = dewF >= 70 ? "Extremely oppressive humidity"
    : dewF >= 65 ? "Muggy conditions"
    : dewF >= 55 ? "Somewhat humid air"
    : "Comfortable moisture levels";
  paragraphs.push(
    `${dewSeverity} and ${windMph >= 20 ? "breezy" : "light"} winds characterize the local environment at this time. ` +
    "For the latest forecasts, check the NWS forecast discussion page and monitor SPC for any developing severe weather threats."
  );

  return paragraphs.join("\n\n");
}

function TrendBadge({ diff, unit }: { diff: number; unit: string }) {
  if (Math.abs(diff) < 1) return <span className="text-xs text-muted-foreground">Steady</span>;
  const up = diff > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? "text-red-400" : "text-blue-400"}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {Math.abs(Math.round(diff))}{unit}
    </span>
  );
}

export default function RecentWeatherSummary({ location }: Props) {
  const { data: weather, isLoading, refetch } = useOpenMeteo(location);
  const { data: alerts = [] } = useNWSAlerts(location);
  const { data: nationwideCount } = useNationwideAlertCount();

  const cur    = weather?.current;
  const hourly = weather?.hourly;
  const daily  = weather?.daily;

  const tempF   = cur ? Math.round(cToF(cur.temperature_2m))       : null;
  const feelsF  = cur ? Math.round(cToF(cur.apparent_temperature))  : null;
  const dewF    = cur ? Math.round(cToF(cur.dew_point_2m ?? 10))   : null;
  const windMph = cur ? Math.round(msToMph(cur.wind_speed_10m))     : 0;
  const gustMph = cur ? Math.round(msToMph(cur.wind_gusts_10m))     : 0;
  const windDir = cur ? getWindDirection(cur.wind_direction_10m)    : "";
  const humidity = cur?.relative_humidity_2m ?? 0;
  const wmoCode  = cur?.weather_code ?? 0;
  const condition = WMO_DESCRIPTIONS[wmoCode] ?? "Unknown";
  const emoji     = WEATHER_ICONS[wmoCode] ?? "🌡️";

  const tempNow  = hourly?.temperature_2m?.[0] ?? 0;
  const temp6ago = hourly?.temperature_2m?.[6] ?? tempNow;
  const temp24ago= hourly?.temperature_2m?.[23] ?? tempNow;

  const precipLast24h = hourly?.precipitation
    ? hourly.precipitation.slice(0, 24).reduce((s: number, v: number) => s + (v ?? 0), 0)
    : 0;

  const dailyHighLow = (() => {
    if (!hourly?.temperature_2m) return null;
    const todayTemps = hourly.temperature_2m.slice(0, 24).map(cToF);
    return {
      high: Math.round(Math.max(...todayTemps)),
      low:  Math.round(Math.min(...todayTemps)),
    };
  })();

  const briefing = !isLoading && tempF !== null
    ? generateBriefing({
        tempF,
        feelsF:          feelsF!,
        condition,
        windMph,
        windDir,
        gustMph,
        humidity,
        dewF:            dewF!,
        location:        location.name,
        alerts:          alerts.length,
        alertEvents:     alerts.map((a: { properties: { event: string } }) => a.properties.event),
        highF:           dailyHighLow?.high ?? null,
        lowF:            dailyHighLow?.low  ?? null,
        temp6hAgoF:      Math.round(cToF(temp6ago)),
        temp24hAgoF:     Math.round(cToF(temp24ago)),
        precipLast24h,
        nationwideTotal:   nationwideCount?.total   ?? 0,
        nationwideTornado: nationwideCount?.tornado  ?? 0,
        nationwideSvr:     nationwideCount?.svr      ?? 0,
        nationwideFlood:   nationwideCount?.flood    ?? 0,
      })
    : null;

  const pastHours = hourly?.time?.slice(0, 24).map((t: string, i: number) => ({
    time:     format(parseISO(t), "ha"),
    temp:     hourly.temperature_2m ? Math.round(cToF(hourly.temperature_2m[i])) : 0,
    precip:   hourly.precipitation  ? parseFloat((hourly.precipitation[i] * 0.0394).toFixed(3)) : 0,
    humidity: hourly.relative_humidity_2m?.[i] ?? 0,
  })) ?? [];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold tracking-wide">Weather Briefing</h2>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · Current conditions &amp; recent history</p>

      {/* Active local alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 3).map((a: { properties: { id: string; severity: string; event: string; headline?: string } }) => {
            const colors: Record<string, string> = {
              Extreme: "border-red-500/50 bg-red-500/10 text-red-300",
              Severe:  "border-orange-500/50 bg-orange-500/10 text-orange-300",
              Moderate:"border-yellow-500/50 bg-yellow-500/10 text-yellow-300",
              Minor:   "border-blue-500/50 bg-blue-500/10 text-blue-300",
            };
            const cls = colors[a.properties.severity] ?? "border-muted bg-muted/10 text-muted-foreground";
            return (
              <div key={a.properties.id} className={`border rounded-xl p-3 flex items-start gap-2 ${cls}`}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-sm">{a.properties.event}</div>
                  <div className="text-xs opacity-80 mt-0.5">{a.properties.headline}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* National situation snapshot */}
      {nationwideCount && nationwideCount.total > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">National Situation</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Alerts",        value: nationwideCount.total,   color: "text-yellow-400" },
              { label: "Tornado Warnings",    value: nationwideCount.tornado, color: "text-red-400" },
              { label: "Svr Tstm Warnings",   value: nationwideCount.svr,     color: "text-orange-400" },
              { label: "Flash Flood Warnings",value: nationwideCount.flood,   color: "text-blue-400" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Weather History Briefing */}
      <div className="bg-card border border-primary/20 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Recent Weather Summary</span>
          <span className="text-xs text-muted-foreground ml-auto">{format(new Date(), "h:mm a · MMM d")}</span>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-3 bg-muted/20 rounded animate-pulse" style={{ width: `${85 - i * 8}%` }} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {briefing?.split("\n\n").map((para, i) => (
              <p key={i} className="text-sm leading-relaxed text-foreground/90">{para}</p>
            ))}
          </div>
        )}
      </div>

      {/* Current conditions card */}
      <div className="flex items-center gap-4 bg-card border border-border rounded-xl p-4">
        <div className="text-5xl">{emoji}</div>
        <div className="flex-1">
          <div className="text-3xl font-bold">{isLoading ? "—" : `${tempF}°F`}</div>
          <div className="text-sm text-muted-foreground">{condition}</div>
          <div className="text-xs text-muted-foreground">Feels like {isLoading ? "—" : `${feelsF}°F`}</div>
        </div>
        {dailyHighLow && (
          <div className="text-right">
            <div className="text-sm font-semibold text-red-400">H: {dailyHighLow.high}°</div>
            <div className="text-sm font-semibold text-blue-400">L: {dailyHighLow.low}°</div>
          </div>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 uppercase tracking-wide">
            <Thermometer className="w-3 h-3" /> 6h Temp Trend
          </div>
          <div className="text-xl font-bold">{isLoading ? "—" : `${Math.round(cToF(tempNow))}°F`}</div>
          <TrendBadge diff={cToF(tempNow) - cToF(temp6ago)} unit="°" />
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 uppercase tracking-wide">
            <Wind className="w-3 h-3" /> Wind
          </div>
          <div className="text-xl font-bold">{isLoading ? "—" : `${windMph} mph`}</div>
          <div className="text-xs text-muted-foreground">{windDir} · Gusts {gustMph}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 uppercase tracking-wide">
            <Droplets className="w-3 h-3" /> Dew Point
          </div>
          <div className="text-xl font-bold">{isLoading ? "—" : `${dewF}°F`}</div>
          <div className="text-xs text-muted-foreground">RH {humidity}%</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2 uppercase tracking-wide">
            <Eye className="w-3 h-3" /> 24h Precip
          </div>
          <div className="text-xl font-bold">
            {isLoading ? "—" : `${(precipLast24h * 0.0394).toFixed(2)}"`}
          </div>
          <div className="text-xs text-muted-foreground">Last 24 hours</div>
        </div>
      </div>

      {/* 24-Hour Temperature Trend */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-1">24-Hour Temperature Trend</h3>
        <p className="text-xs text-muted-foreground mb-3">
          24h change: <TrendBadge diff={cToF(tempNow) - cToF(temp24ago)} unit="°" />
        </p>
        {isLoading ? (
          <div className="h-36 bg-muted/20 rounded animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={pastHours}>
              <defs>
                <linearGradient id="tempG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={5} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="°" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}°F`, "Temp"]} />
              <Area type="monotone" dataKey="temp" stroke="#f97316" strokeWidth={2} fill="url(#tempG)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Precipitation history */}
      {!isLoading && precipLast24h > 0.001 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">24-Hour Hourly Precipitation</h3>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={pastHours}>
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={5} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="&quot;" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}"`, "Precip"]} />
              <Bar dataKey="precip" fill="#3b82f6" radius={[2, 2, 0, 0]} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 24-Hour Humidity */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">24-Hour Humidity</h3>
        {isLoading ? (
          <div className="h-36 bg-muted/20 rounded animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={pastHours}>
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={5} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="%" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, "Humidity"]} />
              <Bar dataKey="humidity" fill="#3b82f6" radius={[2, 2, 0, 0]} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
