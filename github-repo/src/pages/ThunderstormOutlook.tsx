import { useState } from "react";
import { ModuleShell } from "../components/ModuleShell";
import { CloudRain, ExternalLink, RefreshCw } from "lucide-react";
import { ProbabilityMap, PROB_STEPS } from "../components/ProbabilityMap";

const DAYS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function ThunderstormOutlook() {
  const [day, setDay] = useState(1);
  const [key, setKey] = useState(0);

  return (
    <ModuleShell
      eyebrow="SPC · NOAA"
      title="Severe Weather Probability"
      subtitle={'"Will I see severe weather?" — total-severe likelihood, Day 1 through 8.'}
      actions={
        <button onClick={() => setKey(k => k + 1)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      }
    >

      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map(d => (
            <button key={d} onClick={() => setDay(d)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${day === d ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
              Day {d}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-black/30">
          <h3 className="text-sm font-semibold">Day {day} — Chance of Any Severe Weather</h3>
          <a href={day <= 3 ? `https://www.spc.noaa.gov/products/outlook/day${day}otlk.html` : "https://www.spc.noaa.gov/products/exper/day4-8/"}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> SPC source
          </a>
        </div>
        <div className="p-3">
          <ProbabilityMap key={`${day}-${key}`} day={day} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Likelihood Scale</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {[...PROB_STEPS].reverse().map(s => (
            <div key={s.key} className="bg-background/50 rounded-lg p-2.5 flex items-start gap-2">
              <div className="w-3.5 h-3.5 rounded-sm mt-0.5 shrink-0" style={{ background: s.color }} />
              <div>
                <div className="text-xs font-bold text-foreground">{s.label}</div>
                <div className="text-[11px] text-muted-foreground">{s.note}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          This is the probability of <strong>any</strong> severe weather (tornado, damaging wind, or large hail) within about 25 miles of a point —
          not the categorical risk level. Days 1–3 are derived from the SPC categorical outlook's probability thresholds; Days 4–8 use the SPC
          probabilistic any-severe outlook.
        </p>
      </div>
    </ModuleShell>
  );
}
