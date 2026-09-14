/**
 * The model-run transport.
 *
 * A forecast loop is a filmstrip, and the old control was a browser range input
 * over three grey buttons — it told you where you were and nothing else. The
 * two things a person actually wants while a loop is running are *which hour is
 * this* and *how much of the loop is real yet*, and both were either absent or
 * in a separate badge at the bottom of the image.
 *
 * So the scrubber is the filmstrip: one tick per forecast hour, lit when that
 * frame has decoded, dim while it is still coming, struck through if it failed.
 * Buffering stops being a progress bar and becomes the timeline filling up.
 *
 * The play button is the only warm thing on the panel, because it is the only
 * control anybody looks for in a hurry. It carries a ring that sweeps once per
 * loop while playing — the one piece of motion here that is not decoration: it
 * is the loop's own position, so you can see the cadence without reading a
 * number.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { Play, Pause, ChevronLeft, ChevronRight } from "lucide-react";
import { ROYAL, HEADING, SPRING, prefersReducedMotion } from "../../lib/royal";

export interface TransportFrame { fhr: number; url: string }

interface Props {
  frames: TransportFrame[];
  index: number;
  playing: boolean;
  loadedCount: number;
  isLoaded: (url: string) => boolean;
  isFailed: (url: string) => boolean;
  onToggle: () => void;
  onStep: (d: number) => void;
  onScrub: (i: number) => void;
  hourLabel?: string;
  validLabel?: string;
  speeds: { label: string; ms: number }[];
  speed: number;
  onSpeed: (ms: number) => void;
}

export const Transport = memo(function Transport({
  frames, index, playing, loadedCount, isLoaded, isFailed,
  onToggle, onStep, onScrub, hourLabel, validLabel, speeds, speed, onSpeed,
}: Props) {
  const still = prefersReducedMotion();
  const n = frames.length;
  const ready = n > 0 && loadedCount === n;

  return (
    <div className="space-y-3">
      {/* ── the filmstrip ─────────────────────────────────────────────────── */}
      <div className="relative">
        <div
          className="flex items-end gap-[2px] h-9 select-none touch-none"
          role="slider"
          aria-label="Forecast hour"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, n - 1)}
          aria-valuenow={index}
          aria-valuetext={hourLabel}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") { e.preventDefault(); onStep(1); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); onStep(-1); }
            else if (e.key === "Home") { e.preventDefault(); onScrub(0); }
            else if (e.key === "End") { e.preventDefault(); onScrub(n - 1); }
          }}
        >
          {frames.map((f, i) => {
            const on = i === index;
            const failed = isFailed(f.url);
            const have = isLoaded(f.url);
            return (
              <button
                key={f.url}
                onClick={() => onScrub(i)}
                onPointerEnter={(e) => { if (e.buttons === 1) onScrub(i); }}
                aria-label={`Forecast hour ${f.fhr}`}
                className="relative flex-1 min-w-0 h-full rounded-[3px] transition-colors"
                style={{
                  background: failed ? "rgba(255,82,87,0.30)"
                    : have ? (on ? ROYAL.gold : "rgba(204,204,255,0.30)")
                    : "rgba(255,255,255,0.07)",
                  transform: on ? "scaleY(1)" : "scaleY(0.62)",
                  transformOrigin: "bottom",
                  boxShadow: on ? `0 0 16px -3px ${ROYAL.gold}` : undefined,
                }}
              >
                {failed && (
                  <span aria-hidden className="absolute inset-x-0 top-1/2 h-px" style={{ background: "#ff5257" }} />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex justify-between mt-1.5 text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>
          <span>F{String(frames[0]?.fhr ?? 0).padStart(3, "0")}</span>
          {!ready && n > 0 && (
            <span style={{ color: ROYAL.gold }}>buffering {loadedCount}/{n}</span>
          )}
          <span>F{String(frames[n - 1]?.fhr ?? 0).padStart(3, "0")}</span>
        </div>
      </div>

      {/* ── transport ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => onStep(-1)} disabled={!n} aria-label="Previous hour"
          className="p-2 rounded-xl disabled:opacity-35 transition-colors"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}>
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button onClick={onToggle} disabled={n < 2} aria-label={playing ? "Pause" : "Play"}
          className="relative w-11 h-11 rounded-full grid place-items-center disabled:opacity-35"
          style={{
            background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a25f)`,
            color: "#120f1e",
            boxShadow: `0 8px 24px -10px ${ROYAL.gold}, 0 1px 0 0 rgba(255,255,255,0.4) inset`,
          }}>
          {/* the loop's own position, as a ring */}
          {playing && !still && n > 1 && (
            <motion.span
              aria-hidden
              className="absolute -inset-1 rounded-full"
              style={{ border: `1.5px solid ${ROYAL.gold}` }}
              initial={{ opacity: 0.55, scale: 1 }}
              animate={{ opacity: 0, scale: 1.55 }}
              transition={{ duration: Math.max(0.5, (speed * n) / 1000), repeat: Infinity, ease: "linear" }}
            />
          )}
          <motion.span
            key={playing ? "pause" : "play"}
            initial={still ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={still ? { duration: 0 } : SPRING.pop}
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 translate-x-[1px]" />}
          </motion.span>
        </button>

        <button onClick={() => onStep(1)} disabled={!n} aria-label="Next hour"
          className="p-2 rounded-xl disabled:opacity-35 transition-colors"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}>
          <ChevronRight className="w-4 h-4" />
        </button>

        <div className="ml-1.5 min-w-0">
          <div className="text-[15px] font-black tabular-nums leading-none"
               style={{ fontFamily: HEADING, color: ROYAL.text }}>
            {hourLabel ?? "—"}
          </div>
          {validLabel && (
            <div className="text-[11px] truncate mt-0.5" style={{ color: ROYAL.dim }}>{validLabel}</div>
          )}
        </div>

        <div className="ml-auto flex gap-1 rounded-xl p-1"
             style={{ background: "rgba(10,10,22,0.5)", border: `1px solid ${ROYAL.hairline}` }}>
          {speeds.map((s) => {
            const on = speed === s.ms;
            return (
              <button key={s.ms} onClick={() => onSpeed(s.ms)}
                className="relative px-2.5 py-1 rounded-lg text-[11px] font-bold"
                style={{ color: on ? "#120f1e" : ROYAL.dim }}>
                {on && (
                  <motion.span aria-hidden layoutId="model-speed" className="absolute inset-0 rounded-lg"
                    transition={still ? { duration: 0 } : SPRING.silk}
                    style={{ background: ROYAL.iris }} />
                )}
                <span className="relative">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default Transport;
