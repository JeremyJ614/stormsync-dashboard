import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { Moon, Sun, Star, Sparkles } from "lucide-react";
import { format, parseISO } from "date-fns";
import { PageHero } from "../components/PageHero";

interface Props { location: Location }

function getMoonPhase(date: Date): { phase: string; illumination: number; icon: string; age: number; waxing: boolean } {
  const knownNewMoon = new Date("2000-01-06T18:14:00Z");
  const synodic = 29.53058867;
  const daysSince = (date.getTime() - knownNewMoon.getTime()) / (86400000);
  const age = ((daysSince % synodic) + synodic) % synodic;
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * age / synodic)) / 2 * 100);
  const waxing = age < synodic / 2;

  let phase = "New Moon", icon = "🌑";
  if (age < 1.85)      { phase = "New Moon";        icon = "🌑"; }
  else if (age < 7.38) { phase = "Waxing Crescent"; icon = "🌒"; }
  else if (age < 9.22) { phase = "First Quarter";   icon = "🌓"; }
  else if (age < 14.77){ phase = "Waxing Gibbous";  icon = "🌔"; }
  else if (age < 16.61){ phase = "Full Moon";        icon = "🌕"; }
  else if (age < 22.15){ phase = "Waning Gibbous";  icon = "🌖"; }
  else if (age < 23.99){ phase = "Last Quarter";     icon = "🌗"; }
  else if (age < 29.53){ phase = "Waning Crescent";  icon = "🌘"; }

  return { phase, illumination, icon, age: Math.round(age * 10) / 10, waxing };
}

// Realistic moon disk: textured face (maria) + a true terminator computed from the
// illuminated fraction, so the shaded portion matches the real phase shape.
const MARIA = [
  { x: -0.30, y: -0.34, r: 0.24, o: 0.20 }, // Mare Imbrium
  { x: 0.06, y: -0.30, r: 0.16, o: 0.18 },  // Mare Serenitatis
  { x: 0.20, y: -0.06, r: 0.19, o: 0.19 },  // Mare Tranquillitatis
  { x: 0.46, y: 0.06, r: 0.13, o: 0.17 },   // Mare Crisium
  { x: -0.12, y: 0.24, r: 0.21, o: 0.15 },  // Mare Nubium
  { x: -0.42, y: 0.20, r: 0.11, o: 0.14 },  // Oceanus Procellarum
  { x: 0.0, y: 0.46, r: 0.07, o: 0.24 },    // Tycho
  { x: 0.30, y: 0.34, r: 0.05, o: 0.20 },
];

function MoonDisk({ illum, waxing, size = 230 }: { illum: number; waxing: boolean; size?: number }) {
  const R = size / 2 - 12;
  const c = size / 2;
  const f = Math.max(0, Math.min(1, illum / 100));

  // Dark (unlit) region outline — sampled limb + terminator ellipse (exact shape).
  const N = 36;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const y = -R + (2 * R * i) / N;
    const s = Math.sqrt(Math.max(0, R * R - y * y));
    pts.push(`${(c + (waxing ? -s : s)).toFixed(2)},${(c + y).toFixed(2)}`); // dark-side limb
  }
  for (let i = N; i >= 0; i--) {
    const y = -R + (2 * R * i) / N;
    const s = Math.sqrt(Math.max(0, R * R - y * y));
    const xt = (1 - 2 * f) * s * (waxing ? 1 : -1); // terminator x at height y
    pts.push(`${(c + xt).toFixed(2)},${(c + y).toFixed(2)}`);
  }
  const darkPath = "M" + pts.join("L") + "Z";

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id="moonFace" cx="40%" cy="36%" r="68%">
          <stop offset="0%" stopColor="#fdfdf6" />
          <stop offset="60%" stopColor="#dcdbd1" />
          <stop offset="100%" stopColor="#a4a399" />
        </radialGradient>
        <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="#cdd6ff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#cdd6ff" stopOpacity="0" />
        </radialGradient>
        <filter id="termBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4" /></filter>
        <clipPath id="moonClip"><circle cx={c} cy={c} r={R} /></clipPath>
      </defs>
      <circle cx={c} cy={c} r={R + 14} fill="url(#moonGlow)" />
      <g clipPath="url(#moonClip)">
        <circle cx={c} cy={c} r={R} fill="url(#moonFace)" />
        {MARIA.map((m, i) => (
          <circle key={i} cx={c + m.x * R} cy={c + m.y * R} r={m.r * R} fill="#6b6a60" opacity={m.o} />
        ))}
        {/* a few crisp craters */}
        <circle cx={c - 0.02 * R} cy={c + 0.44 * R} r={0.03 * R} fill="#fff" opacity={0.5} />
        <circle cx={c + 0.34 * R} cy={c - 0.40 * R} r={0.025 * R} fill="#fff" opacity={0.4} />
        <path d={darkPath} fill="#05060f" fillOpacity={0.93} filter="url(#termBlur)" />
      </g>
      <circle cx={c} cy={c} r={R} fill="none" stroke="#ffffff" strokeOpacity={0.14} strokeWidth={1} />
    </svg>
  );
}

