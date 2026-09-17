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

/**
 * How long a loop is, by default.
 *
 * Thirty frames of four tiles is around thirty-six megabytes on the default
 * infrared product — measured, not estimated: the tiles run 220–330 kB each.
 * That is a minute or more of cellular before the loop is full, during which
 * the tab looks broken. Fifteen frames is still two and a half hours of storm
 * at ten-minute imagery, and it halves the wait.
 */
const DEFAULT_FRAMES = 15;

/** Extra attempts per tile before it counts as failed. See `load` below. */
const TILE_RETRIES = 2;
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
  stormId, stormName, frames = DEFAULT_FRAMES,
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
  /** Decoded tiles, keyed by their URL. Emptied per frame — see `compose`. */
  const tiles = useRef<Map<string, HTMLImageElement>>(new Map());
  /**
   * One finished picture per frame, at the crop's native size.
   *
   * The loop used to hold every decoded TILE for the whole session, and that is
   * what made this unusable on a phone. A tile is 678x678, so a decoded one
   * costs about 1.8 MB of bitmap however small the PNG was; four per frame
   * across thirty frames is 221 MB held at once. A desktop shrugs; iOS Safari
   * discards the tab, and the symptom is a satellite tab that never fills in.
   *
   * The crop is only 500x500 of those pixels — the tile offsets are in the same
   * units, so one crop unit IS one native tile pixel and nothing is lost by
   * compositing at that size. Each frame becomes a single 500x500 canvas of
   * about 1 MB and its four source tiles are released immediately: 15 MB for a
   * fifteen-frame loop instead of 110 MB, for exactly the same picture.
   */
  const shots = useRef<Map<number, HTMLCanvasElement>>(new Map());

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
    shots.current = new Map();
    setLoaded(new Set());
    setFailed(new Set());

    /**
     * Flatten one frame's tiles into a single canvas and let the tiles go.
     *
     * Done the moment a frame's tiles have all settled rather than at paint
     * time, because the point is to stop holding them — deferring it would keep
     * every tile alive for the whole session, which is the thing being fixed.
     */
    const compose = (i: number) => {
      const f = data.frames[i];
      if (!f) return false;
      const cv = document.createElement("canvas");
      cv.width = data.cropSize;
      cv.height = data.cropSize;
      const ctx = cv.getContext("2d");
      if (!ctx) return false;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cv.width, cv.height);
      let drew = 0;
      for (const t of data.tiles) {
        const url = tileUrl(f.base, t.row, t.col);
        const img = tiles.current.get(url);
        if (img) {
          ctx.drawImage(img, t.left, t.top, data.tileSize, data.tileSize);
          drew++;
        }
        tiles.current.delete(url);      // released either way
      }
      if (drew === 0) return false;
      shots.current.set(i, cv);
      return true;
    };

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
        if (got > 0 && compose(job.i)) setLoaded((s) => new Set(s).add(job.i));
        else setFailed((s) => new Set(s).add(job.i));
        pump();
      };
      for (const url of job.urls) load(url, 0);

      /**
       * Fetch one tile, and try again before giving up on it.
       *
       * CIRA drops a share of connections when several are open at once — not
       * an HTTP error, the socket simply closes mid-exchange, and the browser
       * reports it as `onerror` exactly like a 404. Measured here: a tile that
       * returned nothing was served in full on an immediate retry.
       *
       * Without a retry each of those drops permanently killed a tile, and a
       * frame whose four tiles all dropped was marked dead for the session. On
       * a phone, where drops are commoner still, enough frames died that the
       * loop had nothing to play — which is the "no frames load" this is here
       * to fix. Two attempts with a short pause turns a transient socket close
       * back into a picture.
       */
      function load(url: string, attempt: number) {
        const img = new Image();
        // NO `crossOrigin` HERE, DELIBERATELY, AND IT MUST NOT COME BACK.
        //
        // Setting it to "anonymous" puts the request in CORS mode, and CIRA
        // SLIDER answers with no `Access-Control-Allow-Origin` header at all —
        // verified against the live host, which also 405s an OPTIONS preflight.
        // So the browser blocked every tile before it was ever decoded, on
        // every device, for every storm. That is the whole of the "satellite
        // tab loads no frames" report: not the frame count, not memory, not
        // CIRA being down. The tiles answer 200 with a 280 kB PNG to anything
        // that asks in no-cors mode, which is what an <img> does by default.
        //
        // It cost nothing to remove. `crossOrigin` exists to keep a canvas
        // untainted so its pixels can be read back, and nothing here reads
        // pixels back — there is no toDataURL, toBlob or getImageData in this
        // component, and the Download control is a plain link to the tile on
        // CIRA rather than a canvas export. It was defensive boilerplate
        // guarding a capability the component does not use, and it disabled
        // the feature it was attached to.
        img.onload = () => { if (!cancelled) { tiles.current.set(url, img); done(true); } };
        img.onerror = () => {
          if (cancelled) return;
          if (attempt < TILE_RETRIES) {
            // Staggered, so a burst of failures does not retry as a burst.
            setTimeout(() => { if (!cancelled) load(url, attempt + 1); }, 350 * (attempt + 1));
            return;
          }
          done(false);
        };
        img.src = url;
      }
    };
    for (let i = 0; i < CONCURRENCY; i++) pump();
    return () => { cancelled = true; };
  }, [data]);

  // ── paint ─────────────────────────────────────────────────────────────────
  /**
   * Draw frame `i`, optionally dissolving `frac` of the way into `next`.
   *
   * WHY A DISSOLVE. Ten-minute imagery at a frame every 700 ms is a slideshow:
   * fifteen hard cuts, each one a jump the eye reads as a stutter rather than
   * as weather moving. Nothing is wrong with the frames — there is simply
   * nothing between them. Cross-fading the changeover gives the eye a
   * continuous path from one to the next, which is what makes a loop look like
   * motion instead of a stack of photographs, and it costs one extra
   * `drawImage` of an already-decoded canvas.
   *
   * The frame is held first and dissolved late (see HOLD below) so each picture
   * is legible in its own right before it starts turning into the next one. A
   * constant dissolve across the whole interval would mean never seeing any
   * single frame cleanly.
   */
  const paintAt = useCallback((i: number, next: number, frac: number) => {
    const cv = canvasRef.current;
    if (!cv || !data?.available) return;
    const box = cv.getBoundingClientRect();
    if (box.width < 2) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    // One draw of one finished picture, scaled to fit. The per-tile
    // arithmetic moved to `compose`, where it happens once per frame instead of
    // on every repaint.
    const shot = shots.current.get(i);
    if (shot) ctx.drawImage(shot, 0, 0, w, h);

    // The frame coming in, laid over the one going out. Skipped entirely when
    // it has not decoded yet, so a gap in the loop holds on the last good
    // picture rather than fading to black and back.
    if (frac > 0 && next !== i) {
      const up = shots.current.get(next);
      if (up) {
        ctx.globalAlpha = frac;
        ctx.drawImage(up, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }
    }
  }, [data]);

  const paint = useCallback((i: number) => paintAt(i, i, 0), [paintAt]);

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
  // The animation loop reads the current frame from a ref, so changing frames
  // does not tear down and rebuild the loop sixty times a second.
  const idxRef = useRef(idx);
  idxRef.current = idx;
  /**
   * Playback.
   *
   * The loop paints on every animation frame rather than only when the frame
   * index changes. That is the difference between "advance, then wait 700 ms
   * doing nothing" and a picture that is always mid-move. React state still
   * holds which frame is current — the timestamp, the scrubber and the counter
   * all read it — but it is updated once per frame rather than being the thing
   * that drives the drawing, so the canvas is never waiting on a re-render.
   */
  useEffect(() => {
    if (!playing || count < 2) return;
    const step = 700 / speed;
    /** Fraction of each step the frame sits still before dissolving. */
    const HOLD = 0.55;
    /** The newest frame is the one people came to look at; let it linger. */
    const LAST_FRAME_HOLD = 900 / speed;

    let raf = 0;
    let started = performance.now();
    let current = -1;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const i = idxRef.current;
      if (i !== current) { current = i; started = now; }

      const dwell = step + (i === count - 1 ? LAST_FRAME_HOLD : 0);
      const elapsed = now - started;
      const n = (i + 1) % count;
      // Only dissolve toward a frame that has actually arrived; otherwise hold.
      const ready = settled.current.has(n);
      const frac = !ready ? 0
        : Math.min(1, Math.max(0, (elapsed - dwell * HOLD) / (dwell * (1 - HOLD))));
      paintAt(i, n, frac);

      if (elapsed >= dwell) {
        started = now;
        // Hold rather than blink through a frame whose tiles have not arrived.
        if (ready) { idxRef.current = n; setIdx(n); }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, count, paintAt]);

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
          detail={`The loop for ${stormName} was built — ${count} frames on ${data.satelliteLabel} — but not one tile would load. Imagery usually returns within the hour; if this persists, the tiles themselves can be opened from the Tile link.`}
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
