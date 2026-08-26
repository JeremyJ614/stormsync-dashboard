import { useOpenMeteo, useNWSAlerts, useNWSPoints } from "../hooks/useWeatherQuery";
import DataUnavailable from "../components/DataUnavailable";
import type { Location } from "../hooks/useLocation";
import {
  computeSRHFromProfile, compute06kmShear, computeSWTI, cToF, msToMph,
} from "../utils/weatherCalc";
import { Activity, Info, AlertTriangle } from "lucide-react";
import { PageHero } from "../components/PageHero";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";

interface Props { location: Location }

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

function riskBadge(risk: string): string {
  if (risk === "high") return "bg-red-500/15 text-red-400 border-red-500/30";
  if (risk === "moderate") return "bg-orange-500/15 text-orange-400 border-orange-500/30";
  if (risk === "low") return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  return "bg-green-500/15 text-green-400 border-green-500/30";
}

function ScoreGauge({ score, color }: { score: number; color: string }) {
  const cx = 110, cy = 110, r = 88;
  const START = 135, SWEEP = 270; // open-bottom dial
  const polar = (deg: number, radius: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  const arc = (startDeg: number, endDeg: number, radius: number) => {
    const s = polar(startDeg, radius), e = polar(endDeg, radius);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  };
  const frac = Math.max(0, Math.min(1, score / 100));
  const endDeg = START + SWEEP * frac;
  const tip = polar(endDeg, r);

  const segs = [
    { f0: 0.0, f1: 0.2, c: "#4ade80" },
    { f0: 0.2, f1: 0.4, c: "#fde047" },
    { f0: 0.4, f1: 0.6, c: "#f97316" },
    { f0: 0.6, f1: 0.8, c: "#ef4444" },
    { f0: 0.8, f1: 1.0, c: "#d946ef" },
  ];
  const ticks = Array.from({ length: 28 }, (_, i) => START + (SWEEP / 27) * i);

  return (
    <svg width="220" height="212" viewBox="0 0 220 212">
      <defs>
        <filter id="swtiGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.4" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="swtiCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.30" />
          <stop offset="68%" stopColor={color} stopOpacity="0.05" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d={arc(START, START + SWEEP, r)} stroke="hsl(var(--border))" strokeWidth="13" fill="none" strokeLinecap="round" opacity={0.5} />
      {segs.map((s, i) => (
        <path key={i} d={arc(START + SWEEP * s.f0, START + SWEEP * s.f1, r)} stroke={s.c} strokeWidth="13" fill="none" opacity={0.22} />
      ))}
      {ticks.map((t, i) => {
        const a = polar(t, r - 14), b = polar(t, r - 20);
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#6b7280" strokeWidth={i % 9 === 0 ? 2 : 1} opacity={0.55} />;
      })}
      <circle cx={cx} cy={cy} r="62" fill="url(#swtiCore)" />
      <path d={arc(START, endDeg, r)} stroke={color} strokeWidth="13" fill="none" strokeLinecap="round" filter="url(#swtiGlow)" style={{ transition: "all .7s ease" }} />
      <circle cx={tip.x} cy={tip.y} r="6" fill="#fff" filter="url(#swtiGlow)" style={{ transition: "all .7s ease" }} />
      <circle cx={tip.x} cy={tip.y} r="3" fill={color} style={{ transition: "all .7s ease" }} />
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="50" fontWeight="bold" fill={color} filter="url(#swtiGlow)">{score}</text>
      <text x={cx} y={cy + 38} textAnchor="middle" fontSize="12" fill="#9ca3af" letterSpacing="2">/ 100</text>
      <text x={polar(START, r + 13).x} y={polar(START, r + 13).y + 4} textAnchor="middle" fontSize="9" fill="#6b7280">0</text>
      <text x={polar(START + SWEEP, r + 13).x} y={polar(START + SWEEP, r + 13).y + 4} textAnchor="middle" fontSize="9" fill="#6b7280">100</text>
    </svg>
  );
}

export default function SWTIPage({ location }: Props) {
  const { data: weather, isLoading, refetch } = useOpenMeteo(location);
  const { data: alerts = [] } = useNWSAlerts(location);
  const { data: nwsPoints } = useNWSPoints(location);

  const hourly = weather?.hourly;
  const ws10 = hourly?.wind_speed_10m?.[0] ?? 0;
  const wd10 = hourly?.wind_direction_10m?.[0] ?? 0;
  const ws925 = hourly?.wind_speed_925hPa?.[0] ?? 0;
  const wd925 = hourly?.wind_direction_925hPa?.[0] ?? 0;
  const ws850 = hourly?.wind_speed_850hPa?.[0] ?? 0;
  const wd850 = hourly?.wind_direction_850hPa?.[0] ?? 0;
  const ws700 = hourly?.wind_speed_700hPa?.[0] ?? 0;
  const wd700 = hourly?.wind_direction_700hPa?.[0] ?? 0;
  const ws500 = hourly?.wind_speed_500hPa?.[0] ?? 0;
  const wd500 = hourly?.wind_direction_500hPa?.[0] ?? 0;

  const srh = !isLoading && hourly
    ? computeSRHFromProfile(ws10, wd10, ws925, wd925, ws850, wd850, ws700, wd700, ws500, wd500)
    : 0;
  const shear = !isLoading && hourly ? compute06kmShear(ws10, wd10, ws500, wd500) : 0;

  const cape = hourly?.cape?.[0] ?? 0;
  const li = hourly?.lifted_index?.[0] ?? 0;
  const dewC = hourly?.dew_point_2m?.[0] ?? 10;

  const swti = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: dewC });

  const timeline = (hourly?.time as string[] | undefined)?.slice(0, 48).map((t: string, i: number) => {
    const c = hourly!.cape?.[i] ?? 0;
    const l = hourly!.lifted_index?.[i] ?? 0;
    const dC = hourly!.dew_point_2m?.[i] ?? 10;
    const w10 = hourly!.wind_speed_10m?.[i] ?? 0;
    const wd = hourly!.wind_direction_10m?.[i] ?? 0;
    const w5 = hourly!.wind_speed_500hPa?.[i] ?? 0;
    const wd5 = hourly!.wind_direction_500hPa?.[i] ?? 0;
    const sh = compute06kmShear(w10, wd, w5, wd5);
    const result = computeSWTI({ cape: c, srh: 100, shear06km: sh, liftedIndex: l, dewPointC: dC });
    return { time: format(parseISO(t), "EEE ha"), swti: result.score };
  }) ?? [];

  const severeAlerts = alerts.filter((a: { properties: { event: string } }) =>
    (a.properties.event ?? "").toLowerCase().includes("tornado") ||
    (a.properties.event ?? "").toLowerCase().includes("severe")
  );

  // Every parameter above defaults to 0 when the profile is missing, and 0 CAPE
  // with 0 shear scores as BENIGN. That is a reading we have not taken.
  if (!isLoading && !hourly) {
    return <DataUnavailable title="Storm Weather Threat Index" source="Open-Meteo" onRetry={() => refetch()} />;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      <PageHero icon={Activity} title="Storm Weather Threat Index" subtitle={`${location.name} · Composite threat assessment`} />

      <div className="flex items-start gap-2 bg-muted/20 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <span>SWTI combines CAPE, 0-3km SRH, 0-6km bulk shear, Lifted Index, and dew point to produce a composite 0–100 storm threat score.</span>
      </div>

      {severeAlerts.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-red-300">{severeAlerts.length} Severe Alert{severeAlerts.length > 1 ? "s" : ""}</div>
            <div className="text-xs text-muted-foreground">{severeAlerts.map((a: { properties: { event: string } }) => a.properties.event).join(" · ")}</div>
          </div>
        </div>
      )}

      <div className="aurora-bg glass-strong rounded-2xl p-6 flex flex-col items-center text-center" style={{ boxShadow: `0 0 52px -8px ${swti.color}66`, borderColor: swti.color + "66" }}>
        <div className="relative flex flex-col items-center">
          <div className="text-xs tracking-[0.3em] uppercase text-muted-foreground mb-3">Current SWTI Score</div>
          {isLoading
            ? <div className="h-52 w-52 bg-muted/20 rounded-full animate-pulse mb-3" />
            : <ScoreGauge score={swti.score} color={swti.color} />
          }
          <div className="text-2xl font-bold mt-2" style={{ color: swti.color, textShadow: `0 0 24px ${swti.color}66` }}>
            {swti.label}
          </div>
          <div className="text-sm text-muted-foreground mt-1">Tornado Threat Level</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tornado Risk", value: swti.label, color: swti.color, riskClass: swti.score >= 60 ? "high" : swti.score >= 30 ? "moderate" : swti.score >= 10 ? "low" : "minimal" },
          { label: "Hail Risk", value: swti.hailRisk, color: (swti.hailRisk === "giant" || swti.hailRisk === "large") ? "#ef4444" : swti.hailRisk === "small" ? "#f97316" : "#4ade80", riskClass: (swti.hailRisk === "giant" || swti.hailRisk === "large") ? "high" : swti.hailRisk === "small" ? "moderate" : "minimal" },
          { label: "Wind Risk", value: swti.windRisk, color: swti.windRisk === "significant" ? "#ef4444" : swti.windRisk === "marginal" ? "#f97316" : "#4ade80", riskClass: swti.windRisk === "significant" ? "high" : swti.windRisk === "marginal" ? "moderate" : "minimal" },
        ].map(m => (
          <div key={m.label} className="glass rounded-xl p-3 text-center transition-shadow"
            style={{ borderColor: m.color + "44", boxShadow: `0 0 22px -12px ${m.color}` }}>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">{m.label}</div>
            <span className={`inline-block px-2 py-1 rounded-lg text-xs font-bold capitalize border ${riskBadge(m.riskClass)}`}>
              {m.value}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "CAPE", value: `${Math.round(cape)} J/kg`, color: cape >= 2000 ? "#ef4444" : cape >= 1000 ? "#f97316" : cape >= 500 ? "#fde047" : "#4ade80", threshold: `${cape >= 2000 ? "Extreme" : cape >= 1000 ? "Large" : cape >= 500 ? "Moderate" : "Weak"}`, pct: Math.min(100, (cape / 3000) * 100) },
          { label: "0-3km SRH", value: `${Math.round(srh)} m²/s²`, color: srh >= 300 ? "#ef4444" : srh >= 150 ? "#f97316" : srh >= 75 ? "#fde047" : "#4ade80", threshold: srh >= 300 ? "Very favorable" : srh >= 150 ? "Favorable" : "Limited", pct: Math.min(100, (srh / 400) * 100) },
          { label: "0-6km Shear", value: `${Math.round(shear)} kts`, color: shear >= 50 ? "#ef4444" : shear >= 40 ? "#f97316" : shear >= 30 ? "#fde047" : "#4ade80", threshold: shear >= 50 ? "Extreme" : shear >= 40 ? "Strong" : "Moderate", pct: Math.min(100, (shear / 60) * 100) },
          { label: "Lifted Index", value: li.toFixed(1), color: li <= -6 ? "#ef4444" : li <= -4 ? "#f97316" : li <= 0 ? "#fde047" : "#4ade80", threshold: li <= -6 ? "Extreme instability" : li <= -4 ? "Unstable" : li <= 0 ? "Slightly unstable" : "Stable", pct: Math.min(100, Math.max(0, (-li / 8) * 100)) },
        ].map(m => (
          <div key={m.label} className="glass rounded-xl p-3" style={{ borderColor: m.color + "33" }}>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{m.label}</div>
            <div className="text-xl font-bold" style={{ color: m.color }}>{isLoading ? "—" : m.value}</div>
            <div className="mt-2 h-1.5 rounded-full bg-muted/40 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${isLoading ? 0 : m.pct}%`, backgroundColor: m.color, boxShadow: `0 0 10px -1px ${m.color}` }} />
            </div>
            <div className="text-xs mt-1.5" style={{ color: m.color }}>{m.threshold}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { label: "Dew Point", value: `${Math.round(cToF(dewC))}°F`, color: dewC >= 18 ? "#ef4444" : dewC >= 13 ? "#f97316" : dewC >= 10 ? "#fde047" : "#4ade80", sub: dewC >= 18 ? "Very moist — fuel for storms" : dewC >= 10 ? "Adequate moisture" : "Limited moisture" },
          { label: "Surface Wind", value: `${Math.round(msToMph(ws10))} mph`, color: "#7B8FD9", sub: `From ~${wd10}°` },
        ].map(m => (
          <div key={m.label} className="glass rounded-xl p-3" style={{ borderColor: m.color + "33" }}>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{m.label}</div>
            <div className="text-xl font-bold" style={{ color: m.color }}>{isLoading ? "—" : m.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      {nwsPoints && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-2">NWS Forecast Office</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Office", value: nwsPoints.properties.cwa },
              { label: "Grid", value: `${nwsPoints.properties.gridX}, ${nwsPoints.properties.gridY}` },
              { label: "City", value: `${nwsPoints.properties.relativeLocation?.properties?.city}, ${nwsPoints.properties.relativeLocation?.properties?.state}` },
              { label: "Timezone", value: nwsPoints.properties.timeZone },
            ].map(s => (
              <div key={s.label}>
                <span className="text-muted-foreground text-xs">{s.label}: </span>
                <span className="font-medium text-sm">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">48-Hour SWTI Timeline</h3>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={timeline}>
            <defs>
              <linearGradient id="swtiGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={swti.color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={swti.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}/100`, "SWTI"]} />
            <Area type="monotone" dataKey="swti" stroke={swti.color} fill="url(#swtiGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">Threshold Reference</h3>
        <div className="space-y-2">
          {[
            { range: "0–10", label: "Minimal", color: "#4ade80", desc: "No convective threat" },
            { range: "10–30", label: "Low", color: "#fde047", desc: "Isolated storms possible, not severe" },
            { range: "30–60", label: "Moderate", color: "#f97316", desc: "Severe storm potential" },
            { range: "60–80", label: "High", color: "#ef4444", desc: "Significant severe weather event likely" },
            { range: "80–100", label: "Extreme", color: "#d946ef", desc: "Major tornado outbreak possible" },
          ].map(r => (
            <div key={r.range} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: r.color }} />
              <span className="text-xs font-bold w-12 shrink-0" style={{ color: r.color }}>{r.range}</span>
              <span className="text-xs font-medium w-20 shrink-0">{r.label}</span>
              <span className="text-xs text-muted-foreground">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