function getSeasons(date: Date): { season: string; nextSolstice: string; daysToNext: number } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  let season = "Winter", nextSolstice = `Jun 21, ${year}`, nextDate = new Date(year, 5, 21);
  if (month >= 3 && month < 6) { season = "Spring"; nextSolstice = `Jun 21, ${year}`; nextDate = new Date(year, 5, 21); }
  else if (month >= 6 && month < 9) { season = "Summer"; nextSolstice = `Sep 22, ${year}`; nextDate = new Date(year, 8, 22); }
  else if (month >= 9 && month < 12) { season = "Fall"; nextSolstice = `Dec 21, ${year}`; nextDate = new Date(year, 11, 21); }
  else { season = "Winter"; nextSolstice = `Mar 20, ${year + 1}`; nextDate = new Date(year + 1, 2, 20); }
  const daysToNext = Math.max(0, Math.round((nextDate.getTime() - date.getTime()) / 86400000));
  return { season, nextSolstice, daysToNext };
}

const PLANETS = [
  { name: "Venus",   symbol: "♀", desc: "Often visible as the \"Morning Star\" or \"Evening Star\" near dawn/dusk.", color: "#fde047" },
  { name: "Jupiter", symbol: "♃", desc: "Brightest planet; visible for much of the night when in opposition.", color: "#fb923c" },
  { name: "Mars",    symbol: "♂", desc: "Reddish-orange; best viewed near opposition every 26 months.", color: "#ef4444" },
  { name: "Saturn",  symbol: "♄", desc: "Rings visible in small telescopes; visible several months per year.", color: "#a78bfa" },
];

// Lightweight starfield (CSS dots) for the night-sky panels.
const STAR_BG: React.CSSProperties = {
  backgroundImage: [
    "radial-gradient(1px 1px at 12% 22%, #ffffffcc, transparent)",
    "radial-gradient(1px 1px at 28% 64%, #ffffff99, transparent)",
    "radial-gradient(1.4px 1.4px at 46% 28%, #ffffffbb, transparent)",
    "radial-gradient(1px 1px at 62% 74%, #ffffff88, transparent)",
    "radial-gradient(1px 1px at 76% 18%, #ffffffaa, transparent)",
    "radial-gradient(1.3px 1.3px at 88% 52%, #ffffffaa, transparent)",
    "radial-gradient(1px 1px at 8% 82%, #ffffff77, transparent)",
    "radial-gradient(1px 1px at 53% 88%, #ffffff88, transparent)",
    "radial-gradient(1px 1px at 35% 8%, #ffffff88, transparent)",
    "linear-gradient(160deg, #070a1f 0%, #0a0f2b 55%, #0b0820 100%)",
  ].join(","),
};

