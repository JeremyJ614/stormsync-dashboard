import { useDailyBrief } from "../hooks/useDailyBrief";
import type { RiskOverview } from "../lib/dailyBrief";
import type { Location } from "../hooks/useLocation";
import { PageSkeleton } from "../components/WeatherSkeleton";
import { Brain, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props { location: Location }

// Deterministic national severe-activity index from the SPC risk overview the
// Storm Engine ingests nightly (no AI / no per-request cost): the Day-1 category
// sets the baseline, the peak hazard probability nudges it within the band.
const CAT_BASE: Record<string, number> = { TSTM: 15, MRGL: 30, SLGT: 52, ENH: 70, MDT: 86, HIGH: 97 };
function patternScore(o?: RiskOverview): number {
  if (!o) return 0;
  const base = o.day1_category ? (CAT_BASE[o.day1_category] ?? 10) : 5;
  const maxProb = Math.max(o.tornado_prob_max, o.wind_prob_max, o.hail_prob_max);
  return Math.min(100, Math.round(base + Math.min(maxProb, 15) * 0.4));
}
function hazardList(o?: RiskOverview): string[] {
  if (!o) return [];
  const h: string[] = [];
  if (o.tornado_prob_max > 0) h.push(`Tornadoes — peak ${o.tornado_prob_max}% probability`);
  if (o.wind_prob_max > 0) h.push(`Damaging wind — peak ${o.wind_prob_max}% probability`);
  if (o.hail_prob_max > 0) h.push(`Large hail — peak ${o.hail_prob_max}% probability`);
  return h;
}

function WPIGauge({ score }: { score: number }) {
  const color =
    score >= 80 ? "#d946ef"
    : score >= 60 ? "#ef4444"
    : score >= 40 ? "#f97316"
    : score >= 20 ? "#fde047"
    : "#4ade80";
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
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold" style={{ color }}>{score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className="mt-2 font-semibold text-sm" style={{ color }}>{label} Activity</span>
    </div>
  );
}

export default function WeatherPatternIndex(_: Props) {
  const { data: brief, isLoading } = useDailyBrief();
  const overview = brief?.content.risk_overview;
  const pattern = brief?.content.pattern?.trim();
  const score = patternScore(overview);
  const hazards = hazardList(overview);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Weather Pattern AI</h2>
      </div>
      <p className="text-sm text-muted-foreground">Nationwide · SSWX nightly pattern analysis</p>

      {isLoading && <PageSkeleton />}

      {!isLoading && !brief && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Brain className="w-12 h-12 mx-auto mb-4 text-primary opacity-60" />
          <h3 className="font-semibold text-lg mb-2">Pattern analysis not ready yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The SSWX Storm Engine writes one national pattern analysis each morning. Check back shortly.
          </p>
        </div>
      )}

      {!isLoading && brief && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-6 flex flex-col md:flex-row items-center gap-6">
            <WPIGauge score={score} />
            <div className="flex-1">
              <h4 className="font-semibold mb-2">{brief.headline ?? "Pattern Summary"}</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {brief.summary ?? "National severe-weather pattern overview."}
              </p>
              {brief.content.confidence && (
                <div className="mt-3 inline-flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground uppercase tracking-wider">Confidence</span>
                  <span className="font-semibold text-primary capitalize">{brief.content.confidence}</span>
                </div>
              )}
            </div>
          </div>

          {hazards.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                Key Hazards Today
              </h4>
              <ul className="space-y-1">
                {hazards.map((h, i) => (
                  <li key={i} className="text-sm flex items-start gap-2">
                    <span className="text-yellow-400 mt-0.5">⚠</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pattern && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="font-semibold text-sm mb-2">Pattern & Day 2-3 Trend</h4>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{pattern}</p>
            </div>
          )}

          {overview && (
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="font-semibold text-sm mb-3">SPC Outlook Trend</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { d: "Today", c: overview.day1_category_name },
                  { d: "Day 2", c: overview.day2_category ?? "—" },
                  { d: "Day 3", c: overview.day3_category ?? "—" },
                ].map(x => (
                  <div key={x.d} className="bg-muted/20 rounded-lg p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{x.d}</div>
                    <div className="text-sm font-semibold mt-0.5">{x.c}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            {brief.generatedAt
              ? (() => { try { return `Generated ${format(parseISO(brief.generatedAt), "MMM d · h:mm a")} · `; } catch { return ""; } })()
              : ""}
            AI analysis · Not official NWS guidance
          </p>
        </div>
      )}
    </div>
  );
}
