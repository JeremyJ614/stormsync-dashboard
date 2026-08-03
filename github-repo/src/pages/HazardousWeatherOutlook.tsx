import { useNWSPoints, useNWSHazardousWeather } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { CardSkeleton } from "../components/WeatherSkeleton";
import { AlertTriangle } from "lucide-react";

interface Props { location: Location }

const SEGMENT_PATTERNS = [
  { key: "DAY ONE", color: "text-red-400", label: "Day 1" },
  { key: "DAYS TWO THROUGH SEVEN", color: "text-orange-400", label: "Days 2-7" },
  { key: "SPOTTER INFORMATION STATEMENT", color: "text-blue-400", label: "Spotter Info" },
];

function parseHWO(text: string): Array<{ label: string; color: string; content: string }> {
  if (!text) return [];
  const segments: Array<{ label: string; color: string; content: string }> = [];
  const lines = text.split("\n");
  let current: { label: string; color: string; content: string } | null = null;

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    const pattern = SEGMENT_PATTERNS.find(p => upper.includes(p.key));
    if (pattern) {
      if (current) segments.push(current);
      current = { label: pattern.label, color: pattern.color, content: "" };
    } else if (current) {
      current.content += line + "\n";
    }
  }
  if (current) segments.push(current);

  if (segments.length === 0 && text.length > 20) {
    segments.push({ label: "Hazardous Weather Outlook", color: "text-foreground", content: text });
  }

  return segments;
}

export default function HazardousWeatherOutlook({ location }: Props) {
  const { data: nwsPoints } = useNWSPoints(location);
  const office = nwsPoints?.properties?.cwa;
  const { data: hwoText, isLoading, error } = useNWSHazardousWeather(office);

  const segments = parseHWO(hwoText ?? "");

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-yellow-400" />
        <h2 className="text-xl font-bold">Hazardous Weather Outlook</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · NWS Office: {office ?? "loading…"}</p>

      {isLoading && <CardSkeleton rows={10} />}

      {error && (
        <div className="bg-destructive/10 border border-destructive rounded-xl p-4 text-sm text-destructive">
          Could not load Hazardous Weather Outlook from NWS.
        </div>
      )}

      {!isLoading && !hwoText && !error && (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
          No Hazardous Weather Outlook available for {office ?? "this office"}.
        </div>
      )}

      {segments.map((seg, i) => (
        <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
          <div className={`px-4 py-2 border-b border-border font-semibold text-sm ${seg.color}`}>
            {seg.label}
          </div>
          <div className="p-4">
            <pre className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground font-mono">
              {seg.content.trim() || "(No hazards mentioned for this period)"}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}
