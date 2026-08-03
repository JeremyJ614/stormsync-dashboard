import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import {
  computeSRHFromProfile, compute06kmShear, computeSWTI, mpsToKnots,
} from "../utils/weatherCalc";
import {
  AreaChart, Area, ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell,
} from "recharts";
import { format, parseISO } from "date-fns";
import { FlaskConical, Download, Share2, Layers, TrendingUp, Wind, Activity, Zap } from "lucide-react";
import { PageHero } from "../components/PageHero";

interface Props { location: Location }

const TOOLTIP_STYLE = {
  background: "rgba(10,14,30,0.96)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  fontSize: 12,
};

// ── Pastel Color Palette ─────────────────────────────────────────────────────
// Inspired by Ryan Hall's layout but with a brighter, pastel-forward palette
const PASTEL = {
  mint:     "#98f5c4",  // low/benign
  lime:     "#b8f09e",  // marginal
  yellow:   "#ffe88a",  // elevated
  peach:    "#ffbf96",  // significant
  coral:    "#ff9fa0",  // extreme
  lavender: "#c8b4f8",  // violent
  sky:      "#93d8f8",  // shear/wind
  rose:     "#f8a4c4",  // rotation/srh
  gold:     "#ffd88a",  // CAPE
};

// ── Threat level helpers (using pastel colors) ────────────────────────────────
function peakThreatLevel(swtiScore: number) {
  if (swtiScore >= 80) return { level: "VIOLENT",     color: PASTEL.lavender, bg: "rgba(200,180,248,0.08)", icon: "🌪️🌪️🌪️", desc: "Violent tornadoes, widespread significant severe weather" };
  if (swtiScore >= 65) return { level: "EXTREME",     color: PASTEL.coral,    bg: "rgba(255,159,160,0.08)", icon: "🌪️🌪️",    desc: "Tornadoes likely including strong/violent, large hail, extreme winds" };
  if (swtiScore >= 50) return { level: "SIGNIFICANT", color: PASTEL.peach,    bg: "rgba(255,191,150,0.08)", icon: "⛈️⛈️",    desc: "Significant severe weather, tornadoes and large hail possible" };
  if (swtiScore >= 35) return { level: "ELEVATED",    color: PASTEL.yellow,   bg: "rgba(255,232,138,0.08)", icon: "⛈️",       desc: "Elevated severe weather risk, supercells possible" };
  if (swtiScore >= 15) return { level: "MARGINAL",    color: PASTEL.lime,     bg: "rgba(184,240,158,0.08)", icon: "🌩️",       desc: "Marginal risk, isolated severe storms possible" };
  return                { level: "BENIGN",      color: PASTEL.mint,     bg: "rgba(152,245,196,0.08)", icon: "🌤️",       desc: "No meaningful convective threat" };
}

function capeLabel(c: number)  {
  if (c >= 4000) return { label: "EXTREME",    color: PASTEL.lavender };
  if (c >= 2500) return { label: "VERY HIGH",  color: PASTEL.coral    };
  if (c >= 1500) return { label: "HIGH",       color: PASTEL.peach    };
  if (c >= 1000) return { label: "MODERATE",   color: PASTEL.yellow   };
  if (c >= 500)  return { label: "LOW-MOD",    color: PASTEL.lime     };
  return               { label: "MINIMAL",    color: PASTEL.mint     };
}
function shearLabel(k: number) {
  if (k >= 60) return { label: "VERY HIGH",  color: PASTEL.coral  };
  if (k >= 45) return { label: "HIGH",       color: PASTEL.peach  };
  if (k >= 35) return { label: "MODERATE",   color: PASTEL.yellow };
  if (k >= 20) return { label: "LOW-MOD",    color: PASTEL.lime   };
  return             { label: "LOW",         color: PASTEL.mint   };
}
function srhLabel(s: number)   {
  if (s >= 400) return { label: "EXTREME",   color: PASTEL.lavender };
  if (s >= 300) return { label: "HIGH",      color: PASTEL.coral    };
  if (s >= 150) return { label: "MODERATE",  color: PASTEL.peach    };
  if (s >= 75)  return { label: "LOW-MOD",   color: PASTEL.yellow   };
  return              { label: "LOW",        color: PASTEL.mint     };
}
function liLabel(l: number)    {
  if (l <= -8) return { label: "EXT. UNSTABLE",   color: PASTEL.lavender };
  if (l <= -6) return { label: "VERY UNSTABLE",   color: PASTEL.coral    };
  if (l <= -4) return { label: "UNSTABLE",        color: PASTEL.peach    };
  if (l <= -2) return { label: "SLT. UNSTABLE",   color: PASTEL.yellow   };
  if (l <= 0)  return { label: "NEAR NEUTRAL",    color: PASTEL.lime     };
  return              { label: "STABLE",          color: PASTEL.mint     };
}
function stpLabel(s: number)   {
  if (s >= 3) return { label: "EXTREME",    color: PASTEL.lavender };
  if (s >= 2) return { label: "HIGH",       color: PASTEL.coral    };
  if (s >= 1) return { label: "ELEVATED",   color: PASTEL.peach    };
  if (s >= 0.5) return { label: "MARGINAL", color: PASTEL.yellow   };
  return             { label: "LOW",        color: PASTEL.mint     };
}

