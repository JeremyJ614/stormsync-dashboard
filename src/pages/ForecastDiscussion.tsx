import { useState } from "react";
import { useNWSPoints, useNWSDiscussion } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { CardSkeleton } from "../components/WeatherSkeleton";
import { MessageSquare, Wand2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { BASE_API } from "../config";

interface Props { location: Location }

export default function ForecastDiscussion({ location }: Props) {
  const { data: nwsPoints } = useNWSPoints(location);
  const office = nwsPoints?.properties?.cwa;
  const { data: discussion, isLoading } = useNWSDiscussion(office);
  const [tab, setTab] = useState<"raw" | "friendly">("raw");
  const [friendly, setFriendly] = useState<string | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleInterpret = async () => {
    if (!discussion?.productText) return;
    setInterpreting(true);
    setAiError(null);
    try {
      const res = await fetch(`${BASE_API}/ai/discuss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discussionText: discussion.productText,
          office,
        }),
      });
      if (!res.ok) throw new Error("AI service unavailable");
      const data = await res.json() as { interpretation: string };
      setFriendly(data.interpretation);
      setTab("friendly");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI interpretation failed");
    } finally {
      setInterpreting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Forecast Discussion</h2>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · NWS Office: {office ?? "loading…"}</p>

      {isLoading && <CardSkeleton rows={8} />}

      {!isLoading && !discussion && (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
          No forecast discussion available for {office ?? "this location"}.
        </div>
      )}

      {!isLoading && discussion && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => setTab("raw")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "raw" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:border-primary/40"}`}
              >
                Technical
              </button>
              <button
                onClick={() => setTab("friendly")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === "friendly" ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:border-primary/40"}`}
              >
                Plain Language
              </button>
            </div>

            {tab === "friendly" && !friendly && (
              <button
                onClick={handleInterpret}
                disabled={interpreting}
                className="flex items-center gap-2 px-4 py-1.5 bg-primary/15 border border-primary/30 text-primary rounded-lg text-sm hover:bg-primary/25 transition-colors disabled:opacity-50"
              >
                <Wand2 className="w-3.5 h-3.5" />
                {interpreting ? "Interpreting…" : "Generate Plain Language"}
              </button>
            )}
          </div>

          {discussion.issuanceTime && (
            <div className="text-xs text-muted-foreground">
              Issued: {(() => { try { return format(parseISO(discussion.issuanceTime), "MMM d, yyyy h:mm a"); } catch { return discussion.issuanceTime; } })()}
            </div>
          )}

          {aiError && (
            <div className="bg-destructive/10 border border-destructive rounded-xl p-3 text-sm text-destructive">
              {aiError}
            </div>
          )}

          {tab === "raw" && (
            <div className="bg-card border border-border rounded-xl p-4">
              <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground overflow-x-auto">
                {discussion.productText}
              </pre>
            </div>
          )}

          {tab === "friendly" && !friendly && (
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <Wand2 className="w-8 h-8 mx-auto mb-3 text-primary opacity-50" />
              <p className="text-sm text-muted-foreground">
                Click "Generate Plain Language" to get an AI-powered plain English interpretation of the technical forecast discussion.
              </p>
              {interpreting && (
                <div className="mt-4 flex justify-center">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}

          {tab === "friendly" && friendly && (
            <div className="bg-card border border-border rounded-xl p-4 prose prose-sm prose-invert max-w-none">
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{friendly}</div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Generated by AI · Not official NWS guidance</span>
                <button
                  onClick={() => setFriendly(null)}
                  className="text-xs text-primary hover:underline"
                >
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
