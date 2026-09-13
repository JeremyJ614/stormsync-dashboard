import { memo } from "react";
import { ROYAL } from "../../lib/royal";

/**
 * The small drawing on a dashboard tile.
 *
 * A tile used to be a number and, sometimes, a progress bar. A number tells you
 * the value; it does not tell you the SHAPE, and the shape is most of what a
 * glance is for — 74°F says nothing about whether the afternoon falls off a
 * cliff, and 60% says nothing about whether the storm is at four o'clock or
 * spread across the evening. So every tile whose shared data contains a series
 * or an angle now draws it.
 *
 * FIVE KINDS, AND NO MORE
 * line, bars, compass, moon, gauge. The list is short on purpose: a wall where
 * every tile invents its own idiom is a wall nobody can read quickly, and the
 * whole argument for this page is that it can be read without reading.
 *
 * Each one is inline SVG at a fixed viewBox, stretched to the tile with
 * `preserveAspectRatio="none"` where the shape tolerates it. Nothing here
 * animates and nothing here measures: twenty of these on a page, re-rendering
 * whenever the forecast refreshes, is not the place to put a spring.
 */

export type Visual =
  /** A series — hourly temperature, a week of highs. Drawn as a filled sparkline. */
  | { kind: "line"; points: number[]; color?: string }
  /** A series that is a count or a percentage per hour. Drawn as columns. */
  | { kind: "bars"; points: number[]; max?: number; color?: string }
  /** A bearing in degrees, meteorological (the direction the wind comes FROM). */
  | { kind: "compass"; deg: number; label?: string; color?: string }
  /** Illuminated fraction 0-1, and whether the moon is waxing. */
  | { kind: "moon"; illum: number; waxing: boolean }
  /** A value on a banded scale — AQI, UV, an index with named thresholds. */
  | { kind: "gauge"; value: number; max: number; bands: { at: number; c: string }[] };

const H = 30;

export const TileVisual = memo(function TileVisual({ v, tint }: { v: Visual; tint: string }) {
  if (v.kind === "line") return <Line v={v} tint={tint} />;
  if (v.kind === "bars") return <Bars v={v} tint={tint} />;
  if (v.kind === "compass") return <Compass v={v} tint={tint} />;
  if (v.kind === "moon") return <Moon v={v} />;
  return <Gauge v={v} />;
});

function Line({ v, tint }: { v: Extract<Visual, { kind: "line" }>; tint: string }) {
  const p = v.points.filter((n) => Number.isFinite(n));
  if (p.length < 2) return null;
  const lo = Math.min(...p), hi = Math.max(...p);
  const span = hi - lo || 1;
  const c = v.color ?? tint;
  // 4% of headroom top and bottom so a flat series is not welded to an edge.
  const y = (n: number) => 96 - ((n - lo) / span) * 92;
  const d = p.map((n, i) => `${i === 0 ? "M" : "L"}${(i / (p.length - 1)) * 100},${y(n)}`).join(" ");
  return (
    <svg width="100%" height={H} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <path d={`M0,100 ${d.slice(1)} L100,100 Z`} fill={c} opacity={0.14} />
      <path d={d} fill="none" stroke={c} strokeWidth={1.8}
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Bars({ v, tint }: { v: Extract<Visual, { kind: "bars" }>; tint: string }) {
  const p = v.points.filter((n) => Number.isFinite(n));
  if (!p.length) return null;
  const max = v.max ?? Math.max(1, ...p);
  const c = v.color ?? tint;
  const w = 100 / p.length;
  return (
    <svg width="100%" height={H} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {p.map((n, i) => {
        const h = Math.max(1.5, (Math.max(0, n) / max) * 100);
        return <rect key={i} x={i * w + w * 0.14} width={w * 0.72} y={100 - h} height={h}
                     fill={c} opacity={n > 0 ? 0.9 : 0.25} />;
      })}
    </svg>
  );
}

function Compass({ v, tint }: { v: Extract<Visual, { kind: "compass" }>; tint: string }) {
  // Meteorological bearing: 0 is FROM the north, and the arrow points the way
  // the air is going, which is the opposite. Drawing it the other way round is
  // the single most common error on a wind dial.
  const a = ((v.deg + 180) % 360) - 90;
  const r = (a * Math.PI) / 180;
  const x = 50 + 26 * Math.cos(r), y = 50 + 26 * Math.sin(r);
  const c = v.color ?? tint;
  return (
    <div className="flex items-center gap-2" style={{ height: H }}>
      <svg width={H} height={H} viewBox="0 0 100 100" aria-hidden className="shrink-0">
        <circle cx="50" cy="50" r="34" fill="none" stroke={ROYAL.hairline} strokeWidth="6" />
        <line x1="50" y1="50" x2={x} y2={y} stroke={c} strokeWidth="9" strokeLinecap="round" />
        <circle cx="50" cy="50" r="7" fill={c} />
      </svg>
      {v.label && (
        <span className="text-[10px] tabular-nums truncate" style={{ color: ROYAL.dim }}>{v.label}</span>
      )}
    </div>
  );
}

function Moon({ v }: { v: Extract<Visual, { kind: "moon" }> }) {
  /*
   * A real terminator, not a pac-man wedge.
   *
   * The lit edge of the Moon is the projection of a circle seen at an angle, so
   * it is an ELLIPSE whose semi-minor axis shrinks to zero at quarter and then
   * grows the other way. Two arcs with a shared radius give the correct shape at
   * every phase, including the straight edge at first and last quarter that a
   * wedge can never produce.
   */
  const f = Math.max(0, Math.min(1, v.illum));
  const rx = Math.abs(1 - 2 * f) * 24;            // ellipse width of the terminator
  const lit = f > 0.5;                            // gibbous: terminator bulges outward
  const sweepOuter = v.waxing ? 1 : 0;
  const sweepInner = lit === v.waxing ? 1 : 0;
  return (
    <div className="flex items-center" style={{ height: H }}>
      <svg width={H} height={H} viewBox="0 0 60 60" aria-hidden className="shrink-0">
        <circle cx="30" cy="30" r="24" fill="#141427" stroke={ROYAL.hairline} strokeWidth="1" />
        {f > 0.01 && (
          <path
            d={`M30,6 A24,24 0 0,${sweepOuter} 30,54 A${rx},24 0 0,${sweepInner} 30,6 Z`}
            fill="#e8e4d8"
          />
        )}
      </svg>
    </div>
  );
}

function Gauge({ v }: { v: Extract<Visual, { kind: "gauge" }> }) {
  const pos = Math.max(0, Math.min(1, v.value / v.max));
  return (
    <div style={{ height: H }} className="flex items-center">
      <div className="relative w-full h-[9px] rounded-full overflow-hidden"
           style={{ background: "rgba(204,204,255,0.08)" }}>
        {/* The bands are the scale — a bar alone says "some of the way", and
            the whole point of AQI or UV is WHICH band you are in. */}
        {v.bands.map((b, i) => {
          const from = i === 0 ? 0 : v.bands[i - 1].at / v.max;
          return (
            <span key={b.at} className="absolute inset-y-0"
                  style={{ left: `${from * 100}%`, width: `${(b.at / v.max - from) * 100}%`,
                           background: b.c, opacity: 0.36 }} />
          );
        })}
        <span className="absolute top-0 bottom-0 w-[2.5px] rounded-full"
              style={{ left: `calc(${pos * 100}% - 1.25px)`, background: ROYAL.text,
                       boxShadow: "0 0 5px rgba(0,0,0,0.8)" }} />
      </div>
    </div>
  );
}
