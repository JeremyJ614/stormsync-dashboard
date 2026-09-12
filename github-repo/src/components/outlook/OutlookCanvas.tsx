/**
 * The shared outlook map.
 *
 * Every vector product in the Daily Brief — SPC's risk areas, WPC's rainfall
 * contours, CPC's probability bands, the drought hazards — is drawn by this one
 * component on the app's own Albers canvas. That is deliberate: a person moving
 * between them should feel they are turning pages in one atlas, not opening
 * four different agencies' websites.
 *
 * Three details do most of the work.
 *
 * The bands are masked to the nation with a few pixels of coastal margin, so a
 * contour that genuinely runs into Canada or the Gulf stops at a believable edge
 * instead of floating in black.
 *
 * State outlines are drawn again ON TOP of the bands. An outlook fill is opaque
 * enough to swallow the borders underneath it, and a rainfall map you cannot
 * locate yourself on is decoration — this is the one thing every national centre
 * does on its own graphics, and the reason is the same.
 *
 * And the legend sits in a strip beneath the map rather than floating over a
 * corner of it. Every corner of this canvas is occupied: Alaska and Hawaii are
 * bottom left, Florida and the Atlantic bottom right, and the period rail has
 * the top right. A legend that hides Alaska to explain Alaska is not a legend.
 */
import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { AlbersPanZoom } from "../map/AlbersPanZoom";
import { UsStatesBackdrop, UsNationMask, useUsMaskId } from "../UsStatesBackdrop";
import { MAP_W, MAP_H, US_STATES, US_STATE_LABELS } from "../../lib/usAlbers";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import type { Band, OutlookFrame } from "../../lib/outlooks";

/** Borders redrawn over the bands, dark so they read on pale fills and bright. */
const StateEdges = memo(function StateEdges({ k }: { k: number }) {
  return (
    <g fill="none" stroke="#05060d" strokeOpacity={0.42} strokeWidth={0.75 / k} style={{ pointerEvents: "none" }}>
      {US_STATES.map((s, i) => <path key={i} d={s.d} />)}
    </g>
  );
});

/** Abbreviations that hold their on-screen size as the map is zoomed. */
const StateLabels = memo(function StateLabels({ k }: { k: number }) {
  return (
    <g style={{ pointerEvents: "none" }}>
      {US_STATE_LABELS.map((l) => (
        <text
          key={l.abbr}
          x={l.x} y={l.y}
          textAnchor="middle" dominantBaseline="middle"
          fill="#e6ecf7" fillOpacity={0.88}
          fontSize={11 / k} fontWeight={700}
          fontFamily="system-ui, sans-serif"
          stroke="#05060d" strokeWidth={1.5 / k} paintOrder="stroke"
        >
          {l.abbr}
        </text>
      ))}
    </g>
  );
});

const Bands = memo(function Bands({ bands, k, still }: { bands: Band[]; k: number; still: boolean }) {
  return (
    <>
      {bands.map((b, i) => (
        <motion.path
          key={b.key}
          d={b.d}
          fill={b.fill}
          fillOpacity={0.72}
          fillRule="evenodd"
          stroke={b.stroke}
          strokeOpacity={0.85}
          strokeWidth={1 / k}
          strokeLinejoin="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: still ? 0.18 : 0.5,
            delay: still ? 0 : Math.min(i, 12) * 0.045,
            ease: EASE,
          }}
        />
      ))}
    </>
  );
});

/**
 * The legend.
 *
 * A risk outlook has three classes and wants them named; a rainfall forecast has
 * eighteen and wants a ramp. Rather than force one into the other's shape, the
 * legend counts what it was given and picks.
 */
export const OutlookLegend = memo(function OutlookLegend({
  legend, unit,
}: { legend: OutlookFrame["legend"]; unit?: string }) {
  const ramp = legend.length > 8;
  const gradient = useMemo(
    () => (ramp ? `linear-gradient(90deg, ${legend.map((l) => l.fill).join(", ")})` : ""),
    [ramp, legend],
  );
  if (!legend.length) return null;

  if (ramp) {
    return (
      <div className="px-4 py-3">
        {unit && (
          <div className="text-[9px] uppercase tracking-[0.24em] mb-1.5" style={{ color: ROYAL.dim }}>{unit}</div>
        )}
        <div className="h-2.5 rounded-full" style={{ background: gradient }} />
        <div className="relative mt-1 h-4">
          {legend.map((l, i) => {
            // Ticks every other class past eight of them, so the strip never
            // becomes a row of overlapping numbers on a phone.
            const step = legend.length > 12 ? 3 : 2;
            if (i % step !== 0 && i !== legend.length - 1) return null;
            const at = (i / (legend.length - 1)) * 100;
            return (
              <span
                key={l.key}
                className="absolute text-[10px] tabular-nums -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${Math.min(97, Math.max(3, at))}%`, color: ROYAL.dim }}
              >
                {l.label}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <ul className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {legend.map((l) => (
        <li key={l.key} className="flex items-center gap-2 text-[11px] whitespace-nowrap">
          <span
            className="w-3 h-3 rounded-[3px] shrink-0"
            style={{ background: l.fill, border: `1px solid ${l.stroke}` }}
          />
          <span style={{ color: ROYAL.text }}>{l.label}</span>
        </li>
      ))}
    </ul>
  );
});

interface Props {
  frame: OutlookFrame;
  still: boolean;
  height?: number;
  /** Floating chrome — the period rail — laid over the top of the map. */
  topRight?: React.ReactNode;
  ariaLabel: string;
}

export const OutlookCanvas = memo(function OutlookCanvas({
  frame, still, height = 470, topRight, ariaLabel,
}: Props) {
  const maskId = useUsMaskId();

  return (
    <div className="w-full overflow-hidden rounded-2xl"
         style={{ background: ROYAL.ink, border: `1px solid ${ROYAL.hairline}` }}>
      <div className="relative" style={{ height }}>
        <AlbersPanZoom width={MAP_W} height={MAP_H} maxZoom={8} className="w-full h-full" ariaLabel={ariaLabel}>
          {(k) => (
            <>
              <defs><UsNationMask id={maskId} /></defs>
              <UsStatesBackdrop labels={false} />
              <g mask={`url(#${maskId})`}>
                <Bands bands={frame.bands} k={k} still={still} />
              </g>
              <StateEdges k={k} />
              <StateLabels k={k} />
            </>
          )}
        </AlbersPanZoom>

        {topRight && <div className="absolute top-3 right-3 z-10">{topRight}</div>}

        {frame.empty && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div
              className="px-5 py-3 rounded-2xl text-center"
              style={{
                background: "rgba(7,7,19,0.88)",
                border: `1px solid ${ROYAL.goldSoft}`,
                backdropFilter: "blur(10px)",
              }}
            >
              <div className="text-sm font-bold" style={{ color: ROYAL.gold, fontFamily: HEADING }}>
                Nothing posted
              </div>
              <div className="text-[11px] mt-0.5 max-w-[260px]" style={{ color: ROYAL.dim }}>
                The centre has issued this cycle with no areas in it.
              </div>
            </div>
          </div>
        )}
      </div>

      {frame.legend.length > 0 && (
        <div style={{ borderTop: `1px solid ${ROYAL.hairline}`, background: "rgba(8,8,18,0.6)" }}>
          <OutlookLegend legend={frame.legend} unit={frame.unit} />
        </div>
      )}
    </div>
  );
});

export default OutlookCanvas;
