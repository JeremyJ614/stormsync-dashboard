import { useState } from "react";
import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import {
  computeSRHFromProfile, compute06kmShear, computeSWTI, cToF, mpsToKnots,
} from "../utils/weatherCalc";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { FlaskConical, Zap } from "lucide-react";

interface Props { location: Location }

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

function SemiGauge({ value, max, color, label, sublabel }: { value: number; max: number; color: string; label: string; sublabel: string }) {
  const pct = Math.min(1, value / max);
  const angle = pct * 180;
  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = 80, cy = 80, r = 60;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);

  const segments = [
    { start: -90, end: -30, color: "#4ade80" },
    { start: -30, end:  30, color: "#fde047" },
    { start:  30, end:  70, color: "#fb923c" },
    { start:  70, end:  90, color: "#ef4444" },
  ];

  function polarToXY(angleDeg: number, radius: number) {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }

  function arcPath(startDeg: number, endDeg: number, r: number) {
    const s = polarToXY(startDeg, r);
    const e = polarToXY(endDeg, r);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="90" viewBox="0 0 160 90">
        {segments.map((seg, i) => (
          <path key={i} d={arcPath(seg.start, seg.end, 60)} stroke={seg.color} strokeWidth="8" fill="none" strokeLinecap="round" opacity={0.3} />
        ))}
        <path d={arcPath(-90, angle - 90, 60)} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill="white" />
      </svg>
      <div className="text-center -mt-1">
        <div className="text-xs font-semibold tracking-widest uppercase" style={{ color }}>{label}</div>
        <div className="text-xs text-muted-foreground">{sublabel}</div>
      </div>
    </div>
  );
}

