import { useState } from "react";
import { useOpenMeteo, useNWSAlerts } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { PageSkeleton } from "../components/WeatherSkeleton";
import { Brain, Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import { BASE_API } from "../config";
import { cToF, msToMph } from "../utils/weatherCalc";

interface Props { location: Location }

interface WPIResult {
  wpiScore: number;
  summary: string;
  hazards: string[];
  outlook: string;
  synopticFeatures: string;
}

function WPIGauge({ score }: { score: number }) {
  const color =
    score >= 80 ? "#d946ef"
    : score >= 60 ? "#ef4444"
    : score >= 40 ? "#f97316"
    : score >= 20 ? "#fde047"
    : "#4ade80";

  const pct = (score / 100) * 100;
  const label =
    score >= 80 ? "Extreme"
    : score >= 60 ? "High"
    : score >= 40 ? "Moderate"
    : score >= 20 ? "Elevated"
    : "Low";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="48" fill="none" stroke="#1e293b" strokeWidth="12" />
          <circle
            cx="60" cy="60" r="48" fill="none"
            stroke={color} strokeWidth="12"
            strokeDasharray={`${(score / 100) * 301.6} 301.6`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span className="text-3xl font-bold" style={{ color }}>{score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className="mt-2 font-semibold text-sm" style={{ color }}>{label} Activity</span>
    </div>
  );
}

export default function WeatherPatternIndex({ location }: Props) {
  const { data: weather, isLoading: weatherLoading } = useOpenMeteo(location);
  const { data: alerts } = useNWSAlerts(location);
  const [result, setResult] = useState<WPIResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!weather) return;
    setLoading(true);
    setError(null);

    const cur = weather.current;
    const hourly = weather.hourly;

    const weatherData = {
      location: location.name,
      current: {
        temperature: cur ? Math.round(cToF(cur.temperature_2m)) : null,
        windSpeed: cur ? Math.round(msToMph(cur.wind_speed_10m)) : null,
        humidity: cur?.relative_humidity_2m,
        pressure: cur?.surface_pressure,
        weatherCode: cur?.weather_code,
      },
      instability: {
        cape0: hourly?.cape?.[0] ?? null,
        cape6h: hourly?.cape?.[6] ?? null,
        cape12h: hourly?.cape?.[12] ?? null,
        liftedIndex: hourly?.lifted_index?.[0] ?? null,
      },
      alerts: alerts?.map(a => ({ event: a.properties.event, severity: a.properties.severity })) ?? [],
      nextHours: hourly?.time?.slice(0, 12).map((t: string, i: number) => ({
        time: t,
        temp: hourly.temperature_2m ? Math.round(cToF(hourly.temperature_2m[i])) : 0,
        wind: hourly.wind_speed_10m ? Math.round(msToMph(hourly.wind_speed_10m[i])) : 0,
        precipProb: hourly.precipitation_probability?.[i] ?? 0,
        cape: Math.round(hourly.cape?.[i] ?? 0),
      })),
    };

    try {
      const res = await fetch(`${BASE_API}/ai/wpi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weatherData, location: location.name }),
      });
      if (!res.ok) throw new Error("AI analysis failed");
      const data = await res.json() as WPIResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Weather Pattern AI</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name}</p>

      {weatherLoading && <PageSkeleton />}

      {!weatherLoading && (
        <>
          {!result && (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Brain className="w-12 h-12 mx-auto mb-4 text-primary opacity-60" />
              <h3 className="font-semibold text-lg mb-2">AI Weather Pattern Analysis</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                Get an AI-powered analysis of the current atmospheric pattern, synoptic features, and risk assessment for {location.name}.
              </p>
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {loading ? "Analyzing…" : "Analyze Current Pattern"}
              </button>
              {loading && (
                <div className="mt-4 flex justify-center">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive rounded-xl p-4 flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Analysis Results</h3>
                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/15 text-primary border border-primary/30 rounded-lg hover:bg-primary/25 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-3 h-3" />
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              <div className="bg-card border border-border rounded-xl p-6 flex flex-col md:flex-row items-center gap-6">
                <WPIGauge score={typeof result.wpiScore === "number" ? result.wpiScore : 0} />
                <div className="flex-1">
                  <h4 className="font-semibold mb-2">Pattern Summary</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{result.summary}</p>
                </div>
              </div>

              {result.hazards?.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    Key Hazards
                  </h4>
                  <ul className="space-y-1">
                    {result.hazards.map((h, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-yellow-400 mt-0.5">⚠</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.outlook && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="font-semibold text-sm mb-2">24-48 Hour Outlook</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{result.outlook}</p>
                </div>
              )}

              {result.synopticFeatures && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h4 className="font-semibold text-sm mb-2">Synoptic Features</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{result.synopticFeatures}</p>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">AI analysis · Not official NWS guidance</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
