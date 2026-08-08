import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useMemo } from "react";
import { fetchAllUSAlerts } from "../utils/weatherApi";
import { computeComponents, scoreLabel, type AlertItem } from "../lib/sswxcon";
import { computeSRHFromProfile, compute06kmShear } from "../utils/weatherCalc";
import type { Location } from "../hooks/useLocation";
import {
  Wind, Droplets, Gauge, Eye, Cloud, Activity, Moon, Bug, Flame, Timer,
  ChevronRight, Loader2,
} from "lucide-react";

/**
 * Animated dashboard mini-widgets.
 *
 * Every widget is driven by data the dashboard already fetches (Open-Meteo
 * current + hourly), except AQI and SSWXCon which each add one cheap request.
 * Animation is CSS/SVG only and is disabled wholesale under
 * prefers-reduced-motion via the shared stylesheet at the bottom.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Wx = any;

function Shell({ to, title, icon: Icon, accent, children, foot }: {
  to?: string; title: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string; children: React.ReactNode; foot?: string;
}) {
  const body = (
    <div className="relative h-full bg-card border border-border rounded-2xl p-3 overflow-hidden group transition-colors hover:border-primary/35">
      <span className="absolute inset-x-0 top-0 h-px opacity-70"
        style={{ background: `linear-gradient(90deg,transparent,${accent},transparent)` }} />
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
        <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground">{title}</span>
        {to && <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground/50 group-hover:text-primary transition-colors" />}
      </div>
      {children}
      {foot && <div className="text-[10px] text-muted-foreground mt-1.5 truncate">{foot}</div>}
    </div>
  );
  return to ? <Link href={to} className="block h-full">{body}</Link> : body;
}

/** Circular progress ring used by several widgets. */
function Ring({ pct, color, label, sub, size = 74 }: {
  pct: number; color: string; label: string; sub?: string; size?: number;
}) {
  const r = 30, C = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg viewBox="0 0 74 74" className="w-full h-full -rotate-90">
        <circle cx="37" cy="37" r={r} fill="none" stroke="rgba(148,163,184,.16)" strokeWidth="7" />
        <circle cx="37" cy="37" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * C} ${C}`} className="sswx-w-ring" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-black tabular-nums leading-none" style={{ color }}>{label}</span>
        {sub && <span className="text-[8px] text-muted-foreground mt-0.5">{sub}</span>}
      </div>
    </div>
  );
}

// ── Cloud cover ─────────────────────────────────────────────────────────────
export function CloudCoverWidget({ wx }: { wx: Wx }) {
  const pct = Math.round(wx?.current?.cloud_cover ?? 0);
  const desc = pct >= 88 ? "Overcast" : pct >= 63 ? "Mostly cloudy" : pct >= 38 ? "Partly cloudy" : pct >= 13 ? "Mostly clear" : "Clear";
  return (
    <Shell title="Cloud cover" icon={Cloud} accent="#94a3b8" foot={desc}>
      <div className="relative h-[74px] rounded-xl overflow-hidden bg-gradient-to-b from-sky-900/40 to-slate-900/60">
        {/* three drifting cloud bands whose opacity tracks actual cover */}
        {[0, 1, 2].map((i) => (
          <span key={i} className={`sswx-w-cloud sswx-w-cloud-${i}`}
            style={{ opacity: Math.min(1, (pct / 100) * (1.15 - i * 0.22)) }} />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-black tabular-nums drop-shadow">{pct}<span className="text-sm">%</span></span>
        </div>
      </div>
    </Shell>
  );
}

// ── Visibility ──────────────────────────────────────────────────────────────
export function VisibilityWidget({ wx }: { wx: Wx }) {
  const m = wx?.current?.visibility ?? null;
  const mi = m === null ? null : m / 1609.34;
  // 10 mi is the standard "unrestricted" ceiling in US observations.
  const pct = mi === null ? 0 : Math.min(100, (mi / 10) * 100);
  const label = mi === null ? "—" : mi >= 10 ? "10+" : mi.toFixed(1);
  const desc = mi === null ? "unavailable" : mi >= 10 ? "Unrestricted" : mi >= 3 ? "Slight haze" : mi >= 1 ? "Reduced — fog or precip" : "Very poor";
  return (
    <Shell title="Visibility" icon={Eye} accent="#38bdf8" foot={desc}>
      <Ring pct={pct} color="#38bdf8" label={label} sub="miles" />
    </Shell>
  );
}

// ── Humidity / pressure / dew point ────────────────────────────────────────
export function HumidityPressureWidget({ wx }: { wx: Wx }) {
  const c = wx?.current ?? {};
  const rh = Math.round(c.relative_humidity_2m ?? 0);
  const dpC = c.dew_point_2m ?? null;
  const dpF = dpC === null ? null : Math.round(dpC * 9 / 5 + 32);
  const hPa = c.surface_pressure ?? null;
  const inHg = hPa === null ? null : (hPa * 0.02953).toFixed(2);
  // Dew point is the honest comfort signal — 65F+ is where most people start
  // calling the air "sticky".
  const mug = dpF === null ? "" : dpF >= 75 ? "Oppressive" : dpF >= 70 ? "Muggy" : dpF >= 65 ? "Humid" : dpF >= 55 ? "Comfortable" : "Dry";
  return (
    <Shell title="Humidity · Pressure · Dew" icon={Droplets} accent="#22d3ee" foot={mug}>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { v: `${rh}%`, k: "Humidity" },
          { v: dpF === null ? "—" : `${dpF}°`, k: "Dew pt" },
          { v: inHg ?? "—", k: "Pressure" },
        ].map((x) => (
          <div key={x.k} className="rounded-lg bg-muted/25 py-2 text-center">
            <div className="text-base font-black tabular-nums leading-none">{x.v}</div>
            <div className="text-[8px] uppercase tracking-wider text-muted-foreground mt-1">{x.k}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted/30 overflow-hidden">
        <span className="block h-full rounded-full sswx-w-grow"
          style={{ width: `${rh}%`, background: "linear-gradient(90deg,#0ea5e9,#22d3ee)" }} />
      </div>
    </Shell>
  );
}

// ── AQI ─────────────────────────────────────────────────────────────────────
const AQI_BANDS: { max: number; label: string; color: string }[] = [
  { max: 50, label: "Good", color: "#4ade80" },
  { max: 100, label: "Moderate", color: "#facc15" },
  { max: 150, label: "Unhealthy (sensitive)", color: "#fb923c" },
  { max: 200, label: "Unhealthy", color: "#ef4444" },
  { max: 300, label: "Very unhealthy", color: "#a855f7" },
  { max: 9999, label: "Hazardous", color: "#7f1d1d" },
];
const aqiBand = (v: number) => AQI_BANDS.find((b) => v <= b.max) ?? AQI_BANDS[AQI_BANDS.length - 1];

export function AqiWidget({ location }: { location: Location }) {
  const q = useQuery({
    queryKey: ["aqi-mini", location.lat.toFixed(2), location.lon.toFixed(2)],
    queryFn: async () => {
      const u = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
      u.searchParams.set("latitude", location.lat.toFixed(4));
      u.searchParams.set("longitude", location.lon.toFixed(4));
      u.searchParams.set("hourly", "us_aqi");
      u.searchParams.set("forecast_days", "1");
      const r = await fetch(u.toString());
      if (!r.ok) throw new Error("aqi");
      const d = await r.json();
      return Math.round(d?.hourly?.us_aqi?.[0] ?? 0);
    },
    staleTime: 30 * 60_000,
  });
  const v = q.data ?? 0;
  const band = aqiBand(v);
  return (
    <Shell to="/aqi" title="Air quality" icon={Flame} accent={band.color} foot={q.isLoading ? "loading…" : band.label}>
      {q.isLoading
        ? <div className="h-[74px] grid place-items-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        : <Ring pct={Math.min(100, (v / 300) * 100)} color={band.color} label={String(v)} sub="US AQI" />}
    </Shell>
  );
}

// ── SSWXCon ─────────────────────────────────────────────────────────────────
export function SswxconWidget({ wx }: { wx: Wx }) {
  const alerts = useQuery({
    queryKey: ["all-us-alerts"],           // shared cache key with the SSWXCon page
    queryFn: fetchAllUSAlerts,
    staleTime: 2 * 60_000,
  });
  const h = wx?.hourly;
  const score = useMemo(() => {
    if (!alerts.data) return null;
    const cape = h?.cape?.[0] ?? 0;
    const li = h?.lifted_index?.[0] ?? 0;
    const srh = computeSRHFromProfile(
      h?.wind_speed_10m?.[0] ?? 0, h?.wind_direction_10m?.[0] ?? 0,
      h?.wind_speed_925hPa?.[0] ?? 0, h?.wind_direction_925hPa?.[0] ?? 0,
      h?.wind_speed_850hPa?.[0] ?? 0, h?.wind_direction_850hPa?.[0] ?? 0,
      h?.wind_speed_700hPa?.[0] ?? 0, h?.wind_direction_700hPa?.[0] ?? 0,
      h?.wind_speed_500hPa?.[0] ?? 0, h?.wind_direction_500hPa?.[0] ?? 0);
    const shear = compute06kmShear(
      h?.wind_speed_10m?.[0] ?? 0, h?.wind_direction_10m?.[0] ?? 0,
      h?.wind_speed_500hPa?.[0] ?? 0, h?.wind_direction_500hPa?.[0] ?? 0);
    return computeComponents(alerts.data as AlertItem[], cape, srh, shear, li).total;
  }, [alerts.data, h]);

  const lab = score === null ? null : scoreLabel(score);
  return (
    <Shell to="/sswxcon" title="SSWXCon score" icon={Activity} accent={lab?.color ?? "#7B8FD9"}
      foot={lab ? lab.text : "loading…"}>
      {score === null
        ? <div className="h-[74px] grid place-items-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        : <Ring pct={Math.min(100, (score / 250) * 100)} color={lab!.color} label={String(Math.round(score))} sub="national" />}
    </Shell>
  );
}

// ── Atmospheric ingredients ────────────────────────────────────────────────
export function IngredientsWidget({ wx }: { wx: Wx }) {
  const h = wx?.hourly;
  const cape = Math.round(h?.cape?.[0] ?? 0);
  const li = Math.round((h?.lifted_index?.[0] ?? 0) * 10) / 10;
  const shear = Math.round(compute06kmShear(
    h?.wind_speed_10m?.[0] ?? 0, h?.wind_direction_10m?.[0] ?? 0,
    h?.wind_speed_500hPa?.[0] ?? 0, h?.wind_direction_500hPa?.[0] ?? 0));
  const verdict = cape >= 2500 && shear >= 35 ? "Volatile"
    : cape >= 1000 && shear >= 30 ? "Organised storms possible"
    : cape >= 1000 ? "Instability, weak shear"
    : cape >= 300 ? "Marginal" : "Stable";
  const bars = [
    { k: "CAPE", v: cape, max: 4000, unit: "J/kg", color: "#f97316" },
    { k: "Shear", v: shear, max: 60, unit: "kt", color: "#38bdf8" },
    { k: "LI", v: Math.abs(Math.min(0, li)), max: 10, unit: "°C", color: "#a78bfa" },
  ];
  return (
    <Shell to="/ingredients" title="Storm ingredients" icon={Gauge} accent="#f97316" foot={verdict}>
      <div className="space-y-1.5">
        {bars.map((b) => (
          <div key={b.k}>
            <div className="flex justify-between text-[9px] mb-0.5">
              <span className="text-muted-foreground uppercase tracking-wider font-bold">{b.k}</span>
              <span className="tabular-nums font-bold">{b.k === "LI" ? li : b.v}<span className="text-muted-foreground ml-0.5">{b.unit}</span></span>
            </div>
            <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
              <span className="block h-full rounded-full sswx-w-grow"
                style={{ width: `${Math.min(100, (b.v / b.max) * 100)}%`, background: b.color }} />
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

// ── Storm timing ────────────────────────────────────────────────────────────
export function TimingWidget({ wx }: { wx: Wx }) {
  const h = wx?.hourly;
  const times: string[] = h?.time ?? [];
  const cape: number[] = h?.cape ?? [];
  const pop: number[] = h?.precipitation_probability ?? [];

  // Rank the next 24 h by a simple instability x precip-chance product; the peak
  // hour is the honest "when is it most likely" answer without pretending to be
  // a convective forecast.
  const next = times.slice(0, 24).map((t, i) => ({
    t, score: (cape[i] ?? 0) / 1000 * (pop[i] ?? 0),
    pop: pop[i] ?? 0, cape: cape[i] ?? 0,
  }));
  const peak = next.reduce((b, x) => (x.score > b.score ? x : b), next[0] ?? { t: "", score: 0, pop: 0, cape: 0 });
  const hour = peak?.t ? new Date(peak.t).toLocaleTimeString("en-US", { hour: "numeric" }) : "—";
  const quiet = !peak || peak.score < 2;

  return (
    <Shell to="/timing" title="Storm timing" icon={Timer} accent="#eab308"
      foot={quiet ? "No convective window in 24 h" : `${Math.round(peak.pop)}% precip · ${Math.round(peak.cape)} J/kg`}>
      <div className="flex items-end gap-[2px] h-[52px]">
        {next.map((x, i) => {
          const hgt = Math.max(6, Math.min(100, x.score * 8));
          const isPeak = !quiet && x.t === peak.t;
          return (
            <span key={i} className="flex-1 rounded-t-sm sswx-w-bar"
              style={{
                height: `${hgt}%`,
                background: isPeak ? "#eab308" : "rgba(234,179,8,0.28)",
                animationDelay: `${i * 18}ms`,
              }} />
          );
        })}
      </div>
      <div className="text-center mt-1">
        <span className="text-sm font-black">{quiet ? "Quiet" : `Peak ~${hour}`}</span>
      </div>
    </Shell>
  );
}

// ── Moon ────────────────────────────────────────────────────────────────────
const SYNODIC = 29.53058867;
function moonAge(d: Date): number {
  // Reference new moon 2000-01-06 18:14 UTC.
  const days = (d.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC;
}
function moonName(age: number): string {
  if (age < 1.85) return "New Moon";
  if (age < 5.53) return "Waxing Crescent";
  if (age < 9.22) return "First Quarter";
  if (age < 12.91) return "Waxing Gibbous";
  if (age < 16.61) return "Full Moon";
  if (age < 20.30) return "Waning Gibbous";
  if (age < 23.99) return "Last Quarter";
  if (age < 27.68) return "Waning Crescent";
  return "New Moon";
}
export function MoonWidget() {
  const age = moonAge(new Date());
  const illum = Math.round((1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2 * 100);
  const waxing = age < SYNODIC / 2;
  // Terminator drawn as an ellipse whose x-radius tracks illumination, which is
  // the actual geometry rather than a cropped circle.
  const k = Math.abs(1 - illum / 50);
  return (
    <Shell to="/moon" title="Moon" icon={Moon} accent="#cbd5e1" foot={`${illum}% illuminated`}>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 100 100" className="w-[62px] h-[62px] shrink-0">
          <defs>
            <radialGradient id="sswx-moon" cx="38%" cy="34%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="42" fill="#0b1020" stroke="rgba(203,213,225,.25)" strokeWidth="1.5" />
          <g className="sswx-w-moon">
            {illum > 2 && (
              <>
                <path d={`M50 8 A42 42 0 0 ${waxing ? 1 : 0} 50 92 Z`} fill="url(#sswx-moon)" />
                <ellipse cx="50" cy="50" rx={42 * k} ry="42"
                  fill={illum > 50 ? "url(#sswx-moon)" : "#0b1020"} />
              </>
            )}
          </g>
        </svg>
        <div className="min-w-0">
          <div className="text-sm font-black truncate">{moonName(age)}</div>
          <div className="text-[10px] text-muted-foreground">Day {Math.floor(age)} of {Math.round(SYNODIC)}</div>
        </div>
      </div>
    </Shell>
  );
}

// ── Mosquito ────────────────────────────────────────────────────────────────
export function MosquitoWidget({ wx }: { wx: Wx }) {
  const c = wx?.current ?? {};
  const tempC = c.temperature_2m ?? 0;
  const rh = c.relative_humidity_2m ?? 0;
  const precip = c.precipitation ?? 0;
  const windMph = (c.wind_speed_10m ?? 0) * 2.23694;
  // Mosquitoes need warmth + moisture and are grounded by wind.
  let s = 0;
  if (tempC >= 15 && tempC <= 32) s += 45 * (1 - Math.abs(24 - tempC) / 12);
  else if (tempC > 32) s += 15;
  s += Math.max(0, (rh - 40) / 60) * 35;
  s += Math.min(12, precip * 25);
  s -= Math.min(30, Math.max(0, windMph - 6) * 2.2);
  const score = Math.max(0, Math.min(100, Math.round(s)));
  const band = score >= 75 ? { t: "Swarming", c: "#ef4444" }
    : score >= 50 ? { t: "Active", c: "#f97316" }
    : score >= 25 ? { t: "Moderate", c: "#facc15" }
    : { t: "Low", c: "#4ade80" };
  return (
    <Shell to="/mosquito" title="Mosquito index" icon={Bug} accent={band.c} foot={band.t}>
      <Ring pct={score} color={band.c} label={String(score)} sub="/ 100" />
    </Shell>
  );
}

// ── Current wind (compact) ─────────────────────────────────────────────────
export function WindWidget({ wx }: { wx: Wx }) {
  const c = wx?.current ?? {};
  const mph = Math.round((c.wind_speed_10m ?? 0) * 2.23694);
  const gust = Math.round((c.wind_gusts_10m ?? 0) * 2.23694);
  const deg = c.wind_direction_10m ?? 0;
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const dir = dirs[Math.round(deg / 22.5) % 16];
  return (
    <Shell title="Current wind" icon={Wind} accent="#60a5fa" foot={`Gusting ${gust} mph`}>
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 100 100" className="w-[62px] h-[62px] shrink-0">
          <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(148,163,184,.2)" strokeWidth="2" />
          {["N", "E", "S", "W"].map((l, i) => {
            const a = ((i * 90 - 90) * Math.PI) / 180;
            return (
              <text key={l} x={50 + Math.cos(a) * 32} y={50 + Math.sin(a) * 32 + 3}
                textAnchor="middle" fontSize="9" fill="#64748b">{l}</text>
            );
          })}
          <g transform={`rotate(${deg} 50 50)`} className="sswx-w-vane">
            <path d="M50 16 L57 52 L50 46 L43 52 Z" fill="#60a5fa" />
          </g>
          <circle cx="50" cy="50" r="3" fill="#60a5fa" />
        </svg>
        <div className="min-w-0">
          <div className="text-xl font-black tabular-nums leading-none">{mph}<span className="text-xs font-bold ml-1">mph</span></div>
          <div className="text-[10px] text-muted-foreground mt-1">From the {dir}</div>
        </div>
      </div>
    </Shell>
  );
}

export const WIDGET_CSS = `
.sswx-w-ring{animation:sswx-w-sweep 1.1s cubic-bezier(.16,1,.3,1) both}
@keyframes sswx-w-sweep{from{stroke-dasharray:0 999}}
.sswx-w-grow{animation:sswx-w-wide .9s cubic-bezier(.16,1,.3,1) both;transform-origin:left}
@keyframes sswx-w-wide{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.sswx-w-bar{animation:sswx-w-up .5s cubic-bezier(.2,1,.3,1) both;transform-origin:bottom}
@keyframes sswx-w-up{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.sswx-w-vane{transition:transform .8s cubic-bezier(.22,1,.36,1);transform-origin:50px 50px}
.sswx-w-moon{animation:sswx-w-fade .8s ease-out both}
@keyframes sswx-w-fade{from{opacity:0}to{opacity:1}}
.sswx-w-cloud{position:absolute;height:36%;width:70%;border-radius:9999px;
  background:radial-gradient(closest-side,rgba(226,232,240,.85),rgba(226,232,240,0));
  animation:sswx-w-drift linear infinite}
.sswx-w-cloud-0{top:14%;animation-duration:19s}
.sswx-w-cloud-1{top:38%;animation-duration:26s;animation-delay:-6s}
.sswx-w-cloud-2{top:58%;animation-duration:33s;animation-delay:-13s}
@keyframes sswx-w-drift{from{left:-70%}to{left:110%}}
@media (prefers-reduced-motion:reduce){
  .sswx-w-ring,.sswx-w-grow,.sswx-w-bar,.sswx-w-moon,.sswx-w-cloud{animation:none!important;transform:none!important}
  .sswx-w-vane{transition:none}
  .sswx-w-cloud{left:20%}
}
`;
