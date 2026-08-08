import { useQuery } from "@tanstack/react-query";
import { useDailyBrief } from "../hooks/useDailyBrief";
import type { RiskOverview } from "../lib/dailyBrief";
import type { Location } from "../hooks/useLocation";
import { PageSkeleton } from "../components/WeatherSkeleton";
import {
  getSevenDayPattern, getSeasonStats, getSurveyTiles, REGIONS,
  CAT_LABEL, CAT_COLOR, type PatternDay, type SeasonTile,
} from "../lib/patternData";
import { Brain, AlertTriangle, CalendarRange, BarChart3, TrendingUp, TrendingDown, Loader2, Flame } from "lucide-react";
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
    score >= 80 ? "#d946ef" : score >= 60 ? "#ef4444" : score >= 40 ? "#f97316"
    : score >= 20 ? "#fde047" : "#4ade80";
  const label =
    score >= 80 ? "Extreme" : score >= 60 ? "High" : score >= 40 ? "Moderate"
    : score >= 20 ? "Elevated" : "Low";

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-40 h-40">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r="48" fill="none" stroke="#1e293b" strokeWidth="12" />
          <circle cx="60" cy="60" r="48" fill="none" stroke={color} strokeWidth="12"
            strokeDasharray={`${(score / 100) * 301.6} 301.6`} strokeLinecap="round" />
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

/** Colour a Day 4-7 probability the way SPC does. */
function probColor(p: number): string {
  return p >= 0.30 ? "#dc2626" : p >= 0.15 ? "#e6a23c" : "#48a832";
}

