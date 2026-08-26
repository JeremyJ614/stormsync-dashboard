import { useQuery } from "@tanstack/react-query";
import { motion, LayoutGroup } from "framer-motion";
import { Flower2 } from "lucide-react";
import { ModuleShell } from "../components/ModuleShell";
import { PollenTab } from "../components/aqi/PollenTab";
import { ROYAL, prefersReducedMotion } from "../lib/royal";
import { useRef, useEffect, useState } from "react";
import type { Location } from "../hooks/useLocation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { format, parseISO } from "date-fns";
import { Wind, ExternalLink, Info, AlertTriangle, Activity, Droplets, Flame } from "lucide-react";
import { PageHero } from "../components/PageHero";

interface Props { location: Location }

const AQI_MAX = 500;

// ── EPA-Official AQI Breakpoint Calculations ────────────────────────────────
// These are the OFFICIAL EPA breakpoints for each pollutant.
// Computing AQI from raw concentrations is MORE accurate than using Open-Meteo's
// pre-computed us_aqi field, which can underestimate during extreme wildfire smoke events.

function pm25ToAQI(c: number): number {
  const c_t = Math.round(c * 10) / 10; // truncate to 1 decimal per EPA method
  const BP: [number, number, number, number][] = [
    [0.0, 12.0, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 350.4, 301, 400],
    [350.5, 500.4, 401, 500],
  ];
  const row = BP.find(b => c_t <= b[1]) ?? BP[BP.length - 1];
  const [c_lo, c_hi, i_lo, i_hi] = row;
  return Math.min(500, Math.round(((i_hi - i_lo) / (c_hi - c_lo)) * (c_t - c_lo) + i_lo));
}

function pm10ToAQI(c: number): number {
  const c_t = Math.floor(c); // truncate to integer per EPA method
  const BP: [number, number, number, number][] = [
    [0, 54, 0, 50],
    [55, 154, 51, 100],
    [155, 254, 101, 150],
    [255, 354, 151, 200],
    [355, 424, 201, 300],
    [425, 504, 301, 400],
    [505, 604, 401, 500],
  ];
  const row = BP.find(b => c_t <= b[1]) ?? BP[BP.length - 1];
  const [c_lo, c_hi, i_lo, i_hi] = row;
  return Math.min(500, Math.round(((i_hi - i_lo) / (c_hi - c_lo)) * (c_t - c_lo) + i_lo));
}

function ozoneToAQI(c_ppb: number): number {
  // Ozone from Open-Meteo is in μg/m³; convert to ppb (1 ppb ≈ 1.96 μg/m³ at STP)
  const c_ppm = c_ppb / 1960; // μg/m³ → ppm
  const c_8h = Math.round(c_ppm * 1000) / 1000; // truncate to 3 decimals
  const BP: [number, number, number, number][] = [
    [0.000, 0.054, 0, 50],
    [0.055, 0.070, 51, 100],
    [0.071, 0.085, 101, 150],
    [0.086, 0.105, 151, 200],
    [0.106, 0.200, 201, 300],
  ];
  const row = BP.find(b => c_8h <= b[1]) ?? BP[BP.length - 1];
  const [c_lo, c_hi, i_lo, i_hi] = row;
  return Math.min(300, Math.round(((i_hi - i_lo) / (c_hi - c_lo)) * (c_8h - c_lo) + i_lo));
}

/**
 * Compute US AQI from raw concentrations using EPA breakpoints.
 * Takes the MAX of all individual pollutant sub-indices — this is the official method.
 * During wildfire smoke events, PM2.5 will dominate and show the true hazard level.
 *
 * We also compare against Open-Meteo's pre-computed us_aqi and take the higher value
 * as an extra safety margin.
 */
function computeAccurateAQI(pm25: number, pm10: number, ozone: number, openMeteoAQI: number): number {
  const pm25_aqi = pm25ToAQI(pm25);
  const pm10_aqi = pm10ToAQI(pm10);
  const o3_aqi   = ozoneToAQI(ozone);
  // Take the maximum of all sub-indices and also Open-Meteo's value
  return Math.max(pm25_aqi, pm10_aqi, o3_aqi, openMeteoAQI);
}

