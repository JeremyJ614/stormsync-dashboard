import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOpenMeteo } from "../hooks/useWeatherQuery";
import { fetchAllUSAlerts } from "../utils/weatherApi";
import { useDailyBrief } from "../hooks/useDailyBrief";
import type { Location } from "../hooks/useLocation";
import { Activity, Info, RefreshCw, Sparkles } from "lucide-react";
import { computeSRHFromProfile, compute06kmShear, computeSWTI } from "../utils/weatherCalc";
import { format } from "date-fns";

interface Props { location: Location }

const ACTIVATION_THRESHOLD = 107.5;
const GAUGE_MAX = 250;

type AlertItem = { event?: string; properties?: { event?: string } };

function computeComponents(alerts: AlertItem[], cape: number, srh: number, shear: number, li: number) {
  const events = alerts.map((a: AlertItem) => (a.event || a.properties?.event || "").toLowerCase());

  const tornadoWarnings = events.filter(e => e.includes("tornado warning")).length;
  const svrThunderstorm = events.filter(e => e.includes("severe thunderstorm warning")).length;
  const floodFlash = events.filter(e => e.includes("flash flood warning")).length;
  const floodRiver = events.filter(e => e.includes("flood warning") && !e.includes("flash")).length;
  const tropical = events.filter(e => e.includes("tropical") || e.includes("hurricane")).length;
  const winterBlizzard = events.filter(e => e.includes("blizzard")).length;
  const winterStorm = events.filter(e => e.includes("winter storm") || e.includes("ice storm")).length;
  const fireredflag = events.filter(e => e.includes("red flag")).length;

  const r1 = (v: number) => Math.round(v * 10) / 10;
  // National-scale weights. These are counts across the WHOLE U.S., so every
  // bucket is capped — routine background warnings (river flooding, red-flag,
  // winter advisories) can't dominate, and the rare/dangerous convective and
  // tropical warnings drive the score. A genuine outbreak is the only way to
  // reach the top bands.
  const tornadoScore  = r1(Math.min(120, tornadoWarnings * 4));          // dominant signal
  const svrScore      = r1(Math.min(70,  svrThunderstorm * 1));
  const floodScore    = r1(Math.min(40,  floodFlash * 1 + floodRiver * 0.25)); // flash >> river
  const tropicalScore = r1(Math.min(90,  tropical * 6));
  const winterScore   = r1(Math.min(40,  winterBlizzard * 4 + winterStorm * 0.5));
  const fireScore     = r1(Math.min(15,  fireredflag * 0.5));

  const atmoScore = r1(Math.min(12,
    (cape > 0 ? Math.min(3, cape / 1000) : 0) +
    (srh > 0 ? Math.min(3, srh / 150) : 0) +
    (shear > 0 ? Math.min(3, shear / 25) : 0) +
    (li < 0 ? Math.min(3, Math.abs(li) / 3) : 0)
  ));

  const total = r1(tornadoScore + svrScore + floodScore + tropicalScore + winterScore + fireScore + atmoScore);

  return {
    tornadoWarnings, svrThunderstorm, floodFlash, floodRiver, tropical,
    winterBlizzard, winterStorm, fireredflag,
    components: [
      { label: "TORNADO WARNINGS", score: tornadoScore, multiplier: "×4", desc: `${tornadoWarnings} active nationwide` },
      { label: "SEVERE THUNDERSTORM", score: svrScore, multiplier: "×1", desc: `${svrThunderstorm} active nationwide` },
      { label: "FLOOD THREAT", score: floodScore, multiplier: "flash×1", desc: `${floodFlash} flash · ${floodRiver} river` },
      { label: "TROPICAL SYSTEMS", score: tropicalScore, multiplier: "×6", desc: `${tropical} tropical/hurricane` },
      { label: "WINTER WEATHER", score: winterScore, multiplier: "blz×4", desc: `${winterBlizzard} blizzard · ${winterStorm} storm` },
      { label: "FIRE WEATHER", score: fireScore, multiplier: "×0.5", desc: `${fireredflag} red flag warnings` },
      { label: "LOCAL INSTABILITY", score: atmoScore, multiplier: "max 12", desc: "Your area: CAPE / SRH / Shear / LI" },
    ],
    total,
  };
}