function DayGrid({ days }: { days: PatternDay[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 min-w-[640px]">
        <thead>
          <tr>
            <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 w-32">Region</th>
            {days.map((d) => (
              <th key={d.day} className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Day {d.day}</div>
                <div className="text-[10px] text-muted-foreground/70 tabular-nums">{d.date.slice(5)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {REGIONS.map((r) => (
            <tr key={r.id}>
              <td className="text-xs font-medium px-1 whitespace-nowrap">{r.label}</td>
              {days.map((d) => {
                const c = d.cells[r.id];
                const isCat = d.kind === "categorical";
                const has = isCat ? !!c?.cat : c?.prob != null;
                const color = !has ? null : isCat ? CAT_COLOR[c.cat!] : probColor(c.prob!);
                const text = !has
                  ? (d.lowPredictability ? "—" : "·")
                  : isCat ? CAT_LABEL[c.cat!] : `${Math.round(c.prob! * 100)}%`;
                return (
                  <td key={d.day} className="text-center">
                    <div className="rounded-md py-1.5 px-1 text-[10px] font-bold border"
                      style={has
                        ? { background: color + "26", color: color!, borderColor: color + "66" }
                        : { background: "rgba(148,163,184,.06)", color: "#64748b", borderColor: "rgba(148,163,184,.15)" }}>
                      {text}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Tile({ t }: { t: SeasonTile }) {
  const tone =
    t.tone === "hot" ? "text-orange-300" :
    t.tone === "up" ? "text-red-300" :
    t.tone === "down" ? "text-emerald-300" : "text-foreground";
  const Icon = t.tone === "up" ? TrendingUp : t.tone === "down" ? TrendingDown : t.tone === "hot" ? Flame : null;
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight">{t.label}</div>
      <div className={`text-xl font-extrabold tabular-nums mt-1 flex items-center gap-1 ${tone}`}>
        {Icon && <Icon className="w-3.5 h-3.5" />}{t.value}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 truncate" title={t.sub}>{t.sub}</div>
    </div>
  );
}

export default function WeatherPatternIndex(_: Props) {
  const { data: brief, isLoading } = useDailyBrief();
  const overview = brief?.content.risk_overview;
  const pattern = brief?.content.pattern?.trim();
  const score = patternScore(overview);
  const hazards = hazardList(overview);

  const week = useQuery({
    queryKey: ["pattern7d"], queryFn: getSevenDayPattern, staleTime: 30 * 60_000,
  });
  const season = useQuery({
    queryKey: ["seasonStats"], queryFn: getSeasonStats, staleTime: 30 * 60_000,
  });
  // Separate query: DAT is an external service, so if it is slow or down the
  // report-count tiles still render rather than the whole section stalling.
  const survey = useQuery({
    queryKey: ["surveyTiles"], queryFn: getSurveyTiles, staleTime: 60 * 60_000,
  });

  const anyRisk = (week.data ?? []).some((d) =>
    REGIONS.some((r) => d.cells[r.id]?.rank > 0));

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Brain className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-bold">Weather Pattern AI</h2>
      </div>
      <p className="text-sm text-muted-foreground">Nationwide · SSWX nightly pattern analysis</p>

      {isLoading && <PageSkeleton />}

      {!isLoading && brief && (
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
      )}

      {/* ── 7-day regional breakdown ── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-sm">7-Day Outlook by Region</h4>
          {week.isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>

        {week.isLoading ? (
          <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : !week.data ? (
          <p className="text-sm text-muted-foreground">Could not reach the SPC outlook service.</p>
        ) : (
          <>
            <DayGrid days={week.data} />
            {!anyRisk && (
              <p className="text-xs text-muted-foreground">
                No SPC risk areas intersect any region across the next 7 days — a genuinely quiet week nationally.
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
              Days 1-3 are SPC's <strong>categorical</strong> outlooks; Days 4-7 are the Day 4-8{" "}
              <strong>probabilistic</strong> panels (SPC issues no categorical risk beyond Day 3), so the
              units change halfway across on purpose. A region lights up when a risk polygon actually
              overlaps it — computed geometrically here, not estimated. "—" means SPC published
              <em> Predictability Too Low</em> for that day.
            </p>
          </>
        )}
      </div>

      {/* ── Season stats ── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h4 className="font-semibold text-sm">Season So Far</h4>
          {season.data?.trackingSince && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              {season.data.days} days tracked since {season.data.trackingSince}
            </span>
          )}
        </div>
        {season.isLoading ? (
          <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : (season.data?.tiles.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No storm-report history recorded yet — the Storm Engine fills this ledger from SPC each night.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {season.data!.tiles.map((t) => <Tile key={t.id} t={t} />)}
              {(survey.data ?? []).map((t) => <Tile key={t.id} t={t} />)}
            </div>
            {survey.isLoading && (
              <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> loading survey-based stats (EF ratings, casualties)…
              </p>
            )}
            {!survey.isLoading && (survey.data?.length ?? 0) === 0 && (
              <p className="text-[10px] text-muted-foreground/70">
                Survey-based stats (strongest tornado, EF3+ days, fatalities) are unavailable right now —
                the NOAA Damage Assessment Toolkit did not respond.
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/80">
              Every figure here is counted from SPC storm reports in our own ledger — the AI on this page
              writes the narrative only, never the numbers.
              {(season.data?.pendingDetail ?? 0) > 0 && (
                <> {" "}<span className="text-yellow-300/90">
                  {season.data!.pendingDetail} earlier day{season.data!.pendingDetail === 1 ? "" : "s"} predate
                  per-report detail and aren't yet counted toward top state / largest hail / peak gust — the
                  engine backfills 25 a night.
                </span></>
              )}
            </p>
          </>
        )}
      </div>

      {hazards.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-400" /> Key Hazards Today
          </h4>
          <ul className="space-y-1">
            {hazards.map((h, i) => (
              <li key={i} className="text-sm flex items-start gap-2"><span className="text-yellow-400 mt-0.5">⚠</span>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {pattern && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="font-semibold text-sm mb-2">Pattern &amp; Day 2-3 Trend</h4>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{pattern}</p>
        </div>
      )}

      {!isLoading && !brief && (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <Brain className="w-10 h-10 mx-auto mb-3 text-primary opacity-60" />
          <h3 className="font-semibold mb-1">Nightly narrative not ready yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The Storm Engine writes one national pattern analysis each morning. The outlook grid and
            season stats above are live regardless.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        {brief?.generatedAt
          ? (() => { try { return `Narrative generated ${format(parseISO(brief.generatedAt), "MMM d · h:mm a")} · `; } catch { return ""; } })()
          : ""}
        Not official NWS guidance
      </p>
    </div>
  );
}
