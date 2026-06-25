import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import {
  computeSRHFromProfile, compute06kmShear, computeSWTI, cToF, mpsToKnots,
} from "../utils/weatherCalc";
import { AreaChart, Area, ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { format, parseISO } from "date-fns";
import { FlaskConical, Zap, Download, Share2, Layers } from "lucide-react";
import { PageHero } from "../components/PageHero";

interface Props { location: Location }

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

// ── existing ingredient labels / gauges (math unchanged) ─────────────────────────
function SemiGauge({ value, max, color, label, sublabel }: { value: number; max: number; color: string; label: string; sublabel: string }) {
  const pct = Math.min(1, value / max);
  const angle = pct * 180;
  const rad = ((angle - 90) * Math.PI) / 180;
  const cx = 80, cy = 80, r = 60;
  const nx = cx + r * Math.cos(rad), ny = cy + r * Math.sin(rad);
  const segments = [
    { start: -90, end: -30, color: "#4ade80" }, { start: -30, end: 30, color: "#fde047" },
    { start: 30, end: 70, color: "#fb923c" }, { start: 70, end: 90, color: "#ef4444" },
  ];
  function polarToXY(angleDeg: number, radius: number) { const a = (angleDeg * Math.PI) / 180; return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) }; }
  function arcPath(startDeg: number, endDeg: number, rr: number) { const s = polarToXY(startDeg, rr); const e = polarToXY(endDeg, rr); const large = endDeg - startDeg > 180 ? 1 : 0; return `M ${s.x} ${s.y} A ${rr} ${rr} 0 ${large} 1 ${e.x} ${e.y}`; }
  return (
    <div className="flex flex-col items-center">
      <svg width="160" height="90" viewBox="0 0 160 90">
        {segments.map((seg, i) => <path key={i} d={arcPath(seg.start, seg.end, 60)} stroke={seg.color} strokeWidth="8" fill="none" strokeLinecap="round" opacity={0.3} />)}
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
      <div className="flex items-center gap-2 mb-2"><span className="text-lg">{icon}</span><span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</span></div>
      <div className="flex items-baseline gap-1 mb-1"><span className="text-3xl font-bold" style={{ color: sparkColor }}>{value}</span><span className="text-sm text-muted-foreground">{unit}</span></div>
      <div className="px-2 py-0.5 rounded text-xs font-bold tracking-widest uppercase inline-block mb-2" style={{ background: color + "20", color, border: `1px solid ${color}40` }}>{label}</div>
      {sparkChart.length > 0 && (
        <ResponsiveContainer width="100%" height={40}>
          <AreaChart data={sparkChart}>
            <defs><linearGradient id={`sg-${title}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={sparkColor} stopOpacity={0.4} /><stop offset="95%" stopColor={sparkColor} stopOpacity={0} /></linearGradient></defs>
            <Area type="monotone" dataKey="v" stroke={sparkColor} strokeWidth={1.5} fill={`url(#sg-${title})`} dot={false} />
            <YAxis domain={["auto", "auto"]} hide /><XAxis dataKey="i" hide />
          </AreaChart>
        </ResponsiveContainer>
      )}
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
    </div>
  );
}

function capeLabel(cape: number) { if (cape >= 4000) return { label: "EXTREME", color: "#d946ef" }; if (cape >= 2500) return { label: "VERY STRONG", color: "#ef4444" }; if (cape >= 1500) return { label: "STRONG", color: "#f97316" }; if (cape >= 1000) return { label: "MODERATE", color: "#fde047" }; if (cape >= 500) return { label: "WEAK", color: "#86efac" }; return { label: "MINIMAL", color: "#4ade80" }; }
function shearLabel(kts: number) { if (kts >= 60) return { label: "VERY HIGH", color: "#ef4444" }; if (kts >= 45) return { label: "HIGH", color: "#f97316" }; if (kts >= 35) return { label: "MODERATE", color: "#fde047" }; if (kts >= 20) return { label: "LOW-MOD", color: "#86efac" }; return { label: "LOW", color: "#4ade80" }; }
function srhLabel(srh: number) { if (srh >= 400) return { label: "EXTREME", color: "#d946ef" }; if (srh >= 300) return { label: "HIGH", color: "#ef4444" }; if (srh >= 150) return { label: "MODERATE", color: "#f97316" }; if (srh >= 75) return { label: "LOW-MOD", color: "#fde047" }; return { label: "LOW", color: "#4ade80" }; }
function liLabel(li: number) { if (li <= -8) return { label: "EXTREMELY UNSTABLE", color: "#d946ef" }; if (li <= -6) return { label: "VERY UNSTABLE", color: "#ef4444" }; if (li <= -4) return { label: "UNSTABLE", color: "#f97316" }; if (li <= -2) return { label: "SLIGHTLY UNSTABLE", color: "#fde047" }; if (li <= 0) return { label: "NEAR NEUTRAL", color: "#86efac" }; return { label: "STABLE", color: "#4ade80" }; }

// Simplified fixed-layer Significant Tornado Parameter from available fields (additive — SWTI math untouched).
function computeSTP(cape: number, srh: number, shearKts: number, li: number): number {
  const capeT = cape / 1500;
  const srhT = srh / 150;
  let shrT = shearKts / 20; if (shearKts < 12.5) shrT = 0; else if (shearKts > 30) shrT = 1.5;
  const liT = li <= -4 ? 1 : li <= -2 ? 0.85 : li <= 0 ? 0.6 : 0.3;
  return Math.max(0, Math.round(capeT * srhT * shrT * liT * 10) / 10);
}
function stpLabel(stp: number) { if (stp >= 3) return { label: "EXTREME", color: "#d946ef" }; if (stp >= 2) return { label: "HIGH", color: "#ef4444" }; if (stp >= 1) return { label: "ELEVATED", color: "#f97316" }; if (stp >= 0.5) return { label: "MARGINAL", color: "#fde047" }; return { label: "LOW", color: "#4ade80" }; }

function peakThreatLevel(swtiScore: number) {
  if (swtiScore >= 80) return { level: "VIOLENT", color: "#d946ef", bg: "hsl(290 60% 8%)", icon: "🌪️🌪️🌪️", desc: "Violent tornadoes, widespread significant severe weather" };
  if (swtiScore >= 65) return { level: "EXTREME", color: "#ef4444", bg: "hsl(0 40% 8%)", icon: "🌪️🌪️", desc: "Tornadoes likely including strong/violent, large hail, extreme wind" };
  if (swtiScore >= 50) return { level: "SIGNIFICANT", color: "#f97316", bg: "hsl(24 40% 8%)", icon: "⛈️⛈️", desc: "Significant severe weather, tornadoes and large hail possible" };
  if (swtiScore >= 35) return { level: "ELEVATED", color: "#fde047", bg: "hsl(47 30% 8%)", icon: "⛈️", desc: "Elevated severe weather risk, supercells possible" };
  if (swtiScore >= 15) return { level: "MARGINAL", color: "#86efac", bg: "hsl(142 20% 8%)", icon: "🌩️", desc: "Marginal risk, isolated severe storms possible" };
  return { level: "BENIGN", color: "#4ade80", bg: "hsl(142 20% 7%)", icon: "🌤️", desc: "No meaningful convective threat" };
}

// Multi-model CAPE for the agreement panel.
const MODELS = [
  { key: "cape_gfs_seamless", name: "GFS" }, { key: "cape_ecmwf_ifs025", name: "ECMWF" },
  { key: "cape_icon_seamless", name: "ICON" }, { key: "cape_gem_seamless", name: "GEM" },
];
async function fetchModelCape(lat: number, lon: number): Promise<Record<string, number[]>> {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=cape&models=gfs_seamless,ecmwf_ifs025,icon_seamless,gem_seamless&forecast_days=2&timezone=auto`;
  const r = await fetch(u); if (!r.ok) throw new Error(String(r.status));
  const d = await r.json();
  return d.hourly ?? {};
}

const SHARE_W = 1200, SHARE_H = 675;

export default function StormIngredients({ location }: Props) {
  const [hourOffset, setHourOffset] = useState(0);
  const { data: weather, isLoading } = useOpenMeteo(location);
  const svgRef = useRef<SVGSVGElement>(null);

  const hourly = weather?.hourly;
  const i = hourOffset;

  const cape = hourly?.cape?.[i] ?? 0;
  const li = hourly?.lifted_index?.[i] ?? 0;
  const dewC = hourly?.dew_point_2m?.[i] ?? 10;
  const ws10 = hourly?.wind_speed_10m?.[i] ?? 0, wd10 = hourly?.wind_direction_10m?.[i] ?? 0;
  const ws925 = hourly?.wind_speed_925hPa?.[i] ?? 0, wd925 = hourly?.wind_direction_925hPa?.[i] ?? 0;
  const ws850 = hourly?.wind_speed_850hPa?.[i] ?? 0, wd850 = hourly?.wind_direction_850hPa?.[i] ?? 0;
  const ws700 = hourly?.wind_speed_700hPa?.[i] ?? 0, wd700 = hourly?.wind_direction_700hPa?.[i] ?? 0;
  const ws500 = hourly?.wind_speed_500hPa?.[i] ?? 0, wd500 = hourly?.wind_direction_500hPa?.[i] ?? 0;

  const srh = computeSRHFromProfile(ws10, wd10, ws925, wd925, ws850, wd850, ws700, wd700, ws500, wd500);
  const shear = compute06kmShear(ws10, wd10, ws500, wd500);
  const shearKts = mpsToKnots(shear);
  const swti = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: dewC });
  const peak = peakThreatLevel(swti.score);
  const stp = computeSTP(cape, srh, shearKts, li);

  const capeInfo = capeLabel(cape), shearInfo = shearLabel(shearKts), srhInfo = srhLabel(srh), liInfo = liLabel(li), stpInfo = stpLabel(stp);

  const sparkCape = hourly?.cape?.slice(0, 24) ?? [];
  const srhAt = (j: number) => computeSRHFromProfile(hourly!.wind_speed_10m?.[j] ?? 0, hourly!.wind_direction_10m?.[j] ?? 0, hourly!.wind_speed_925hPa?.[j] ?? 0, hourly!.wind_direction_925hPa?.[j] ?? 0, hourly!.wind_speed_850hPa?.[j] ?? 0, hourly!.wind_direction_850hPa?.[j] ?? 0, hourly!.wind_speed_700hPa?.[j] ?? 0, hourly!.wind_direction_700hPa?.[j] ?? 0, hourly!.wind_speed_500hPa?.[j] ?? 0, hourly!.wind_direction_500hPa?.[j] ?? 0);
  const shearKtsAt = (j: number) => mpsToKnots(compute06kmShear(hourly!.wind_speed_10m?.[j] ?? 0, hourly!.wind_direction_10m?.[j] ?? 0, hourly!.wind_speed_500hPa?.[j] ?? 0, hourly!.wind_direction_500hPa?.[j] ?? 0));
  const sparkSrh = hourly?.time?.slice(0, 24).map((_: string, j: number) => srhAt(j)) ?? [];
  const sparkShear = hourly?.time?.slice(0, 24).map((_: string, j: number) => shearKtsAt(j)) ?? [];
  const sparkLi = hourly?.lifted_index?.slice(0, 24) ?? [];

  // Real hourly SWTI (uses per-hour SRH/shear/CAPE/LI) — drives both the timeline and the share strip.
  const hourlyThreat = useMemo(() => (hourly?.time as string[] | undefined)?.slice(0, 48).map((t, j) => {
    const c = hourly!.cape?.[j] ?? 0, l = hourly!.lifted_index?.[j] ?? 0, dC = hourly!.dew_point_2m?.[j] ?? 10;
    const sh = compute06kmShear(hourly!.wind_speed_10m?.[j] ?? 0, hourly!.wind_direction_10m?.[j] ?? 0, hourly!.wind_speed_500hPa?.[j] ?? 0, hourly!.wind_direction_500hPa?.[j] ?? 0);
    const res = computeSWTI({ cape: c, srh: srhAt(j), shear06km: sh, liftedIndex: l, dewPointC: dC });
    return { time: format(parseISO(t), "EEE ha"), short: format(parseISO(t), "ha"), swti: res.score };
  }) ?? [], [hourly]);

  const dualData = useMemo(() => (hourly?.time as string[] | undefined)?.slice(0, 48).map((t, j) => ({
    time: format(parseISO(t), "EEE ha"), cape: Math.round(hourly!.cape?.[j] ?? 0), shear: Math.round(shearKtsAt(j)),
  })) ?? [], [hourly]);

  const peakPrecip = Math.max(0, ...(hourly?.precipitation_probability?.slice(0, 24) ?? [0]));
  const hourLabels = hourly?.time?.slice(0, 24).map((t: string, j: number) => ({ label: format(parseISO(t), "ha"), offset: j })) ?? [];

  // Model agreement
  const { data: modelCape } = useQuery({ queryKey: ["ingredients-models", location.lat.toFixed(3), location.lon.toFixed(3)], queryFn: () => fetchModelCape(location.lat, location.lon), staleTime: 30 * 60 * 1000 });
  const modelRows = MODELS.map(m => ({ name: m.name, cape: Math.round((modelCape?.[m.key]?.[i] ?? NaN)) })).filter(r => !Number.isNaN(r.cape));
  const modelAgreement = (() => {
    if (modelRows.length < 2) return null;
    const vals = modelRows.map(r => r.cape), mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const spread = (Math.max(...vals) - Math.min(...vals)) / Math.max(mean, 1);
    return { mean: Math.round(mean), level: spread < 0.35 ? "High" : spread < 0.7 ? "Moderate" : "Low", color: spread < 0.35 ? "#4ade80" : spread < 0.7 ? "#fde047" : "#ef4444" };
  })();
  const modelMax = Math.max(500, ...modelRows.map(r => r.cape));

  // ── shareable graphic export ──────────────────────────────────────────────────
  async function rasterize(): Promise<Blob | null> {
    const svg = svgRef.current; if (!svg) return null;
    const xml = new XMLSerializer().serializeToString(svg);
    const url = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
    const img = new Image();
    try { await new Promise((res, rej) => { img.onload = () => res(null); img.onerror = rej; img.src = url; }); } catch { return null; }
    const scale = 2, canvas = document.createElement("canvas");
    canvas.width = SHARE_W * scale; canvas.height = SHARE_H * scale;
    const ctx = canvas.getContext("2d"); if (!ctx) return null;
    ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, SHARE_W, SHARE_H);
    return await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  }
  const fname = `storm-ingredients-${location.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
  async function downloadImage() { const b = await rasterize(); if (!b) return; const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = fname; a.click(); URL.revokeObjectURL(u); }
  async function shareImage() {
    const b = await rasterize(); if (!b) return;
    const file = new File([b], fname, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) { try { await nav.share({ files: [file], title: "Storm Ingredients", text: `${location.name} — ${peak.level} threat (SWTI ${swti.score})` }); return; } catch { /* cancelled */ } }
    const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = fname; a.click(); URL.revokeObjectURL(u);
  }
  async function shareLink() {
    const link = window.location.href;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) { try { await nav.share({ title: "Storm Ingredients", text: `${location.name} storm ingredients`, url: link }); return; } catch { /* cancelled */ } }
    try { await navigator.clipboard.writeText(link); } catch { /* noop */ }
  }

  const tiles = [
    { name: "CAPE", value: Math.round(cape).toLocaleString(), unit: "J/kg", color: capeInfo.color, label: capeInfo.label },
    { name: "0–6KM SHEAR", value: Math.round(shearKts), unit: "kt", color: shearInfo.color, label: shearInfo.label },
    { name: "0–3KM SRH", value: Math.round(srh), unit: "m²/s²", color: srhInfo.color, label: srhInfo.label },
    { name: "STP", value: stp.toFixed(1), unit: "", color: stpInfo.color, label: stpInfo.label },
  ];
  const nowLabel = hourly?.time?.[i] ? format(parseISO(hourly.time[i]), "EEE MMM d · ha") : "";
  const strip = hourlyThreat.slice(0, 18);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <PageHero icon={FlaskConical} title="Storm Ingredients" subtitle={`${location.name} · Atmospheric parameters for convection`} />

      {/* ── Shareable graphic ─────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <svg ref={svgRef} viewBox={`0 0 ${SHARE_W} ${SHARE_H}`} xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto", display: "block" }}>
          <defs>
            <linearGradient id="ingbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0b0f1d" /><stop offset="100%" stopColor="#141024" /></linearGradient>
          </defs>
          <rect x={0} y={0} width={SHARE_W} height={SHARE_H} fill="url(#ingbg)" />
          <rect x={0} y={0} width={SHARE_W} height={6} fill={peak.color} />
          <text x={40} y={62} fill="#ffffff" fontSize={40} fontWeight={800} fontFamily="system-ui, sans-serif" letterSpacing={1}>STORM INGREDIENTS</text>
          <text x={42} y={94} fill="#8FAEC0" fontSize={20} fontFamily="system-ui, sans-serif">{location.name}{nowLabel ? ` · ${nowLabel}` : ""}</text>

          {/* Threat block */}
          <rect x={40} y={130} width={360} height={310} rx={16} fill="#000000" fillOpacity={0.3} stroke={peak.color} strokeOpacity={0.5} />
          <text x={220} y={172} textAnchor="middle" fill="#ffffff" fillOpacity={0.6} fontSize={16} letterSpacing={3} fontFamily="system-ui, sans-serif">PEAK THREAT</text>
          <text x={220} y={320} textAnchor="middle" fill={peak.color} fontSize={150} fontWeight={800} fontFamily="system-ui, sans-serif">{swti.score}</text>
          <text x={220} y={360} textAnchor="middle" fill="#ffffff" fillOpacity={0.5} fontSize={18} fontFamily="system-ui, sans-serif">SWTI / 100</text>
          <text x={220} y={410} textAnchor="middle" fill={peak.color} fontSize={34} fontWeight={800} fontFamily="system-ui, sans-serif">{peak.level}</text>

          {/* 4 tiles */}
          {tiles.map((t, k) => {
            const tx = 440 + (k % 2) * 370, ty = 130 + Math.floor(k / 2) * 158;
            return (
              <g key={t.name}>
                <rect x={tx} y={ty} width={350} height={142} rx={14} fill="#000000" fillOpacity={0.3} stroke={t.color} strokeOpacity={0.4} />
                <text x={tx + 22} y={ty + 38} fill="#8FAEC0" fontSize={17} letterSpacing={2} fontFamily="system-ui, sans-serif">{t.name}</text>
                <text x={tx + 22} y={ty + 100} fill="#ffffff" fontSize={56} fontWeight={800} fontFamily="system-ui, sans-serif">{t.value}<tspan fontSize={22} fill="#8FAEC0" fontWeight={400}> {t.unit}</tspan></text>
                <text x={tx + 328} y={ty + 38} textAnchor="end" fill={t.color} fontSize={16} fontWeight={700} fontFamily="system-ui, sans-serif">{t.label}</text>
              </g>
            );
          })}

          {/* Hour-by-hour threat strip */}
          <text x={40} y={480} fill="#8FAEC0" fontSize={16} letterSpacing={2} fontFamily="system-ui, sans-serif">NEXT 18 HOURS · THREAT TIMELINE</text>
          {strip.map((h, k) => {
            const bw = (SHARE_W - 80) / strip.length, bx = 40 + k * bw;
            const bh = Math.max(3, (h.swti / 100) * 120), by = 620 - bh;
            const c = peakThreatLevel(h.swti).color;
            return (
              <g key={k}>
                <rect x={bx + 2} y={by} width={bw - 4} height={bh} rx={3} fill={c} />
                {k % 3 === 0 && <text x={bx + bw / 2} y={638} textAnchor="middle" fill="#5b6680" fontSize={12} fontFamily="system-ui, sans-serif">{h.short}</text>}
              </g>
            );
          })}

          <text x={SHARE_W - 40} y={500} textAnchor="end" fill="#8FAEC0" fontSize={16} fontFamily="system-ui, sans-serif">Peak rain chance <tspan fill="#22d3ee" fontWeight={800} fontSize={22}>{peakPrecip}%</tspan></text>
          <text x={SHARE_W - 40} y={660} textAnchor="end" fill="#5b6680" fontSize={15} fontFamily="system-ui, sans-serif">StormSync WX · Open-Meteo</text>
        </svg>
        <div className="flex gap-2 p-3 border-t border-border">
          <button onClick={downloadImage} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary/15 border border-primary/30 text-primary text-sm font-semibold"><Download className="w-4 h-4" /> Download Image</button>
          <button onClick={shareImage} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm font-medium hover:border-primary/40 transition-colors"><Share2 className="w-4 h-4" /> Share Image</button>
          <button onClick={shareLink} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm font-medium hover:border-primary/40 transition-colors"><Layers className="w-4 h-4" /> Link</button>
        </div>
      </div>

      {/* hour selector */}
      {hourLabels.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="text-xs text-muted-foreground mb-2 uppercase tracking-widest font-medium">View at Hour</div>
          <div className="flex flex-wrap gap-1.5">
            {[0, 3, 6, 9, 12, 15, 18, 21].map(offset => (
              <button key={offset} onClick={() => setHourOffset(offset)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${hourOffset === offset ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>{hourLabels[offset]?.label ?? `+${offset}h`}</button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SemiGauge value={cape} max={5000} color={capeInfo.color} label={capeInfo.label} sublabel="CAPE (J/kg)" />
        <SemiGauge value={srh} max={500} color={srhInfo.color} label={srhInfo.label} sublabel="0-3km SRH" />
        <SemiGauge value={shearKts} max={80} color={shearInfo.color} label={shearInfo.label} sublabel="0-6km Shear (kts)" />
        <SemiGauge value={stp} max={6} color={stpInfo.color} label={stpInfo.label} sublabel="Sig. Tornado Param" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <IngredientCard title="CAPE" icon="⚡" value={isLoading ? "—" : Math.round(cape)} unit="J/kg" label={capeInfo.label} color={capeInfo.color} sparkColor={capeInfo.color} sparkData={sparkCape} description="Convective Available Potential Energy — the fuel for thunderstorms. ≥1500 supports intense convection; ≥2500 supports supercells." />
        <IngredientCard title="0-3km SRH" icon="🌀" value={isLoading ? "—" : Math.round(srh)} unit="m²/s²" label={srhInfo.label} color={srhInfo.color} sparkColor={srhInfo.color} sparkData={sparkSrh} description="Storm-Relative Helicity (0-3km). ≥150 favors rotating updrafts; ≥300 favors significant tornadoes." />
        <IngredientCard title="0-6km Shear" icon="💨" value={isLoading ? "—" : Math.round(shearKts)} unit="kts" label={shearInfo.label} color={shearInfo.color} sparkColor={shearInfo.color} sparkData={sparkShear} description="Bulk wind shear through 6km. ≥35 kts supports supercells; ≥50 kts favors significant tornadoes and large hail." />
        <IngredientCard title="Lifted Index" icon="📊" value={isLoading ? "—" : li.toFixed(1)} unit="" label={liInfo.label} color={liInfo.color} sparkColor={liInfo.color} sparkData={sparkLi} description="Lifted Index: negative = unstable. LI ≤ -4 is unstable; ≤ -6 is very unstable with explosive potential." />
      </div>

      {/* Dual parameter chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">CAPE &amp; Shear — 48-Hour Trend</h3>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={dualData}>
            <defs><linearGradient id="capeGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#fb923c" stopOpacity={0.45} /><stop offset="95%" stopColor="#fb923c" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="hsl(232 18% 16%)" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
            <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#fb923c" }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#22d3ee" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area yAxisId="l" type="monotone" name="CAPE (J/kg)" dataKey="cape" stroke="#fb923c" fill="url(#capeGrad)" strokeWidth={2} dot={false} />
            <Line yAxisId="r" type="monotone" name="0-6km Shear (kt)" dataKey="shear" stroke="#22d3ee" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Model agreement */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Model Agreement — CAPE</h3>
          {modelAgreement && <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: modelAgreement.color + "22", color: modelAgreement.color }}>{modelAgreement.level} agreement</span>}
        </div>
        {modelRows.length === 0 ? <div className="text-xs text-muted-foreground">Loading model guidance…</div> : (
          <div className="space-y-2">
            {modelRows.map(r => (
              <div key={r.name} className="flex items-center gap-3">
                <div className="w-14 text-xs font-semibold text-muted-foreground">{r.name}</div>
                <div className="flex-1 h-5 bg-muted/20 rounded overflow-hidden"><div className="h-full rounded" style={{ width: `${Math.min(100, (r.cape / modelMax) * 100)}%`, background: capeLabel(r.cape).color }} /></div>
                <div className="w-20 text-right text-xs font-bold" style={{ color: capeLabel(r.cape).color }}>{r.cape.toLocaleString()}</div>
              </div>
            ))}
            {modelAgreement && <p className="text-[11px] text-muted-foreground pt-1">Four-model mean CAPE ≈ <strong>{modelAgreement.mean.toLocaleString()} J/kg</strong>. {modelAgreement.level === "High" ? "Models are tightly clustered — high confidence in the instability forecast." : modelAgreement.level === "Moderate" ? "Some model spread — moderate confidence." : "Large model spread — low confidence; watch for forecast changes."}</p>}
          </div>
        )}
      </div>

      {/* 48h threat timeline */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-3">48-Hour Threat Timeline (SWTI)</h3>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={hourlyThreat}>
            <defs><linearGradient id="ingGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.4} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs>
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
