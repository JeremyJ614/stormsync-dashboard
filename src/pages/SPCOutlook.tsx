import { useState } from "react";
import type { Location } from "../hooks/useLocation";
import { Globe, ExternalLink, RefreshCw, Image as ImageIcon } from "lucide-react";
import { SPCLeafletMap, type SPCProduct } from "../components/SPCLeafletMap";
import { SPCStaticMap } from "../components/SPCStaticMap";

interface Props { location: Location }

// ── Static outlook maps (P-06): SSWX-themed, whole-US, downloadable snapshots ────
// Same risk colors as the live map above, rendered self-contained (no tiles) so
// every day/hazard always loads and exports cleanly to a shareable image.
const STATIC_DAYS = [1, 2, 3];
const STATIC_HAZ = [
  { id: "cat", label: "Categorical" },
  { id: "torn", label: "Tornado" },
  { id: "wind", label: "Wind" },
  { id: "hail", label: "Hail" },
] as const;
type HazId = (typeof STATIC_HAZ)[number]["id"];

function SPCStaticMaps() {
  const [day, setDay] = useState(1);
  const [haz, setHaz] = useState<HazId>("cat");
  // Hazard-specific outlooks only exist for Days 1-2; Day 3 is categorical only.
  const hazardOk = day <= 2;
  const activeHaz: HazId = hazardOk ? haz : "cat";
  const product = (activeHaz === "cat" ? `day${day}otlk_cat` : `day${day}otlk_${activeHaz}`) as SPCProduct;
  const hazLabel = STATIC_HAZ.find(h => h.id === activeHaz)!.label;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-black/30 flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Static Outlook Maps</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">SSWX-themed · download &amp; share</span>
      </div>
      <div className="p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {STATIC_DAYS.map(d => (
            <button key={d} onClick={() => setDay(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${day === d ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>Day {d}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATIC_HAZ.map(h => {
            const disabled = !hazardOk && h.id !== "cat";
            return (
              <button key={h.id} disabled={disabled} onClick={() => setHaz(h.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${activeHaz === h.id ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"} ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}>{h.label}</button>
            );
          })}
        </div>
        {!hazardOk && <p className="text-[11px] text-muted-foreground">Day 3 issues a single categorical outlook (no hazard breakdown).</p>}
        <SPCStaticMap product={product} title={`Day ${day} ${hazLabel} Outlook`} subtitle="NOAA Storm Prediction Center · United States" />
      </div>
    </div>
  );
}

const DAYS = [
  { d: 1, label: "Day 1" },
  { d: 2, label: "Day 2" },
  { d: 3, label: "Day 3" },
  { d: 4, label: "Day 4" },
  { d: 5, label: "Day 5" },
  { d: 6, label: "Day 6" },
];
const TYPES = [
  { id: "cat",  label: "Overview" },
  { id: "torn", label: "Tornado" },
  { id: "hail", label: "Hail" },
  { id: "wind", label: "Wind" },
] as const;
type TypeId = (typeof TYPES)[number]["id"];

function buildProduct(day: number, type: TypeId): SPCProduct {
  if (day >= 4) return `day${day}prob` as SPCProduct;        // Day 4-8: combined "any severe" outlook
  if (type === "cat") return `day${day}otlk_cat` as SPCProduct;
  if (day === 3) return "day3otlk_cat";
  // SPC names the hazard probability products dayNotlk_{torn,wind,hail}.
  return `day${day}otlk_${type}` as SPCProduct;
}

export default function SPCOutlook({ location: _ }: Props) {
  const [day, setDay] = useState(1);
  const [type, setType] = useState<TypeId>("cat");
  const [key, setKey] = useState(0);

  const product = buildProduct(day, type);
  const typeLabel = day >= 4 ? "Severe Probability" : (TYPES.find(t => t.id === type)?.label ?? "Overview");
  const spcHref = day >= 4
    ? "https://www.spc.noaa.gov/products/exper/day4-8/"
    : `https://www.spc.noaa.gov/products/outlook/day${day}otlk.html`;

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
        <div className="flex gap-2">
          {DAYS.map(d => (
            <button key={d.d} onClick={() => setDay(d.d)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${day === d.d ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
              {d.label}
            </button>
          ))}
        </div>
        {day <= 3 ? (
          <div className="flex flex-wrap gap-2">
            {TYPES.map(t => {
              const disabled = day === 3 && t.id !== "cat";
              return (
                <button key={t.id} onClick={() => !disabled && setType(t.id)} disabled={disabled}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${type === t.id ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"} ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}>
                  {t.label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Days 4-6 show the combined probability of any severe weather (SPC issues a single outlook — no hazard breakdown).</p>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-black/30">
          <h3 className="text-sm font-semibold">Day {day} — {typeLabel} Outlook</h3>
          <a href={spcHref}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> SPC
          </a>
        </div>
        <SPCLeafletMap key={`${product}-${key}`} product={product} height={460} />
      </div>

      {day === 3 && type !== "cat" && (
        <p className="text-xs text-muted-foreground">Day 3 only has a categorical outlook — switching to Overview.</p>
      )}

      <SPCStaticMaps />
    </div>
  );
}
