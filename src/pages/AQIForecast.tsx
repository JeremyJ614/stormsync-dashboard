import { useQuery } from "@tanstack/react-query";
import { useRef, useEffect } from "react";
import type { Location } from "../hooks/useLocation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, Cell } from "recharts";
import { format, parseISO } from "date-fns";
import { Wind, ExternalLink, Info } from "lucide-react";
import { PageHero } from "../components/PageHero";

interface Props { location: Location }

const AQI_MAX = 500;

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

// Cinematic canvas arc gauge (shares the SSWXCon Score look — multi-layer glow,
// tick ring, dark dial face — tuned to the 0–500 US AQI scale with extra glow).
function AQIArcGauge({ aqi, color }: { aqi: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = 320, cssH = 260;
    if (canvas.width !== cssW * dpr) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = cssW, H = cssH;
    const cx = W / 2, cy = H * 0.60;
    const R = Math.min(W, H) * 0.40;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const totalArc = endAngle - startAngle;
    const pct = Math.min(1, aqi / AQI_MAX);
    const fillAngle = startAngle + totalArc * pct;

    ctx.clearRect(0, 0, W, H);

    // Outer ambient glow
    const ambient = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 1.6);
    ambient.addColorStop(0, color + "2b");
    ambient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, W, H);

    // Outer thin ring
    ctx.beginPath();
    ctx.arc(cx, cy, R + 16, startAngle, endAngle);
    ctx.strokeStyle = "rgba(148,163,184,0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Tick marks (major every 10%, minor every 5%)
    for (let i = 0; i <= 20; i++) {
      const a = startAngle + (totalArc * i) / 20;
      const isMajor = i % 2 === 0;
      const inner = R - (isMajor ? 16 : 10);
      const outer = R - 22;
      ctx.beginPath();
      ctx.moveTo(cx + outer * Math.cos(a), cy + outer * Math.sin(a));
      ctx.lineTo(cx + inner * Math.cos(a), cy + inner * Math.sin(a));
      ctx.strokeStyle = isMajor ? "rgba(203,213,225,0.45)" : "rgba(148,163,184,0.25)";
      ctx.lineWidth = isMajor ? 1.5 : 1;
      ctx.stroke();
    }

    const segColors = [
      { from: 0, to: 50 / AQI_MAX, color: "#4ade80" },
      { from: 50 / AQI_MAX, to: 100 / AQI_MAX, color: "#fde047" },
      { from: 100 / AQI_MAX, to: 150 / AQI_MAX, color: "#fb923c" },
      { from: 150 / AQI_MAX, to: 200 / AQI_MAX, color: "#ef4444" },
      { from: 200 / AQI_MAX, to: 300 / AQI_MAX, color: "#a855f7" },
      { from: 300 / AQI_MAX, to: 1, color: "#be123c" },
    ];

    // Dark base track
    ctx.beginPath();
    ctx.arc(cx, cy, R, startAngle, endAngle);
    ctx.strokeStyle = "rgba(15,23,42,0.85)";
    ctx.lineWidth = 22;
    ctx.lineCap = "round";
    ctx.stroke();

    // Faint segmented background
    segColors.forEach(seg => {
      ctx.beginPath();
      ctx.arc(cx, cy, R, startAngle + totalArc * seg.from, startAngle + totalArc * seg.to);
      ctx.strokeStyle = seg.color + "33";
      ctx.lineWidth = 22;
      ctx.lineCap = "butt";
      ctx.stroke();
    });

    // Active fill — triple-layer dramatic glow
    if (pct > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, startAngle, fillAngle);
      ctx.strokeStyle = color + "55";
      ctx.lineWidth = 34;
      ctx.lineCap = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 30;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, startAngle, fillAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 22;
      ctx.lineCap = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, startAngle, fillAngle);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }

    // Tapered needle indicator
    const nxOuter = cx + (R + 14) * Math.cos(fillAngle);
    const nyOuter = cy + (R + 14) * Math.sin(fillAngle);
    const nxInner = cx + (R - 14) * Math.cos(fillAngle);
    const nyInner = cy + (R - 14) * Math.sin(fillAngle);
    ctx.save();
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(nxOuter, nyOuter);
    ctx.lineTo(nxInner, nyInner);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(nxOuter, nyOuter, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    // Inner dark dial face
    const dial = ctx.createRadialGradient(cx, cy - R * 0.2, 4, cx, cy, R * 0.78);
    dial.addColorStop(0, "rgba(30,41,59,0.95)");
    dial.addColorStop(1, "rgba(2,6,23,0.95)");
    ctx.beginPath();
    ctx.arc(cx, cy, R - 22, 0, Math.PI * 2);
    ctx.fillStyle = dial;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = color + "44";
    ctx.stroke();

    // Score number — multi-pass glow
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 58px ui-monospace, monospace";
    ctx.shadowColor = color;
    ctx.shadowBlur = 32;
    ctx.fillStyle = color;
    ctx.fillText(String(Math.round(aqi)), cx, cy - 6);
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(Math.round(aqi)), cx, cy - 6);
    ctx.restore();

    // Label inside dial
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(148,163,184,0.85)";
    ctx.font = "600 10px ui-sans-serif, system-ui";
    ctx.fillText("US AQI", cx, cy + 26);
    ctx.fillStyle = color;
    ctx.font = "700 9px ui-sans-serif, system-ui";
    ctx.fillText(`${Math.round(pct * 100)}% OF SCALE`, cx, cy + 40);
    ctx.restore();

    // End-of-scale labels
    ctx.save();
    ctx.fillStyle = "rgba(148,163,184,0.7)";
    ctx.font = "600 10px ui-sans-serif, system-ui";
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.fillText("0", cx + (R + 28) * Math.cos(startAngle), cy + (R + 28) * Math.sin(startAngle));
    ctx.textAlign = "left";
    ctx.fillText(String(AQI_MAX), cx + (R + 28) * Math.cos(endAngle), cy + (R + 28) * Math.sin(endAngle));
    ctx.restore();
  }, [aqi, color]);

  return (
    <div className="flex items-center justify-center relative">
      <div className="absolute inset-0 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ background: `radial-gradient(circle at center, ${color}, transparent 60%)` }} />
      <canvas ref={canvasRef} style={{ width: 320, height: 260 }} className="relative w-full max-w-[320px]" />
    </div>
  );
}