function aqiCategory(aqi: number): { label: string; color: string; bg: string; desc: string; emoji: string; healthMsg: string } {
  if (aqi <= 50)  return { label: "Good",                     color: "#6ee7b7", bg: "rgba(110,231,183,0.12)", desc: "Air quality is satisfactory. No health concerns.",                          emoji: "✅", healthMsg: "Enjoy outdoor activities freely." };
  if (aqi <= 100) return { label: "Moderate",                 color: "#fde68a", bg: "rgba(253,230,138,0.12)", desc: "Acceptable; some pollutants may concern sensitive groups.",                  emoji: "🟡", healthMsg: "Sensitive individuals should consider reducing prolonged outdoor exertion." };
  if (aqi <= 150) return { label: "Unhealthy for Sensitive",  color: "#fdba74", bg: "rgba(253,186,116,0.12)", desc: "Sensitive groups may experience health effects. Others are less likely.",    emoji: "🟠", healthMsg: "People with asthma, heart/lung disease, elderly, and children should limit outdoor activity." };
  if (aqi <= 200) return { label: "Unhealthy",                color: "#f87171", bg: "rgba(248,113,113,0.12)", desc: "Everyone may begin to experience health effects.",                           emoji: "🔴", healthMsg: "Everyone should reduce prolonged exertion. Sensitive groups should avoid outdoor activity." };
  if (aqi <= 300) return { label: "Very Unhealthy",           color: "#c084fc", bg: "rgba(192,132,252,0.12)", desc: "Health alert — everyone may experience more serious effects.",               emoji: "🟣", healthMsg: "Everyone should avoid all outdoor physical activity. Sensitive groups should remain indoors." };
  return           { label: "Hazardous",                      color: "#fb7185", bg: "rgba(251,113,133,0.12)", desc: "Emergency conditions — the entire population is affected.",                   emoji: "☣️", healthMsg: "STAY INDOORS. Keep windows/doors closed. Use air purifier if available." };
}

const TOOLTIP_STYLE = { background: "hsl(232 20% 8%)", border: "1px solid hsl(232 18% 20%)", borderRadius: 8, fontSize: 12 };

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

