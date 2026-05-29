import type { Location } from "../hooks/useLocation";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Radio, ExternalLink, AlertTriangle } from "lucide-react";
import { CardSkeleton } from "../components/WeatherSkeleton";

interface Props { location: Location }

interface LSRReport {
  valid: string;
  magnitude: number;
  city: string;
  county: string;
  state: string;
  source: string;
  typetext: string;
  remark: string;
  lat: number;
  lon: number;
}

function useLSRReports(lat: number, lon: number) {
  return useQuery({
    queryKey: ["lsr", lat.toFixed(2), lon.toFixed(2)],
    queryFn: async () => {
      const ets = new Date();
      const sts = new Date(ets.getTime() - 24 * 60 * 60 * 1000);
      const fmt = (d: Date) =>
        `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}`;
      const url = `https://mesonet.agron.iastate.edu/geojson/lsr.php?sts=${fmt(sts)}&ets=${fmt(ets)}&fmt=json`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json() as { features: Array<{ properties: LSRReport; geometry: { coordinates: [number, number] } }> };
      return (data.features ?? [])
        .filter((f) => {
          const [fLon, fLat] = f.geometry.coordinates;
          const dist = Math.sqrt(Math.pow(fLat - lat, 2) + Math.pow(fLon - lon, 2));
          return dist < 3;
        })
        .map((f) => f.properties)
        .slice(0, 30);
    },
    staleTime: 5 * 60 * 1000,
  });
}

const REPORT_ICONS: Record<string, string> = {
  TORNADO: "🌪️",
  FUNNEL: "🌪️",
  HAIL: "🌨️",
  "TSTM WND GST": "💨",
  "TSTM WND DMG": "💨",
  SNOW: "❄️",
  FLOOD: "🌊",
  "FLASH FLOOD": "🌊",
  LIGHTNING: "⚡",
  "HIGH SUST WINDS": "💨",
};

export default function SkywarnReports({ location }: Props) {
  const { data: reports, isLoading, error } = useLSRReports(location.lat, location.lon);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Radio className="w-5 h-5 text-green-400" />
        <h2 className="text-xl font-bold">SkyWarn Local Storm Reports</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · Last 24 Hours (within ~200 miles)</p>

      <a
        href="https://www.weather.gov/skywarn/"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-xs text-primary hover:underline"
      >
        <ExternalLink className="w-3 h-3" />
        Learn about the SkyWarn program
      </a>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} rows={3} />)}
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive rounded-xl p-4 text-sm text-destructive">
          Failed to load storm reports from IEM. Check your connection.
        </div>
      )}

      {!isLoading && !error && (!reports || reports.length === 0) && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h3 className="font-semibold mb-1 text-green-400">No Reports Near You</h3>
          <p className="text-sm text-muted-foreground">No local storm reports found within ~200 miles of {location.name} in the past 24 hours.</p>
        </div>
      )}

      {!isLoading && reports && reports.length > 0 && (
        <div className="space-y-2">
          {reports.map((r, i) => {
            const icon = REPORT_ICONS[r.typetext?.toUpperCase()] ?? "⚠️";
            let timeStr = r.valid;
            try {
              const d = new Date(r.valid.replace(" ", "T") + "Z");
              timeStr = format(d, "MMM d h:mm a");
            } catch { /* ignore */ }

            return (
              <div key={i} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-start gap-3">
                  <span className="text-xl">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{r.typetext}</span>
                      {r.magnitude > 0 && <span className="text-xs bg-muted/40 px-1.5 py-0.5 rounded">{r.magnitude} {r.typetext?.includes("HAIL") ? '"' : "mph"}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {r.city}, {r.state} · {timeStr}
                    </div>
                    {r.remark && (
                      <div className="text-xs text-muted-foreground mt-1">{r.remark}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-0.5">Source: {r.source}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