export default function MoonAstronomy({ location }: Props) {
  const { data: weather } = useOpenMeteo(location);
  const today = new Date();
  const moon = getMoonPhase(today);
  const seasons = getSeasons(today);
  const daily = weather?.daily;

  const upcomingDays = (daily?.time as string[] | undefined)?.slice(0, 7).map((t: string, i: number) => {
    const d = new Date(t);
    const m = getMoonPhase(d);
    const sunrise = daily!.sunrise?.[i];
    const sunset = daily!.sunset?.[i];
    return {
      date: format(parseISO(t), "EEE, MMM d"),
      moon: m,
      sunrise: sunrise ? format(parseISO(String(sunrise)), "h:mm a") : "—",
      sunset: sunset ? format(parseISO(String(sunset)), "h:mm a") : "—",
    };
  }) ?? [];

  const sunrise0 = upcomingDays[0]?.sunrise ?? "—";
  const sunset0 = upcomingDays[0]?.sunset ?? "—";

  return (
    <div className="p-4 md:p-6 space-y-5">
      <PageHero icon={Moon} title="Moon & Astronomy" subtitle={`${location.name} · ${moon.phase} · ${moon.illumination}% lit`} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Realistic moon over a starfield */}
        <div className="relative rounded-2xl overflow-hidden border border-border p-6 flex flex-col items-center text-center" style={STAR_BG}>
          <Sparkles className="absolute top-3 right-3 w-4 h-4 text-white/30" />
          <div className="text-[10px] tracking-[0.35em] uppercase text-white/50 mb-2">Tonight's Moon</div>
          <MoonDisk illum={moon.illumination} waxing={moon.waxing} />
          <div className="text-xl font-bold text-white mt-2" style={{ textShadow: "0 0 22px rgba(205,214,255,0.5)" }}>{moon.phase}</div>
          <div className="text-sm text-white/70 mb-3">{moon.illumination}% illuminated · {moon.age} days old · {moon.waxing ? "waxing" : "waning"}</div>
          <div className="w-full max-w-xs bg-white/10 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${moon.illumination}%`, background: "linear-gradient(to right, #64748b, #f8fafc)", boxShadow: "0 0 12px #f8fafc88" }} />
          </div>
        </div>

        <div className="glass rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sun className="w-4 h-4 text-yellow-400" /> Today's Sun
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center rounded-lg p-3" style={{ background: "linear-gradient(160deg, #fde04722, transparent 75%)" }}>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Sunrise</div>
              <div className="text-lg font-bold text-yellow-400">🌅 {sunrise0}</div>
            </div>
            <div className="text-center rounded-lg p-3" style={{ background: "linear-gradient(160deg, #fb923c22, transparent 75%)" }}>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Sunset</div>
              <div className="text-lg font-bold text-orange-400">🌇 {sunset0}</div>
            </div>
          </div>
          <div className="bg-muted/20 rounded-lg p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Current Season</div>
            <div className="text-sm font-semibold">{seasons.season}</div>
            <div className="text-xs text-muted-foreground">Next: {seasons.nextSolstice} ({seasons.daysToNext} days)</div>
          </div>
          <div className="bg-muted/20 rounded-lg p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Lunar Cycle</div>
            <div className="text-sm font-semibold">{moon.age} / 29.5 days</div>
            <div className="text-xs text-muted-foreground">{moon.waxing ? "Growing toward full" : "Waning toward new"}</div>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border/60">
          <h3 className="text-sm font-semibold">7-Day Moon &amp; Sun Almanac</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60">
                {["Date", "Moon", "Phase", "Illum.", "Sunrise", "Sunset"].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {upcomingDays.map((d, i) => (
                <tr key={i} className="border-b border-border/20 hover:bg-muted/10">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{d.date}</td>
                  <td className="px-3 py-1.5"><MoonDisk illum={d.moon.illumination} waxing={d.moon.waxing} size={30} /></td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{d.moon.phase}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.moon.illumination}%</td>
                  <td className="px-3 py-2 text-yellow-400">{d.sunrise}</td>
                  <td className="px-3 py-2 text-orange-400">{d.sunset}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass rounded-xl p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-yellow-300" /> Planetary Visibility Guide
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {PLANETS.map(p => (
            <div key={p.name} className="rounded-lg p-3 border border-border/40" style={{ background: `linear-gradient(160deg, ${p.color}14, transparent 72%)` }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl" style={{ color: p.color }}>{p.symbol}</span>
                <span className="font-semibold text-sm">{p.name}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-muted-foreground bg-muted/20 rounded-lg p-3">
          💡 For real-time planet positions and rise/set times, check <a href="https://stellarium-web.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Stellarium Web</a> or <a href="https://heavens-above.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Heavens-Above</a>.
        </div>
      </div>
    </div>
  );
}
