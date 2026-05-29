import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { Moon, Sun, Star } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props { location: Location }

function getMoonPhase(date: Date): { phase: string; illumination: number; icon: string; age: number } {
  const knownNewMoon = new Date("2000-01-06T18:14:00Z");
  const synodic = 29.53058867;
  const daysSince = (date.getTime() - knownNewMoon.getTime()) / (86400000);
  const age = ((daysSince % synodic) + synodic) % synodic;
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * age / synodic)) / 2 * 100);

  let phase = "New Moon", icon = "🌑";
  if (age < 1.85)      { phase = "New Moon";        icon = "🌑"; }
  else if (age < 7.38) { phase = "Waxing Crescent"; icon = "🌒"; }
  else if (age < 9.22) { phase = "First Quarter";   icon = "🌓"; }
  else if (age < 14.77){ phase = "Waxing Gibbous";  icon = "🌔"; }
  else if (age < 16.61){ phase = "Full Moon";        icon = "🌕"; }
  else if (age < 22.15){ phase = "Waning Gibbous";  icon = "🌖"; }
  else if (age < 23.99){ phase = "Last Quarter";     icon = "🌗"; }
  else if (age < 29.53){ phase = "Waning Crescent";  icon = "🌘"; }

  return { phase, illumination, icon, age: Math.round(age * 10) / 10 };
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
      dateShort: format(parseISO(t), "EEE"),
      moon: m,
      sunrise: sunrise ? format(parseISO(String(sunrise)), "h:mm a") : "—",
      sunset: sunset ? format(parseISO(String(sunset)), "h:mm a") : "—",
    };
  }) ?? [];

  const sunrise0 = upcomingDays[0]?.sunrise ?? "—";
  const sunset0 = upcomingDays[0]?.sunset ?? "—";

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Moon className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold tracking-wide">Moon & Astronomy</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-center text-center">
          <div className="text-7xl mb-3" style={{ filter: "drop-shadow(0 0 12px rgba(196, 181, 253, 0.4))" }}>{moon.icon}</div>
          <div className="text-xl font-bold mb-1">{moon.phase}</div>
          <div className="text-sm text-muted-foreground mb-3">{moon.illumination}% illuminated · {moon.age} days old</div>
          <div className="w-full bg-muted/30 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-slate-400 to-white rounded-full" style={{ width: `${moon.illumination}%` }} />
          </div>
          <div className="text-xs text-muted-foreground mt-2">{moon.illumination}% illumination</div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sun className="w-4 h-4 text-yellow-400" /> Today's Sun
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center bg-muted/20 rounded-lg p-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Sunrise</div>
              <div className="text-lg font-bold text-yellow-400">🌅 {sunrise0}</div>
            </div>
            <div className="text-center bg-muted/20 rounded-lg p-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Sunset</div>
              <div className="text-lg font-bold text-orange-400">🌇 {sunset0}</div>
            </div>
          </div>
          <div className="bg-muted/20 rounded-lg p-3">
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Current Season</div>
            <div className="text-sm font-semibold">{seasons.season}</div>
            <div className="text-xs text-muted-foreground">Next: {seasons.nextSolstice} ({seasons.daysToNext} days)</div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold">7-Day Moon & Sun Almanac</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Date", "Moon Phase", "Illum.", "Sunrise", "Sunset"].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {upcomingDays.map((d, i) => (
                <tr key={i} className="border-b border-border/30 hover:bg-muted/10">
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{d.date}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{d.moon.icon} {d.moon.phase}</td>
                  <td className="px-3 py-2 text-muted-foreground">{d.moon.illumination}%</td>
                  <td className="px-3 py-2 text-yellow-400">{d.sunrise}</td>
                  <td className="px-3 py-2 text-orange-400">{d.sunset}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-yellow-300" /> Planetary Visibility Guide
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {PLANETS.map(p => (
            <div key={p.name} className="bg-muted/20 rounded-lg p-3 border border-border/40">
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
