import { useState } from "react";
import { CloudRain, ExternalLink, RefreshCw } from "lucide-react";
import { SPCLeafletMap, type SPCProduct } from "../components/SPCLeafletMap";

const DAYS = [{ d: 1, label: "Day 1" }, { d: 2, label: "Day 2" }] as const;
const HAZARDS = [
  { id: "torn", label: "Tornado Probability" },
  { id: "wind", label: "Wind Probability" },
  { id: "hail", label: "Hail Probability" },
] as const;
type HazardId = (typeof HAZARDS)[number]["id"];

const TIER_INFO = [
  { pct: "2%",  label: "Possible",   desc: "Isolated activity possible but unlikely to directly impact your area." },
  { pct: "5%",  label: "Slight",     desc: "Scattered activity possible. Some watches may be issued." },
  { pct: "10%", label: "Likely",     desc: "Organized severe activity expected. Watches likely for affected areas." },
  { pct: "15%", label: "Very Likely",desc: "Significant severe weather expected across affected areas." },
  { pct: "30%", label: "High",       desc: "Widespread severe weather likely. Significant event in progress or expected." },
  { pct: "45%+",label: "Extreme",    desc: "Extremely high probability. Major outbreak possible." },
];

export default function ThunderstormOutlook() {
  const [day, setDay] = useState<1 | 2>(1);
  const [hazard, setHazard] = useState<HazardId>("torn");
  const [key, setKey] = useState(0);

  const product: SPCProduct = `day${day}otlk_${hazard}` as SPCProduct;
  const hazardLabel = HAZARDS.find(h => h.id === hazard)?.label ?? "Probability";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CloudRain className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-wide uppercase">Thunderstorm Probability</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">NOAA SPC probabilistic severe weather outlook · Nationwide</p>
        </div>
        <button onClick={() => setKey(k => k + 1)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        <div className="flex gap-2">
          {DAYS.map(d => (
            <button key={d.d} onClick={() => setDay(d.d)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${day === d.d ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {HAZARDS.map(h => (
            <button key={h.id} onClick={() => setHazard(h.id)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${hazard === h.id ? "bg-primary/15 text-primary border border-primary/30" : "bg-muted/30 text-muted-foreground border border-transparent hover:border-border"}`}>
              {h.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-black/30">
          <h3 className="text-sm font-semibold">Day {day} — {hazardLabel}</h3>
          <a href={`https://www.spc.noaa.gov/products/outlook/day${day}otlk.html`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> SPC
          </a>
        </div>
        <div className="p-3">
          <SPCLeafletMap key={`${product}-${key}`} product={product} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Probability Scale</h3>
        <div className="grid grid-cols-2 gap-2">
          {TIER_INFO.map(t => (
            <div key={t.pct} className="bg-background/50 rounded-lg p-2.5">
              <div className="font-bold text-primary text-sm">{t.pct}</div>
              <div className="text-xs font-semibold text-foreground">{t.label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
