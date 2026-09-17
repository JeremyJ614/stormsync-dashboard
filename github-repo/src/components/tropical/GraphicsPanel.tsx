/**
 * Official NHC storm graphics.
 *
 * Filenames are probed through a candidate list rather than assumed. The older
 * code hard-coded a `_latest.png` suffix that does not exist in any storm
 * directory, and `_5day_cone_with_line_and_wind.png` only exists for some
 * basins — the plain `_5day_cone.png` is the reliable name. Anything that
 * genuinely is not published (NHC ships no model-track graphic for Central
 * Pacific storms) is stated plainly instead of shown as a perpetual spinner.
 */
import { useState } from "react";
import { Download, ExternalLink, ImageOff } from "lucide-react";
import type { Storm } from "../../lib/tropical";
import { GOLD } from "../../lib/tropical";
import { Panel, Source, TabBar, Empty, HEADING_FONT } from "./ui";

/** basin+number folder, e.g. CP012026 → CP01 */
const folder = (atcfId: string) => atcfId.slice(0, 4);
const url = (atcfId: string, name: string) =>
  `https://www.nhc.noaa.gov/storm_graphics/${folder(atcfId)}/${atcfId}_${name}`;

interface Graphic {
  key: string; label: string; blurb: string;
  /** Tried in order; the first that loads is shown. */
  candidates: string[];
}
const GRAPHICS: Graphic[] = [
  { key: "cone", label: "Forecast Cone", blurb: "The probable track of the storm's centre over five days. The cone is not the storm's size — impacts reach well outside it.",
    candidates: ["5day_cone_with_line_and_wind.png", "5day_cone.png", "3day_cone.png"] },
  { key: "wind", label: "Wind Field", blurb: "Current extent of tropical-storm and hurricane-force winds around the centre.",
    candidates: ["current_wind.png", "wind_history.png"] },
  { key: "probs", label: "Wind Probabilities", blurb: "Chance of sustained tropical-storm-force wind (39 mph+) arriving within 120 hours.",
    candidates: ["wind_probs_34_F120.png"] },
  { key: "arrival", label: "Arrival Time", blurb: "Most likely arrival time of tropical-storm-force winds.",
    candidates: ["most_likely_toa_34.png", "3day_most_likely_toa_34.png"] },
  { key: "surge", label: "Peak Surge", blurb: "Peak storm surge height above ground that has a 1-in-10 chance of being exceeded.",
    candidates: ["peak_surge.png"] },
  { key: "key", label: "Key Messages", blurb: "The NHC's headline points for this advisory.",
    candidates: ["key_messages.png"] },
];

function GraphicImage({ atcfId, graphic }: { atcfId: string; graphic: Graphic }) {
  // Track failures by URL rather than by index. An index counter advances once
  // per error event, so a single candidate erroring twice (a re-render, a retry)
  // silently burns through the remaining candidates and reports "not published"
  // for a graphic that does exist.
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const candidates = graphic.candidates.map((c) => url(atcfId, c));
  const src = candidates.find((u) => !failed.has(u)) ?? null;
  const exhausted = src === null;

  if (exhausted) {
    return (
      <Empty
        title="Not published for this storm"
        detail={
          <>
            The National Hurricane Center has not issued a{" "}
            <span className="text-foreground/80">{graphic.label.toLowerCase()}</span> graphic for{" "}
            {atcfId}. Not every product is produced for every system or every basin.
          </>
        }
      />
    );
  }
  return (
    <>
      <img
        key={src}
        src={src!}
        alt={`${atcfId} ${graphic.label}`}
        className="w-full rounded-xl border border-border/50 bg-black/25"
        loading="lazy"
        onError={() => setFailed((f) => (f.has(src!) ? f : new Set(f).add(src!)))}
      />
      <div className="flex items-center gap-3 mt-2.5">
        <a href={src!} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider hover:underline"
           style={{ color: GOLD }}>
          <Download className="w-3 h-3" /> Full size
        </a>
      </div>
    </>
  );
}

export default function GraphicsPanel({ storm }: { storm: Storm }) {
  const [tab, setTab] = useState(GRAPHICS[0].key);
  const active = GRAPHICS.find((g) => g.key === tab)!;

  return (
    <div className="space-y-4">
      <Panel
        flush
        eyebrow={storm.advisoryNum ? `Advisory #${storm.advisoryNum}` : "Official graphics"}
        title="NHC Graphics"
        action={storm.links.graphics && (
          <a href={storm.links.graphics} target="_blank" rel="noopener noreferrer"
             className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider hover:underline"
             style={{ color: GOLD }}>
            <ExternalLink className="w-3 h-3" /> All graphics
          </a>
        )}
      >
        <TabBar className="px-2" tabs={GRAPHICS.map((g) => ({ key: g.key, label: g.label }))} active={tab} onChange={setTab} />
        <div className="p-4">
          <p className="text-[11px] text-muted-foreground/85 leading-relaxed mb-3">{active.blurb}</p>
          <GraphicImage key={active.key} atcfId={storm.atcfId} graphic={active} />
          <Source>
            Official National Hurricane Center graphics for {storm.atcfId}. Images refresh with each
            advisory, roughly every six hours.
          </Source>
        </div>
      </Panel>

      {storm.basin === "CP" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/40 px-3.5 py-3">
          <ImageOff className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground/70" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground/85" style={{ fontFamily: HEADING_FONT }}>
              No model-track graphic for Central Pacific storms.
            </span>{" "}
            The NHC does not publish one for the CP basin at all — it is not late. The{" "}
            <span className="text-foreground/80">Models</span> tab draws the same guidance directly
            from the ATCF a-deck instead.
          </p>
        </div>
      )}
    </div>
  );
}
