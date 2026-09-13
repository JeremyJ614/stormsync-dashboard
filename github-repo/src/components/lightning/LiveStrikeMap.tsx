/**
 * Live lightning — where it is striking, and where it is about to.
 *
 * WHAT THIS REPLACED, AND WHY IT HAD TO
 * The Live tab was a single JPEG from NESDIS under a header reading "GOES-19
 * GLM Flash Extent Density". It was not that. The URL was
 * `GOES16/ABI/CONUS/GEOCOLOR/1250x750.jpg`, which 301s to
 * `GOES19/ABI/CONUS/GEOCOLOR` — the visible-and-infrared GeoColor picture.
 * Clouds, not lightning. A caption underneath then explained which pixels were
 * the flashes, of an image that contained none.
 *
 * (The real product does exist at that host and is now used for the still:
 * `GOES19/GLM/CONUS/EXTENT3/1250x750.jpg`, verified as a 1 MB JPEG.)
 *
 * WHAT IS HERE NOW
 * Two layers on the app's own map rather than a picture of someone else's, so
 * it pans, zooms and sits over the same basemap as every other map in the app:
 *
 *   FLASHES — GOES-East GLM Flash Extent Density. Every flash the geostationary
 *     lightning mapper saw in the last few minutes, which is the honest answer
 *     to "where is it striking".
 *
 *   NEXT HOUR — LightningCast v2. A model that reads the satellite's cloud
 *     fields and radar and gives the probability of a flash in the next sixty
 *     minutes. This is the part worth having and the part a strike map cannot
 *     do: a strike map tells you where the storm already is, and by the time a
 *     flash appears over you it is too late for that to have been useful.
 *
 * Both come from SSEC RealEarth, which the Radar module already draws from, so
 * this adds a layer rather than a dependency.
 */
import { memo, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Zap, Timer, Layers } from "lucide-react";
import { BaseMap } from "../map/BaseMap";
import { ROYAL, EASE } from "../../lib/royal";

type Layer = "flash" | "cast";

const RE = (code: string, bust: number) =>
  `https://realearth.ssec.wisc.edu/tiles/${code}/{z}/{x}/{y}.png?_=${bust}`;

const LAYERS: {
  id: Layer; label: string; blurb: string; code: string; icon: typeof Zap;
  legend: { c: string; t: string }[];
}[] = [
  {
    id: "flash", label: "Flashes now", icon: Zap,
    blurb: "Every flash GOES-East's lightning mapper saw in the last few minutes.",
    code: "GOESEastGLMFEDRadC",
    legend: [
      { c: "#3b1d6e", t: "1-2" }, { c: "#7b2ff7", t: "3-6" },
      { c: "#f59e0b", t: "7-15" }, { c: "#fde68a", t: "16+" },
    ],
  },
  {
    id: "cast", label: "Next hour", icon: Timer,
    blurb: "LightningCast: the chance of a flash in the next sixty minutes, from the satellite's own cloud fields and radar.",
    code: "PLTG-abi-mrms-GOESEastRadC",
    legend: [
      { c: "#164e63", t: "10%" }, { c: "#0891b2" , t: "25%" },
      { c: "#facc15", t: "50%" }, { c: "#ef4444", t: "75%+" },
    ],
  },
];

export const LiveStrikeMap = memo(function LiveStrikeMap({
  center, bust, still, height = 460,
}: { center: { lat: number; lon: number }; bust: number; still: boolean; height?: number }) {
  const [layer, setLayer] = useState<Layer>("flash");
  const def = LAYERS.find((l) => l.id === layer)!;

  const overlays = useMemo(() => [{
    id: `lightning-${layer}`,
    url: RE(def.code, bust),
    opacity: 0.9,
    // Same reasoning as the radar module's cap: past the deepest level the
    // service publishes, the browser magnifies a 256px PNG instead.
    maxZoom: 12,
    tileSize: 256 as const,
    underLabels: true,
  }], [layer, def.code, bust]);

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: ROYAL.ink, border: `1px solid ${ROYAL.hairline}` }}>

      <div className="flex items-center gap-1.5 flex-wrap px-3 py-2.5"
           style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
        <Layers className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />
        {LAYERS.map((l) => {
          const Icon = l.icon;
          const on = l.id === layer;
          return (
            <button key={l.id} onClick={() => setLayer(l.id)}
              className="relative px-3 py-1.5 rounded-lg text-[11.5px] font-bold flex items-center gap-1.5 transition-colors"
              style={{ color: on ? "#120f1e" : ROYAL.dim }}>
              {on && (
                <motion.span aria-hidden layoutId="lightning-layer" className="absolute inset-0 rounded-lg"
                  transition={still ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
                  style={{ background: "#fbbf24" }} />
              )}
              <Icon className="w-3.5 h-3.5 relative" />
              <span className="relative">{l.label}</span>
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] shrink-0"
              style={{ color: "#fbbf24" }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#fbbf24" }} /> Live
        </span>
      </div>

      <div className="relative" style={{ height }}>
        <BaseMap center={center} zoom={4.4} height={height} overlays={overlays} />
      </div>

      <motion.div
        key={layer}
        initial={still ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: still ? 0.15 : 0.3, ease: EASE }}
        className="px-3.5 py-3 space-y-2"
        style={{ borderTop: `1px solid ${ROYAL.hairline}` }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {def.legend.map((s) => (
            <span key={s.t} className="flex items-center gap-1.5 text-[10.5px]">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.c }} />
              <span style={{ color: ROYAL.dim }}>{s.t}</span>
            </span>
          ))}
          <span className="text-[10px] ml-auto" style={{ color: ROYAL.dim }}>
            GOES-East · SSEC RealEarth
          </span>
        </div>
        <p className="text-[11px] leading-relaxed" style={{ color: ROYAL.dim }}>{def.blurb}</p>
      </motion.div>
    </div>
  );
});
