import { useEffect, useState } from "react";
import { getLatestBrief, type DailyBrief } from "../lib/dailyBrief";
import { Zap, Loader2, Tornado, Wind, CloudHail, Target } from "lucide-react";

const CAT_COLOR: Record<string, string> = {
  TSTM: "#4ade80", MRGL: "#22c55e", SLGT: "#eab308", ENH: "#f97316", MDT: "#ef4444", HIGH: "#ec4899",
};

function ProbStat({ icon: Icon, label, value, color, compact }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: number; color: string; compact?: boolean }) {
  return (
    <div className={`flex-1 bg-muted/20 rounded-lg text-center ${compact ? "min-w-0 p-1" : "min-w-[88px] p-2.5"}`}>
      <Icon className={`mx-auto mb-1 ${compact ? "w-3 h-3" : "w-4 h-4"}`} style={{ color }} />
      <div className="font-bold tabular-nums" style={{ color, fontSize: compact ? "clamp(11px, 3.2vw, 15px)" : undefined }}>
        {value}%
      </div>
      <div className={`uppercase tracking-widest text-muted-foreground truncate ${compact ? "text-[7.5px]" : "text-[9px]"}`}>{label}</div>
    </div>
  );
}

/**
 * `compact` is the Home page's half-size variant.
 *
 * It shrinks the frame rather than dropping anything: the headline, the
 * summary, the three probabilities and the chase targets all still appear,
 * because a briefing with its content trimmed away is a header, not a
 * briefing. What goes is padding, type size and — on the narrow column it now
 * shares with the wall — the summary's tail past four lines.
 */
export default function DailyBriefing({ compact = false }: { compact?: boolean } = {}) {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    getLatestBrief()
      .then(setBrief)
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading today's storm briefing…
      </div>
    );
  }
  // No brief yet, or load failed — keep it quiet (the engine runs nightly).
  if (err || !brief) return null;

  const ov = brief.content.risk_overview;
  const cat = ov?.day1_category;
  const catColor = cat ? (CAT_COLOR[cat] ?? "#7B8FD9") : "#64748b";
  const isAI = brief.status === "ok";

  return (
    <div className={`rounded-2xl border ${compact ? "p-3.5 md:p-4 space-y-2.5 h-full" : "p-5 md:p-6 space-y-4"}`}
      style={{ borderColor: catColor + "55", background: `linear-gradient(135deg, ${catColor}14, transparent 70%)` }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className={compact ? "w-4 h-4" : "w-5 h-5"} style={{ color: catColor }} />
          <div>
            <div className={`uppercase text-muted-foreground ${compact ? "text-[7.5px] tracking-[0.16em] truncate" : "text-[10px] tracking-[0.3em]"}`}>
              {compact ? "SSWX Storm Engine" : "SSWX Storm Engine · Daily Briefing"}
            </div>
            <h2 className={`font-bold leading-tight ${compact ? "line-clamp-3" : "text-lg md:text-xl"}`}
                style={compact ? { fontSize: "clamp(11.5px, 3.4vw, 15px)" } : undefined}>
              {brief.headline ?? "Today's severe weather outlook"}
            </h2>
          </div>
        </div>
        {ov && (
          <span className={`rounded-lg font-bold uppercase tracking-widest border shrink-0 ${compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"}`}
            style={{ color: catColor, borderColor: catColor + "66", background: catColor + "1a" }}>
            Day 1: {ov.day1_category_name}
          </span>
        )}
      </div>

      {/* The summary is the first thing to go when the column is half a phone
          wide: at ~190px it is four words a line and reads as noise. The
          headline, the risk category and the three numbers survive at any
          width, and those are what a glance is actually for. */}
      {brief.summary && (
        <p className={`leading-relaxed text-foreground/90 ${
          compact ? "text-[12px] line-clamp-4 hidden sm:block" : "text-sm"}`}>
          {brief.summary}
        </p>
      )}

      {ov && (
        <div className="flex gap-2 flex-wrap">
          <ProbStat icon={Tornado} label="Tornado" value={ov.tornado_prob_max} color="#ef4444" compact={compact} />
          <ProbStat icon={Wind} label="Wind" value={ov.wind_prob_max} color="#22d3ee" compact={compact} />
          <ProbStat icon={CloudHail} label="Hail" value={ov.hail_prob_max} color="#a855f7" compact={compact} />
        </div>
      )}

      {isAI && brief.content.chase_targets && brief.content.chase_targets.length > 0 && (
        <div className={`space-y-1.5 ${compact ? "hidden lg:block" : ""}`}>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Target className="w-3 h-3" /> Chase Targets</div>
          {brief.content.chase_targets.map((t, i) => (
            <div key={i} className={`bg-muted/20 rounded-lg ${compact ? "p-2 text-[11px]" : "p-2.5 text-xs"}`}>
              <span className="font-semibold text-foreground">{t.area}</span>
              <span className="text-muted-foreground"> — {t.reason} <em className="text-foreground/70">({t.hazards})</em></span>
            </div>
          ))}
        </div>
      )}

      <div className={`flex items-center justify-between gap-2 text-[10px] text-muted-foreground/70 pt-1 border-t border-border/50 ${
        compact ? "hidden sm:flex" : ""}`}>
        <span>
          {isAI
            ? `AI brief · ${brief.model ?? "Storm Engine"}${brief.content.confidence ? ` · ${brief.content.confidence} confidence` : ""}`
            : "Automated SPC risk overview — AI brief activates once the Storm Engine is keyed"}
        </span>
        <span>{brief.briefDate}</span>
      </div>
    </div>
  );
}