function computeSTP(cape: number, srh: number, shearKts: number, li: number): number {
  const capeT = cape / 1500;
  const srhT  = srh / 150;
  let shrT = shearKts / 20;
  if (shearKts < 12.5) shrT = 0;
  else if (shearKts > 30) shrT = 1.5;
  const liT = li <= -4 ? 1 : li <= -2 ? 0.85 : li <= 0 ? 0.6 : 0.3;
  return Math.max(0, Math.round(capeT * srhT * shrT * liT * 10) / 10);
}

// ── Multi-model CAPE ──────────────────────────────────────────────────────────
const MODELS = [
  { key: "cape_gfs_seamless",    name: "GFS",   color: PASTEL.sky     },
  { key: "cape_ecmwf_ifs025",    name: "ECMWF", color: PASTEL.peach   },
  { key: "cape_icon_seamless",   name: "ICON",  color: PASTEL.lime    },
  { key: "cape_gem_seamless",    name: "GEM",   color: PASTEL.lavender },
];
async function fetchModelCape(lat: number, lon: number) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=cape&models=gfs_seamless,ecmwf_ifs025,icon_seamless,gem_seamless&forecast_days=2&timezone=auto`;
  const r = await fetch(u); if (!r.ok) throw new Error(String(r.status));
  const d = await r.json();
  return d.hourly ?? {};
}

const SHARE_W = 1200, SHARE_H = 675;

// ── Pastel threat gauge ───────────────────────────────────────────────────────
function ThreatGauge({ score, color, level }: { score: number; color: string; level: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = 280, cssH = 240;
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = cssW, H = cssH;
    const cx = W / 2, cy = H * 0.58;
    const R = Math.min(W, H) * 0.38;
    const startA = Math.PI * 0.75, endA = Math.PI * 2.25, totalA = endA - startA;
    const pct = Math.min(1, score / 100);
    const fillA = startA + totalA * pct;

    ctx.clearRect(0, 0, W, H);

    // Ambient glow
    const amb = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.6);
    amb.addColorStop(0, color + "22");
    amb.addColorStop(1, "transparent");
    ctx.fillStyle = amb;
    ctx.fillRect(0, 0, W, H);

    // Segment colors (pastel)
    const segs = [
      { from: 0, to: 0.15, c: PASTEL.mint     },
      { from: 0.15, to: 0.35, c: PASTEL.lime  },
      { from: 0.35, to: 0.50, c: PASTEL.yellow },
      { from: 0.50, to: 0.65, c: PASTEL.peach  },
      { from: 0.65, to: 0.80, c: PASTEL.coral  },
      { from: 0.80, to: 1,    c: PASTEL.lavender },
    ];

    // Dark track
    ctx.beginPath(); ctx.arc(cx, cy, R, startA, endA);
    ctx.strokeStyle = "rgba(8,12,28,0.92)"; ctx.lineWidth = 22; ctx.lineCap = "round"; ctx.stroke();

    // Dim segment bg
    segs.forEach(s => {
      ctx.beginPath(); ctx.arc(cx, cy, R, startA + totalA * s.from, startA + totalA * s.to);
      ctx.strokeStyle = s.c + "30"; ctx.lineWidth = 22; ctx.lineCap = "butt"; ctx.stroke();
    });

    if (pct > 0) {
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, startA, fillA);
      ctx.strokeStyle = color + "50"; ctx.lineWidth = 36; ctx.lineCap = "round";
      ctx.shadowColor = color; ctx.shadowBlur = 22; ctx.stroke(); ctx.restore();

      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, startA, fillA);
      ctx.strokeStyle = color; ctx.lineWidth = 22; ctx.lineCap = "round";
      ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.stroke(); ctx.restore();

      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, startA, fillA);
      ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.stroke(); ctx.restore();
    }

    // Needle
    const nx = cx + (R + 14) * Math.cos(fillA), ny = cy + (R + 14) * Math.sin(fillA);
    const nx2 = cx + (R - 14) * Math.cos(fillA), ny2 = cy + (R - 14) * Math.sin(fillA);
    ctx.save(); ctx.shadowColor = "#fff"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(nx2, ny2);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.stroke();
    ctx.beginPath(); ctx.arc(nx, ny, 4.5, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
    ctx.restore();

    // Inner dial
    const dial = ctx.createRadialGradient(cx, cy - R * 0.2, 2, cx, cy, R * 0.78);
    dial.addColorStop(0, "rgba(18,24,46,0.98)"); dial.addColorStop(1, "rgba(4,8,20,0.98)");
    ctx.beginPath(); ctx.arc(cx, cy, R - 24, 0, Math.PI * 2);
    ctx.fillStyle = dial; ctx.fill();
    ctx.strokeStyle = color + "33"; ctx.lineWidth = 1; ctx.stroke();

    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "bold 54px ui-monospace, monospace";
    ctx.shadowColor = color; ctx.shadowBlur = 28; ctx.fillStyle = color;
    ctx.fillText(String(score), cx, cy - 6);
    ctx.shadowBlur = 10; ctx.fillStyle = "#fff";
    ctx.fillText(String(score), cx, cy - 6);
    ctx.restore();

    ctx.save(); ctx.textAlign = "center";
    ctx.fillStyle = "rgba(180,200,230,0.6)"; ctx.font = "600 9px ui-sans-serif, system-ui";
    ctx.fillText("SWTI / 100", cx, cy + 26);
    ctx.fillStyle = color; ctx.font = "700 10px ui-sans-serif, system-ui";
    ctx.fillText(level, cx, cy + 40);
    ctx.restore();

    // Scale labels
    ctx.save(); ctx.fillStyle = "rgba(160,180,200,0.5)"; ctx.font = "600 9px ui-sans-serif, system-ui"; ctx.textBaseline = "middle";
    ctx.textAlign = "right"; ctx.fillText("0", cx + (R + 28) * Math.cos(startA), cy + (R + 28) * Math.sin(startA));
    ctx.textAlign = "left";  ctx.fillText("100", cx + (R + 28) * Math.cos(endA), cy + (R + 28) * Math.sin(endA));
    ctx.restore();
  }, [score, color, level]);

  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute inset-0 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${color}, transparent 65%)` }} />
      <canvas ref={canvasRef} style={{ width: 280, height: 240 }} className="relative max-w-[280px] w-full" />
    </div>
  );
}

