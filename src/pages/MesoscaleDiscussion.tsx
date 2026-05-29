import { useState } from "react";
import type { Location } from "../hooks/useLocation";
import { Layers, ExternalLink, RefreshCw } from "lucide-react";

interface Props { location: Location }

export default function MesoscaleDiscussion({ location }: Props) {
  const [reloadKey, setReloadKey] = useState(0);
  const [imgError, setImgError] = useState(false);

  const refresh = () => { setImgError(false); setReloadKey(k => k + 1); };

  const validMdSrc = `https://www.spc.noaa.gov/products/md/validmd.gif?t=${reloadKey}`;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold tracking-wide">Mesoscale Discussions</h2>
        </div>
        <button onClick={refresh} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/40">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      <p className="text-sm text-muted-foreground">{location.name} · NOAA SPC Active MDs · Live</p>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-black/30">
          <h3 className="text-sm font-semibold">Active Mesoscale Discussions Map</h3>
          <a href="https://www.spc.noaa.gov/products/md/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="w-3 h-3" /> Open on SPC
          </a>
        </div>
        {imgError ? (
          <div className="p-8 text-center space-y-2 bg-muted/10">
            <div className="text-2xl">📡</div>
            <p className="text-sm text-muted-foreground">Could not load active MD map right now.</p>
            <a href="https://www.spc.noaa.gov/products/md/" target="_blank" rel="noopener noreferrer"
              className="text-xs text-primary hover:underline">View live on SPC →</a>
          </div>
        ) : (
          <img
            key={validMdSrc}
            src={validMdSrc}
            alt="SPC active mesoscale discussions"
            className="w-full h-auto block bg-white"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold">About Mesoscale Discussions</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          SPC Mesoscale Discussions (MDs) are short-fuse bulletins issued when severe convective weather is rapidly developing or imminent — typically 1–6 hours before a tornado or severe thunderstorm watch is issued.
          The map above shows the outline of every active MD across the country. Click <em>Open on SPC</em> for the full text of each discussion.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <a href="https://www.spc.noaa.gov/products/md/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 text-sm hover:bg-muted/50 transition-colors">
            <ExternalLink className="w-3.5 h-3.5 text-primary" /> Active MD List
          </a>
          <a href="https://www.spc.noaa.gov/products/watch/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 text-sm hover:bg-muted/50 transition-colors">
            <ExternalLink className="w-3.5 h-3.5 text-primary" /> Active Watches
          </a>
          <a href="https://www.spc.noaa.gov/exper/mesoanalysis/" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 text-sm hover:bg-muted/50 transition-colors">
            <ExternalLink className="w-3.5 h-3.5 text-primary" /> Mesoanalysis Viewer
          </a>
          <a href="https://www.spc.noaa.gov/climo/reports/today.html" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/30 text-sm hover:bg-muted/50 transition-colors">
            <ExternalLink className="w-3.5 h-3.5 text-primary" /> Today's Storm Reports
          </a>
        </div>
      </div>
    </div>
  );
}