// ── Animated counter hook ───────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(timer); }
      else setValue(Math.round(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

// ── High-tech Arc Gauge with animated fill ──────────────────────────────────
function AQIArcGauge({ aqi, color }: { aqi: number; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const startRef  = useRef<number>(0);
  const prevAQI   = useRef<number>(0);

  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    const from = prevAQI.current;
    const to   = aqi;
    const duration = 1400;
    startRef.current = performance.now();

    function draw(now: number) {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      const current = from + (to - from) * ease;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const cssW = 340, cssH = 280;
      if (canvas.width !== cssW * dpr) {
        canvas.width  = cssW * dpr;
        canvas.height = cssH * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = cssW, H = cssH;
      const cx = W / 2, cy = H * 0.60;
      const R = Math.min(W, H) * 0.40;
      const startAngle = Math.PI * 0.75;
      const endAngle   = Math.PI * 2.25;
      const totalArc   = endAngle - startAngle;
      const pct        = Math.min(1, current / AQI_MAX);
      const fillAngle  = startAngle + totalArc * pct;

      ctx.clearRect(0, 0, W, H);

      // Background ambient glow
      const ambient = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.8);
      ambient.addColorStop(0, color + "1a");
      ambient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ambient;
      ctx.fillRect(0, 0, W, H);

      // Outer ring
      ctx.beginPath();
      ctx.arc(cx, cy, R + 20, startAngle, endAngle);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Tick marks
      for (let i = 0; i <= 20; i++) {
        const a = startAngle + (totalArc * i) / 20;
        const isMajor = i % 2 === 0;
        const inner = R - (isMajor ? 18 : 11);
        const outer = R - 24;
        ctx.beginPath();
        ctx.moveTo(cx + outer * Math.cos(a), cy + outer * Math.sin(a));
        ctx.lineTo(cx + inner * Math.cos(a), cy + inner * Math.sin(a));
        ctx.strokeStyle = isMajor ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)";
        ctx.lineWidth = isMajor ? 1.5 : 0.8;
        ctx.stroke();
      }

      // Segment colors for background band
      const segColors = [
        { from: 0,           to: 50/AQI_MAX,  color: "#6ee7b7" },
        { from: 50/AQI_MAX,  to: 100/AQI_MAX, color: "#fde68a" },
        { from: 100/AQI_MAX, to: 150/AQI_MAX, color: "#fdba74" },
        { from: 150/AQI_MAX, to: 200/AQI_MAX, color: "#f87171" },
        { from: 200/AQI_MAX, to: 300/AQI_MAX, color: "#c084fc" },
        { from: 300/AQI_MAX, to: 1,           color: "#fb7185" },
      ];

      // Dark base track
      ctx.beginPath();
      ctx.arc(cx, cy, R, startAngle, endAngle);
      ctx.strokeStyle = "rgba(5,10,30,0.90)";
      ctx.lineWidth = 24;
      ctx.lineCap = "round";
      ctx.stroke();

      // Dim segment background
      segColors.forEach(seg => {
        ctx.beginPath();
        ctx.arc(cx, cy, R, startAngle + totalArc * seg.from, startAngle + totalArc * seg.to);
        ctx.strokeStyle = seg.color + "28";
        ctx.lineWidth = 24;
        ctx.lineCap = "butt";
        ctx.stroke();
      });

      // Active fill — triple glow layers
      if (pct > 0) {
        // Outer bloom
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, startAngle, fillAngle);
        ctx.strokeStyle = color + "40";
        ctx.lineWidth = 40;
        ctx.lineCap = "round";
        ctx.shadowColor = color;
        ctx.shadowBlur = 24;
        ctx.stroke();
        ctx.restore();

        // Mid glow
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, startAngle, fillAngle);
        ctx.strokeStyle = color + "88";
        ctx.lineWidth = 28;
        ctx.lineCap = "round";
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.stroke();
        ctx.restore();

        // Core solid track
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, startAngle, fillAngle);
        ctx.strokeStyle = color;
        ctx.lineWidth = 22;
        ctx.lineCap = "round";
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.restore();

        // Bright edge highlight
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, startAngle, fillAngle);
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      }

      // Needle tip marker
      const nxOuter = cx + (R + 16) * Math.cos(fillAngle);
      const nyOuter = cy + (R + 16) * Math.sin(fillAngle);
      const nxInner = cx + (R - 16) * Math.cos(fillAngle);
      const nyInner = cy + (R - 16) * Math.sin(fillAngle);
      ctx.save();
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(nxOuter, nyOuter);
      ctx.lineTo(nxInner, nyInner);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(nxOuter, nyOuter, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();

      // Inner dial face
      const dial = ctx.createRadialGradient(cx, cy - R * 0.25, 2, cx, cy, R * 0.80);
      dial.addColorStop(0, "rgba(20,28,50,0.98)");
      dial.addColorStop(1, "rgba(4,8,20,0.98)");
      ctx.beginPath();
      ctx.arc(cx, cy, R - 24, 0, Math.PI * 2);
      ctx.fillStyle = dial;
      ctx.fill();
      ctx.strokeStyle = color + "33";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Score text — multi-glow
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 62px ui-monospace, 'Courier New', monospace";
      ctx.shadowColor = color;
      ctx.shadowBlur = 40;
      ctx.fillStyle = color;
      ctx.fillText(String(Math.round(current)), cx, cy - 8);
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(String(Math.round(current)), cx, cy - 8);
      ctx.restore();

      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(180,200,220,0.7)";
      ctx.font = "600 11px ui-sans-serif, system-ui";
      ctx.fillText("US AQI", cx, cy + 24);
      ctx.fillStyle = color;
      ctx.font = "700 9px ui-sans-serif, system-ui";
      ctx.fillText(`${Math.round(pct * 100)}% OF SCALE`, cx, cy + 40);
      ctx.restore();

      // Scale labels
      ctx.save();
      ctx.fillStyle = "rgba(148,163,184,0.6)";
      ctx.font = "600 9px ui-sans-serif, system-ui";
      ctx.textBaseline = "middle";
      ctx.textAlign = "right";
      ctx.fillText("0", cx + (R + 32) * Math.cos(startAngle), cy + (R + 32) * Math.sin(startAngle));
      ctx.textAlign = "left";
      ctx.fillText("500", cx + (R + 32) * Math.cos(endAngle), cy + (R + 32) * Math.sin(endAngle));
      ctx.restore();

      if (t < 1) animRef.current = requestAnimationFrame(draw);
      else prevAQI.current = to;
    }

    animRef.current = requestAnimationFrame(draw);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [aqi, color]);

  return (
    <div className="flex items-center justify-center relative">
      <div className="absolute inset-0 rounded-full blur-[80px] opacity-25 pointer-events-none"
        style={{ background: `radial-gradient(circle at center, ${color}, transparent 60%)` }} />
      <canvas ref={canvasRef} style={{ width: 340, height: 280 }} className="relative w-full max-w-[340px]" />
    </div>
  );
}