function scoreLabel(score: number): { text: string; color: string; bgColor: string } {
  if (score >= 250) return { text: "HISTORIC", color: "#ff0000", bgColor: "#4a0000" };
  if (score >= 150) return { text: "EXTREME", color: "#ff3333", bgColor: "#3d0000" };
  if (score >= 120) return { text: "MAJOR EVENT", color: "#e03030", bgColor: "#3a0a0a" };
  if (score >= 90)  return { text: "SEVERE OUTBREAK", color: "#cc2222", bgColor: "#350505" };
  if (score >= 70)  return { text: "SIGNIFICANT", color: "#ef4444", bgColor: "#2d0000" };
  if (score >= 50)  return { text: "ELEVATED", color: "#f97316", bgColor: "#2a1000" };
  if (score >= 30)  return { text: "NOTABLE", color: "#fbbf24", bgColor: "#1a1000" };
  return { text: "QUIET / LOW", color: "#4ade80", bgColor: "#001a06" };
}

const SCALE_RANGES = [
  { range: "0–30", label: "Quiet / Low", color: "#4ade80" },
  { range: "30–50", label: "Notable Activity", color: "#fbbf24" },
  { range: "50–70", label: "Elevated", color: "#f97316" },
  { range: "70–90", label: "Significant", color: "#ef4444" },
  { range: "90–120", label: "Severe Outbreak", color: "#cc2222" },
  { range: "120–150", label: "Major Event", color: "#b91c1c" },
  { range: "150–250", label: "Extreme", color: "#991b1b" },
  { range: "250+", label: "Historic", color: "#ff0000" },
];

