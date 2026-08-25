/**
 * The river trace — observed stage behind, forecast ahead, flood thresholds as
 * bands beneath both.
 *
 * The one animation the module earns: the observed line draws itself left to
 * right on load, and the forecast continues it in a dash that flows downstream.
 * The bands fade in from the top category down, so the worst threshold the
 * river is anywhere near is the first thing to arrive.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ROYAL, EASE, prefersReducedMotion } from "../../lib/royal";
import { FLOOD_STYLE, type GaugeDetail } from "../../lib/riverGauges";

const W = 720, H = 260;
const PAD = { l: 46, r: 14, t: 16, b: 30 };

interface Band { key: string; from: number; label: string; color: string }

export function Hydrograph({ g }: { g: GaugeDetail }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(prefersReducedMotion()), []);
  const pathRef = useRef<SVGPathElement>(null);

  const model = useMemo(() => {
    const all = [...g.observed, ...g.forecast];
    if (all.length === 0) return null;

    const t0 = Math.min(...all.map((p) => p.t));
    const t1 = Math.max(...all.map((p) => p.t));
    const span = Math.max(1, t1 - t0);

    const th = g.thresholds;
    const marks = [th.action, th.minor, th.moderate, th.major].filter((v): v is number => v != null);
    const stages = all.map((p) => p.stage);
    // Include thresholds in the scale only when the river is within reach of
    // them — otherwise a distant major-flood stage flattens the whole trace.
    const peak = Math.max(...stages);
    const nearby = marks.filter((m) => m <= peak + (peak - Math.min(...stages) || 1) * 1.4);
    const lo = Math.min(...stages, ...(nearby.length ? nearby : []));
    const hi = Math.max(...stages, ...(nearby.length ? nearby : []));
    const pad = (hi - lo || 1) * 0.16;
    const yLo = lo - pad, yHi = hi + pad;

    const X = (t: number) => PAD.l + ((t - t0) / span) * (W - PAD.l - PAD.r);
    const Y = (s: number) => PAD.t + (1 - (s - yLo) / (yHi - yLo || 1)) * (H - PAD.t - PAD.b);

    const line = (pts: { t: number; stage: number }[]) =>
      pts.map((p, i) => `${i === 0 ? "M" : "L"}${X(p.t).toFixed(1)},${Y(p.stage).toFixed(1)}`).join("");

    const bands: Band[] = ([
      ["action", th.action], ["minor", th.minor], ["moderate", th.moderate], ["major", th.major],
    ] as [string, number | null][])
      .filter(([, v]) => v != null && v >= yLo && v <= yHi)
      .map(([key, v]) => ({ key, from: v as number, label: FLOOD_STYLE[key].label, color: FLOOD_STYLE[key].color }));

    // Ticks on the hour boundary the span can carry without crowding.
    const hours = span / 3600_000;
    const stepH = hours > 120 ? 24 : hours > 48 ? 12 : hours > 18 ? 6 : 3;
    const ticks: { x: number; label: string }[] = [];
    const start = new Date(t0); start.setMinutes(0, 0, 0);
    for (let t = start.getTime(); t <= t1; t += stepH * 3600_000) {
      if (t < t0) continue;
      const dt = new Date(t);
      ticks.push({
        x: X(t),
        label: stepH >= 24
          ? dt.toLocaleDateString(undefined, { month: "numeric", day: "numeric" })
          : dt.toLocaleTimeString(undefined, { hour: "numeric" }).replace(" ", ""),
      });
    }

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const v = yLo + (yHi - yLo) * f;
      return { y: Y(v), label: v.toFixed(1) };
    });

    const nowX = X(Math.min(Math.max(Date.now(), t0), t1));
    return {
      obs: g.observed.length ? line(g.observed) : "",
      fcst: g.forecast.length ? line(g.forecast) : "",
      // Fill under the observed trace, closed to the floor.
      obsFill: g.observed.length
        ? `${line(g.observed)}L${X(g.observed[g.observed.length - 1].t).toFixed(1)},${(H - PAD.b).toFixed(1)}L${X(g.observed[0].t).toFixed(1)},${(H - PAD.b).toFixed(1)}Z`
        : "",
      bands, ticks, yTicks, nowX, Y, yHi,
      last: g.observed.at(-1) ?? null,
    };
  }, [g]);

  useEffect(() => {
    const el = pathRef.current;
    if (!el || !model?.obs || reduced) return;
    const len = el.getTotalLength();
    el.style.transition = "none";
    el.style.strokeDasharray = `${len}`;
    el.style.strokeDashoffset = `${len}`;
    // Force a reflow so the browser keeps the start state before transitioning.
    void el.getBoundingClientRect();
    el.style.transition = "stroke-dashoffset 1500ms cubic-bezier(0.22,1,0.36,1)";
    el.style.strokeDashoffset = "0";
  }, [model, reduced]);

  if (!model) {
    return (
      <div className="h-[180px] grid place-items-center text-[13px]" style={{ color: ROYAL.dim }}>
        No stage record published for this gauge.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" style={{ height: "auto" }} role="img"
           aria-label={`Stage trace for ${g.name}`}>
        <defs>
          <linearGradient id="hg-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ROYAL.gold} stopOpacity="0.26" />
            <stop offset="100%" stopColor={ROYAL.gold} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* flood bands, worst arriving first */}
        {[...model.bands].reverse().map((b, i) => (
          <motion.g key={b.key}
                    initial={reduced ? undefined : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 + i * 0.12, duration: 0.5, ease: EASE }}>
            <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={Math.max(0, model.Y(b.from) - PAD.t)}
                  fill={b.color} opacity={0.07} />
            <line x1={PAD.l} x2={W - PAD.r} y1={model.Y(b.from)} y2={model.Y(b.from)}
                  stroke={b.color} strokeWidth={1} strokeDasharray="5 4" opacity={0.75} />
            <text x={W - PAD.r - 2} y={model.Y(b.from) - 4} textAnchor="end"
                  fontSize="8.5" fill={b.color} opacity={0.9}
                  style={{ fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.1em" }}>
              {b.label.toUpperCase()} {b.from}
            </text>
          </motion.g>
        ))}

        {/* axes */}
        {model.yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} stroke={ROYAL.hairline} strokeWidth={1} />
            <text x={PAD.l - 6} y={t.y + 3} textAnchor="end" fontSize="8.5" fill={ROYAL.dim}
                  style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{t.label}</text>
          </g>
        ))}
        {model.ticks.map((t, i) => (
          <text key={i} x={t.x} y={H - 10} textAnchor="middle" fontSize="8.5" fill={ROYAL.dim}
                style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{t.label}</text>
        ))}

        {/* now */}
        <line x1={model.nowX} x2={model.nowX} y1={PAD.t} y2={H - PAD.b}
              stroke={ROYAL.iris} strokeWidth={1} opacity={0.45} strokeDasharray="2 3" />

        {model.obsFill && <path d={model.obsFill} fill="url(#hg-fill)" />}
        {model.obs && (
          <path ref={pathRef} d={model.obs} fill="none" stroke={ROYAL.gold} strokeWidth={2.2}
                strokeLinejoin="round" strokeLinecap="round" />
        )}
        {model.fcst && (
          <path d={model.fcst} fill="none" stroke={ROYAL.iris} strokeWidth={2} strokeDasharray="7 5"
                strokeLinecap="round" opacity={0.92}>
            {!reduced && (
              <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.4s" repeatCount="indefinite" />
            )}
          </path>
        )}

        {/* the current reading, emphasised */}
        {model.last && (
          <motion.circle
            cx={model.nowX} cy={model.Y(model.last.stage)} r={4}
            fill={ROYAL.gold} stroke="#0b0b1a" strokeWidth={1.5}
            initial={reduced ? undefined : { scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.35, type: "spring", stiffness: 480, damping: 22 }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          />
        )}
      </svg>
    </div>
  );
}
