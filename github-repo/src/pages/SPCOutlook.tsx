import { useState } from "react";
import type { Location } from "../hooks/useLocation";
import { Globe, ExternalLink, RefreshCw, Image as ImageIcon, Crosshair } from "lucide-react";
import { SPCMap, type SPCProduct, type DisplayMode } from "../components/SPCMap";
import { SPCStaticMap } from "../components/SPCStaticMap";
import type { TargetArea } from "../lib/spcTargetAreas";

interface Props { location: Location }

// ── Day tabs: Today/Tomorrow, then real weekday abbreviations (matches how ──
// SPC actually issues Day 1-8 outlooks relative to today) ───────────────────
function buildDayTabs(): { d: number; label: string }[] {
  const today = new Date();
  return Array.from({ length: 8 }, (_, i) => {
    const d = i + 1;
    if (d === 1) return { d, label: "Today" };
    if (d === 2) return { d, label: "Tomorrow" };
    const dt = new Date(today);
    dt.setDate(dt.getDate() + (d - 1));
    return { d, label: dt.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase() };
  });
}
const DAYS = buildDayTabs();

type Hazard = "cat" | "torn" | "hail" | "wind";
const TYPES: { hazard: Hazard; mode: DisplayMode; label: string }[] = [
  { hazard: "cat", mode: "likelihood", label: "Overview" },
  { hazard: "torn", mode: "likelihood", label: "Tornado Likelihood" },
  { hazard: "torn", mode: "intensity", label: "Tornado Intensity" },
  { hazard: "hail", mode: "likelihood", label: "Hail Likelihood" },
  { hazard: "hail", mode: "intensity", label: "Hail Intensity" },
  { hazard: "wind", mode: "likelihood", label: "Wind Likelihood" },
  { hazard: "wind", mode: "intensity", label: "Wind Intensity" },
];

function buildProduct(day: number, hazard: Hazard): SPCProduct {
  if (day >= 4) return `day${day}prob` as SPCProduct; // Day 4-8: combined "any severe" outlook, no hazard breakdown
  if (hazard === "cat") return `day${day}otlk_cat` as SPCProduct;
  if (day === 3) return "day3otlk_cat"; // Day 3: categorical only
  return `day${day}otlk_${hazard}` as SPCProduct;
}

export default function SPCOutlook({ location: _ }: Props) {
  const [day, setDay] = useState(1);
  const [typeIdx, setTypeIdx] = useState(0);
  const [view, setView] = useState(0); // 0 = National, 1-3 = Target Area
  const [targets, setTargets] = useState<TargetArea[]>([]);
  const [key, setKey] = useState(0);

  const typesAvailable = day <= 2; // full hazard + intensity breakdown only exists for Day 1-2
  const activeType = typesAvailable ? TYPES[typeIdx] : TYPES[0];
  const product = buildProduct(day, activeType.hazard);
  const spcHref = day >= 4
    ? "https://www.spc.noaa.gov/products/exper/day4-8/"
    : `https://www.spc.noaa.gov/products/outlook/day${day}otlk.html`;

  function changeDay(d: number) {
    setDay(d);
    setView(0);
    if (d > 2) setTypeIdx(0);
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold tracking-wide">SPC Convective Outlook</h2>
        </div>
        <button onClick={() => setKey(k => k + 1)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      <p className="text-sm text-muted-foreground">Nationwide · NOAA Storm Prediction Center · Live</p>

      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Day</div>
          <div className="flex gap-1.5 flex-wrap">
            {DAYS.map(d => (
              <button key={d.d} onClick={() => changeDay(d.d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${day === d.d ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Type</div>
          {typesAvailable ? (
            <div className="flex flex-wrap gap-1.5">
              {TYPES.map((t, i) => (
                <button key={i} onClick={() => setTypeIdx(i)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeIdx === i ? "bg-primary/20 text-primary border border-primary/40" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {day === 3 ? "Day 3 issues a single categorical outlook (no hazard breakdown)." : "Days 4-8 show the combined probability of any severe weather (SPC issues one outlook — no hazard breakdown)."}
            </p>
          )}
        </div>

        {targets.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">View</div>
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setView(0)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${view === 0 ? "bg-primary/20 text-primary border border-primary/40" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
                National
              </button>
              {targets.map((_, i) => (
                <button key={i} onClick={() => setView(i + 1)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors ${view === i + 1 ? "bg-primary/20 text-primary border border-primary/40" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
                  <Crosshair className="w-3 h-3" /> Target {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-black/30">
          <h3 className="text-sm font-semibold">Day {day} — {activeType.label}</h3>
          <a href={spcHref} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> SPC
          </a>
        </div>
        <SPCMap key={`${product}-${activeType.mode}-${key}`} product={product} mode={activeType.mode} height={460} targetIndex={view} onTargetsComputed={setTargets} />
      </div>

      <SPCStaticMaps />
    </div>
  );
}

// ── Static, downloadable outlook images -- same palette system as the live map ──
const STATIC_DAYS = [1, 2, 3];
const STATIC_TYPES = TYPES; // reuse the same 7 hazard/mode combos
function SPCStaticMaps() {
  const [day, setDay] = useState(1);
  const [typeIdx, setTypeIdx] = useState(0);
  const typesOk = day <= 2;
  const activeType = typesOk ? STATIC_TYPES[typeIdx] : STATIC_TYPES[0];
  const product = buildProduct(day, activeType.hazard);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-black/30 flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Static Outlook Maps</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">Download &amp; share</span>
      </div>
      <div className="p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {STATIC_DAYS.map(d => (
            <button key={d} onClick={() => setDay(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${day === d ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>Day {d}</button>
          ))}
        </div>
        {typesOk ? (
          <div className="flex flex-wrap gap-1.5">
            {STATIC_TYPES.map((t, i) => (
              <button key={i} onClick={() => setTypeIdx(i)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${typeIdx === i ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>{t.label}</button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Day 3 issues a single categorical outlook (no hazard breakdown).</p>
        )}
        <SPCStaticMap product={product} mode={activeType.mode} title={`Day ${day} ${activeType.label}`} subtitle="NOAA Storm Prediction Center · United States" />
      </div>
    </div>
  );
}
