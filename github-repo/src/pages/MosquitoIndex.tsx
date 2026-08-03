import { useRef, useEffect } from "react";
import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { Bug, ExternalLink, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format, parseISO } from "date-fns";
import { cToF, msToMph } from "../utils/weatherCalc";

interface Props { location: Location }

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

function mosquitoScore(tempC: number, humidity: number, precip: number, windMph: number): number {
  let score = 0;
  const tempF = cToF(tempC);
  if (tempF >= 50 && tempF <= 95) {
    const ideal = 80;
    const proximity = 1 - Math.abs(tempF - ideal) / 45;
    score += proximity * 40;
  }
  if (humidity >= 40) score += Math.min(30, (humidity - 40) * 0.6);
  if (precip > 0) score += Math.min(20, precip * 100);
  else score += 5;
  if (windMph < 5) score += 10;
  else if (windMph < 10) score += 5;
  else if (windMph > 15) score -= 10;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function mosquitoLabel(score: number): { text: string; color: string; bgColor: string; desc: string } {
  if (score >= 80) return { text: "VERY HIGH", color: "#ef4444", bgColor: "#2d0000", desc: "Extreme mosquito activity. Use repellent and cover up." };
  if (score >= 60) return { text: "HIGH", color: "#f97316", bgColor: "#2a1000", desc: "High activity. Protection strongly recommended." };
  if (score >= 40) return { text: "MODERATE", color: "#fde047", bgColor: "#1a1400", desc: "Moderate activity. Consider repellent at dawn/dusk." };
  if (score >= 20) return { text: "LOW", color: "#86efac", bgColor: "#001a06", desc: "Low activity. Conditions mostly unfavorable." };
  return { text: "VERY LOW", color: "#4ade80", bgColor: "#001208", desc: "Minimal to no mosquito activity expected." };
}

function indexColor(score: number): string {
  if (score >= 80) return "#ef4444";
  if (score >= 60) return "#f97316";
  if (score >= 40) return "#fde047";
  if (score >= 20) return "#86efac";
  return "#4ade80";
}

const GAUGE_MAX = 100;

function MosquitoArcGauge({ score }: { score: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const color = indexColor(score);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H * 0.62;
    const R = Math.min(W, H) * 0.38;
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const totalArc = endAngle - startAngle;
    const pct = Math.min(1, score / GAUGE_MAX);
    const fillAngle = startAngle + totalArc * pct;

    ctx.clearRect(0, 0, W, H);

    const segColors = [
      { from: 0, to: 0.2, color: "#4ade80" },
      { from: 0.2, to: 0.4, color: "#86efac" },
      { from: 0.4, to: 0.6, color: "#fde047" },
      { from: 0.6, to: 0.8, color: "#f97316" },
      { from: 0.8, to: 1.0, color: "#ef4444" },
    ];

    segColors.forEach(seg => {
      const sA = startAngle + totalArc * seg.from;
      const eA = startAngle + totalArc * seg.to;
      ctx.beginPath();
      ctx.arc(cx, cy, R, sA, eA);
      ctx.strokeStyle = seg.color + "33";
      ctx.lineWidth = 18;
      ctx.lineCap = "round";
      ctx.stroke();
    });

    if (pct > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, R, startAngle, fillAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 18;
      ctx.lineCap = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const needleAngle = fillAngle;
    const nx = cx + (R + 10) * Math.cos(needleAngle);
    const ny = cy + (R + 10) * Math.sin(needleAngle);
    ctx.beginPath();
    ctx.arc(nx, ny, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fill();

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.fillStyle = color;
    ctx.font = `bold 44px monospace`;
    ctx.fillText(String(score), cx, cy - 10);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#64748b";
    ctx.font = `11px sans-serif`;
    ctx.fillText("ACTIVITY INDEX", cx, cy + 20);
    ctx.restore();
  }, [score, color]);

  return (
    <div className="flex items-center justify-center">
      <canvas ref={canvasRef} width={260} height={200} className="w-full max-w-[260px]" />
    </div>
  );
}

const SCALE_RANGES = [
  { range: "0–20", label: "Very Low", color: "#4ade80" },
  { range: "20–40", label: "Low", color: "#86efac" },
  { range: "40–60", label: "Moderate", color: "#fde047" },
  { range: "60–80", label: "High", color: "#f97316" },
  { range: "80–100", label: "Very High", color: "#ef4444" },
];

const PREVENTION = [
  { icon: "🧴", tip: "Apply EPA-registered repellent (DEET 20-30%, picaridin, IR3535)" },
  { icon: "👕", tip: "Wear long sleeves and pants, especially at dawn and dusk" },
  { icon: "💧", tip: "Eliminate standing water: empty flowerpots, bird baths, gutters" },
  { icon: "🌀", tip: "Use outdoor fans — mosquitoes are weak fliers in wind >1 mph" },
  { icon: "🕯️", tip: "Citronella candles provide limited protection in calm conditions" },
  { icon: "🏠", tip: "Ensure window/door screens are in good repair" },
];

export default function MosquitoIndex({ location }: Props) {
  const { data: weather, isLoading } = useOpenMeteo(location);

  const hourly = weather?.hourly;
  const tempC = hourly?.temperature_2m?.[0] ?? 20;
  const humidity = hourly?.relative_humidity_2m?.[0] ?? 60;
  const precip = hourly?.precipitation?.[0] ?? 0;
  const windMs = hourly?.wind_speed_10m?.[0] ?? 0;
  const windMph = msToMph(windMs);

  const score = mosquitoScore(tempC, humidity, precip, windMph);
  const { text: levelText, color: levelColor, bgColor: levelBg, desc } = mosquitoLabel(score);

  const hourlyData = (hourly?.time as string[] | undefined)?.slice(0, 48).map((t: string, i: number) => {
    const c = hourly!.temperature_2m?.[i] ?? 20;
    const h = hourly!.relative_humidity_2m?.[i] ?? 60;
    const p = hourly!.precipitation?.[i] ?? 0;
    const w = msToMph(hourly!.wind_speed_10m?.[i] ?? 0);
    return { time: format(parseISO(t), "EEE ha"), score: mosquitoScore(c, h, p, w) };
  }) ?? [];

  if (isLoading) return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-2 mb-6">
        <Bug className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold tracking-wide">Mosquito Activity Index</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl h-28 animate-pulse" />)}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Bug className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold tracking-wide uppercase">Mosquito Activity Index</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · Based on temperature, humidity, precipitation, and wind</p>

      <div className="flex items-start gap-2 bg-muted/20 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <span>The Mosquito Activity Index is calculated from current atmospheric conditions. It is not an official public health product — consult local health authorities for disease risk information.</span>
      </div>

      <div className="bg-card border rounded-xl p-4" style={{ borderColor: levelColor + "50" }}>
        <MosquitoArcGauge score={score} />
        <div className="text-center mt-2 mb-4">
          <div className="inline-block px-6 py-1.5 rounded font-bold text-lg tracking-widest uppercase"
            style={{ color: levelColor, backgroundColor: levelBg, border: `1px solid ${levelColor}40` }}>
            {levelText}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 text-center mb-4">
          {[
            { label: "CURRENT INDEX", value: score.toString(), color: levelColor },
            { label: "TEMP", value: `${Math.round(cToF(tempC))}°F`, color: "#f97316" },
            { label: "HUMIDITY", value: `${humidity}%`, color: "#06b6d4" },
            { label: "WIND", value: `${Math.round(windMph)} mph`, color: "#7B8FD9" },
          ].map(s => (
            <div key={s.label}>
              <div className="text-base font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide leading-tight mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="mb-4">
          <div className="relative h-3 rounded-full overflow-hidden bg-muted/30">
            <div className="absolute inset-0 rounded-full" style={{
              background: "linear-gradient(to right, #4ade80 0%, #86efac 20%, #fde047 40%, #f97316 60%, #ef4444 80%, #b91c1c 100%)"
            }} />
            <div className="absolute top-0 h-full bg-background/60 transition-all"
              style={{ left: `${score}%`, right: 0 }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>0 — Very Low</span>
            <span>100 — Very High</span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground text-center">{desc}</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex gap-1 border-b border-border px-4">
          <div className="px-2 py-2.5 text-sm font-medium text-primary border-b-2 border-primary">Activity Scale</div>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {SCALE_RANGES.map(s => (
            <div key={s.range} className="rounded-xl p-3 border"
              style={{ backgroundColor: s.color + "18", borderColor: s.color + "40" }}>
              <div className="text-sm font-bold" style={{ color: s.color }}>{s.range}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">48-Hour Activity Forecast</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={hourlyData}>
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}/100`, "Activity Index"]} />
            <Bar dataKey="score" radius={[2, 2, 0, 0]}>
              {hourlyData.map((entry, i) => (
                <Cell key={i} fill={indexColor(entry.score)} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        {[
          { label: "Temp", value: `${Math.round(cToF(tempC))}°F`, color: "#f97316", sub: tempC >= 10 && tempC <= 35 ? "Active range" : "Outside range" },
          { label: "Humidity", value: `${humidity}%`, color: "#06b6d4", sub: humidity >= 60 ? "High — favorable" : "Lower activity" },
          { label: "Precip (1h)", value: `${precip.toFixed(2)}"`, color: "#3b82f6", sub: precip > 0 ? "Recent rain = breeding" : "Dry" },
          { label: "Wind", value: `${Math.round(windMph)} mph`, color: "#7B8FD9", sub: windMph > 10 ? "Unfavorable" : "Calm — favorable" },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-3 text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{m.label}</div>
            <div className="text-xl font-bold" style={{ color: m.color }}>{m.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border"><h3 className="text-sm font-semibold">Prevention Tips</h3></div>
        <div className="divide-y divide-border">
          {PREVENTION.map((item, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3">
              <span className="text-lg shrink-0">{item.icon}</span>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.tip}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <a href="https://www.cdc.gov/mosquitoes/" target="_blank" rel="noopener noreferrer"
          className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors">
          <div className="text-sm font-medium flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5 text-primary" /> CDC Mosquito Info
          </div>
          <div className="text-xs text-muted-foreground mt-1">Prevention & disease info</div>
        </a>
        <a href="https://www.epa.gov/insect-repellents" target="_blank" rel="noopener noreferrer"
          className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors">
          <div className="text-sm font-medium flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5 text-primary" /> EPA Repellents
          </div>
          <div className="text-xs text-muted-foreground mt-1">Find the right repellent</div>
        </a>
      </div>
    </div>
  );
}