// High-tech category bar — crisp AQI bands with a glowing live marker.
function AQIScaleBar({ aqi, color }: { aqi: number; color: string }) {
  const left = Math.min(100, (aqi / AQI_MAX) * 100);
  return (
    <div className="w-full max-w-md mx-auto mt-5">
      <div className="relative h-3.5 rounded-full overflow-hidden border border-white/10" style={{ boxShadow: `0 0 22px -4px ${color}` }}>
        <div className="absolute inset-0" style={{
          background: "linear-gradient(to right, #4ade80 0%, #4ade80 10%, #fde047 10%, #fde047 20%, #fb923c 20%, #fb923c 30%, #ef4444 30%, #ef4444 40%, #a855f7 40%, #a855f7 60%, #be123c 60%, #be123c 100%)",
        }} />
      </div>
      <div className="relative h-0">
        <div className="absolute -top-[18px] w-1.5 h-5 -translate-x-1/2 rounded-full bg-white"
          style={{ left: `${left}%`, boxShadow: "0 0 10px 1px #fff" }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
        <span>0</span><span>100</span><span>200</span><span>300</span><span>500</span>
      </div>
    </div>
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
      <PageHero icon={Wind} title="Air Quality Forecast" subtitle={`${location.name} · Open-Meteo Air Quality`} />

      {error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive">
          Unable to load air quality data. Please try again later.
        </div>
      ) : (
        <>
          <div className="aurora-bg glass-strong rounded-2xl p-6 flex flex-col items-center text-center" style={{ boxShadow: `0 0 56px -8px ${aqiColor}66`, borderColor: aqiColor + "66" }}>
            <div className="relative w-full">
              <div className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-1">Current US AQI</div>
              {isLoading
                ? <div className="h-[260px] w-[320px] max-w-full mx-auto bg-muted/20 rounded-full animate-pulse" />
                : <AQIArcGauge aqi={currentAQI} color={aqiColor} />
              }
              <div className="text-2xl mb-1">{aqiEmoji}</div>
              <div className="text-2xl font-bold" style={{ color: aqiColor, textShadow: `0 0 24px ${aqiColor}88` }}>{aqiLabel}</div>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{aqiDesc}</p>
              {!isLoading && <AQIScaleBar aqi={currentAQI} color={aqiColor} />}
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
              <div key={m.label} className="relative rounded-xl p-3 text-center overflow-hidden border" style={{ borderColor: m.color + "44", background: `linear-gradient(160deg, ${m.color}1c, transparent 72%)`, boxShadow: `0 0 22px -14px ${m.color}` }}>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{m.label}</div>
                <div className="text-lg font-bold" style={{ color: m.color, textShadow: `0 0 16px ${m.color}55` }}>{m.value}</div>
                <div className="text-xs mt-1" style={{ color: m.color }}>{m.sub}</div>
              </div>
            ))}
          </div>

          <div className="glass rounded-xl p-4">
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

          <div className="glass rounded-xl p-4">
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

          <div className="glass rounded-xl p-4">
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
                  <div className="w-3 h-3 rounded-sm shrink-0 mt-0.5" style={{ backgroundColor: r.color, boxShadow: `0 0 8px -1px ${r.color}` }} />
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
            className="flex items-center gap-2 glass rounded-xl p-3 hover:border-primary/40 transition-colors">
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
