import { useQuery } from "@tanstack/react-query";
import type { Location } from "../hooks/useLocation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, Cell } from "recharts";
import { format, parseISO } from "date-fns";
import { Wind, ExternalLink, Info } from "lucide-react";

interface Props { location: Location }

async function fetchAQI(lat: number, lon: number) {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lon.toFixed(4));
  url.searchParams.set("hourly", "us_aqi,pm10,pm2_5,ozone,nitrogen_dioxide,carbon_monoxide,dust,uv_index");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "5");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("AQI fetch failed");
  return res.json();
}

function aqiCategory(aqi: number): { label: string; color: string; desc: string; emoji: string } {
  if (aqi <= 50)  return { label: "Good",                     color: "#4ade80", desc: "Air quality is satisfactory. No health concerns.",                          emoji: "✅" };
  if (aqi <= 100) return { label: "Moderate",                 color: "#fde047", desc: "Acceptable; some pollutants may concern sensitive groups.",                  emoji: "🟡" };
  if (aqi <= 150) return { label: "Unhealthy (Sensitive)",    color: "#fb923c", desc: "Sensitive groups may experience health effects. Others are less likely.",    emoji: "🟠" };
  if (aqi <= 200) return { label: "Unhealthy",                color: "#ef4444", desc: "Everyone may begin to experience health effects.",                           emoji: "🔴" };
  if (aqi <= 300) return { label: "Very Unhealthy",           color: "#a855f7", desc: "Health alert — everyone may experience more serious effects.",               emoji: "🟣" };
  return           { label: "Hazardous",                      color: "#be123c", desc: "Emergency conditions — the entire population is affected.",                   emoji: "☣️" };
}

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

function AQIGauge({ aqi, color }: { aqi: number; color: string }) {
  const maxAqi = 500;
  const pct = Math.min(1, aqi / maxAqi);
  const angle = pct * 180;
  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = 100, cy = 100, r = 80;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);

  function polarToXY(angleDeg: number, radius: number) {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }

  function arcPath(startDeg: number, endDeg: number, radius: number) {
    const s = polarToXY(startDeg, radius);
    const e = polarToXY(endDeg, radius);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  const segments = [
    { start: -90, end: -54, color: "#4ade80" },   // Good 0-50
    { start: -54, end: -18, color: "#fde047" },   // Moderate 50-100
    { start: -18, end: 18, color: "#fb923c" },    // USG 100-150
    { start: 18, end: 54, color: "#ef4444" },     // Unhealthy 150-200
    { start: 54, end: 72, color: "#a855f7" },     // VeryUnhealthy 200-300
    { start: 72, end: 90, color: "#be123c" },     // Hazardous 300-500
  ];

  return (
    <svg width="200" height="110" viewBox="0 0 200 110">
      {segments.map((seg, i) => (
        <path key={i} d={arcPath(seg.start, seg.end, 80)} stroke={seg.color}
          strokeWidth="12" fill="none" strokeLinecap="round" opacity={0.3} />
      ))}
      <path d={arcPath(-90, angle - 90, 80)} stroke={color}
        strokeWidth="12" fill="none" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill="white" />
      <text x={cx} y={cy + 22} textAnchor="middle" fontSize="28" fontWeight="bold" fill={color}>{aqi}</text>
      <text x={15} y={108} fontSize="9" fill="#6b7280">0</text>
      <text x={180} y={108} fontSize="9" fill="#6b7280">500</text>
    </svg>
  );
}

