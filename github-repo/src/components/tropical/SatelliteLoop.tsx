/**
 * Storm-centred GOES loop.
 *
 * Frames are assembled from CIRA SLIDER tiles rather than NESDIS full-disk
 * JPEGs: the edge function works out which 678 px tiles intersect a crop box
 * around the storm, so a frame costs a few hundred KB at full 2 km resolution
 * instead of ~1.8 MB for a whole hemisphere.
 *
 * Frames are composited onto one canvas rather than stacked as DOM. Thirty
 * frames of up to six tiles each is 180 <img> elements, all laid out, all
 * cross-fading — which is what made playback stutter. Tiles are decoded once
 * and then each frame is six drawImage calls, and the loop runs on
 * requestAnimationFrame so a frame advances on a paint rather than between two.
 *
 * WHY IT USED TO LOOK BROKEN. The playhead starts on the newest frame, which is
 * the one anybody opening this tab wants to see — and the loader worked through
 * the frames from oldest to newest, four at a time. So the frame on screen was
 * the last one to arrive: on a storm whose tiles run 300 KB each, that is the
 * better part of a minute of black canvas with nothing but a small "Buffering"
 * chip to explain it. It was not failing, but there is no useful difference
 * between a tab that takes a minute to show anything and one that is broken.
 *
 * Frames are now decoded in playback order starting from the frame actually on
 * screen, so the first thing that finishes is the first thing you are looking
 * at. And a frame is only counted as ready if at least one of its tiles really
 * decoded — an errored tile used to settle exactly like a loaded one, so a
 * genuinely dead frame was shown as black rather than skipped, and a genuinely
 * dead product still reported "Buffering 30/30".
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Play, Pause, SkipBack, SkipForward, Gauge, Download, Satellite,
} from "lucide-react";
import { type SatelliteData, tropicalFetch, tileUrl, GOLD } from "../../lib/tropical";
import { Panel, Source, Spinner, Empty } from "./ui";

const SPEEDS = [0.5, 1, 2, 4];
/** Native resolution per zoom level, as CIRA serves it. */
const ZOOMS = [
  { z: 1, label: "8 km" },
  { z: 2, label: "4 km" },
  { z: 3, label: "2 km" },
];
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
  /** Frames whose tiles all failed. Kept apart from `loaded` so a dead product
      can say so instead of playing black. */
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Decoded tiles, keyed by their URL. */
  const tiles = useRef<Map<string, HTMLImageElement>>(new Map());

  const { data, isLoading, isError, error } = useQuery<SatelliteData>({
    queryKey: ["sat", stormId, product, zoom, frames],
    queryFn: () => tropicalFetch(`/satellite/${stormId}?product=${product}&zoom=${zoom}&frames=${frames}`),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });

  const count = data?.frames?.length ?? 0;

  // Reset the playhead whenever the frame set changes underneath us.
  useEffect(() => {
    setIdx(Math.max(0, count - 1)); setLoaded(new Set()); setFailed(new Set());
  }, [count, product, zoom]);

  // ── decode every tile once ────────────────────────────────────────────────
  // Four at a time so the frames finish roughly in the order they are played,
  // rather than thirty frames all half-arrived at once.
  useEffect(() => {
    if (!data?.available || !data.frames?.length) return;
    let cancelled = false;
    tiles.current = new Map();
    setLoaded(new Set());
    setFailed(new Set());

    const n = data.frames.length;
    // Playback order from where the playhead actually starts: newest first,
    // then wrapping round through the oldest. Decoding 0…n-1 while showing
    // n-1 is what made the tab look dead on open.
    const order = Array.from({ length: n }, (_, k) => (n - 1 + k) % n);
    const jobs = order.map((i) => ({
      i, urls: data.tiles.map((t) => tileUrl(data.frames[i].base, t.row, t.col)),
    }));

    let next = 0;
    const CONCURRENCY = 4;

    const pump = () => {
      if (cancelled || next >= jobs.length) return;
      const job = jobs[next++];
      let left = job.urls.length;
      let got = 0;
      const done = (ok: boolean) => {
        if (cancelled) return;
        if (ok) got++;
        if (--left > 0) return;
        // A frame counts as ready only if something actually decoded. Marking
        // an all-errors frame "loaded" is what let the loop hold on black.
        if (got > 0) setLoaded((s) => new Set(s).add(job.i));
        else setFailed((s) => new Set(s).add(job.i));
        pump();
      };
      for (const url of job.urls) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { tiles.current.set(url, img); done(true); };
        img.onerror = () => done(false);
        img.src = url;
      }
    };
    for (let i = 0; i < CONCURRENCY; i++) pump();
    return () => { cancelled = true; };
  }, [data]);

  // ── paint ─────────────────────────────────────────────────────────────────
  const paint = useCallback((i: number) => {
    const cv = canvasRef.current;
    if (!cv || !data?.available) return;
    const box = cv.getBoundingClientRect();
    if (box.width < 2) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const f = data.frames[i];
    if (!f) return;
    const k = w / data.cropSize;              // crop pixels → canvas pixels
    const size = data.tileSize * k;
    for (const t of data.tiles) {
      const img = tiles.current.get(tileUrl(f.base, t.row, t.col));
      if (!img) continue;
      ctx.drawImage(img, t.left * k, t.top * k, size, size);
    }
  }, [data]);

  useEffect(() => { paint(idx); }, [paint, idx, loaded]);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => paint(idx));
    ro.observe(cv);
    return () => ro.disconnect();
  }, [paint, idx]);

  // ── advance ───────────────────────────────────────────────────────────────
  const settled = useRef<Set<number>>(new Set());
  settled.current = loaded;
  useEffect(() => {
    if (!playing || count < 2) return;
    let raf = 0, last = performance.now();
    const step = 700 / speed;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < step) return;
      last = now;
      // Hold rather than blink through a frame whose tiles have not arrived.
      setIdx((i) => {
        const n = (i + 1) % count;
        return settled.current.has(n) ? n : i;
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, count]);

  const active = data?.frames?.[idx];
  const buffered = loaded.size;
  /** Nothing decoded and everything tried: the product is genuinely down. */
  const allDead = count > 0 && failed.size === count;
  /** The frame on screen has not arrived yet. Worth saying, not worth hiding. */
  const waiting = count > 0 && !loaded.has(idx) && !allDead;

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
  if (allDead) {
    return (
      <Panel title="Satellite" eyebrow="Live imagery">
        <Empty
          title="Imagery is not coming through"
          detail={`The loop for ${stormName} was built — ${count} frames on ${data.satelliteLabel} — but not one tile would load. That is CIRA SLIDER's end rather than ours; it is usually back within the hour.`}
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
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

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
        {buffered + failed.size < count && (
          <div className="absolute top-2 left-2 right-2 flex items-center gap-2">
            <span className="text-[10px] text-white/85 bg-black/70 rounded px-1.5 py-0.5 shrink-0 tabular-nums">
              Buffering {buffered}/{count}
              {failed.size > 0 ? ` · ${failed.size} unavailable` : ""}
            </span>
            <div className="flex-1 h-1 rounded bg-black/60 overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${((buffered + failed.size) / Math.max(1, count)) * 100}%`, background: GOLD }} />
            </div>
          </div>
        )}

        {/* Something to look at while the first frame arrives. A black rectangle
            with a 10px chip in the corner is indistinguishable from a broken
            tab, which is exactly what it was being reported as. */}
        {waiting && (
          <div className="absolute inset-0 grid place-items-center bg-black/55 pointer-events-none">
            <div className="flex flex-col items-center gap-2 px-4 text-center">
              <Satellite className="w-5 h-5 animate-pulse" style={{ color: GOLD }} />
              <span className="text-[11px] text-white/85">
                Pulling {data.satelliteLabel} imagery for {stormName}…
              </span>
              <span className="text-[10px] text-white/50 tabular-nums">
                {buffered} of {count} frames ready
              </span>
            </div>
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

        {/* A cycle button gave no feedback until the tiles reloaded, so it read
            as doing nothing. Three states, one visibly chosen. */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
          <Satellite className="w-3.5 h-3.5 ml-1 text-muted-foreground" />
          {ZOOMS.map((zz) => (
            <button
              key={zz.z}
              onClick={() => setZoom(zz.z)}
              className={`px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                zoom === zz.z ? "text-background" : "text-muted-foreground hover:text-foreground"}`}
              style={{ background: zoom === zz.z ? GOLD : "transparent" }}
              aria-pressed={zoom === zz.z}
            >
              {zz.label}
            </button>
          ))}
        </div>
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
