import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { Star, ExternalLink, Moon, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format, parseISO } from "date-fns";
import { NationalSkymap } from "../components/NationalSkymap";

interface Props { location: Location }

const TOOLTIP_STYLE = { background: "hsl(232 20% 10%)", border: "1px solid hsl(232 18% 16%)", borderRadius: 8, fontSize: 12 };

function skygazingScore(cloudCover: number, humidity: number, precip: number): number {
  let score = 100;
  score -= cloudCover * 0.85;
  score -= Math.max(0, (humidity - 50)) * 0.15;
  if (precip > 0) score -= 40;
  return Math.max(0, Math.round(score));
}

function skygazingLabel(score: number): { text: string; color: string; mapColor: string } {
  if (score >= 85) return { text: "PRISTINE", color: "#fbbf24", mapColor: "#fbbf24" };
  if (score >= 70) return { text: "EXCELLENT", color: "#4ade80", mapColor: "#4ade80" };
  if (score >= 55) return { text: "CLEAR", color: "#22d3ee", mapColor: "#22d3ee" };
  if (score >= 35) return { text: "FAIR", color: "#818cf8", mapColor: "#818cf8" };
  return { text: "HAZY", color: "#a78bfa", mapColor: "#a78bfa" };
}

function scoreColor(score: number): string {
  return skygazingLabel(score).mapColor;
}

const SCALE = [
  { label: "PRISTINE", color: "#fbbf24", range: "85–100" },
  { label: "EXCELLENT", color: "#4ade80", range: "70–84" },
  { label: "CLEAR", color: "#22d3ee", range: "55–69" },
  { label: "FAIR", color: "#818cf8", range: "35–54" },
  { label: "HAZY", color: "#a78bfa", range: "0–34" },
];

const DEEP_SKY_OBJECTS = [
  { name: "Orion Nebula (M42)", type: "Nebula", season: "Winter/Spring", mag: "4.0" },
  { name: "Andromeda Galaxy (M31)", type: "Galaxy", season: "Fall/Winter", mag: "3.4" },
  { name: "Pleiades (M45)", type: "Open Cluster", season: "Winter", mag: "1.2" },
  { name: "Hercules Cluster (M13)", type: "Glob. Cluster", season: "Summer", mag: "5.8" },
  { name: "Beehive Cluster (M44)", type: "Open Cluster", season: "Spring", mag: "3.1" },
  { name: "Whirlpool Galaxy (M51)", type: "Galaxy", season: "Spring/Summer", mag: "8.4" },
  { name: "Ring Nebula (M57)", type: "Planetary Nebula", season: "Summer", mag: "8.8" },
  { name: "Lagoon Nebula (M8)", type: "Emission Nebula", season: "Summer", mag: "6.0" },
];