function ArcGauge({ score, color }: { score: number; color: string }) {
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
    const pct = Math.min(1, score / GAUGE_MAX);
    const fillAngle = startAngle + totalArc * pct;

    ctx.clearRect(0, 0, W, H);

    // Outer ambient glow ring
    const ambient = ctx.createRadialGradient(cx, cy, R * 0.4, cx, cy, R * 1.6);
    ambient.addColorStop(0, color + "22");
    ambient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, W, H);

    // Outer thin ring
    ctx.beginPath();
    ctx.arc(cx, cy, R + 16, startAngle, endAngle);
    ctx.strokeStyle = "rgba(148,163,184,0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Tick marks around arc (major every 10%, minor every 5%)
    for (let i = 0; i <= 20; i++) {
      const a = startAngle + (totalArc * i) / 20;
      const isMajor = i % 2 === 0;
      const inner = R - (isMajor ? 16 : 10);
      const outer = R - 22;
      const x1 = cx + outer * Math.cos(a);
      const y1 = cy + outer * Math.sin(a);
      const x2 = cx + inner * Math.cos(a);
      const y2 = cy + inner * Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = isMajor ? "rgba(203,213,225,0.45)" : "rgba(148,163,184,0.25)";
      ctx.lineWidth = isMajor ? 1.5 : 1;
      ctx.stroke();
    }

    const segColors = [
      { from: 0, to: 30 / GAUGE_MAX, color: "#4ade80" },
      { from: 30 / GAUGE_MAX, to: 50 / GAUGE_MAX, color: "#fbbf24" },
      { from: 50 / GAUGE_MAX, to: 70 / GAUGE_MAX, color: "#f97316" },
      { from: 70 / GAUGE_MAX, to: 90 / GAUGE_MAX, color: "#ef4444" },
      { from: 90 / GAUGE_MAX, to: 120 / GAUGE_MAX, color: "#cc2222" },
      { from: 120 / GAUGE_MAX, to: 150 / GAUGE_MAX, color: "#b91c1c" },
      { from: 150 / GAUGE_MAX, to: 1, color: "#991b1b" },
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
      const sA = startAngle + totalArc * seg.from;
      const eA = startAngle + totalArc * seg.to;
      ctx.beginPath();
      ctx.arc(cx, cy, R, sA, eA);
      ctx.strokeStyle = seg.color + "33";
      ctx.lineWidth = 22;
      ctx.lineCap = "butt";
      ctx.stroke();
    });

    // Active fill — triple-layer dramatic glow
    if (pct > 0) {
      // Wide outer glow
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, startAngle, fillAngle);
      ctx.strokeStyle = color + "55";
      ctx.lineWidth = 34;
      ctx.lineCap = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 28;
      ctx.stroke();
      ctx.restore();

      // Mid glow
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, startAngle, fillAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = 22;
      ctx.lineCap = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.restore();

      // Inner bright core
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
    const needleAngle = fillAngle;
    const nxOuter = cx + (R + 14) * Math.cos(needleAngle);
    const nyOuter = cy + (R + 14) * Math.sin(needleAngle);
    const nxInner = cx + (R - 14) * Math.cos(needleAngle);
    const nyInner = cy + (R - 14) * Math.sin(needleAngle);
    ctx.save();
    ctx.shadowColor = "#fde047";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(nxOuter, nyOuter);
    ctx.lineTo(nxInner, nyInner);
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(nxOuter, nyOuter, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fef9c3";
    ctx.fill();
    ctx.restore();

    // Inner dark dial face with gradient
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

    // Score number — multi-pass glow for cinematic feel
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold 54px ui-monospace, monospace`;
    // outer halo
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    ctx.fillStyle = color;
    ctx.fillText(score.toFixed(1), cx, cy - 6);
    // sharper core
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(score.toFixed(1), cx, cy - 6);
    ctx.restore();

    // Label inside dial
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(148,163,184,0.85)";
    ctx.font = `600 10px ui-sans-serif, system-ui`;
    ctx.fillText("SSWX SCORE", cx, cy + 24);
    ctx.fillStyle = color;
    ctx.font = `700 9px ui-sans-serif, system-ui`;
    ctx.fillText(`${Math.round(pct * 100)}% OF MAX`, cx, cy + 38);
    ctx.restore();

    // End-of-scale labels
    ctx.save();
    ctx.fillStyle = "rgba(148,163,184,0.7)";
    ctx.font = `600 10px ui-sans-serif, system-ui`;
    ctx.textBaseline = "middle";
    const lx1 = cx + (R + 28) * Math.cos(startAngle);
    const ly1 = cy + (R + 28) * Math.sin(startAngle);
    const lx2 = cx + (R + 28) * Math.cos(endAngle);
    const ly2 = cy + (R + 28) * Math.sin(endAngle);
    ctx.textAlign = "right";
    ctx.fillText("0", lx1, ly1);
    ctx.textAlign = "left";
    ctx.fillText(String(GAUGE_MAX), lx2, ly2);
    ctx.restore();
  }, [score, color]);

  return (
    <div className="flex items-center justify-center relative">
      <div
        className="absolute inset-0 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ background: `radial-gradient(circle at center, ${color}, transparent 60%)` }}
      />
      <canvas
        ref={canvasRef}
        style={{ width: 320, height: 260 }}
        className="relative w-full max-w-[320px]"
      />
    </div>
  );
}

function ComponentBar({ score, max }: { score: number; max: number }) {
  const pct = Math.min(100, (score / Math.max(max, 1)) * 100);
  const color = score <= 0 ? "#374151" : score > 20 ? "#3b82f6" : score > 10 ? "#f97316" : "#fbbf24";
  return (
    <div className="w-full bg-muted/30 rounded-full h-1.5">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

type TabType = "components" | "breakdown" | "scale";

export default function SSWXCon({ location }: Props) {
  const { data: weather, isLoading: wxLoading, refetch: refetchWx } = useOpenMeteo(location);
  // SSWXCon is a NATIONAL "DEFCON for storms" score — it must aggregate every
  // active NWS warning across the U.S., not just the user's point (otherwise it
  // reads ~0 whenever no warning is firing on their exact location).
  const { data: alerts = [], isLoading: alertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ["all-us-alerts"],
    queryFn: fetchAllUSAlerts,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
  const { data: brief } = useDailyBrief();
  const [activeTab, setActiveTab] = useState<TabType>("components");
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const isLoading = wxLoading || alertsLoading;

  const hourly = weather?.hourly;
  const cape = hourly?.cape?.[0] ?? 0;
  const li = hourly?.lifted_index?.[0] ?? 0;
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
  const srh = !isLoading && hourly ? computeSRHFromProfile(ws10, wd10, ws925, wd925, ws850, wd850, ws700, wd700, ws500, wd500) : 0;
  const shear = !isLoading && hourly ? compute06kmShear(ws10, wd10, ws500, wd500) : 0;

  const { components, total, tornadoWarnings, svrThunderstorm } = computeComponents(alerts as AlertItem[], cape, srh, shear, li);
  const { text: levelText, color: levelColor, bgColor: levelBg } = scoreLabel(total);
  const saturation = Math.round((total / ACTIVATION_THRESHOLD) * 100);
  const swti = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: hourly?.dew_point_2m?.[0] ?? 10 });

  const refresh = () => {
    refetchWx();
    refetchAlerts();
    setLastUpdated(new Date());
  };

  useEffect(() => {
    const interval = setInterval(() => {
      refresh();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const alertTypeBreakdown = [
    { label: "Tornado Warnings", count: tornadoWarnings, color: "#ef4444" },
    { label: "SVR Thunderstorm", count: svrThunderstorm, color: "#f97316" },
    { label: "Total Active Alerts", count: alerts.length, color: "#7B8FD9" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold tracking-wide uppercase">SSWXCon Score</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Real-time <span className="text-foreground/80 font-medium">nationwide</span> Severe & Significant Weather Conditions intensity score</p>
        </div>
        <button onClick={refresh}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      {brief?.headline && (
        <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-xl px-3 py-2">
          <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
          <div className="text-xs">
            <span className="font-semibold text-primary">National picture: </span>
            <span className="text-foreground/90">{brief.headline}</span>
            {brief.content.risk_overview?.day1_category_name && (
              <span className="text-muted-foreground"> · SPC Day 1: {brief.content.risk_overview.day1_category_name}</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 bg-muted/20 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <span>The SSWXCon Score is a situational awareness tool. It is <strong className="text-foreground">not</strong> an official NWS product. Always follow official NWS guidance. A low score does not mean your area is safe.</span>
      </div>

      <div className="bg-card border rounded-xl p-4" style={{ borderColor: levelColor + "50" }}>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground">Loading...</div>
        ) : (
          <>
            <ArcGauge score={total} color={levelColor} />
            <div className="text-center mt-2 mb-4">
              <div className="inline-block px-6 py-1.5 rounded font-bold text-lg tracking-widest uppercase"
                style={{ color: levelColor, backgroundColor: levelBg, border: `1px solid ${levelColor}40` }}>
                {levelText}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center mb-4">
              {[
                { label: "CURRENT SCORE", value: total.toFixed(1), color: levelColor },
                { label: "SATURATION", value: `${saturation}%`, color: "#fbbf24" },
                { label: "ACTIVATION THRESHOLD", value: ACTIVATION_THRESHOLD.toString(), color: "#7B8FD9" },
                { label: "ACTIVE NWS ALERTS", value: alerts.length.toString(), color: "#7B8FD9" },
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
                  background: "linear-gradient(to right, #4ade80 0%, #fbbf24 20%, #f97316 36%, #ef4444 52%, #cc2222 68%, #b91c1c 84%, #991b1b 100%)"
                }} />
                <div className="absolute top-0 h-full w-0.5 bg-white opacity-80"
                  style={{ left: `${Math.min(100, (ACTIVATION_THRESHOLD / GAUGE_MAX) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0</span>
                <div className="flex items-center gap-1">
                  <span className="text-yellow-400">▲</span>
                  <span className="text-yellow-400 font-medium">{ACTIVATION_THRESHOLD} THRESHOLD</span>
                </div>
                <span>250</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {alertTypeBreakdown.map(a => (
                <div key={a.label} className="bg-muted/20 border border-border rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold tabular-nums" style={{ color: a.color }}>{a.count}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1 leading-tight">{a.label}</div>
                </div>
              ))}
            </div>

            <div className="text-center text-xs text-muted-foreground">
              Updated {format(lastUpdated, "h:mm:ss aa")} · Auto-refreshes every 60s
            </div>
          </>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          { id: "components", label: "Components" },
          { id: "breakdown", label: "Alert Breakdown" },
          { id: "scale", label: "Score Scale" },
        ] as { id: TabType; label: string }[]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {tab.label}
            {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />}
          </button>
        ))}
      </div>

      {activeTab === "components" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-widest font-medium">SCORE COMPONENTS</div>
          </div>
          <div className="divide-y divide-border">
            {components.map(comp => (
              <div key={comp.label} className="px-4 py-3 flex items-center gap-3">
                <div className="w-36 text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">{comp.label}</div>
                <div className="flex-1">
                  <ComponentBar score={comp.score} max={60} />
                </div>
                <div className="w-10 text-sm font-bold tabular-nums text-right shrink-0"
                  style={{ color: comp.score > 0 ? levelColor : "#6b7280" }}>
                  {comp.score.toFixed(1)}
                </div>
                <div className="w-10 text-xs text-muted-foreground text-right shrink-0 font-mono">{comp.multiplier}</div>
                <div className="text-xs text-muted-foreground min-w-0 truncate hidden sm:block">{comp.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "breakdown" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-widest font-medium">ALERT TYPE BREAKDOWN</div>
          </div>
          <div className="p-4 space-y-3">
            {[
              { label: "Tornado Warnings", count: tornadoWarnings, color: "#ef4444", weight: "2.5x multiplier" },
              { label: "SVR Thunderstorm Warnings", count: svrThunderstorm, color: "#f97316", weight: "2.0x multiplier" },
              { label: "Flash Flood Warnings", count: components.find(c => c.label === "FLOOD THREAT") ? Math.round((components.find(c => c.label === "FLOOD THREAT")!.score) / 15) : 0, color: "#3b82f6", weight: "15.0x multiplier" },
              { label: "Total Active Alerts", count: alerts.length, color: "#7B8FD9", weight: "Atmospheric boost" },
            ].map(a => (
              <div key={a.label} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{a.label}</div>
                  <div className="text-xs text-muted-foreground">{a.weight}</div>
                </div>
                <div className="text-2xl font-bold tabular-nums" style={{ color: a.color }}>{a.count}</div>
              </div>
            ))}
            <div className="mt-2 pt-3 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">SWTI Score Contribution</div>
                  <div className="text-xs text-muted-foreground">Storm threat index factor</div>
                </div>
                <div className="text-xl font-bold tabular-nums text-primary">{swti.score.toFixed(1)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "scale" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs text-muted-foreground uppercase tracking-widest font-medium">SCORE REFERENCE SCALE</div>
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
          <div className="mx-4 mb-4 p-3 bg-muted/20 rounded-xl border border-border text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Important:</strong> The SSWXCon Score is a situational awareness tool for understanding regional weather intensity. It is <strong className="text-foreground">not</strong> an official NWS product and should never replace official warnings or advisories. A low score does not mean your local area is safe — a single tornado warning in your county is life-threatening regardless of the national score. Always follow official NWS guidance.
          </div>
        </div>
      )}
    </div>
  );
}
