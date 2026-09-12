import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REGIONS, regionSourceRect, regionAspect, plateFor, type Plate } from "../lib/modelProjection";
import { Transport } from "../components/models/Transport";
import { ROYAL, HEADING } from "../lib/royal";
import { ModuleShell } from "../components/ModuleShell";
import { NowcastTab } from "../components/models/NowcastTab";
import type { Location } from "../hooks/useLocation";
import { useQuery } from "@tanstack/react-query";
import {
  Satellite, Download, Share2,
  Loader2, AlertTriangle, Clock,
} from "lucide-react";
import {
  listRuns, groupParams, cycleLabel, validLabel,
  type ModelId, type ModelRun, type ModelFrame,
} from "../lib/modelRuns";

/**
 * Model Runs — HRRR, GFS and HREF map viewer.
 *
 * Frames are pre-rendered from the NOAA Open Data GRIB buckets by
 * `scripts/render_maps.py` and served from Supabase Storage, so the browser only
 * ever loads finished PNGs — no model maths at page load.
 *
 * The previous implementation fetched Max Velocity's private API
 * (`data.maxvelocitywx.com/api/hrrr`) and crashed on `run.frames[...]` because
 * the response never matched the expected shape. Everything here reads our own
 * manifest, and every state (no run yet / still rendering / frame failed) is
 * surfaced rather than showing a blank player.
 */

// Frame durations. The fast setting is genuinely usable now that a step costs
// one drawImage from a decoded bitmap rather than an image swap.
const SPEEDS = [
  { label: "Slow", ms: 800 },
  { label: "Normal", ms: 420 },
  { label: "Fast", ms: 220 },
  { label: "Rapid", ms: 120 },
];

interface Props { location: Location }