// ── Ingredient card (pastel-styled) ──────────────────────────────────────────
function IngCard({ title, value, unit, label, color, description, sparkData, icon }: {
  title: string; value: number | string; unit: string; label: string; color: string;
  description: string; sparkData?: number[]; icon: string;
}) {
  const chart = (sparkData ?? []).map((v, i) => ({ i, v }));
  return (
    <div className="relative rounded-2xl p-4 overflow-hidden border transition-all duration-300 hover:scale-[1.015]"
      style={{
        background: `linear-gradient(135deg, ${color}0d 0%, rgba(6,10,24,0.85) 100%)`,
        borderColor: color + "35",
        boxShadow: `0 8px 32px -8px ${color}30`,
      }}>
      {/* Corner glow */}
      <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full blur-2xl opacity-25 pointer-events-none"
        style={{ background: color }} />

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/50">{title}</span>
          </div>
          <div className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest"
            style={{ background: color + "22", color, border: `1px solid ${color}44` }}>
            {label}
          </div>
        </div>

        <div className="flex items-baseline gap-1.5 mb-3">
          <span className="text-4xl font-black" style={{ color, textShadow: `0 0 24px ${color}66` }}>{value}</span>
          <span className="text-sm text-white/40 font-medium">{unit}</span>
        </div>

        {chart.length > 0 && (
          <div className="mb-3 -mx-1">
            <ResponsiveContainer width="100%" height={44}>
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id={`sg-${title.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.45} />
                    <stop offset="95%" stopColor={color} stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5}
                  fill={`url(#sg-${title.replace(/\s/g, "")})`} dot={false} />
                <YAxis domain={["auto", "auto"]} hide />
                <XAxis dataKey="i" hide />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="text-[11px] text-white/45 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

// ── 72-hour timeline ──────────────────────────────────────────────────────────
function ThreatTimeline({ data, selectedHour, onSelect }: {
  data: { time: string; short: string; swti: number }[];
  selectedHour: number;
  onSelect: (h: number) => void;
}) {
  const maxSwti = Math.max(1, ...data.map(d => d.swti));
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex gap-0.5 min-w-[640px] h-32 items-end pb-8 relative">
        {data.map((h, i) => {
          const { color } = peakThreatLevel(h.swti);
          const heightPct = Math.max(0.04, h.swti / 100);
          const isActive = i === selectedHour;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end cursor-pointer group relative"
              onClick={() => onSelect(i)}>
              <div className="w-full rounded-t transition-all duration-200 group-hover:opacity-100"
                style={{
                  height: `${heightPct * 88}px`,
                  background: isActive ? color : color + "77",
                  boxShadow: isActive ? `0 0 12px 2px ${color}66` : undefined,
                  opacity: isActive ? 1 : 0.7,
                }} />
              {i % 6 === 0 && (
                <div className="absolute bottom-0 text-[9px] text-white/35 whitespace-nowrap mt-1">{h.short}</div>
              )}
              {isActive && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] font-bold whitespace-nowrap px-1 py-0.5 rounded"
                  style={{ background: color + "33", color }}>
                  {h.swti}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-white/25 mt-1">
        <span>Now</span><span>+24h</span><span>+48h</span><span>+72h</span>
      </div>
    </div>
  );
}

// ── Threat level badge bar ────────────────────────────────────────────────────
function ThreatBadge({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 border"
      style={{ background: color + "10", borderColor: color + "33" }}>
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] font-bold tracking-[0.2em] uppercase text-white/40">{label}</div>
        <div className="text-sm font-black" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StormIngredients({ location }: Props) {
  const [hourOffset, setHourOffset] = useState(0);
  const { data: weather, isLoading } = useOpenMeteo(location);
  const svgRef = useRef<SVGSVGElement>(null);

  const hourly = weather?.hourly;
  const i      = hourOffset;

  const cape  = hourly?.cape?.[i]              ?? 0;
  const li    = hourly?.lifted_index?.[i]      ?? 0;
  const dewC  = hourly?.dew_point_2m?.[i]      ?? 10;
  const ws10  = hourly?.wind_speed_10m?.[i]    ?? 0;
  const wd10  = hourly?.wind_direction_10m?.[i] ?? 0;
  const ws925 = hourly?.wind_speed_925hPa?.[i] ?? 0;
  const wd925 = hourly?.wind_direction_925hPa?.[i] ?? 0;
  const ws850 = hourly?.wind_speed_850hPa?.[i] ?? 0;
  const wd850 = hourly?.wind_direction_850hPa?.[i] ?? 0;
  const ws700 = hourly?.wind_speed_700hPa?.[i] ?? 0;
  const wd700 = hourly?.wind_direction_700hPa?.[i] ?? 0;
  const ws500 = hourly?.wind_speed_500hPa?.[i] ?? 0;
  const wd500 = hourly?.wind_direction_500hPa?.[i] ?? 0;

  const srh      = computeSRHFromProfile(ws10, wd10, ws925, wd925, ws850, wd850, ws700, wd700, ws500, wd500);
  const shear    = compute06kmShear(ws10, wd10, ws500, wd500);
  const shearKts = mpsToKnots(shear);
  const swti     = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: dewC });
  const peak     = peakThreatLevel(swti.score);
  const stp      = computeSTP(cape, srh, shearKts, li);

  const capeInfo  = capeLabel(cape);
  const shearInfo = shearLabel(shearKts);
  const srhInfo   = srhLabel(srh);
  const liInfo    = liLabel(li);
  const stpInfo   = stpLabel(stp);

  // Spark arrays
  const sparkCape  = hourly?.cape?.slice(0, 24) ?? [];
  const sparkLi    = hourly?.lifted_index?.slice(0, 24) ?? [];
  const srhAt  = (j: number) => computeSRHFromProfile(
    hourly!.wind_speed_10m?.[j]??0, hourly!.wind_direction_10m?.[j]??0,
    hourly!.wind_speed_925hPa?.[j]??0, hourly!.wind_direction_925hPa?.[j]??0,
    hourly!.wind_speed_850hPa?.[j]??0, hourly!.wind_direction_850hPa?.[j]??0,
    hourly!.wind_speed_700hPa?.[j]??0, hourly!.wind_direction_700hPa?.[j]??0,
    hourly!.wind_speed_500hPa?.[j]??0, hourly!.wind_direction_500hPa?.[j]??0,
  );
  const shearKtsAt = (j: number) => mpsToKnots(compute06kmShear(
    hourly!.wind_speed_10m?.[j]??0, hourly!.wind_direction_10m?.[j]??0,
    hourly!.wind_speed_500hPa?.[j]??0, hourly!.wind_direction_500hPa?.[j]??0,
  ));
  const sparkSrh   = hourly?.time?.slice(0, 24).map((_: string, j: number) => srhAt(j)) ?? [];
  const sparkShear = hourly?.time?.slice(0, 24).map((_: string, j: number) => shearKtsAt(j)) ?? [];

  // 72-hour threat timeline
  const hourlyThreat = useMemo(() => (hourly?.time as string[]|undefined)?.slice(0, 72).map((t, j) => {
    const c  = hourly!.cape?.[j] ?? 0;
    const l  = hourly!.lifted_index?.[j] ?? 0;
    const dC = hourly!.dew_point_2m?.[j] ?? 10;
    const sh = compute06kmShear(hourly!.wind_speed_10m?.[j]??0, hourly!.wind_direction_10m?.[j]??0, hourly!.wind_speed_500hPa?.[j]??0, hourly!.wind_direction_500hPa?.[j]??0);
    const res = computeSWTI({ cape: c, srh: srhAt(j), shear06km: sh, liftedIndex: l, dewPointC: dC });
    return { time: format(parseISO(t), "EEE ha"), short: format(parseISO(t), "ha"), swti: res.score };
  }) ?? [], [hourly]);

  // Dual-param chart
  const dualData = useMemo(() => (hourly?.time as string[]|undefined)?.slice(0, 72).map((t, j) => ({
    time: format(parseISO(t), "EEE ha"),
    cape: Math.round(hourly!.cape?.[j] ?? 0),
    shear: Math.round(shearKtsAt(j)),
  })) ?? [], [hourly]);

  // SRH + STP chart
  const srhStpData = useMemo(() => (hourly?.time as string[]|undefined)?.slice(0, 72).map((t, j) => {
    const srh_j = srhAt(j);
    const c_j   = hourly!.cape?.[j] ?? 0;
    const l_j   = hourly!.lifted_index?.[j] ?? 0;
    const sh_j  = shearKtsAt(j);
    return {
      time: format(parseISO(t), "EEE ha"),
      srh: Math.round(srh_j),
      stp: Math.round(computeSTP(c_j, srh_j, sh_j, l_j) * 10) / 10,
    };
  }) ?? [], [hourly]);

  const peakPrecip = Math.max(0, ...(hourly?.precipitation_probability?.slice(0, 24) ?? [0]));
  const hourLabels = hourly?.time?.slice(0, 72).map((t: string, j: number) => ({ label: format(parseISO(t), "ha"), offset: j })) ?? [];
  const nowLabel   = hourly?.time?.[i] ? format(parseISO(hourly.time[i]), "EEE MMM d · ha") : "";

  // Model agreement
  const { data: modelCape } = useQuery({
    queryKey: ["ingredients-models", location.lat.toFixed(3), location.lon.toFixed(3)],
    queryFn: () => fetchModelCape(location.lat, location.lon),
    staleTime: 30 * 60 * 1000,
  });
  const modelRows = MODELS.map(m => ({ name: m.name, color: m.color, cape: Math.round(modelCape?.[m.key]?.[i] ?? NaN) })).filter(r => !Number.isNaN(r.cape));
  const modelAgreement = (() => {
    if (modelRows.length < 2) return null;
    const vals = modelRows.map(r => r.cape), mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const spread = (Math.max(...vals) - Math.min(...vals)) / Math.max(mean, 1);
    return { mean: Math.round(mean), level: spread < 0.35 ? "High" : spread < 0.7 ? "Moderate" : "Low", color: spread < 0.35 ? PASTEL.mint : spread < 0.7 ? PASTEL.yellow : PASTEL.coral };
  })();
  const modelMax = Math.max(500, ...modelRows.map(r => r.cape));

  // Share image
  const strip = hourlyThreat.slice(0, 18);
  const tiles = [
    { name: "CAPE",        value: String(Math.round(cape)),      unit: "J/kg",  color: capeInfo.color,  label: capeInfo.label  },
    { name: "0–6KM SHEAR", value: String(Math.round(shearKts)), unit: "kt",    color: shearInfo.color, label: shearInfo.label },
    { name: "0–3KM SRH",   value: String(Math.round(srh)),       unit: "m²/s²", color: srhInfo.color,   label: srhInfo.label   },
    { name: "STP",         value: stp.toFixed(1),                unit: "",      color: stpInfo.color,   label: stpInfo.label   },
  ];

  const fname = `storm-ingredients-${location.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`;
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
    return await new Promise<Blob | null>(r => canvas.toBlob(r, "image/png"));
  }
  async function downloadImage() { const b = await rasterize(); if (!b) return; const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = fname; a.click(); URL.revokeObjectURL(u); }
  async function shareImage() {
    const b = await rasterize(); if (!b) return;
    const file = new File([b], fname, { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) { try { await nav.share({ files: [file], title: "Storm Ingredients", text: `${location.name} — ${peak.level} threat` }); return; } catch { /**/ } }
    const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = fname; a.click(); URL.revokeObjectURL(u);
  }
  async function shareLink() {
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    const link = window.location.href;
    if (nav.share) { try { await nav.share({ title: "Storm Ingredients", text: `${location.name} storm ingredients`, url: link }); return; } catch { /**/ } }
    try { await navigator.clipboard.writeText(link); } catch { /**/ }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHero icon={FlaskConical} title="Storm Ingredients" subtitle={`${location.name} · 72-hour atmospheric parameters for convection`} />

      {/* ── Shareable graphic SVG ────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-white/5" style={{ background: "rgba(4,8,20,0.90)" }}>
        <svg ref={svgRef} viewBox={`0 0 ${SHARE_W} ${SHARE_H}`} xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "auto", display: "block" }}>
          <defs>
            <linearGradient id="ingbg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#080e24" /><stop offset="100%" stopColor="#0e0820" />
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <rect width={SHARE_W} height={SHARE_H} fill="url(#ingbg)" />
          <rect width={SHARE_W} height={5} fill={peak.color} />
          {/* Soft glow background */}
          <ellipse cx={300} cy={200} rx={300} ry={200} fill={peak.color} fillOpacity={0.06} />

          <text x={40} y={60} fill="#ffffff" fontSize={38} fontWeight={800} fontFamily="system-ui, sans-serif" letterSpacing={2}>STORM INGREDIENTS</text>
          <text x={42} y={90} fill="rgba(180,200,240,0.6)" fontSize={18} fontFamily="system-ui, sans-serif">{location.name}{nowLabel ? ` · ${nowLabel}` : ""}</text>

          {/* Peak threat block */}
          <rect x={40} y={120} width={340} height={320} rx={18} fill={peak.color} fillOpacity={0.06} stroke={peak.color} strokeOpacity={0.3} strokeWidth={1} />
          <text x={210} y={160} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={13} letterSpacing={4} fontFamily="system-ui, sans-serif">PEAK THREAT</text>
          <text x={210} y={310} textAnchor="middle" fill={peak.color} fontSize={140} fontWeight={900} fontFamily="ui-monospace, monospace" filter="url(#glow)">{swti.score}</text>
          <text x={210} y={355} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={16} fontFamily="system-ui, sans-serif">SWTI / 100</text>
          <text x={210} y={400} textAnchor="middle" fill={peak.color} fontSize={30} fontWeight={900} fontFamily="system-ui, sans-serif" letterSpacing={3}>{peak.level}</text>

          {/* Ingredient tiles (2×2) */}
          {tiles.map((t, k) => {
            const tx = 420 + (k % 2) * 380, ty = 120 + Math.floor(k / 2) * 162;
            return (
              <g key={t.name}>
                <rect x={tx} y={ty} width={360} height={146} rx={14} fill={t.color} fillOpacity={0.07} stroke={t.color} strokeOpacity={0.35} strokeWidth={1} />
                <text x={tx + 20} y={ty + 36} fill="rgba(180,200,240,0.55)" fontSize={14} letterSpacing={3} fontFamily="system-ui, sans-serif">{t.name}</text>
                <text x={tx + 20} y={ty + 96} fill="#ffffff" fontSize={52} fontWeight={900} fontFamily="ui-monospace, monospace">{t.value}<tspan fontSize={20} fill="rgba(180,200,240,0.5)" fontWeight={400}> {t.unit}</tspan></text>
                <text x={tx + 336} y={ty + 36} textAnchor="end" fill={t.color} fontSize={14} fontWeight={800} fontFamily="system-ui, sans-serif">{t.label}</text>
              </g>
            );
          })}

          {/* Hour-by-hour threat strip */}
          <text x={40} y={468} fill="rgba(160,180,220,0.5)" fontSize={13} letterSpacing={3} fontFamily="system-ui, sans-serif">72-HOUR THREAT TIMELINE</text>
          {strip.map((h, k) => {
            const bw = (SHARE_W - 80) / strip.length, bx = 40 + k * bw;
            const bh = Math.max(3, (h.swti / 100) * 130), by = 620 - bh;
            const c = peakThreatLevel(h.swti).color;
            return (
              <g key={k}>
                <rect x={bx + 2} y={by} width={bw - 4} height={bh} rx={3} fill={c} fillOpacity={0.85} />
                {k % 3 === 0 && <text x={bx + bw / 2} y={638} textAnchor="middle" fill="rgba(100,120,160,0.7)" fontSize={11} fontFamily="system-ui, sans-serif">{h.short}</text>}
              </g>
            );
          })}

          <text x={SHARE_W - 40} y={490} textAnchor="end" fill="rgba(160,200,240,0.6)" fontSize={14} fontFamily="system-ui, sans-serif">Peak precip chance <tspan fill={PASTEL.sky} fontWeight={900} fontSize={20}>{peakPrecip}%</tspan></text>
          <text x={SHARE_W - 40} y={662} textAnchor="end" fill="rgba(80,100,140,0.6)" fontSize={13} fontFamily="system-ui, sans-serif">VIP Forecasts &amp; Alerts · Open-Meteo</text>
        </svg>

        <div className="flex gap-2 p-3 border-t border-white/5">
          <button onClick={downloadImage} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-[1.02]"
            style={{ background: peak.color + "22", border: `1px solid ${peak.color}44`, color: peak.color }}>
            <Download className="w-4 h-4" /> Download Image
          </button>
          <button onClick={shareImage} className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium hover:border-white/20 transition-all hover:scale-[1.02]">
            <Share2 className="w-4 h-4" /> Share Image
          </button>
          <button onClick={shareLink} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium hover:border-white/20 transition-all">
            <Layers className="w-4 h-4" /> Link
          </button>
        </div>
      </div>

      {/* ── Peak Threat Card ─────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden border p-5"
        style={{ background: peak.bg, borderColor: peak.color + "44", boxShadow: `0 0 60px -12px ${peak.color}44` }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-1/3 -right-1/4 w-2/3 h-full rounded-full blur-3xl opacity-15"
            style={{ background: peak.color }} />
        </div>

        <div className="relative flex flex-col md:flex-row items-center gap-6">
          <ThreatGauge score={swti.score} color={peak.color} level={peak.level} />

          <div className="flex-1 text-center md:text-left">
            <div className="text-[11px] font-bold tracking-[0.3em] uppercase mb-1 opacity-50">Severe Weather Threat Index</div>
            <div className="text-5xl font-black mb-2" style={{ color: peak.color, textShadow: `0 0 40px ${peak.color}66` }}>
              {peak.icon} {peak.level}
            </div>
            <p className="text-sm opacity-70 mb-4 max-w-md">{peak.desc}</p>

            <div className="grid grid-cols-2 gap-2">
              <ThreatBadge icon="🌪️" label="Tornado" value={swti.tornadoRisk.toUpperCase()} color={peak.color} />
              <ThreatBadge icon="⚡" label="Hail" value={swti.hailRisk.toUpperCase()} color={PASTEL.gold} />
              <ThreatBadge icon="💨" label="Wind" value={swti.windRisk.toUpperCase()} color={PASTEL.sky} />
              <ThreatBadge icon="🌧️" label="Peak Rain%" value={`${peakPrecip}%`} color={PASTEL.sky} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 72-Hour Threat Timeline ──────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-white/5 p-5" style={{ background: "rgba(4,8,20,0.85)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold tracking-tight text-white/90 flex items-center gap-2">
            <Activity className="w-4 h-4" style={{ color: peak.color }} />
            72-Hour Threat Timeline
          </h2>
          <span className="text-[10px] text-white/30 uppercase tracking-wider">Click any hour to inspect</span>
        </div>
        {isLoading
          ? <div className="h-32 bg-white/5 rounded-xl animate-pulse" />
          : <ThreatTimeline data={hourlyThreat} selectedHour={hourOffset} onSelect={setHourOffset} />
        }
      </div>

      {/* ── Hour Selector ─────────────────────────────────────────────────── */}
      {hourLabels.length > 0 && (
        <div className="rounded-2xl overflow-hidden border border-white/5 p-4" style={{ background: "rgba(4,8,20,0.85)" }}>
          <div className="text-[10px] font-bold tracking-[0.25em] uppercase text-white/40 mb-3">View at Hour</div>
          <div className="flex flex-wrap gap-1.5">
            {[0,3,6,9,12,15,18,21,24,27,30,33,36].map(offset => (
              <button key={offset} onClick={() => setHourOffset(offset)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={hourOffset === offset
                  ? { background: peak.color + "25", color: peak.color, border: `1px solid ${peak.color}50` }
                  : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid transparent" }
                }>
                {hourLabels[offset]?.label ?? `+${offset}h`}
              </button>
            ))}
          </div>
          {nowLabel && <div className="mt-2 text-[11px] text-white/30">Viewing: {nowLabel}</div>}
        </div>
      )}

      {/* ── Ingredient Cards ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-white/80 mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4" style={{ color: PASTEL.yellow }} />
          Storm Ingredients — 72h Peaks
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IngCard title="CAPE" icon="⚡" value={isLoading ? "—" : Math.round(cape)} unit="J/kg"
            label={capeInfo.label} color={capeInfo.color} sparkData={sparkCape}
            description="Convective Available Potential Energy — the energy fuel for thunderstorms. ≥1500 supports intense convection; ≥2500 supports supercells and large hail." />
          <IngCard title="0-3km SRH" icon="🌀" value={isLoading ? "—" : Math.round(srh)} unit="m²/s²"
            label={srhInfo.label} color={srhInfo.color} sparkData={sparkSrh}
            description="Storm-Relative Helicity in the lowest 3km. ≥150 favors rotating updrafts; ≥300 significantly increases tornado potential with sufficient instability." />
          <IngCard title="0-6km Bulk Shear" icon="💨" value={isLoading ? "—" : Math.round(shearKts)} unit="kts"
            label={shearInfo.label} color={shearInfo.color} sparkData={sparkShear}
            description="Bulk wind shear through 6km — the organizational mechanism for supercells. ≥35 kts supports supercells; ≥50 kts favors significant tornadoes and large hail." />
          <IngCard title="Lifted Index" icon="📊" value={isLoading ? "—" : li.toFixed(1)} unit=""
            label={liInfo.label} color={liInfo.color} sparkData={sparkLi}
            description="Lifted Index: how unstable the atmosphere is. Negative = unstable air. LI ≤ -4 is significantly unstable; ≤ -6 is very unstable with explosive potential." />
        </div>
      </div>

      {/* ── STP Panel ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border p-5"
        style={{ background: `linear-gradient(135deg, ${stpInfo.color}08, rgba(4,8,20,0.90))`, borderColor: stpInfo.color + "33" }}>
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl border"
            style={{ background: stpInfo.color + "15", borderColor: stpInfo.color + "33" }}>
            🌪️
          </div>
          <div className="flex-1">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-4xl font-black" style={{ color: stpInfo.color, textShadow: `0 0 24px ${stpInfo.color}66` }}>{stp.toFixed(1)}</span>
              <span className="text-xs text-white/40">Significant Tornado Parameter</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black ml-auto" style={{ background: stpInfo.color + "22", color: stpInfo.color, border: `1px solid ${stpInfo.color}44` }}>{stpInfo.label}</span>
            </div>
            <p className="text-xs text-white/50">STP combines CAPE, SRH, and 0–6km shear into a single tornado potential metric. STP ≥1 indicates elevated risk; ≥3 indicates extreme conditions for strong/violent tornadoes.</p>
          </div>
        </div>
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* CAPE & Shear */}
        <div className="rounded-2xl overflow-hidden border border-white/5 p-4" style={{ background: "rgba(4,8,20,0.85)" }}>
          <h3 className="text-sm font-bold mb-3 text-white/80 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: PASTEL.gold }} /> CAPE &amp; Wind Shear
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={dualData}>
              <defs>
                <linearGradient id="capeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={PASTEL.gold} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={PASTEL.gold} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={11} />
              <YAxis yAxisId="l" tick={{ fontSize: 9, fill: PASTEL.gold }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9, fill: PASTEL.sky }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area yAxisId="l" type="monotone" name="CAPE (J/kg)" dataKey="cape" stroke={PASTEL.gold} fill="url(#capeGrad)" strokeWidth={2} dot={false} />
              <Line yAxisId="r" type="monotone" name="0-6km Shear (kt)" dataKey="shear" stroke={PASTEL.sky} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* SRH & STP */}
        <div className="rounded-2xl overflow-hidden border border-white/5 p-4" style={{ background: "rgba(4,8,20,0.85)" }}>
          <h3 className="text-sm font-bold mb-3 text-white/80 flex items-center gap-2">
            <Wind className="w-4 h-4" style={{ color: PASTEL.rose }} /> SRH &amp; STP
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <ComposedChart data={srhStpData}>
              <defs>
                <linearGradient id="srhGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={PASTEL.rose} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={PASTEL.rose} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={11} />
              <YAxis yAxisId="l" tick={{ fontSize: 9, fill: PASTEL.rose }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9, fill: PASTEL.lavender }} tickLine={false} axisLine={false} domain={[0, 6]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area yAxisId="l" type="monotone" name="0-3km SRH (m²/s²)" dataKey="srh" stroke={PASTEL.rose} fill="url(#srhGrad)" strokeWidth={2} dot={false} />
              <Line yAxisId="r" type="monotone" name="STP" dataKey="stp" stroke={PASTEL.lavender} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 48-Hour SWTI Chart ────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-white/5 p-4" style={{ background: "rgba(4,8,20,0.85)" }}>
        <h3 className="text-sm font-bold mb-3 text-white/80">72-Hour SWTI Threat Score</h3>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={hourlyThreat} barCategoryGap="5%">
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={11} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}/100`, "SWTI"]} />
            <Bar dataKey="swti" radius={[2, 2, 0, 0]}>
              {hourlyThreat.map((h, idx) => <Cell key={idx} fill={peakThreatLevel(h.swti).color} fillOpacity={0.8} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Model Agreement ───────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-white/5 p-4" style={{ background: "rgba(4,8,20,0.85)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-white/80">Model Agreement — CAPE</h3>
          {modelAgreement && (
            <span className="text-xs font-black px-2.5 py-1 rounded-full"
              style={{ background: modelAgreement.color + "22", color: modelAgreement.color, border: `1px solid ${modelAgreement.color}44` }}>
              {modelAgreement.level} Agreement
            </span>
          )}
        </div>

        {modelRows.length === 0
          ? <div className="text-xs text-white/30 animate-pulse">Loading model guidance…</div>
          : (
            <div className="space-y-3">
              {modelRows.map(r => (
                <div key={r.name} className="flex items-center gap-3">
                  <div className="w-12 text-xs font-black" style={{ color: r.color }}>{r.name}</div>
                  <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                      style={{
                        width: `${Math.min(100, (r.cape / modelMax) * 100)}%`,
                        background: `linear-gradient(to right, ${r.color}55, ${r.color})`,
                        boxShadow: `0 0 10px -2px ${r.color}66`,
                        minWidth: r.cape > 0 ? "20px" : "0",
                      }} />
                  </div>
                  <div className="w-24 text-right text-xs font-black" style={{ color: r.color }}>
                    {r.cape.toLocaleString()} J/kg
                  </div>
                  <div className="w-16 text-right text-[10px] font-bold uppercase tracking-wide" style={{ color: capeLabel(r.cape).color }}>
                    {capeLabel(r.cape).label}
                  </div>
                </div>
              ))}
              {modelAgreement && (
                <p className="text-[11px] text-white/40 pt-2 border-t border-white/5">
                  Four-model mean CAPE ≈ <strong className="text-white/60">{modelAgreement.mean.toLocaleString()} J/kg</strong>.{" "}
                  {modelAgreement.level === "High"
                    ? "Models are tightly clustered — high confidence in the instability forecast."
                    : modelAgreement.level === "Moderate"
                    ? "Some model spread — moderate confidence. Monitor for updates."
                    : "Large model spread — low confidence. Significant forecast uncertainty; watch for model trends."}
                </p>
              )}
            </div>
          )
        }
      </div>

      {/* ── Ingredient legend ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-white/5 p-4" style={{ background: "rgba(4,8,20,0.85)" }}>
        <h3 className="text-sm font-bold text-white/80 mb-3">Threat Level Reference</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[
            { level: "BENIGN",      color: PASTEL.mint,     desc: "No meaningful convective threat" },
            { level: "MARGINAL",    color: PASTEL.lime,     desc: "Isolated severe storms possible" },
            { level: "ELEVATED",    color: PASTEL.yellow,   desc: "Elevated risk, supercells possible" },
            { level: "SIGNIFICANT", color: PASTEL.peach,    desc: "Significant severe weather likely" },
            { level: "EXTREME",     color: PASTEL.coral,    desc: "Tornadoes likely, large hail" },
            { level: "VIOLENT",     color: PASTEL.lavender, desc: "Violent tornadoes possible" },
          ].map(r => (
            <div key={r.level} className="flex items-start gap-2 p-2.5 rounded-lg border"
              style={{ background: r.color + "0c", borderColor: r.color + "28" }}>
              <div className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: r.color, boxShadow: `0 0 6px ${r.color}` }} />
              <div>
                <div className="text-[10px] font-black tracking-wider" style={{ color: r.color }}>{r.level}</div>
                <div className="text-[10px] text-white/35">{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
