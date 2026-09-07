import { useState, useSyncExternalStore } from "react";
import { ModuleShell } from "../components/ModuleShell";
import { CloudRain, ExternalLink, RefreshCw } from "lucide-react";
import { ProbabilityMap, PROB_STEPS, stepAt } from "../components/ProbabilityMap";
import { subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot } from "../lib/mapPalette";

const DAYS = [1, 2, 3, 4, 5, 6, 7, 8];

export default function ThunderstormOutlook() {
  const [day, setDay] = useState(1);
  const [key, setKey] = useState(0);
  // The scale below is the map's own colours. Subscribing is what makes an
  // admin's change reach it — without this the page would go on showing the
  // shipped ramp beside a map painted in the new one.
  useSyncExternalStore(subscribePalette, getPaletteSnapshot, getPaletteServerSnapshot);

  return (
    <ModuleShell
      eyebrow="SPC · NOAA"
      title="Severe Weather Probability"
      subtitle={'"Will I see severe weather?" — total-severe likelihood on a five-level scale, Day 1 through 8.'}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[...PROB_STEPS].reverse().map(base => {
            const s = stepAt(base.level);
            return (
            <div key={s.level} className="bg-background/50 rounded-lg p-2.5 flex items-start gap-2.5">
              <div
                className="w-7 h-7 rounded-md shrink-0 grid place-items-center text-[11px] font-black"
                style={{
                  background: s.color,
                  border: s.outline ? `1.5px solid ${s.outline}` : "none",
                  // Pale swatches need dark type on them and vice versa; this is
                  // the only place in the app where the scale's own colour is
                  // the background for its own number.
                  color: s.level >= 4 ? "#ffffff" : "#101018",
                }}
              >
                {s.level}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-foreground">{s.label}</div>
                <div className="text-[11px] text-muted-foreground">{s.note}</div>
              </div>
            </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
          This is the probability of <strong>any</strong> severe weather (tornado, damaging wind, or large hail) within about 25 miles of a point —
          not the categorical risk level. Days 1–3 come from the SPC categorical outlook, folded onto this five-level scale: General Thunder is 1,
          Marginal 2, Slight 3, Enhanced 4, and Moderate and High both reach 5. Days 4–8 use the SPC probabilistic any-severe outlook, cut at the
          same percentages the SPC uses to draw those categories, so a 15% day on Day 6 reads the same as a Slight risk on Day 1.
        </p>
      </div>
    </ModuleShell>
  );
}
