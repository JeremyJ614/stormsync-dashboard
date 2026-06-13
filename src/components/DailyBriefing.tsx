import { useEffect, useState } from "react";
import { getLatestBrief, type DailyBrief } from "../lib/dailyBrief";
import { Zap, Loader2, Tornado, Wind, CloudHail, Target } from "lucide-react";

const CAT_COLOR: Record<string, string> = {
  TSTM: "#4ade80", MRGL: "#22c55e", SLGT: "#eab308", ENH: "#f97316", MDT: "#ef4444", HIGH: "#ec4899",
};

function ProbStat({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; label: string; value: number; color: string }) {
  return (
    <div className="flex-1 min-w-[88px] bg-muted/20 rounded-lg p-2.5 text-center">
      <Icon className="w-4 h-4 mx-auto mb-1" style={{ color }} />
      <div className="text-lg font-bold tabular-nums" style={{ color }}>{value}%</div>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}

export default function DailyBriefing() {
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
    <div className="rounded-2xl border p-5 md:p-6 space-y-4"
      style={{ borderColor: catColor + "55", background: `linear-gradient(135deg, ${catColor}14, transparent 70%)` }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5" style={{ color: catColor }} />
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">SSWX Storm Engine · Daily Briefing</div>
            <h2 className="text-lg md:text-xl font-bold leading-tight">{brief.headline ?? "Today's severe weather outlook"}</h2>
          </div>
        </div>
        {ov && (
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-widest border shrink-0"
            style={{ color: catColor, borderColor: catColor + "66", background: catColor + "1a" }}>
            Day 1: {ov.day1_category_name}
          </span>
        )}
      </div>

      {brief.summary && <p className="text-sm leading-relaxed text-foreground/90">{brief.summary}</p>}

      {ov && (
        <div className="flex gap-2 flex-wrap">
          <ProbStat icon={Tornado} label="Tornado" value={ov.tornado_prob_max} color="#ef4444" />
          <ProbStat icon={Wind} label="Wind" value={ov.wind_prob_max} color="#22d3ee" />
          <ProbStat icon={CloudHail} label="Hail" value={ov.hail_prob_max} color="#a855f7" />
        </div>
      )}

      {isAI && brief.content.chase_targets && brief.content.chase_targets.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><Target className="w-3 h-3" /> Chase Targets</div>
          {brief.content.chase_targets.map((t, i) => (
            <div key={i} className="bg-muted/20 rounded-lg p-2.5 text-xs">
              <span className="font-semibold text-foreground">{t.area}</span>
              <span className="text-muted-foreground"> — {t.reason} <em className="text-foreground/70">({t.hazards})</em></span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/70 pt-1 border-t border-border/50">
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
