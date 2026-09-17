/**
 * The Instrument apparatus — the geometry that sits behind a module header.
 *
 * The idea is borrowed from measuring plates: a grid, a needle, and a record of
 * something that actually happened. Concentric arcs, radial spokes, a tick
 * ladder. Cold periwinkle for the apparatus; exactly one warm champagne trace
 * allowed to be beautiful.
 *
 * Three rules keep this from costing what decoration usually costs:
 *
 *  1. It draws once. Every animation here is a one-shot `stroke-dashoffset`
 *     run on mount and then finished. Nothing loops. An ambient animation on an
 *     element that appears on all thirty-odd modules is a permanent tax on the
 *     compositor, and this app gets read while people are watching radar.
 *  2. It is two small SVGs of hairlines. No filters, no blurs, no `will-change`
 *     (which would pin a compositor layer per module).
 *  3. Reduced motion renders the finished state directly — same picture, no
 *     transition.
 *
 * On why this is two SVGs rather than one: the arcs want to be anchored to the
 * right edge and the ladder to the left, and a single `slice` viewBox crops
 * whichever side it is not aligned to. As one element the ladder rendered at
 * x=7 — off the panel and behind the sidebar — while looking perfectly correct
 * in the DOM. Two elements, each pinned to the edge it belongs to, cannot drift
 * at any viewport width.
 */
import { memo } from "react";
import { ROYAL, prefersReducedMotion } from "../../lib/royal";

interface Props {
  /** Height of the band the apparatus occupies. */
  height?: number;
  /** 0–1. Scales every stroke's opacity, for headers that need to sit quieter. */
  intensity?: number;
  className?: string;
}

const AW = 520; // arc plate width, in its own user units

export const Apparatus = memo(function Apparatus({
  height = 168, intensity = 1, className,
}: Props) {
  const still = prefersReducedMotion();
  const a = (v: number) => v * intensity;

  // Anchored off the top-right corner, so the densest part of the drawing sits
  // where a header's text never reaches.
  const cx = AW - 150;
  const cy = -40;
  const rings = [96, 148, 200, 252, 304, 356];
  const ticks = Math.floor(height / 9);

  return (
    <div aria-hidden className={className}
         style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* ── arc plate, pinned right ─────────────────────────────────────── */}
      <svg
        width={AW} height={height} viewBox={`0 0 ${AW} ${height}`}
        preserveAspectRatio="xMaxYMin meet"
        style={{ position: "absolute", top: 0, right: 0 }}
      >
        <defs>
          <linearGradient id="app-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0.7" />
            <stop offset="1" stopColor="#fff" stopOpacity="1" />
          </linearGradient>
          <mask id="app-mask">
            <rect width={AW} height={height} fill="url(#app-fade)" />
          </mask>
        </defs>

        <g mask="url(#app-mask)">
          {rings.map((r, i) => (
            <circle
              key={r}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={ROYAL.iris}
              strokeOpacity={a(i === rings.length - 1 ? 0.18 : 0.1)}
              strokeWidth={1}
              style={still ? undefined : {
                strokeDasharray: 2 * Math.PI * r,
                strokeDashoffset: 2 * Math.PI * r,
                animation: `app-draw 1100ms cubic-bezier(0.22,1,0.36,1) ${120 + i * 70}ms forwards`,
              }}
            />
          ))}

          {Array.from({ length: 13 }).map((_, i) => {
            const deg = 96 + i * 15;
            const th = (deg * Math.PI) / 180;
            const major = i % 3 === 0;
            return (
              <line
                key={deg}
                x1={cx + Math.cos(th) * 96} y1={cy + Math.sin(th) * 96}
                x2={cx + Math.cos(th) * 356} y2={cy + Math.sin(th) * 356}
                stroke={ROYAL.iris}
                strokeOpacity={a(major ? 0.13 : 0.065)}
                strokeWidth={1}
                style={still ? undefined : {
                  opacity: 0,
                  animation: `app-fade-in 700ms ease-out ${420 + i * 26}ms forwards`,
                }}
              />
            );
          })}

          {/* the one warm trace */}
          <circle
            cx={cx} cy={cy} r={252}
            fill="none"
            stroke={ROYAL.gold}
            strokeOpacity={a(0.55)}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 252 * 0.11} ${2 * Math.PI * 252}`}
            transform={`rotate(118 ${cx} ${cy})`}
            style={still ? undefined : {
              strokeDashoffset: 2 * Math.PI * 252 * 0.11,
              animation: "app-trace 1200ms cubic-bezier(0.22,1,0.36,1) 640ms forwards",
            }}
          />
        </g>
      </svg>

      {/* ── tick ladder, pinned left ────────────────────────────────────── */}
      <svg
        width={22} height={height} viewBox={`0 0 22 ${height}`}
        preserveAspectRatio="xMinYMin meet"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        {Array.from({ length: ticks }).map((_, i) => {
          const long = i % 5 === 0;
          return (
            <line
              key={i}
              x1={1} y1={8 + i * 9}
              x2={1 + (long ? 14 : 6)} y2={8 + i * 9}
              stroke={ROYAL.iris}
              strokeOpacity={a(long ? 0.4 : 0.18)}
              strokeWidth={1}
              style={still ? undefined : {
                opacity: 0,
                animation: `app-fade-in 500ms ease-out ${200 + i * 11}ms forwards`,
              }}
            />
          );
        })}
      </svg>
    </div>
  );
});

export default Apparatus;
