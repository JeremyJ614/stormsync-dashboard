import { useState } from "react";
import { ModuleShell } from "../components/ModuleShell";
import { ROYAL } from "../lib/royal";
import { RefreshCw, ExternalLink } from "lucide-react";
import type { Location } from "../hooks/useLocation";

interface Props { location: Location }

const DROUGHT_REGIONS = [
  { id: "US", label: "United States", img: "https://droughtmonitor.unl.edu/data/png/current/current_usdm.png",      external: "https://droughtmonitor.unl.edu/CurrentMap.aspx" },
  { id: "OH", label: "Ohio",          img: "https://droughtmonitor.unl.edu/data/png/current/current_OH_trd.png",  external: "https://droughtmonitor.unl.edu/CurrentMap/StateDroughtMonitor.aspx?OH" },
];

const NWS_HAZARDS_IMG = "https://www.weather.gov/wwamap/png/US.png";
const NWS_HAZARDS_EXTERNAL = "https://www.weather.gov/";

const DROUGHT_LEGEND = [
  { code: "D0", label: "Abnormally Dry",     color: "#f5e5a0" },
  { code: "D1", label: "Moderate Drought",   color: "#f0c040" },
  { code: "D2", label: "Severe Drought",     color: "#e08020" },
  { code: "D3", label: "Extreme Drought",    color: "#d04010" },
  { code: "D4", label: "Exceptional Drought",color: "#8b0000" },
];

export default function HazardsMap({ location }: Props) {
  const [tab, setTab] = useState<"hazards" | "drought">("hazards");
  const [droughtRegion, setDroughtRegion] = useState("US");
  const [reloadKey, setReloadKey] = useState(0);
  const [imgError, setImgError] = useState<Record<string, boolean>>({});

  const refresh = () => { setReloadKey(k => k + 1); setImgError({}); };

  const currentDrought = DROUGHT_REGIONS.find(r => r.id === droughtRegion)!;
  const hazardSrc = `${NWS_HAZARDS_IMG}?t=${reloadKey}`;
  const droughtSrc = `${currentDrought.img}?t=${reloadKey}`;

  return (
    <ModuleShell
      eyebrow="NWS Hazards · USDM Drought Monitor"
      title={<>Hazards &amp; Drought</>}
      subtitle={`Longer-range hazard outlooks and the weekly drought picture for ${location.name}.`}
      wide
      actions={
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 text-xs transition-colors px-2.5 py-1.5 rounded-lg"
          style={{ border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      }
    >

      <div className="flex gap-2">
        <button
          onClick={() => setTab("hazards")}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === "hazards" ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:border-primary/30"}`}
        >
          🌪️ Hazards Map
        </button>
        <button
          onClick={() => setTab("drought")}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${tab === "drought" ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:border-primary/30"}`}
        >
          🌵 Drought Monitor
        </button>
      </div>

      {tab === "hazards" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-black/30">
              <h3 className="text-sm font-semibold">NWS Active Hazards — United States</h3>
              <a href={NWS_HAZARDS_EXTERNAL} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> Open on NWS
              </a>
            </div>
            {imgError["hazard"] ? (
              <div className="p-8 text-center space-y-2 bg-muted/10">
                <div className="text-2xl">🗺️</div>
                <p className="text-sm text-muted-foreground">Could not load the hazards map right now.</p>
                <a href={NWS_HAZARDS_EXTERNAL} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline">View on weather.gov →</a>
              </div>
            ) : (
              <img
                key={hazardSrc}
                src={hazardSrc}
                alt="NWS active hazards map"
                className="w-full h-auto block bg-white"
                loading="lazy"
                onError={() => setImgError(p => ({ ...p, hazard: true }))}
              />
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-2">Additional Resources</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "All Warnings",    url: "https://www.weather.gov/" },
                { label: "Flood Warnings",  url: "https://water.weather.gov/ahps2/state.php?state=us" },
                { label: "Fire Weather",    url: "https://www.spc.noaa.gov/products/fire_wx/" },
                { label: "Marine Warnings", url: "https://marine.weather.gov/" },
              ].map(link => (
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 text-sm hover:bg-muted/50 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-primary" /> {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "drought" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {DROUGHT_REGIONS.map(r => (
              <button
                key={r.id}
                onClick={() => { setDroughtRegion(r.id); setImgError({}); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${droughtRegion === r.id ? "bg-primary/15 text-primary border border-primary/30" : "bg-card border border-border text-muted-foreground hover:border-primary/30"}`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-black/30">
              <h3 className="text-sm font-semibold">US Drought Monitor — {currentDrought.label}</h3>
              <a href={currentDrought.external} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> Open on USDM
              </a>
            </div>
            {imgError[`drought-${droughtRegion}`] ? (
              <div className="p-8 text-center space-y-2 bg-muted/10">
                <div className="text-2xl">🌵</div>
                <p className="text-sm text-muted-foreground">Could not load drought map right now.</p>
                <a href={currentDrought.external} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline">View on droughtmonitor.unl.edu →</a>
              </div>
            ) : (
              <img
                key={droughtSrc}
                src={droughtSrc}
                alt={`USDM ${currentDrought.label} drought map`}
                className="w-full h-auto block bg-white"
                loading="lazy"
                onError={() => setImgError(p => ({ ...p, [`drought-${droughtRegion}`]: true }))}
              />
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Drought Classification</h3>
            <div className="space-y-2">
              {DROUGHT_LEGEND.map(d => (
                <div key={d.code} className="flex items-center gap-3">
                  <div className="w-8 h-4 rounded shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs font-bold text-foreground w-6 shrink-0">{d.code}</span>
                  <span className="text-xs text-muted-foreground">{d.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
              The USDM is produced by the National Drought Mitigation Center at the University of Nebraska-Lincoln
              in partnership with USDA and NOAA. Updated every Thursday.
            </p>
          </div>
        </div>
      )}
    </ModuleShell>
  );
}