// ── Animated gradient scale bar ──────────────────────────────────────────────
function AQIScaleBar({ aqi, color }: { aqi: number; color: string }) {
  const left = Math.min(98, Math.max(1, (aqi / AQI_MAX) * 100));
  return (
    <div className="w-full max-w-sm mx-auto mt-4">
      <div className="relative h-4 rounded-full overflow-visible">
        <div className="absolute inset-0 rounded-full overflow-hidden" style={{
          background: "linear-gradient(to right, #6ee7b7 0%,#6ee7b7 10%, #fde68a 10%,#fde68a 20%, #fdba74 20%,#fdba74 30%, #f87171 30%,#f87171 40%, #c084fc 40%,#c084fc 60%, #fb7185 60%,#fb7185 100%)",
          boxShadow: `0 0 20px -2px ${color}88`,
        }} />
        {/* Live marker */}
        <div
          className="absolute top-1/2 w-3 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-1000"
          style={{
            left: `${left}%`,
            background: "#ffffff",
            boxShadow: `0 0 0 2px ${color}, 0 0 14px 2px ${color}88`,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-2 px-0.5">
        {["0", "Good", "Moderate", "USG", "Unhealthy", "Very Unhlthy", "Hazardous", "500"].map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}

// ── Animated pollutant meter bar ─────────────────────────────────────────────
function PollutantMeter({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mt-2">
      <div
        className="h-full rounded-full transition-all duration-1000"
        style={{ width: `${pct}%`, background: `linear-gradient(to right, ${color}88, ${color})`, boxShadow: `0 0 8px 0 ${color}66` }}
      />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function AQIForecast({ location }: Props) {
  const [tab, setTab] = useState<"air" | "pollen">("air");
  const { data, isLoading, error } = useQuery({
    queryKey: ["aqi", location.lat.toFixed(3), location.lon.toFixed(3)],
    queryFn: () => fetchAQI(location.lat, location.lon),
    staleTime: 30 * 60 * 1000,
  });

  const hourly = data?.hourly;

  // ── Accurate AQI calculation ────────────────────────────────────────────
  // Use EPA breakpoints computed from raw PM2.5/PM10/Ozone concentrations
  // to avoid the underestimation seen in wildfire smoke events.
  const rawPM25   = hourly?.pm2_5?.[0]             ?? 0;
  const rawPM10   = hourly?.pm10?.[0]              ?? 0;
  const rawOzone  = hourly?.ozone?.[0]             ?? 0;
  const openMeteoAQI = hourly?.us_aqi?.[0]         ?? 0;

  const currentAQI = isLoading ? 0 : computeAccurateAQI(rawPM25, rawPM10, rawOzone, openMeteoAQI);
  const { label: aqiLabel, color: aqiColor, bg: aqiBg, desc: aqiDesc, emoji: aqiEmoji, healthMsg } = aqiCategory(currentAQI);

  const no2  = hourly?.nitrogen_dioxide?.[0] ?? 0;
  const co   = hourly?.carbon_monoxide?.[0]  ?? 0;
  const uv   = hourly?.uv_index?.[0]         ?? 0;
  const dust = hourly?.dust?.[0]             ?? 0;

  // Chart data — use accurate AQI for each hour
  interface AqiChartRow { time: string; aqi: number; pm25: number; pm10: number; ozone: number }
  const chartData: AqiChartRow[] = hourly?.time?.slice(0, 48).map((t: string, i: number): AqiChartRow => {
    const h_pm25  = hourly.pm2_5?.[i]   ?? 0;
    const h_pm10  = hourly.pm10?.[i]    ?? 0;
    const h_ozone = hourly.ozone?.[i]   ?? 0;
    const h_omAQI = hourly.us_aqi?.[i]  ?? 0;
    return {
      time: format(parseISO(t), "EEE ha"),
      aqi:  computeAccurateAQI(h_pm25, h_pm10, h_ozone, h_omAQI),
      pm25: Math.round(h_pm25 * 10) / 10,
      pm10: Math.round(h_pm10 * 10) / 10,
      ozone: Math.round(h_ozone),
    };
  }) ?? [];

  // Daily peak AQI for 5-day outlook
  const dailyData = (() => {
    if (!hourly?.time) return [];
    const byDay: Record<string, number[]> = {};
    hourly.time.forEach((t: string, i: number) => {
      const day = format(parseISO(t), "EEE");
      if (!byDay[day]) byDay[day] = [];
      const h_pm25  = hourly.pm2_5?.[i]   ?? 0;
      const h_pm10  = hourly.pm10?.[i]    ?? 0;
      const h_ozone = hourly.ozone?.[i]   ?? 0;
      const h_omAQI = hourly.us_aqi?.[i]  ?? 0;
      byDay[day].push(computeAccurateAQI(h_pm25, h_pm10, h_ozone, h_omAQI));
    });
    return Object.entries(byDay).slice(0, 5).map(([day, vals]) => ({
      day,
      peak: Math.max(...vals),
      avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
    }));
  })();

  function uvLabel(uv: number): { label: string; color: string } {
    if (uv <= 2)  return { label: "Low",       color: "#6ee7b7" };
    if (uv <= 5)  return { label: "Moderate",  color: "#fde68a" };
    if (uv <= 7)  return { label: "High",      color: "#fdba74" };
    if (uv <= 10) return { label: "Very High", color: "#f87171" };
    return               { label: "Extreme",   color: "#c084fc" };
  }
  const uvInfo = uvLabel(uv);

  // Dominant pollutant detection
  const pm25AQI = pm25ToAQI(rawPM25);
  const pm10AQI = pm10ToAQI(rawPM10);
  const o3AQI   = ozoneToAQI(rawOzone);
  const dominantPollutant =
    pm25AQI >= pm10AQI && pm25AQI >= o3AQI ? "PM2.5" :
    pm10AQI >= pm25AQI && pm10AQI >= o3AQI ? "PM10"  : "Ozone";

  const pollutants = [
    { label: "PM2.5", value: isLoading ? "—" : `${rawPM25.toFixed(1)}`, unit: "μg/m³", aqi: pm25AQI, max: 500, color: aqiCategory(pm25AQI).color, sub: aqiCategory(pm25AQI).label, icon: "🔥" },
    { label: "PM10",  value: isLoading ? "—" : `${rawPM10.toFixed(1)}`, unit: "μg/m³", aqi: pm10AQI, max: 600, color: aqiCategory(pm10AQI).color, sub: aqiCategory(pm10AQI).label, icon: "💨" },
    { label: "Ozone", value: isLoading ? "—" : `${rawOzone.toFixed(0)}`, unit: "μg/m³", aqi: o3AQI,   max: 400, color: aqiCategory(o3AQI).color,   sub: aqiCategory(o3AQI).label,   icon: "☁️" },
    { label: "NO₂",   value: isLoading ? "—" : `${no2.toFixed(1)}`,     unit: "μg/m³", aqi: 0,       max: 200, color: no2 < 40 ? "#6ee7b7" : no2 < 100 ? "#fde68a" : "#f87171", sub: no2 < 40 ? "Low" : "Elevated", icon: "🏭" },
    { label: "CO",    value: isLoading ? "—" : `${(co / 1000).toFixed(1)}`, unit: "mg/m³", aqi: 0, max: 10, color: "#7B8FD9", sub: "Carbon Monoxide", icon: "🚗" },
    { label: "UV Index", value: isLoading ? "—" : uv.toFixed(1), unit: "", aqi: 0, max: 12, color: uvInfo.color, sub: uvInfo.label, icon: "☀️" },
  ];

  return (
    <ModuleShell
      eyebrow="Open-Meteo CAMS · EPA breakpoints"
      title={<>Air Quality &amp; Allergy</>}
      subtitle={`What is in the air over ${location.name}, and how readily it is moving around.`}
      status={
        <LayoutGroup id="aqi-tabs">
          <div className="grid grid-cols-2 gap-1 rounded-xl p-1.5"
               style={{ background: "hsl(var(--muted) / 0.3)", border: "1px solid hsl(var(--border))" }}>
            {([
              { id: "air", label: "Air Quality", icon: Wind },
              { id: "pollen", label: "Pollen & Allergy", icon: Flower2 },
            ] as const).map((t) => {
              const Icon = t.icon;
              const on = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className="relative py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ color: on ? "#17141f" : "hsl(var(--muted-foreground))", zIndex: 1 }}>
                  {on && (
                    <motion.span layoutId="aqi-tab-slab"
                      transition={prefersReducedMotion() ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }}
                      className="absolute inset-0 rounded-lg -z-10"
                      style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)` }} />
                  )}
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      }
    >
      {tab === "pollen" ? (
        <PollenTab lat={location.lat} lon={location.lon} place={location.name} />
      ) : (
      <div className="space-y-6">
      {error ? (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm text-destructive flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Unable to load air quality data. Please try again later.
        </div>
      ) : (
        <>
          {/* ── Hero Gauge Card ─────────────────────────────────────────── */}
          <div className="relative rounded-2xl overflow-hidden border" style={{
            borderColor: aqiColor + "55",
            background: `linear-gradient(135deg, rgba(4,8,20,0.97) 0%, rgba(8,14,34,0.97) 100%)`,
            boxShadow: `0 0 80px -12px ${aqiColor}44, inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}>
            {/* Animated background glow blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute -top-1/2 -left-1/4 w-3/4 h-full rounded-full blur-3xl opacity-20 animate-pulse"
                style={{ background: aqiColor, animationDuration: "4s" }} />
              <div className="absolute -bottom-1/2 -right-1/4 w-3/4 h-full rounded-full blur-3xl opacity-15"
                style={{ background: aqiColor }} />
            </div>

            {/* Top status bar */}
            <div className="relative flex items-center justify-between px-5 pt-4 pb-0">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: aqiColor }} />
                <span className="text-[11px] tracking-[0.25em] uppercase text-white/50">Live Air Quality Index</span>
              </div>
              <div className="text-[11px] tracking-[0.15em] uppercase font-bold px-2.5 py-0.5 rounded-full"
                style={{ background: aqiColor + "22", color: aqiColor, border: `1px solid ${aqiColor}44` }}>
                Dominant: {dominantPollutant}
              </div>
            </div>

            <div className="relative flex flex-col items-center px-5 pb-6">
              {isLoading
                ? <div className="h-[280px] w-[340px] max-w-full mx-auto bg-white/5 rounded-full animate-pulse my-4" />
                : <AQIArcGauge aqi={currentAQI} color={aqiColor} />
              }

              <div className="text-4xl mb-1">{aqiEmoji}</div>
              <div className="text-3xl font-black tracking-tight mb-1" style={{
                color: aqiColor,
                textShadow: `0 0 30px ${aqiColor}88, 0 0 60px ${aqiColor}44`,
              }}>{aqiLabel}</div>
              <p className="text-sm text-white/60 mt-1 max-w-xs text-center">{aqiDesc}</p>

              {/* Health message */}
              <div className="mt-4 flex items-start gap-2.5 max-w-sm text-center rounded-xl px-4 py-3"
                style={{ background: aqiBg, border: `1px solid ${aqiColor}33` }}>
                <span className="text-xs leading-relaxed" style={{ color: aqiColor }}>{healthMsg}</span>
              </div>

              {!isLoading && <AQIScaleBar aqi={currentAQI} color={aqiColor} />}
            </div>

            {/* Accuracy note */}
            <div className="relative border-t border-white/5 px-5 py-3 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-white/30 shrink-0" />
              <span className="text-[11px] text-white/30">
                AQI computed from EPA official breakpoints applied to PM2.5, PM10 &amp; Ozone.
                Dominant: <strong className="text-white/50">{dominantPollutant}</strong> (AQI {Math.max(pm25AQI, pm10AQI, o3AQI)}) vs model us_aqi {openMeteoAQI} — highest is shown.
              </span>
            </div>
          </div>

          {/* ── Pollutant Grid ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {pollutants.map(p => (
              <div key={p.label} className="relative rounded-xl p-3.5 overflow-hidden border transition-all duration-300 hover:scale-[1.02]"
                style={{
                  borderColor: p.color + "33",
                  background: `linear-gradient(135deg, ${p.color}0e 0%, rgba(4,8,20,0.8) 100%)`,
                  boxShadow: `0 4px 24px -8px ${p.color}33`,
                }}>
                {/* Background glow corner */}
                <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-xl opacity-20"
                  style={{ background: p.color, transform: "translate(25%, -25%)" }} />

                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-white/50 uppercase tracking-wider font-semibold">{p.label}</span>
                    <span className="text-sm">{p.icon}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black" style={{ color: p.color, textShadow: `0 0 20px ${p.color}66` }}>{p.value}</span>
                    <span className="text-[10px] text-white/40">{p.unit}</span>
                  </div>
                  <div className="mt-1.5 text-[10px] font-bold tracking-widest uppercase" style={{ color: p.color }}>{p.sub}</div>
                  <PollutantMeter value={typeof p.value === "string" ? 0 : Number(p.value)} max={p.max} color={p.color} />
                </div>
              </div>
            ))}
          </div>

          {/* ── 48-Hour AQI Forecast Chart ─────────────────────────────── */}
          <div className="rounded-2xl overflow-hidden border border-white/5" style={{ background: "rgba(4,8,20,0.8)" }}>
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
              <h3 className="text-sm font-bold tracking-tight text-white/90">48-Hour AQI Forecast</h3>
              <span className="text-[10px] text-white/30 uppercase tracking-wider">EPA-computed from raw PM2.5/PM10</span>
            </div>
            <div className="p-4">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} barCategoryGap="20%">
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} domain={[0, 500]} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number) => [`${v}`, "AQI"]}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Bar dataKey="aqi" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry: AqiChartRow, i: number) => <Cell key={i} fill={aqiCategory(entry.aqi).color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── PM2.5 Trend + Ozone Trend side-by-side ────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl overflow-hidden border border-white/5 p-4" style={{ background: "rgba(4,8,20,0.8)" }}>
              <h3 className="text-sm font-bold mb-3 text-white/90 flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" /> PM2.5 Fine Particles
              </h3>
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="pmGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#fb923c" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#fb923c" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="μg" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} μg/m³`, "PM2.5"]} />
                  <Area type="monotone" dataKey="pm25" stroke="#fb923c" fill="url(#pmGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              {rawPM25 > 35 && (
                <div className="mt-2 text-[11px] text-orange-400/80 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Elevated PM2.5 — possible smoke or dust
                </div>
              )}
            </div>

            <div className="rounded-2xl overflow-hidden border border-white/5 p-4" style={{ background: "rgba(4,8,20,0.8)" }}>
              <h3 className="text-sm font-bold mb-3 text-white/90 flex items-center gap-2">
                <Droplets className="w-4 h-4 text-[#d9b775]" /> Ozone (O₃) Trend
              </h3>
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="o3Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} unit="μg" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} μg/m³`, "Ozone"]} />
                  <Area type="monotone" dataKey="ozone" stroke="#22d3ee" fill="url(#o3Grad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── 5-Day AQI Outlook ─────────────────────────────────────── */}
          {dailyData.length > 0 && (
            <div className="rounded-2xl overflow-hidden border border-white/5" style={{ background: "rgba(4,8,20,0.8)" }}>
              <div className="px-5 pt-4 pb-3 border-b border-white/5">
                <h3 className="text-sm font-bold text-white/90">5-Day AQI Outlook</h3>
              </div>
              <div className="p-4 space-y-2.5">
                {dailyData.map((d) => {
                  const { color, label } = aqiCategory(d.peak);
                  return (
                    <div key={d.day} className="flex items-center gap-3">
                      <div className="w-9 text-xs font-bold text-white/50">{d.day}</div>
                      <div className="flex-1 h-6 bg-white/5 rounded-full overflow-hidden relative">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 flex items-center"
                          style={{ width: `${Math.min(100, (d.peak / AQI_MAX) * 100)}%`, background: `linear-gradient(to right, ${color}55, ${color})`, boxShadow: `0 0 12px -2px ${color}66` }}
                        />
                      </div>
                      <div className="w-8 text-xs font-black text-right" style={{ color }}>{d.peak}</div>
                      <div className="w-24 text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>{label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── AQI Reference Table ─────────────────────────────────────── */}
          <div className="rounded-2xl overflow-hidden border border-white/5" style={{ background: "rgba(4,8,20,0.8)" }}>
            <div className="px-5 pt-4 pb-3 border-b border-white/5 flex items-center gap-2">
              <Info className="w-4 h-4 text-white/40" />
              <h3 className="text-sm font-bold text-white/90">AQI Scale Reference</h3>
            </div>
            <div className="p-4 space-y-2">
              {[
                { range: "0–50",   label: "Good",                      color: "#6ee7b7", action: "No precautions needed. Air quality is satisfactory." },
                { range: "51–100", label: "Moderate",                   color: "#fde68a", action: "Unusually sensitive individuals should consider limiting prolonged outdoor exertion." },
                { range: "101–150",label: "Unhealthy for Sensitive",    color: "#fdba74", action: "Sensitive groups (asthma, elderly, children) should reduce prolonged or heavy exertion." },
                { range: "151–200",label: "Unhealthy",                  color: "#f87171", action: "Everyone should reduce prolonged exertion; sensitive groups should avoid outdoor activity." },
                { range: "201–300",label: "Very Unhealthy",             color: "#c084fc", action: "Everyone should avoid all outdoor physical activity." },
                { range: "301+",   label: "Hazardous",                  color: "#fb7185", action: "Health emergency. Everyone should remain indoors and keep windows closed." },
              ].map(r => (
                <div key={r.range} className="flex items-start gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
                  <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} />
                  <div className="w-16 text-xs font-bold shrink-0" style={{ color: r.color }}>{r.range}</div>
                  <div className="text-xs leading-relaxed">
                    <span className="font-semibold text-white/80">{r.label}</span>
                    <span className="text-white/40 ml-2">{r.action}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Data Source Note ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-white/5 p-3.5 flex items-start gap-3" style={{ background: "rgba(4,8,20,0.7)" }}>
            <Info className="w-4 h-4 text-white/30 shrink-0 mt-0.5" />
            <div className="text-[11px] text-white/40 leading-relaxed">
              <strong className="text-white/60">Accuracy Note:</strong> This forecast uses EPA's official PM2.5, PM10, and Ozone breakpoint formulas applied to forecast model concentrations from Open-Meteo (CAMS data). During wildfire smoke events, model concentrations may still be lower than real-time station readings — for the most accurate current conditions, check{" "}
              <a href="https://www.airnow.gov/" target="_blank" rel="noopener noreferrer" className="underline text-white/60 hover:text-white/80">AirNow.gov</a>.
            </div>
          </div>

          <a href="https://www.airnow.gov/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-xl p-3.5 border border-white/5 hover:border-white/10 transition-colors"
            style={{ background: "rgba(4,8,20,0.7)" }}>
            <ExternalLink className="w-4 h-4 text-[#d9b775] shrink-0" />
            <div>
              <div className="text-sm font-semibold text-white/80">AirNow.gov</div>
              <div className="text-xs text-white/40">Official EPA air quality data from monitoring stations</div>
            </div>
          </a>
        </>
      )}
      </div>
      )}
    </ModuleShell>
  );
}