export default function AQIForecast({ location }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["aqi", location.lat.toFixed(3), location.lon.toFixed(3)],
    queryFn: () => fetchAQI(location.lat, location.lon),
    staleTime: 30 * 60 * 1000,
  });

  const hourly = data?.hourly;
  const currentAQI = hourly?.us_aqi?.[0] ?? 0;
  const { label: aqiLabel, color: aqiColor, desc: aqiDesc, emoji: aqiEmoji } = aqiCategory(currentAQI);

  const chartData = hourly?.time?.slice(0, 48).map((t: string, i: number) => ({
    time: format(parseISO(t), "EEE ha"),
    aqi: Math.round(hourly.us_aqi?.[i] ?? 0),
    pm25: Math.round((hourly.pm2_5?.[i] ?? 0) * 10) / 10,
    pm10: Math.round((hourly.pm10?.[i] ?? 0) * 10) / 10,
    ozone: Math.round(hourly.ozone?.[i] ?? 0),
    uv: Math.round((hourly.uv_index?.[i] ?? 0) * 10) / 10,
  })) ?? [];

  const pm25 = hourly?.pm2_5?.[0] ?? 0;
  const pm10 = hourly?.pm10?.[0] ?? 0;
  const ozone = hourly?.ozone?.[0] ?? 0;
  const no2 = hourly?.nitrogen_dioxide?.[0] ?? 0;
  const co = hourly?.carbon_monoxide?.[0] ?? 0;
  const uv = hourly?.uv_index?.[0] ?? 0;

  function uvLabel(uv: number): { label: string; color: string } {
    if (uv <= 2) return { label: "Low", color: "#4ade80" };
    if (uv <= 5) return { label: "Moderate", color: "#fde047" };
    if (uv <= 7) return { label: "High", color: "#f97316" };
    if (uv <= 10) return { label: "Very High", color: "#ef4444" };
    return { label: "Extreme", color: "#a855f7" };
  }

  const uvInfo = uvLabel(uv);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Wind className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold tracking-wide">Air Quality Forecast</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · Open-Meteo Air Quality API</p>

      {error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
          Unable to load air quality data. Please try again later.
        </div>
      ) : (
        <>
          <div className="aurora-bg glass rounded-2xl p-6 flex flex-col items-center text-center" style={{ boxShadow: `0 0 40px -8px ${aqiColor}55`, borderColor: aqiColor + "55" }}>
            <div className="relative">
              <div className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">Current US AQI</div>
              {isLoading
                ? <div className="h-28 w-48 bg-muted/20 rounded animate-pulse mb-3 mx-auto" />
                : <AQIGauge aqi={currentAQI} color={aqiColor} />
              }
              <div className="text-2xl mb-1">{aqiEmoji}</div>
              <div className="text-2xl font-bold" style={{ color: aqiColor, textShadow: `0 0 22px ${aqiColor}66` }}>{aqiLabel}</div>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{aqiDesc}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "PM2.5", value: isLoading ? "—" : `${pm25.toFixed(1)} μg/m³`, color: aqiCategory(Math.round(pm25 * 2)).color, sub: pm25 < 12 ? "Good" : pm25 < 35 ? "Moderate" : "Elevated" },
              { label: "PM10", value: isLoading ? "—" : `${pm10.toFixed(1)} μg/m³`, color: pm10 < 54 ? "#4ade80" : pm10 < 154 ? "#fde047" : "#ef4444", sub: pm10 < 54 ? "Good" : "Elevated" },
              { label: "Ozone", value: isLoading ? "—" : `${ozone.toFixed(0)} μg/m³`, color: ozone < 100 ? "#4ade80" : ozone < 160 ? "#fde047" : "#ef4444", sub: ozone < 100 ? "Good" : "Elevated" },
              { label: "NO₂", value: isLoading ? "—" : `${no2.toFixed(1)} μg/m³`, color: no2 < 40 ? "#4ade80" : no2 < 100 ? "#fde047" : "#ef4444", sub: no2 < 40 ? "Good" : "Elevated" },
              { label: "CO", value: isLoading ? "—" : `${(co / 1000).toFixed(1)} mg/m³`, color: "#7B8FD9", sub: "Carbon Monoxide" },
              { label: "UV Index", value: isLoading ? "—" : uv.toFixed(1), color: uvInfo.color, sub: uvInfo.label },
            ].map(m => (
              <div key={m.label} className="relative rounded-xl p-3 text-center overflow-hidden border" style={{ borderColor: m.color + "33", background: `linear-gradient(160deg, ${m.color}12, transparent 70%)` }}>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{m.label}</div>
                <div className="text-lg font-bold" style={{ color: m.color }}>{m.value}</div>
                <div className="text-xs mt-1" style={{ color: m.color }}>{m.sub}</div>
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">48-Hour AQI Forecast</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData}>
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} domain={[0, 300]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}`, "AQI"]} />
                <Bar dataKey="aqi" radius={[3, 3, 0, 0]}>
                  {(chartData ?? []).map((entry: { time: string; aqi: number; pm25: number; pm10: number; o3: number; no2: number }, i: number) => <Cell key={i} fill={aqiCategory(entry.aqi).color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">PM2.5 Fine Particle Trend</h3>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="pmGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit=" μg" />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} μg/m³`, "PM2.5"]} />
                <Area type="monotone" dataKey="pm25" stroke="#f97316" fill="url(#pmGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-start gap-2 mb-3">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <h3 className="text-sm font-semibold">AQI Scale Reference</h3>
            </div>
            <div className="space-y-2">
              {[
                { range: "0–50", label: "Good", color: "#4ade80", action: "No precautions needed." },
                { range: "51–100", label: "Moderate", color: "#fde047", action: "Unusually sensitive individuals should consider limiting prolonged exertion." },
                { range: "101–150", label: "Unhealthy (Sensitive Groups)", color: "#fb923c", action: "Sensitive groups should reduce prolonged or heavy exertion outdoors." },
                { range: "151–200", label: "Unhealthy", color: "#ef4444", action: "Everyone should reduce prolonged exertion; sensitive groups should avoid it." },
                { range: "201–300", label: "Very Unhealthy", color: "#a855f7", action: "Everyone should avoid all outdoor physical activity." },
                { range: "301+", label: "Hazardous", color: "#be123c", action: "Everyone should remain indoors and keep windows closed." },
              ].map(r => (
                <div key={r.range} className="flex items-start gap-3">
                  <div className="w-3 h-3 rounded-sm shrink-0 mt-0.5" style={{ backgroundColor: r.color }} />
                  <div className="w-16 text-xs font-bold shrink-0" style={{ color: r.color }}>{r.range}</div>
                  <div className="text-xs">
                    <span className="font-medium">{r.label}</span>
                    <span className="text-muted-foreground ml-1.5">{r.action}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <a href="https://www.airnow.gov/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors">
            <ExternalLink className="w-3.5 h-3.5 text-primary" />
            <div>
              <div className="text-sm font-medium">AirNow.gov</div>
              <div className="text-xs text-muted-foreground">Official EPA air quality data</div>
            </div>
          </a>
        </>
      )}
    </div>
  );
}
