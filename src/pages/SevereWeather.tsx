import { useNWSAlerts, useNWSPoints } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { AlertSkeleton } from "../components/WeatherSkeleton";
import { AlertTriangle, Clock, MapPin, Shield } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useState } from "react";

interface Props { location: Location }

const SEVERITY_CONFIG = {
  Extreme: { cls: "border-red-500 bg-red-500/10", badge: "bg-red-500 text-white", icon: "🚨" },
  Severe: { cls: "border-orange-500 bg-orange-500/10", badge: "bg-orange-500 text-white", icon: "⚠️" },
  Moderate: { cls: "border-yellow-500 bg-yellow-500/10", badge: "bg-yellow-400 text-black", icon: "⚡" },
  Minor: { cls: "border-blue-500 bg-blue-500/10", badge: "bg-blue-500 text-white", icon: "ℹ️" },
  Unknown: { cls: "border-muted bg-muted/10", badge: "bg-muted text-muted-foreground", icon: "📢" },
} as const;

export default function SevereWeather({ location }: Props) {
  const { data: alerts, isLoading, error, dataUpdatedAt, refetch } = useNWSAlerts(location);
  const [expanded, setExpanded] = useState<string | null>(null);

  const lastUpdated = dataUpdatedAt ? format(new Date(dataUpdatedAt), "h:mm a") : null;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Severe Weather Alerts
          </h2>
          <p className="text-sm text-muted-foreground">{location.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-xs text-muted-foreground">Updated {lastUpdated}</span>}
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 text-xs bg-primary/15 text-primary border border-primary/30 rounded-lg hover:bg-primary/25 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <AlertSkeleton key={i} />)}
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive rounded-xl p-4 text-sm text-destructive">
          Failed to load alerts. NWS API may be unavailable.
        </div>
      )}

      {!isLoading && !error && alerts?.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Shield className="w-10 h-10 mx-auto mb-3 text-green-400" />
          <h3 className="font-semibold text-green-400 mb-1">No Active Alerts</h3>
          <p className="text-sm text-muted-foreground">No severe weather alerts for {location.name}</p>
        </div>
      )}

      {!isLoading && alerts && alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const sev = (alert.properties.severity as keyof typeof SEVERITY_CONFIG) || "Unknown";
            const cfg = SEVERITY_CONFIG[sev] ?? SEVERITY_CONFIG.Unknown;
            const isOpen = expanded === alert.properties.id;

            let onsetStr = "";
            let expiresStr = "";
            try {
              if (alert.properties.onset) onsetStr = format(parseISO(alert.properties.onset), "MMM d, h:mm a");
              if (alert.properties.expires) expiresStr = format(parseISO(alert.properties.expires), "MMM d, h:mm a");
            } catch { /* ignore */ }

            return (
              <div key={alert.properties.id} className={`border rounded-xl ${cfg.cls}`}>
                <button
                  className="w-full text-left p-4"
                  onClick={() => setExpanded(isOpen ? null : alert.properties.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-lg">{cfg.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${cfg.badge}`}>{sev}</span>
                          <span className="font-semibold text-sm">{alert.properties.event}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">{alert.properties.areaDesc}</div>
                      </div>
                    </div>
                    <span className="text-muted-foreground text-sm">{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {(onsetStr || expiresStr) && (
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      {onsetStr && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Onset: {onsetStr}</span>}
                      {expiresStr && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Expires: {expiresStr}</span>}
                    </div>
                  )}
                </button>

                {isOpen && (
                  <div className="border-t border-border/30 p-4 space-y-3">
                    {alert.properties.headline && (
                      <p className="text-sm font-medium">{alert.properties.headline}</p>
                    )}
                    {alert.properties.description && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Description</div>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{alert.properties.description}</p>
                      </div>
                    )}
                    {alert.properties.instruction && (
                      <div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Instructions</div>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{alert.properties.instruction}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