export default function ForecastRunComparator({ location }: Props) {
  // "nowcast" is not a model here — it is a third view. The maps are national
  // and pre-rendered four times a day; the nowcast is this one point, stepped
  // every fifteen minutes, and answers what a map structurally cannot.
  const [view, setView] = useState<"hrrr" | "gfs" | "href" | "nowcast">("hrrr");
  const model: ModelId = view === "nowcast" ? "hrrr" : view;
  const setModel = (m: ModelId) => setView(m);
  const [runIdx, setRunIdx] = useState(0);
  const [paramKey, setParamKey] = useState<string | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(500);
  const [region, setRegion] = useState("conus");
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  // The decoded frames themselves. Playback draws from these onto a canvas, so
  // stepping a frame is one blit rather than an <img> src swap the browser has
  // to re-decode and re-lay-out — which is what made it stutter.
  const decoded = useRef<Map<string, CanvasImageSource & { width: number; height: number }>>(new Map());
  // Playback reads these rather than closing over render values, so the loop
  // below never has to be torn down and rebuilt just because a frame advanced.
  const framesRef = useRef<ModelFrame[]>([]);
  const frameRef = useRef<ModelFrame | undefined>(undefined);
  const idxRef = useRef(0);
  const settled = useRef<Set<string>>(new Set());

  const runs = useQuery({
    queryKey: ["model-runs", model],
    queryFn: () => listRuns(model, 6),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const run: ModelRun | undefined = runs.data?.[runIdx];
  const grouped = useMemo(() => (run ? groupParams(run.params) : []), [run]);

  // Reset selection whenever the model or run changes.
  useEffect(() => { setRunIdx(0); }, [model]);
  useEffect(() => {
    if (!run) return;
    const keys = run.params.map((p) => p.key);
    if (!paramKey || !keys.includes(paramKey)) setParamKey(keys[0] ?? null);
    setFrameIdx(0);
    setPlaying(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id]);

  const frames: ModelFrame[] = useMemo(
    () => (run && paramKey ? run.frames[paramKey] ?? [] : []), [run, paramKey]);
  const frame = frames[Math.min(frameIdx, Math.max(0, frames.length - 1))];
  const param = run?.params.find((p) => p.key === paramKey);
  framesRef.current = frames;
  frameRef.current = frame;

  // ── preload the active parameter, in order, a few at a time ──────────────
  //
  // Three things matter here and only one of them was right before.
  //
  // Order: firing all ~19 frames at once left most of them in flight while the
  // loop was already running. A small concurrency window means frames finish in
  // the order they will be played. That part was already correct.
  //
  // Decode: `drawImage(HTMLImageElement)` can still cost a decode on the draw
  // itself, which lands in the middle of a frame and shows up as a hitch. These
  // are decoded once, up front, into `ImageBitmap`s — GPU-ready, and a draw from
  // one is a blit. Browsers without `createImageBitmap` keep the old path.
  //
  // Re-renders: every completed frame used to call `setLoaded(new Set(...))`,
  // so loading a parameter re-rendered the whole page nineteen times, each one
  // re-running the paint effect. Completions are collected in a ref and flushed
  // on an animation frame, so a burst of arrivals costs one render.
  useEffect(() => {
    if (!frames.length) return;
    let cancelled = false;
    const els: HTMLImageElement[] = [];
    let next = 0;
    const CONCURRENCY = 4;

    // Batch completions rather than rendering per frame.
    const pendingOk = new Set<string>();
    const pendingBad = new Set<string>();
    let flushRaf = 0;
    const flush = () => {
      flushRaf = 0;
      if (cancelled) return;
      if (pendingOk.size) { const add = [...pendingOk]; pendingOk.clear(); setLoaded((s0) => { const n = new Set(s0); add.forEach((u) => n.add(u)); return n; }); }
      if (pendingBad.size) { const add = [...pendingBad]; pendingBad.clear(); setFailed((s0) => { const n = new Set(s0); add.forEach((u) => n.add(u)); return n; }); }
    };
    const scheduleFlush = () => { if (!flushRaf) flushRaf = requestAnimationFrame(flush); };

    const pump = () => {
      if (cancelled || next >= frames.length) return;
      const f = frames[next++];
      const img = new Image();
      // Storage serves these with `Access-Control-Allow-Origin: *`, so asking
      // for them anonymously keeps the canvas untainted — which costs nothing
      // and leaves the door open to reading pixels back later (a hover readout,
      // an export) instead of silently closing it.
      img.crossOrigin = "anonymous";
      els.push(img);
      const done = (ok: boolean) => {
        if (cancelled) return;
        if (ok) pendingOk.add(f.url); else pendingBad.add(f.url);
        scheduleFlush();
        pump();
      };
      img.onload = () => {
        if (cancelled) return;
        if (typeof createImageBitmap === "function") {
          createImageBitmap(img).then(
            (bmp) => { if (cancelled) { bmp.close?.(); return; } decoded.current.set(f.url, bmp); done(true); },
            () => { decoded.current.set(f.url, img); done(true); },
          );
        } else {
          decoded.current.set(f.url, img);
          done(true);
        }
      };
      img.onerror = () => done(false);
      img.src = f.url;
    };
    for (let i = 0; i < CONCURRENCY; i++) pump();

    return () => {
      cancelled = true;
      if (flushRaf) cancelAnimationFrame(flushRaf);
      els.forEach((i) => { i.onload = null; i.onerror = null; });
      // Release the bitmaps for the parameter being left. Without this, walking
      // through a dozen parameters holds a dozen full frame sets in memory,
      // which on a phone is where the player used to start dropping frames.
      const keep = new Set(frames.map((f) => f.url));
      for (const [url, bmp] of decoded.current) {
        if (keep.has(url)) continue;
        if (typeof ImageBitmap !== "undefined" && bmp instanceof ImageBitmap) bmp.close();
        decoded.current.delete(url);
      }
    };
  }, [frames]);

  const buffered = frames.filter((f) => loaded.has(f.url)).length;
  const ready = frames.length > 0 && buffered === frames.length;

  // ── the painter ────────────────────────────────────────────────────────────
  // Drawing the crop ourselves does two jobs at once. It puts the map over the
  // whole panel — the rendered figure is 1280x760 and only about half of that
  // is map, the rest being margin plus a title and colour bar the page already
  // draws in sharp text. And it means a frame change is one drawImage from a
  // bitmap that is already decoded, instead of an <img> src swap that makes the
  // browser re-decode and re-lay-out mid-loop.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /**
   * The plate the container should be shaped to.
   *
   * Read off the frame on screen rather than assumed, so the box does not jump
   * when the first newly-rendered run replaces the last letterboxed one.
   */
  const [plate, setPlate] = useState<Plate>(() => plateFor());

  /** What is currently on the canvas, so a repaint that changes nothing is free. */
  const painted = useRef<{ url?: string; w: number; h: number; region: string }>({ w: 0, h: 0, region: "" });

  const paint = useCallback((url: string | undefined, force = false) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const img = url ? decoded.current.get(url) : undefined;
    const box = cv.getBoundingClientRect();
    if (box.width < 2) return;

    // Backing store at device resolution, capped: past 2x the extra pixels are
    // invisible and the fill rate is not free on a phone.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(box.width * dpr);
    const h = Math.round(box.height * dpr);
    const resized = cv.width !== w || cv.height !== h;
    if (resized) { cv.width = w; cv.height = h; }

    const p = painted.current;
    if (!force && !resized && p.url === url && p.w === w && p.h === h && p.region === region) return;
    painted.current = { url, w, h, region };

    const ctx = cv.getContext("2d", { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = "#0b0e17";
    ctx.fillRect(0, 0, w, h);
    if (!img || !img.width) { painted.current.url = undefined; return; }

    const framePlate = plateFor(img.width, img.height);
    setPlate((prev) => (prev === framePlate ? prev : framePlate));

    // Which plate this frame is drawn on comes from the frame itself. Storage
    // holds both shapes while retention rolls the old ones off, and a frame
    // knows its own geometry better than any constant we could keep in step.
    const r = regionSourceRect(region, framePlate);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      r.left * img.width, r.top * img.height,
      r.width * img.width, r.height * img.height,
      0, 0, w, h,
    );
  }, [region]);

  // Repaint when React is the one that moved the frame — a step, a scrub, a
  // parameter change, or a late arrival for the frame already on screen. During
  // playback the loop below has already painted and `painted.current` makes this
  // a no-op, which is the point: the canvas is never waiting on a commit.
  useEffect(() => { paint(frame?.url); }, [paint, frame?.url, loaded]);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => paint(frameRef.current?.url, true));
    ro.observe(cv);
    return () => ro.disconnect();
  }, [paint]);

  // ── playback ───────────────────────────────────────────────────────────────
  //
  // THE BUG THIS FIXES
  // The loop was already on requestAnimationFrame, which is right, but the tick
  // only called `setFrameIdx`. The canvas was then drawn by a `useEffect`, which
  // React runs *after* the commit — so every frame was painted a commit late,
  // and by however much React's scheduling varied. That variance is precisely
  // what "stiff and glitchy" was: the timing of the paint had nothing to do with
  // the timing of the tick.
  //
  // Now the tick paints. React state is still updated so the scrubber and the
  // hour readout follow, but nothing visual waits on it, and the repaint effect
  // above short-circuits because the canvas already holds that frame.
  //
  // The clock accumulates instead of resetting (`due += speed`), so a frame that
  // arrives 3 ms late does not push every later frame 3 ms further out. If the
  // tab has been backgrounded and the deficit is more than two frames, the debt
  // is written off rather than replayed as a burst.
  useEffect(() => { settled.current = new Set([...loaded, ...failed]); }, [loaded, failed]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    let raf = 0;
    let due = performance.now() + speed;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now < due) return;
      due += speed;
      if (now - due > speed * 2) due = now + speed;   // came back from a background tab

      const list = framesRef.current;
      if (list.length < 2) return;
      const next = (idxRef.current + 1) % list.length;
      // Hold rather than flash through a frame that has not arrived. With the
      // canvas this cannot show a partial image, but it can show the previous
      // one twice, which reads as a stall rather than as corruption.
      if (!settled.current.has(list[next].url)) return;

      idxRef.current = next;
      paint(list[next].url);        // ← the frame is on screen now, not next commit
      setFrameIdx(next);            // ← and the readout catches up whenever React does
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, frames.length, paint]);

  // React-driven moves (step, scrub, parameter change) own the index too.
  useEffect(() => { idxRef.current = Math.min(frameIdx, Math.max(0, frames.length - 1)); }, [frameIdx, frames.length]);

  /**
   * Scrubbing, painted on the input event.
   *
   * Dragging the slider used to set state and wait for the effect, so the image
   * trailed the thumb by a commit — the same lag as playback, and far more
   * obvious because your finger is the reference. Painting first makes the
   * image track the thumb exactly.
   */
  const scrubTo = useCallback((i: number) => {
    const list = framesRef.current;
    const n = Math.max(0, Math.min(list.length - 1, i));
    idxRef.current = n;
    paint(list[n]?.url);
    setFrameIdx(n);
  }, [paint]);

  const step = useCallback((d: number) => {
    setPlaying(false);
    const n = frames.length;
    if (!n) return;
    scrubTo(((idxRef.current + d) % n + n) % n);
  }, [frames.length, scrubTo]);

  // keyboard: arrows step, space toggles play
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /input|select|textarea/i.test(t.tagName)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  async function download() {
    if (!frame) return;
    try {
      const r = await fetch(frame.url);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sswx-${model}-${paramKey}-F${String(frame.fhr).padStart(3, "0")}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch { /* ignore */ }
  }
  async function share() {
    if (!frame) return;
    try {
      const r = await fetch(frame.url);
      const blob = await r.blob();
      const file = new File([blob], `${model}-${paramKey}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: param?.label });
      else await download();
    } catch { /* cancelled */ }
  }

  const noRuns = runs.isSuccess && (runs.data?.length ?? 0) === 0;

  return (
    <ModuleShell
      eyebrow="NOAA · NOMADS"
      title="Model Runs"
      subtitle="HRRR, GFS and HREF ensemble maps rendered from NOAA model data, plus a fifteen-minute nowcast for your location."
    >
      {/* Views */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-card border border-border rounded-xl p-1.5">
        {([
          { id: "hrrr", label: "HRRR · 3 km" },
          { id: "gfs", label: "GFS · 13 km" },
          { id: "href", label: "HREF · ensemble" },
          { id: "nowcast", label: "Nowcast · 15 min" },
        ] as const).map((v) => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`py-2.5 rounded-lg text-[13px] font-semibold uppercase tracking-wide ${view === v.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {view === "nowcast" && (
        <NowcastTab lat={location.lat} lon={location.lon} place={location.name} />
      )}

      {view !== "nowcast" && (<>
      {/* Run status / archive */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {runs.isLoading ? (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading runs…
          </span>
        ) : runs.isError ? (
          <span className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Could not load model runs.
          </span>
        ) : noRuns ? (
          <span className="text-xs text-yellow-200/90 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> No {model.toUpperCase()} run rendered yet — the first scheduled render will populate this.
          </span>
        ) : run && (
          <>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Model run</div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                {cycleLabel(run.cycle)}
                {runIdx === 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">Latest</span>}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Archive</div>
              <select value={runIdx} onChange={(e) => setRunIdx(Number(e.target.value))}
                className="bg-muted/30 border border-border rounded-lg px-2 py-1 text-xs outline-none focus:border-primary/40">
                {runs.data!.map((r, i) => (
                  <option key={r.id} value={i}>{cycleLabel(r.cycle)}{i === 0 ? " (latest)" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Range</div>
              <div className="text-sm font-semibold">F000–F{String(run.maxFhr).padStart(3, "0")}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Resolution</div>
              <div className="text-sm font-semibold">{model === "hrrr" ? "3 km" : model === "href" ? "3 km · 10 members" : "13 km"}</div>
            </div>
          </>
        )}
      </div>

      {/* Parameter groups */}
      {grouped.map(({ group, params }) => (
        <div key={group}>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">{group}</div>
          <div className="flex gap-2 overflow-x-auto pb-1 px-1 -mx-1 max-w-full">
            {params.map((p) => (
              <button key={p.key} onClick={() => { setParamKey(p.key); setFrameIdx(0); setPlaying(false); }}
                className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                  paramKey === p.key ? "bg-primary/15 border-primary/40 text-primary"
                                     : "bg-muted/20 border-border text-muted-foreground hover:text-foreground"}`}>
                <span className="whitespace-nowrap">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Viewer */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Region tabs — the frames are a fixed Lambert Conformal plate, so a
            region is framed by transforming the image rather than rendering
            (and storing) a separate map per region. */}
        <div className="flex overflow-x-auto no-scrollbar border-b border-border/60">
          {REGIONS.map((r) => {
            const on = r.id === region;
            return (
              <button
                key={r.id}
                onClick={() => setRegion(r.id)}
                className="relative px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap shrink-0 transition-colors"
                style={{ fontFamily: HEADING, color: on ? ROYAL.text : "hsl(var(--muted-foreground))" }}
              >
                {r.label}
                {on && (
                  <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full"
                        style={{ background: `linear-gradient(90deg,transparent,${ROYAL.gold},transparent)` }} />
                )}
              </button>
            );
          })}
        </div>

        <div
          className="relative bg-[#0b0e17] overflow-hidden"
          style={{ minHeight: 220, aspectRatio: String(regionAspect(region, plate)) }}
        >
          {frame ? (
            <>
              {/* One canvas, redrawn from an already-decoded frame. The source
                  rect is the crop, so the map fills the panel instead of the
                  figure's title band and colour bar taking half of it. */}
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

              {/* Our own caption, in real text. The frame has one baked in at
                  whatever size it was rendered; this one is sharp on any screen
                  and says the things a reader actually wants. */}
              <div className="absolute inset-x-0 top-0 p-2.5 pointer-events-none"
                   style={{ background: "linear-gradient(180deg, rgba(6,6,14,.82), transparent)" }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: ROYAL.gold }}>
                    {model.toUpperCase()}
                  </span>
                  <span className="text-[13px] font-semibold" style={{ color: ROYAL.text, fontFamily: HEADING }}>
                    {param?.label}
                  </span>
                  <span className="text-[11px] tabular-nums ml-auto" style={{ color: ROYAL.dim }}>
                    F{String(frame.fhr).padStart(3, "0")}
                  </span>
                </div>
                <div className="text-[10.5px] mt-0.5" style={{ color: ROYAL.dim }}>
                  {cycleLabel(run!.cycle)} run · valid {validLabel(frame.valid)}
                </div>
              </div>

              {failed.has(frame.url) && (
                <div className="absolute inset-0 grid place-items-center">
                  <span className="px-2.5 py-1.5 rounded-md bg-red-500/85 text-[11px] text-white font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Frame unavailable
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="h-[220px] grid place-items-center text-xs text-muted-foreground">
              {runs.isLoading ? <Loader2 className="w-5 h-5 animate-spin" />
                : noRuns ? "Waiting for the first render" : "No frames for this parameter"}
            </div>
          )}

          {/* Buffer state lives on the filmstrip below, where it is per-frame
              rather than a single percentage. */}
        </div>

        {/* Controls */}
        <div className="p-3.5 space-y-3" style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
          <Transport
            frames={frames}
            index={Math.min(frameIdx, Math.max(0, frames.length - 1))}
            playing={playing}
            loadedCount={buffered}
            isLoaded={(u) => loaded.has(u)}
            isFailed={(u) => failed.has(u)}
            onToggle={() => setPlaying((p) => !p)}
            onStep={step}
            onScrub={(i) => { setPlaying(false); scrubTo(i); }}
            hourLabel={frame ? `FORECAST HOUR ${frame.fhr}` : undefined}
            validLabel={frame ? `Valid ${validLabel(frame.valid)}` : undefined}
            speeds={SPEEDS}
            speed={speed}
            onSpeed={setSpeed}
          />

          {/* legend */}
          {param && param.legend.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                {param.label} ({param.unit})
              </div>
              <div className="flex h-3 rounded overflow-hidden">
                {param.legend.map((l) => (
                  <div key={l.v} className="flex-1" style={{ background: l.c }} />
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-muted-foreground tabular-nums mt-0.5">
                {param.legend.map((l) => <span key={l.v}>{l.v}</span>)}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={download} disabled={!frame}
              className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40">
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button onClick={share} disabled={!frame}
              className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
            <span className="ml-auto text-[10px] text-muted-foreground self-center">
              ← → step · space play
            </span>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Rendered from NOAA HRRR &amp; GFS data on the AWS Open Data registry, and HREF ensemble
        probabilities from NOMADS. HRRR updates four times daily out to F018; GFS out to F048 in
        3-hour steps; HREF hourly to F036. Model guidance is not a
        forecast — always defer to official NWS products.
      </p>
      </>)}
    </ModuleShell>
  );
}
