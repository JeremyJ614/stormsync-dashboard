import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REGIONS, regionTransform } from "../lib/modelProjection";
import { ROYAL, HEADING } from "../lib/royal";
import { ModuleShell } from "../components/ModuleShell";
import { NowcastTab } from "../components/models/NowcastTab";
import type { Location } from "../hooks/useLocation";
import { useQuery } from "@tanstack/react-query";
import {
  Satellite, Play, Pause, ChevronLeft, ChevronRight, Download, Share2,
  Loader2, AlertTriangle, Clock,
} from "lucide-react";
import {
  listRuns, groupParams, cycleLabel, validLabel,
  type ModelId, type ModelRun, type ModelFrame,
} from "../lib/modelRuns";

/**
 * Model Runs — HRRR & GFS map viewer (Phase 4).
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

const SPEEDS = [
  { label: "Slow", ms: 900 },
  { label: "Normal", ms: 500 },
  { label: "Fast", ms: 250 },
];

interface Props { location: Location }

export default function ForecastRunComparator({ location }: Props) {
  // "nowcast" is not a model here — it is a third view. The maps are national
  // and pre-rendered four times a day; the nowcast is this one point, stepped
  // every fifteen minutes, and answers what a map structurally cannot.
  const [view, setView] = useState<"hrrr" | "gfs" | "nowcast">("hrrr");
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

  // ── preload the active parameter, in order, a few at a time ──
  // Firing all ~19 frames at once left most of them still in flight while the
  // loop was already running, and an unloaded frame renders at low opacity —
  // which is why playback looked like it only had three or four frames. A small
  // concurrency window means frames finish in the order they are played.
  useEffect(() => {
    if (!frames.length) return;
    let cancelled = false;
    const imgs: HTMLImageElement[] = [];
    let next = 0;
    const CONCURRENCY = 4;

    const pump = () => {
      if (cancelled || next >= frames.length) return;
      const f = frames[next++];
      const img = new Image();
      imgs.push(img);
      const done = (ok: boolean) => {
        if (cancelled) return;
        if (ok) setLoaded((s) => new Set(s).add(f.url));
        else setFailed((s) => new Set(s).add(f.url));
        pump();
      };
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = f.url;
    };
    for (let i = 0; i < CONCURRENCY; i++) pump();

    return () => { cancelled = true; imgs.forEach((i) => { i.onload = null; i.onerror = null; }); };
  }, [frames]);

  const buffered = frames.filter((f) => loaded.has(f.url)).length;
  const ready = frames.length > 0 && buffered === frames.length;

  // ── playback ──
  const timer = useRef<number | null>(null);
  const settled = useRef<Set<string>>(new Set());
  settled.current = new Set([...loaded, ...failed]);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    timer.current = window.setInterval(() => {
      setFrameIdx((i) => {
        const next = (i + 1) % frames.length;
        // Hold on the current frame until the next one has actually arrived,
        // so the loop never flashes through half-loaded images.
        return settled.current.has(frames[next].url) ? next : i;
      });
    }, speed);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [playing, speed, frames]);

  const step = useCallback((d: number) => {
    setPlaying(false);
    setFrameIdx((i) => (i + d + frames.length) % Math.max(1, frames.length));
  }, [frames.length]);

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
      subtitle="HRRR and GFS severe-weather maps rendered from NOAA model data, plus a fifteen-minute nowcast for your location."
    >
      {/* Views */}
      <div className="grid grid-cols-3 gap-2 bg-card border border-border rounded-xl p-1.5">
        {([
          { id: "hrrr", label: "HRRR · 3 km" },
          { id: "gfs", label: "GFS · 13 km" },
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
              <div className="text-sm font-semibold">{model === "hrrr" ? "3 km" : "13 km"}</div>
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

        <div className="relative bg-[#0b0e17] overflow-hidden" style={{ minHeight: 220, aspectRatio: region === "conus" ? "1280 / 760" : "16 / 10" }}>
          {frame ? (
            <>
              <img src={frame.url} alt={`${param?.label} F${frame.fhr}`}
                className="absolute inset-0 w-full block"
                style={{
                  opacity: loaded.has(frame.url) ? 1 : 0.25,
                  transition: "opacity .15s, transform .45s cubic-bezier(.22,1,.36,1)",
                  transformOrigin: "0 0",
                  transform: (() => {
                    const t = regionTransform(region, 16 / 10);
                    return `scale(${t.scale}) translate(${t.x}%, ${t.y}%)`;
                  })(),
                }} />
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

          {/* buffering bar */}
          {frames.length > 0 && !ready && (
            <div className="absolute top-2 left-2 right-2 flex items-center gap-2">
              <span className="text-[10px] text-white/80 bg-black/70 rounded px-1.5 py-0.5 shrink-0">
                Buffering {buffered}/{frames.length}
              </span>
              <div className="flex-1 h-1 rounded bg-black/50 overflow-hidden">
                <div className="h-full bg-primary transition-all"
                  style={{ width: `${(buffered / frames.length) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-3 border-t border-border space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => step(-1)} disabled={!frames.length}
              className="p-2 rounded-lg bg-muted/30 border border-border disabled:opacity-40" aria-label="Previous hour">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPlaying((p) => !p)} disabled={frames.length < 2}
              className="p-2 rounded-lg bg-primary/20 border border-primary/40 text-primary disabled:opacity-40" aria-label="Play or pause">
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button onClick={() => step(1)} disabled={!frames.length}
              className="p-2 rounded-lg bg-muted/30 border border-border disabled:opacity-40" aria-label="Next hour">
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="ml-1 min-w-0">
              <div className="text-sm font-bold tabular-nums">
                {frame ? `FORECAST HOUR ${frame.fhr}` : "—"}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {frame ? `Valid ${validLabel(frame.valid)}` : ""}
              </div>
            </div>

            <div className="ml-auto flex gap-1">
              {SPEEDS.map((s) => (
                <button key={s.ms} onClick={() => setSpeed(s.ms)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                    speed === s.ms ? "bg-primary/15 border-primary/40 text-primary" : "bg-muted/20 border-border text-muted-foreground"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* scrubber */}
          <div>
            <input type="range" min={0} max={Math.max(0, frames.length - 1)} step={1}
              value={Math.min(frameIdx, Math.max(0, frames.length - 1))}
              onChange={(e) => { setPlaying(false); setFrameIdx(Number(e.target.value)); }}
              disabled={frames.length < 2}
              className="w-full accent-primary" aria-label="Forecast hour" />
            <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>F{String(frames[0]?.fhr ?? 0).padStart(3, "0")}</span>
              <span>F{String(frames[frames.length - 1]?.fhr ?? 0).padStart(3, "0")}</span>
            </div>
          </div>

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
        Rendered from NOAA HRRR &amp; GFS data on the AWS Open Data registry. HRRR updates four
        times daily out to F018; GFS out to F048 in 3-hour steps. Model guidance is not a
        forecast — always defer to official NWS products.
      </p>
      </>)}
    </ModuleShell>
  );
}
