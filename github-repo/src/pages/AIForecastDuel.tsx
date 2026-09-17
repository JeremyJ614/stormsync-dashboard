import { useState } from "react";
import { useOpenMeteo, useNWSAlerts } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { Swords, RefreshCw, AlertTriangle } from "lucide-react";
import { BASE_API } from "../config";
import { cToF, msToMph } from "../utils/weatherCalc";

interface Props { location: Location }

interface ModelAnalysis {
  forecast?: string;
  confidence?: number;
  reasoning?: string;
  conservative?: { forecast: string; confidence: number; reasoning: string };
  aggressive?: { forecast: string; confidence: number; reasoning: string };
  consensus?: string;
}

interface DuelResult {
  modelA: { name: string; analysis: ModelAnalysis };
  modelB: { name: string; analysis: ModelAnalysis };
}

const QUESTIONS = [
  "What is the likelihood of significant weather in the next 24 hours?",
  "Will severe thunderstorms develop today or tonight?",
  "What is the tornado threat for this location?",
  "How likely is flash flooding over the next 48 hours?",
  "What will be the peak wind gusts today?",
  "Is this pattern favorable for supercell development?",
  "What are the main hazards for outdoor activities this week?",
];

export default function AIForecastDuel({ location }: Props) {
  const { data: weather } = useOpenMeteo(location);
  const { data: alerts } = useNWSAlerts(location);
  const [result, setResult] = useState<DuelResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState(QUESTIONS[0]);
  const [customQ, setCustomQ] = useState("");
  const [vote, setVote] = useState<"A" | "B" | null>(null);

  const run = async () => {
    if (!weather) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setVote(null);

    const cur = weather.current;
    const hourly = weather.hourly;
    const weatherData = {
      current: {
        temperature: cur ? Math.round(cToF(cur.temperature_2m)) : null,
        windSpeed: cur ? Math.round(msToMph(cur.wind_speed_10m)) : null,
        humidity: cur?.relative_humidity_2m,
        pressure: cur?.surface_pressure,
        weatherCode: cur?.weather_code,
      },
      instability: {
        cape: hourly?.cape?.[0] ?? null,
        liftedIndex: hourly?.lifted_index?.[0] ?? null,
      },
      alerts: alerts?.map(a => ({ event: a.properties.event, severity: a.properties.severity })) ?? [],
      next24h: hourly?.time?.slice(0, 24).map((t: string, i: number) => ({
        time: t,
        temp: hourly.temperature_2m ? Math.round(cToF(hourly.temperature_2m[i])) : 0,
        precipProb: hourly.precipitation_probability?.[i] ?? 0,
        cape: Math.round(hourly.cape?.[i] ?? 0),
        wind: hourly.wind_speed_10m ? Math.round(msToMph(hourly.wind_speed_10m[i])) : 0,
      })),
    };

    try {
      const res = await fetch(`${BASE_API}/ai/duel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weatherData,
          location: location.name,
          question: customQ.trim() || question,
        }),
      });
      if (!res.ok) throw new Error("AI Duel unavailable");
      const data = await res.json() as DuelResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Duel failed");
    } finally {
      setLoading(false);
    }
  };

  const getAnalysisText = (analysis: ModelAnalysis): string => {
    if (analysis.forecast) return analysis.forecast;
    if (analysis.conservative?.forecast) return analysis.conservative.forecast;
    return JSON.stringify(analysis).slice(0, 400);
  };

  const getConfidence = (analysis: ModelAnalysis): number => {
    if (typeof analysis.confidence === "number") return analysis.confidence;
    if (typeof analysis.conservative?.confidence === "number") return analysis.conservative.confidence;
    return 70;
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Swords className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">AI Forecast Duel</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · Two AI models analyze the same data and debate the forecast</p>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">Forecasting Question</h3>
        <div className="grid grid-cols-1 gap-2">
          {QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => { setQuestion(q); setCustomQ(""); }}
              className={`text-left px-3 py-2 rounded-lg text-xs transition-colors ${question === q && !customQ ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/20 hover:bg-muted/30"}`}
            >
              {q}
            </button>
          ))}
        </div>
        <div>
          <input
            type="text"
            placeholder="Or ask your own question..."
            value={customQ}
            onChange={e => { setCustomQ(e.target.value); if (e.target.value) setQuestion(""); }}
            className="w-full px-3 py-2 bg-muted/30 border border-border rounded-lg text-sm outline-none focus:border-primary/60 transition-colors"
          />
        </div>
        <button
          onClick={run}
          disabled={loading || !weather}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Swords className="w-4 h-4" />
          {loading ? "AI Models Debating…" : "Start Duel"}
        </button>
      </div>

      {loading && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Two AI models are analyzing the weather data and formulating their forecasts…</p>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 border border-destructive rounded-xl p-4 flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="text-sm font-medium text-center text-muted-foreground">
            Question: <span className="text-foreground">"{customQ || question}"</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([
              { key: "A", model: result.modelA, color: "text-blue-400", borderColor: "border-blue-500/40", bg: "bg-blue-500/08" },
              { key: "B", model: result.modelB, color: "text-[#d9b775]", borderColor: "border-[#d9b775]/40", bg: "bg-purple-500/08" },
            ] as const).map(({ key, model, color, borderColor, bg }) => (
              <div key={key} className={`border rounded-xl p-4 ${borderColor} ${bg}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className={`font-bold text-sm ${color}`}>Model {key}: {model.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {getConfidence(model.analysis)}% confidence
                  </div>
                </div>
                <div className="h-1.5 bg-muted/30 rounded-full mb-3">
                  <div className={`h-1.5 rounded-full ${key === "A" ? "bg-blue-500" : "bg-purple-500"}`} style={{ width: `${getConfidence(model.analysis)}%` }} />
                </div>
                <p className="text-sm leading-relaxed">{getAnalysisText(model.analysis)}</p>
                {model.analysis.reasoning && (
                  <div className="mt-3 pt-3 border-t border-border/30">
                    <div className="text-xs text-muted-foreground font-medium mb-1">Reasoning</div>
                    <p className="text-xs text-muted-foreground">{model.analysis.reasoning}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-2">Which forecast do you trust more?</h3>
            <div className="flex gap-3">
              {(["A", "B"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setVote(v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${vote === v ? (v === "A" ? "bg-blue-500/20 text-blue-400 border border-blue-500/40" : "bg-purple-500/20 text-[#d9b775] border border-[#d9b775]/40") : "bg-muted/20 hover:bg-muted/40"}`}
                >
                  Model {v}: {v === "A" ? result.modelA.name : result.modelB.name}
                </button>
              ))}
            </div>
            {vote && <p className="text-xs text-muted-foreground text-center mt-2">You voted for Model {vote}. Great instinct!</p>}
          </div>

          {(result.modelA.analysis.consensus || result.modelB.analysis.consensus) && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2">Consensus View</h3>
              <p className="text-sm text-muted-foreground">{result.modelA.analysis.consensus ?? result.modelB.analysis.consensus}</p>
            </div>
          )}

          <button
            onClick={run}
            className="w-full py-2 flex items-center justify-center gap-2 text-sm text-primary hover:underline"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Run Another Duel
          </button>

          <p className="text-xs text-muted-foreground text-center">AI-generated forecasts · Not official NWS guidance</p>
        </div>
      )}
    </div>
  );
}