function IngredientCard({ title, value, unit, label, color, description, sparkData, sparkColor, icon }:
  { title: string; value: number | string; unit: string; label: string; color: string; description: string; sparkData?: number[]; sparkColor: string; icon: string }) {
  const sparkChart = sparkData?.map((v, i) => ({ i, v })) ?? [];
  return (
    <div className="bg-card border border-border rounded-xl p-4" style={{ borderColor: color + "30" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</span>
      </div>
      <div className="flex items-baseline gap-1 mb-1">
        <span className="text-3xl font-bold" style={{ color: sparkColor }}>{value}</span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <div className="px-2 py-0.5 rounded text-xs font-bold tracking-widest uppercase inline-block mb-2"
        style={{ background: color + "20", color, border: `1px solid ${color}40` }}>
        {label}
      </div>
      {sparkChart.length > 0 && (
        <ResponsiveContainer width="100%" height={40}>
          <AreaChart data={sparkChart}>
            <defs>
              <linearGradient id={`sg-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={sparkColor} stopOpacity={0.4} />
                <stop offset="95%" stopColor={sparkColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={sparkColor} strokeWidth={1.5} fill={`url(#sg-${title})`} dot={false} />
            <YAxis domain={["auto", "auto"]} hide />
            <XAxis dataKey="i" hide />
          </AreaChart>
        </ResponsiveContainer>
      )}
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
    </div>
  );
}

function capeLabel(cape: number): { label: string; color: string } {
  if (cape >= 4000) return { label: "EXTREME", color: "#d946ef" };
  if (cape >= 2500) return { label: "VERY STRONG", color: "#ef4444" };
  if (cape >= 1500) return { label: "STRONG", color: "#f97316" };
  if (cape >= 1000) return { label: "MODERATE", color: "#fde047" };
  if (cape >= 500)  return { label: "WEAK", color: "#86efac" };
  return { label: "MINIMAL", color: "#4ade80" };
}

function shearLabel(kts: number): { label: string; color: string } {
  if (kts >= 60) return { label: "VERY HIGH", color: "#ef4444" };
  if (kts >= 45) return { label: "HIGH", color: "#f97316" };
  if (kts >= 35) return { label: "MODERATE", color: "#fde047" };
  if (kts >= 20) return { label: "LOW-MOD", color: "#86efac" };
  return { label: "LOW", color: "#4ade80" };
}

function srhLabel(srh: number): { label: string; color: string } {
  if (srh >= 400) return { label: "EXTREME", color: "#d946ef" };
  if (srh >= 300) return { label: "HIGH", color: "#ef4444" };
  if (srh >= 150) return { label: "MODERATE", color: "#f97316" };
  if (srh >= 75)  return { label: "LOW-MOD", color: "#fde047" };
  return { label: "LOW", color: "#4ade80" };
}

function liLabel(li: number): { label: string; color: string } {
  if (li <= -8) return { label: "EXTREMELY UNSTABLE", color: "#d946ef" };
  if (li <= -6) return { label: "VERY UNSTABLE", color: "#ef4444" };
  if (li <= -4) return { label: "UNSTABLE", color: "#f97316" };
  if (li <= -2) return { label: "SLIGHTLY UNSTABLE", color: "#fde047" };
  if (li <= 0)  return { label: "NEAR NEUTRAL", color: "#86efac" };
  return { label: "STABLE", color: "#4ade80" };
}

function peakThreatLevel(swtiScore: number): { level: string; color: string; bg: string; icon: string; desc: string } {
  if (swtiScore >= 80) return { level: "VIOLENT", color: "#d946ef", bg: "hsl(290 60% 8%)", icon: "🌪️🌪️🌪️", desc: "Violent tornadoes, widespread significant severe weather" };
  if (swtiScore >= 65) return { level: "EXTREME", color: "#ef4444", bg: "hsl(0 40% 8%)", icon: "🌪️🌪️", desc: "Tornadoes likely including strong/violent, large hail, extreme wind" };
  if (swtiScore >= 50) return { level: "SIGNIFICANT", color: "#f97316", bg: "hsl(24 40% 8%)", icon: "⛈️⛈️", desc: "Significant severe weather, tornadoes and large hail possible" };
  if (swtiScore >= 35) return { level: "ELEVATED", color: "#fde047", bg: "hsl(47 30% 8%)", icon: "⛈️", desc: "Elevated severe weather risk, supercells possible" };
  if (swtiScore >= 15) return { level: "MARGINAL", color: "#86efac", bg: "hsl(142 20% 8%)", icon: "🌩️", desc: "Marginal risk, isolated severe storms possible" };
  return { level: "BENIGN", color: "#4ade80", bg: "hsl(142 20% 7%)", icon: "🌤️", desc: "No meaningful convective threat" };
}

export default function StormIngredients({ location }: Props) {
  const [hourOffset, setHourOffset] = useState(0);
  const { data: weather, isLoading } = useOpenMeteo(location);

  const hourly = weather?.hourly;
  const i = hourOffset;

  const cape = hourly?.cape?.[i] ?? 0;
  const li = hourly?.lifted_index?.[i] ?? 0;
  const dewC = hourly?.dew_point_2m?.[i] ?? 10;
  const ws10 = hourly?.wind_speed_10m?.[i] ?? 0;
  const wd10 = hourly?.wind_direction_10m?.[i] ?? 0;
  const ws925 = hourly?.wind_speed_925hPa?.[i] ?? 0;
  const wd925 = hourly?.wind_direction_925hPa?.[i] ?? 0;
  const ws850 = hourly?.wind_speed_850hPa?.[i] ?? 0;
  const wd850 = hourly?.wind_direction_850hPa?.[i] ?? 0;
  const ws700 = hourly?.wind_speed_700hPa?.[i] ?? 0;
  const wd700 = hourly?.wind_direction_700hPa?.[i] ?? 0;
  const ws500 = hourly?.wind_speed_500hPa?.[i] ?? 0;
  const wd500 = hourly?.wind_direction_500hPa?.[i] ?? 0;

  const srh = computeSRHFromProfile(ws10, wd10, ws925, wd925, ws850, wd850, ws700, wd700, ws500, wd500);
  const shear = compute06kmShear(ws10, wd10, ws500, wd500);
  const shearKts = mpsToKnots(shear);
  const swti = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: dewC });

  const peak = peakThreatLevel(swti.score);

  const capeInfo = capeLabel(cape);
  const shearInfo = shearLabel(shearKts);
  const srhInfo = srhLabel(srh);
  const liInfo = liLabel(li);

  const sparkCape  = hourly?.cape?.slice(0, 24) ?? [];
  const sparkSrh   = hourly?.time?.slice(0, 24).map((_: string, j: number) => computeSRHFromProfile(hourly.wind_speed_10m?.[j]??0, hourly.wind_direction_10m?.[j]??0, hourly.wind_speed_925hPa?.[j]??0, hourly.wind_direction_925hPa?.[j]??0, hourly.wind_speed_850hPa?.[j]??0, hourly.wind_direction_850hPa?.[j]??0, hourly.wind_speed_700hPa?.[j]??0, hourly.wind_direction_700hPa?.[j]??0, hourly.wind_speed_500hPa?.[j]??0, hourly.wind_direction_500hPa?.[j]??0)) ?? [];
  const sparkShear = hourly?.time?.slice(0, 24).map((_: string, j: number) => mpsToKnots(compute06kmShear(hourly.wind_speed_10m?.[j]??0, hourly.wind_direction_10m?.[j]??0, hourly.wind_speed_500hPa?.[j]??0, hourly.wind_direction_500hPa?.[j]??0))) ?? [];
  const sparkLi    = hourly?.lifted_index?.slice(0, 24) ?? [];

  const swtiTimeline = (hourly?.time as string[] | undefined)?.slice(0, 48).map((t: string, j: number) => {
    const c = hourly!.cape?.[j] ?? 0;
    const l = hourly!.lifted_index?.[j] ?? 0;
    const dC = hourly!.dew_point_2m?.[j] ?? 10;
    const w10 = hourly!.wind_speed_10m?.[j] ?? 0;
    const wd = hourly!.wind_direction_10m?.[j] ?? 0;
    const w5 = hourly!.wind_speed_500hPa?.[j] ?? 0;
    const wd5 = hourly!.wind_direction_500hPa?.[j] ?? 0;
    const sh = compute06kmShear(w10, wd, w5, wd5);
    const res = computeSWTI({ cape: c, srh: 100, shear06km: sh, liftedIndex: l, dewPointC: dC });
    return { time: format(parseISO(t), "EEE ha"), swti: res.score };
  }) ?? [];

  const hourLabels = hourly?.time?.slice(0, 24).map((t: string, j: number) => ({
    label: format(parseISO(t), "ha"),
    offset: j,
  })) ?? [];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold tracking-wide">Storm Ingredients</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · Atmospheric parameters for convection</p>

      <div
        className="rounded-2xl border-2 p-6 text-center"
        style={{ borderColor: peak.color + "60", background: peak.bg }}
      >
        <div className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-2">Peak Threat Level</div>
        <div className="text-3xl mb-2">{peak.icon}</div>
        <div
          className="text-5xl font-black tracking-wider uppercase mb-2"
          style={{ color: peak.color, textShadow: `0 0 30px ${peak.color}60, 0 0 60px ${peak.color}20` }}
        >
          {peak.level}
        </div>
        <div className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">{peak.desc}</div>
        <div className="mt-4 flex items-center justify-center gap-3">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: swti.color }}>
            <Zap className="w-3.5 h-3.5" />
            <span>SWTI: <strong>{swti.score}/100</strong></span>
          </div>
          <div className="text-muted-foreground">·</div>
          <div className="text-xs text-muted-foreground">
            {swti.hailRisk} hail · {swti.windRisk} wind
          </div>
        </div>
      </div>

      {hourLabels.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-2 uppercase tracking-widest font-medium">View at Hour</div>
          <div className="flex flex-wrap gap-1.5">
            {[0, 3, 6, 9, 12, 15, 18, 21].map(offset => (
              <button
                key={offset}
                onClick={() => setHourOffset(offset)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${hourOffset === offset ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}
              >
                {hourLabels[offset]?.label ?? `+${offset}h`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SemiGauge value={cape} max={5000} color={capeInfo.color} label={capeInfo.label} sublabel={`CAPE (J/kg)`} />
        <SemiGauge value={srh} max={500} color={srhInfo.color} label={srhInfo.label} sublabel={`0-3km SRH`} />
        <SemiGauge value={shearKts} max={80} color={shearInfo.color} label={shearInfo.label} sublabel={`0-6km Shear (kts)`} />
        <SemiGauge value={Math.max(0, -li)} max={12} color={liInfo.color} label={liInfo.label} sublabel={`Lifted Index`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IngredientCard
          title="CAPE" icon="⚡"
          value={isLoading ? "—" : Math.round(cape)} unit="J/kg"
          label={capeInfo.label} color={capeInfo.color} sparkColor={capeInfo.color}
          sparkData={sparkCape}
          description="Convective Available Potential Energy — the fuel for thunderstorms. Values ≥1500 support intense convection; ≥2500 supports supercells."
        />
        <IngredientCard
          title="0-3km SRH" icon="🌀"
          value={isLoading ? "—" : Math.round(srh)} unit="m²/s²"
          label={srhInfo.label} color={srhInfo.color} sparkColor={srhInfo.color}
          sparkData={sparkSrh}
          description="Storm-Relative Helicity in the 0-3km layer. Values ≥150 favor rotating updrafts; ≥300 favors significant tornadoes."
        />
        <IngredientCard
          title="0-6km Shear" icon="💨"
          value={isLoading ? "—" : Math.round(shearKts)} unit="kts"
          label={shearInfo.label} color={shearInfo.color} sparkColor={shearInfo.color}
          sparkData={sparkShear}
          description="Bulk wind shear through 6km. Values ≥35 kts support supercell development; ≥50 kts favors significant tornadoes and large hail."
        />
        <IngredientCard
          title="Lifted Index" icon="📊"
          value={isLoading ? "—" : li.toFixed(1)} unit=""
          label={liInfo.label} color={liInfo.color} sparkColor={liInfo.color}
          sparkData={sparkLi}
          description="Lifted Index: negative values indicate instability. LI ≤ -4 is unstable; LI ≤ -6 is very unstable with potential for explosive convection."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Dew Point</div>
          <div className="text-xl font-bold" style={{ color: dewC >= 18 ? "#ef4444" : dewC >= 13 ? "#f97316" : "#fde047" }}>
            {isLoading ? "—" : `${Math.round(cToF(dewC))}°F`}
          </div>
          <div className="text-xs text-muted-foreground">{dewC >= 18 ? "Very moist — storm fuel" : dewC >= 13 ? "Adequate moisture" : "Limited moisture"}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">SWTI Score</div>
          <div className="text-xl font-bold" style={{ color: swti.color }}>
            {swti.score}<span className="text-sm text-muted-foreground">/100</span>
          </div>
          <div className="text-xs text-muted-foreground">{swti.label} tornado risk</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">48-Hour SWTI Timeline</h3>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={swtiTimeline}>
            <defs>
              <linearGradient id="ingGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}/100`, "SWTI"]} />
            <Area type="monotone" dataKey="swti" stroke="#f97316" fill="url(#ingGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
