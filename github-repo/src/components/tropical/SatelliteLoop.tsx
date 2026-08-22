/**
 * Storm-centred GOES loop.
 *
 * Frames are assembled from CIRA SLIDER tiles rather than NESDIS full-disk
 * JPEGs: the edge function works out which 678 px tiles intersect a crop box
 * around the storm, so a frame costs a few hundred KB at full 2 km resolution
 * instead of ~1.8 MB for a whole hemisphere.
 *
 * Frames load lazily around the playhead, so scrubbing never blocks on a
 * hundred outstanding image requests.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Play, Pause, SkipBack, SkipForward, Gauge, Download, Satellite,
} from "lucide-react";
import { type SatelliteData, tropicalFetch, tileUrl, GOLD } from "../../lib/tropical";
import { Panel, Source, Spinner, Empty, HEADING_FONT } from "./ui";

const SPEEDS = [0.5, 1, 2, 4];
const PRODUCTS = [
  { key: "band_13", label: "Clean IR" },
  { key: "geocolor", label: "GeoColor" },
  { key: "band_02", label: "Visible" },
];

export default function SatelliteLoop({
  stormId, stormName, frames = 30,
}: { stormId: string; stormName: string; frames?: number }) {
  const [product, setProduct] = useState("band_13");
  const [zoom, setZoom] = useState(2);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [loaded, setLoaded] = useState<Set<number>>(new Set());

  const { data, isLoading, isError, error } = useQuery<SatelliteData>({
    queryKey: ["sat", stormId, product, zoom, frames],
    queryFn: () => tropicalFetch(`/satellite/${stormId}?product=${product}&zoom=${zoom}&frames=${frames}`),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  const count = data?.frames?.length ?? 0;

  // Reset the playhead whenever the frame set changes underneath us.
  useEffect(() => { setIdx(Math.max(0, count - 1)); setLoaded(new Set()); }, [count, product, zoom]);

  // Advance the loop.
  useEffect(() => {
    if (!playing || count < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), 700 / speed);
    return () => clearInterval(t);
  }, [playing, speed, count]);

  // Only keep a window of frames in flight around the playhead.
  const window = useMemo(() => {
    const s = new Set<number>();
    for (let d = -2; d <= 6; d++) s.add(((idx + d) % count + count) % count);
    return s;
  }, [idx, count]);

  const active = data?.frames?.[idx];

  if (isLoading) return <Panel title="Satellite" eyebrow="Live imagery"><Spinner label="Locating the storm on the GOES disk…" /></Panel>;
  if (isError) {
    return (
      <Panel title="Satellite" eyebrow="Live imagery">
        <Empty title="Satellite imagery unavailable" detail={(error as Error)?.message} />
      </Panel>
    );
  }
  if (!data?.available) {
    return (
      <Panel title="Satellite" eyebrow="Live imagery">
        <Empty
          title="Outside GOES coverage"
          detail={data?.reason ?? "This storm sits beyond the GOES-East and GOES-West field of view, so no loop can be built for it."}
        />
      </Panel>
    );
  }

  return (
    <Panel flush eyebrow="Live imagery" title="Satellite Loop">
      {/* Source + band picker sit on their own row: the satellite name is too
          long to share the header bar on a phone. */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/40 flex-wrap">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground truncate">
          {data.satelliteLabel}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {PRODUCTS.map((p) => (
            <button
              key={p.key}
              onClick={() => setProduct(p.key)}
              className={`px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors
                ${product === p.key ? "text-background" : "text-muted-foreground hover:text-foreground"}`}
              style={{ background: product === p.key ? GOLD : "transparent" }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {/* ── frame viewport ── */}
      <div className="relative w-full bg-black overflow-hidden" style={{ aspectRatio: "1 / 1", maxHeight: 520 }}>
        {data.frames.map((f, i) => (
          <div
            key={f.ts}
            className="absolute inset-0"
            style={{ opacity: i === idx ? 1 : 0, transition: "opacity 80ms linear" }}
          >
            {window.has(i) && (
              // Tiles are placed as percentages of the crop box so the mosaic
              // scales with the panel. Explicit maxWidth is required: Tailwind's
              // preflight sets `img { max-width: 100% }`, which would otherwise
              // shrink every tile to the crop width and pull the mosaic apart.
              <div className="absolute inset-0">
                {data.tiles.map((t) => (
                  <img
                    key={`${t.row}_${t.col}`}
                    src={tileUrl(f.base, t.row, t.col)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    onLoad={() => setLoaded((s) => (s.has(i) ? s : new Set(s).add(i)))}
                    style={{
                      position: "absolute",
                      left: `${(t.left / data.cropSize) * 100}%`,
                      top: `${(t.top / data.cropSize) * 100}%`,
                      width: `${(data.tileSize / data.cropSize) * 100}%`,
                      height: `${(data.tileSize / data.cropSize) * 100}%`,
                      maxWidth: "none",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Storm centre crosshair */}
        <div
          className="absolute pointer-events-none"
          style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}
        >
          <div className="w-6 h-6 rounded-full border" style={{ borderColor: "rgba(217,183,117,0.75)" }} />
        </div>

        {/* Timestamp + branding */}
        <div className="absolute left-0 bottom-0 px-3 py-1.5 text-[11px] font-semibold tabular-nums bg-black/65 text-white/95">
          {active ? `${active.iso.slice(11, 16)} UTC · ${new Date(active.iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
        </div>
        <div className="absolute right-0 top-0 px-3 py-1.5 text-[10px] tracking-[0.18em] uppercase bg-black/55" style={{ color: GOLD }}>
          {stormName}
        </div>
        {!loaded.has(idx) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="w-5 h-5 rounded-full border-2 border-transparent animate-spin"
              style={{ borderTopColor: GOLD, borderRightColor: GOLD }}
            />
          </div>
        )}
      </div>

      {/* ── scrubber ── */}
      <div className="px-4 pt-3">
        <input
          type="range" min={0} max={Math.max(0, count - 1)} value={idx}
          onChange={(e) => { setIdx(+e.target.value); setPlaying(false); }}
          className="w-full accent-[#d9b775]"
          aria-label="Satellite frame"
        />
      </div>

      {/* ── transport ── */}
      <div className="flex items-center gap-2 px-4 pb-4 pt-1 flex-wrap">
        <button onClick={() => { setIdx(0); setPlaying(false); }} className="p-2 rounded-lg border border-border/60 hover:border-border text-muted-foreground hover:text-foreground transition-colors" aria-label="First frame">
          <SkipBack className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setPlaying((p) => !p)} className="p-2 rounded-lg border transition-colors" style={{ borderColor: GOLD + "77", color: GOLD }} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button onClick={() => { setIdx(count - 1); setPlaying(false); }} className="p-2 rounded-lg border border-border/60 hover:border-border text-muted-foreground hover:text-foreground transition-colors" aria-label="Latest frame">
          <SkipForward className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-border/60 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <Gauge className="w-3.5 h-3.5" /> {speed}×
        </button>

        <span className="text-[11px] tabular-nums text-muted-foreground/80 px-1">
          {count ? idx + 1 : 0}/{count}
        </span>

        <button
          onClick={() => setZoom((z) => (z >= 3 ? 1 : z + 1))}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-border/60 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          title="Cycle resolution"
        >
          <Satellite className="w-3.5 h-3.5" /> {["", "8 km", "4 km", "2 km"][zoom]}
        </button>
        {active && (
          <a
            href={tileUrl(active.base, data.tiles[0].row, data.tiles[0].col)}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border border-border/60 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Tile
          </a>
        )}
      </div>

      <div className="px-4 pb-4">
        <Source>
          {data.satelliteLabel} ABI · {data.productLabel} · full-disk imagery at{" "}
          {["", "8", "4", "2"][data.zoom]} km, cropped to the storm using the ABI fixed-grid
          projection. Frames every 10 minutes via CIRA SLIDER (Colorado State University) / NOAA NESDIS.
        </Source>
      </div>
    </Panel>
  );
}