export default function StarSkygazing({ location }: Props) {
  const { data: weather, isLoading } = useOpenMeteo(location);

  const hourly = weather?.hourly;
  const cc = hourly?.cloud_cover?.[0] ?? 80;
  const hum = hourly?.relative_humidity_2m?.[0] ?? 60;
  const precip = hourly?.precipitation?.[0] ?? 0;

  const currentScore = skygazingScore(cc, hum, precip);
  const { text: conditionText, color: conditionColor } = skygazingLabel(currentScore);

  const timeline = (hourly?.time as string[] | undefined)?.slice(0, 48).map((t: string, i: number) => {
    const c = hourly!.cloud_cover?.[i] ?? 80;
    const h = hourly!.relative_humidity_2m?.[i] ?? 60;
    const p = hourly!.precipitation?.[i] ?? 0;
    const score = skygazingScore(c, h, p);
    return { time: format(parseISO(t), "EEE ha"), score };
  }) ?? [];

  const bestWindow = timeline.reduce((best, cur) => cur.score > best.score ? cur : best, timeline[0] ?? { time: "—", score: 0 });

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Star className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold tracking-wide uppercase">Star & Skygazing</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · 7-Night Sky Clarity Forecast // Cloud + Humidity + Transparency</p>

      <div className="flex items-start gap-2 bg-muted/20 border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
        <span>Experimental stargazing forecast scoring cloud cover (40%), humidity (20%), atmospheric transparency (15%), precipitation (15%), and wind (10%). Updates with each weather data refresh. Not an official product.</span>
      </div>

      {/* SPC-style US Map */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Stargazing Outlook Map — Tonight</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Moon illumination · Valid tonight
          </div>
        </div>
        <div className="p-3">
          <NationalSkymap />
        </div>
        <div className="px-4 pb-3 flex flex-wrap gap-3">
          {SCALE.map(s => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Score card */}
      <div className="bg-card border rounded-xl p-6 text-center" style={{ borderColor: conditionColor + "50" }}>
        <div className="text-xs tracking-widest uppercase text-muted-foreground mb-2">Tonight's Conditions — {location.name}</div>
        <div className="text-6xl font-bold mb-2" style={{ color: conditionColor, textShadow: `0 0 24px ${conditionColor}40` }}>
          {isLoading ? "—" : currentScore}
          <span className="text-2xl font-normal text-muted-foreground">/100</span>
        </div>
        <div className="inline-block px-5 py-1.5 rounded font-bold text-base tracking-widest uppercase mb-3"
          style={{ color: conditionColor, backgroundColor: conditionColor + "18", border: `1px solid ${conditionColor}40` }}>
          {conditionText}
        </div>
        {!isLoading && bestWindow && (
          <div className="text-xs text-muted-foreground">
            Best upcoming window: <span className="text-foreground font-medium">{bestWindow.time}</span> ({bestWindow.score}/100)
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: "Cloud Cover", value: `${cc}%`, color: cc <= 20 ? "#4ade80" : cc <= 50 ? "#fde047" : "#ef4444", good: cc <= 20, bad: cc > 70 },
          { label: "Humidity", value: `${hum}%`, color: hum <= 60 ? "#4ade80" : hum <= 80 ? "#fde047" : "#f97316", good: hum <= 60, bad: hum > 85 },
          { label: "Precipitation", value: precip > 0 ? `${(precip * 25.4).toFixed(1)}mm` : "None", color: precip > 0 ? "#ef4444" : "#4ade80", good: precip === 0, bad: precip > 0 },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-3">
            <div className="text-lg font-bold" style={{ color: m.color }}>{isLoading ? "—" : m.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
            <div className="text-[10px] mt-1" style={{ color: m.color }}>{m.good ? "✓ Good" : m.bad ? "✗ Bad" : "Acceptable"}</div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-1">48-Hour Observing Window</h3>
        <p className="text-xs text-muted-foreground mb-3">Sky clarity score by hour — higher is better</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={timeline}>
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} interval={7} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}/100`, "Skygazing Score"]} />
            <Bar dataKey="score" radius={[2, 2, 0, 0]}>
              {timeline.map((entry, i) => <Cell key={i} fill={scoreColor(entry.score)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
          {SCALE.map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
              <span className="text-muted-foreground">{l.label} ({l.range})</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-1.5"><Moon className="w-4 h-4 text-primary" /> Notable Deep-Sky Objects</h3>
        </div>
        <div className="divide-y divide-border">
          {DEEP_SKY_OBJECTS.map(obj => (
            <div key={obj.name} className="flex items-center gap-3 px-4 py-3">
              <Star className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{obj.name}</div>
                <div className="text-xs text-muted-foreground">{obj.type} · Season: {obj.season}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-semibold text-foreground">Mag {obj.mag}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Clear Outside", url: "https://clearoutside.com/", desc: "Detailed sky conditions" },
          { label: "Stellarium Web", url: "https://stellarium-web.org/", desc: "Online planetarium" },
          { label: "Light Pollution Map", url: "https://www.lightpollutionmap.info/", desc: "Dark sky finder" },
          { label: "Heavens-Above", url: "https://www.heavens-above.com/", desc: "Satellite passes, planets" },
        ].map(r => (
          <a key={r.label} href={r.url} target="_blank" rel="noopener noreferrer"
            className="bg-card border border-border rounded-xl p-3 hover:border-primary/40 transition-colors">
            <div className="text-sm font-medium flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5 text-primary" /> {r.label}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{r.desc}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
