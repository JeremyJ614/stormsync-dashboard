/**
 * The daylight arc.
 *
 * A day has a shape, and it is this one: up from the horizon at sunrise, over,
 * and down again at sunset. Printing "06:41" and "20:12" in a corner tells you
 * the same two facts and none of the thing they describe — how much of the day
 * is left, and whether the light is climbing or going.
 *
 * So the arc is drawn as the day is drawn. The elapsed span is stroked in
 * champagne from sunrise forward, at a rate you can follow; the remainder stays
 * as a faint rail; and the disc sits where the sun actually is, with the
 * lengthening shadow of its glow under it. On a day that is not today there is
 * no disc, because there is no "now" on a Thursday — the arc is drawn whole and
 * labelled with its length.
 *
 * Deliberately geometry rather than imagery: this module is on a menu a member
 * can re-style, and half of those menus are not weather menus. An arc, a rule
 * and two times survive any of them.
 */
import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { ROYAL, EASE } from "../../lib/royal";

interface Props {
  /** ISO local timestamps, e.g. "2026-09-12T06:41". */
  sunrise?: string;
  sunset?: string;
  /** Only today has a position on the arc. */
  isToday: boolean;
  /** Reduced motion or the app's calm mode: render the finished state. */
  still?: boolean;
  height?: number;
}

const W = 320;

/** Minutes past local midnight from an ISO local timestamp. */
function minutes(iso?: string): number | null {
  if (!iso || iso.length < 16) return null;
  const h = Number(iso.slice(11, 13));
  const m = Number(iso.slice(14, 16));
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function clockLabel(iso?: string): string {
  const t = minutes(iso);
  if (t === null) return "—";
  const h = Math.floor(t / 60), m = t % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ampm}`;
}

export const SunArc = memo(function SunArc({
  sunrise, sunset, isToday, still, height = 118,
}: Props) {
  const rise = minutes(sunrise);
  const set = minutes(sunset);

  const { frac, lengthLabel, upNow } = useMemo(() => {
    if (rise === null || set === null || set <= rise) {
      return { frac: null as number | null, lengthLabel: "—", upNow: false };
    }
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const f = (nowMin - rise) / (set - rise);
    const mins = set - rise;
    return {
      frac: Math.max(0, Math.min(1, f)),
      lengthLabel: `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m of daylight`,
      upNow: f >= 0 && f <= 1,
    };
  }, [rise, set]);

  // The arc itself: a flattened half-ellipse from horizon to horizon.
  const pad = 22;
  const base = height - 26;
  const peak = 16;
  const path = `M ${pad} ${base} Q ${W / 2} ${peak - (base - peak) * 0.32} ${W - pad} ${base}`;

  // Where the disc sits. Quadratic Bézier at t, which is exact rather than an
  // approximation along a stroke — the marker and the stroke agree.
  const at = (t: number) => {
    const cx = W / 2, cy = peak - (base - peak) * 0.32;
    const x = (1 - t) ** 2 * pad + 2 * (1 - t) * t * cx + t ** 2 * (W - pad);
    const y = (1 - t) ** 2 * base + 2 * (1 - t) * t * cy + t ** 2 * base;
    return { x, y };
  };

  const show = isToday && frac !== null && upNow;
  const sun = show ? at(frac!) : null;
  const drawTo = isToday && frac !== null ? frac! : 1;

  return (
    <div className="relative w-full" style={{ maxWidth: W }}>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full overflow-visible" role="img"
           aria-label={`${clockLabel(sunrise)} to ${clockLabel(sunset)}. ${lengthLabel}.`}>
        <defs>
          <linearGradient id="sunarc-lit" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={ROYAL.gold} stopOpacity="0.25" />
            <stop offset="100%" stopColor={ROYAL.gold} stopOpacity="1" />
          </linearGradient>
          <radialGradient id="sunarc-glow">
            <stop offset="0%" stopColor={ROYAL.gold} stopOpacity="0.55" />
            <stop offset="100%" stopColor={ROYAL.gold} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* the rail: the whole day, unlit */}
        <path d={path} fill="none" stroke={ROYAL.hairline} strokeWidth={2} strokeLinecap="round" />

        {/* the horizon */}
        <line x1={6} y1={base} x2={W - 6} y2={base}
              stroke={ROYAL.hairline} strokeWidth={1} strokeDasharray="3 6" />

        {/* elapsed daylight, drawn on */}
        <motion.path
          d={path} fill="none" stroke="url(#sunarc-lit)" strokeWidth={2.5} strokeLinecap="round"
          initial={still ? false : { pathLength: 0 }}
          animate={{ pathLength: drawTo }}
          transition={still ? { duration: 0 } : { duration: 1.15, delay: 0.15, ease: EASE }}
        />

        {sun && (
          <motion.g
            initial={still ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={still ? { duration: 0 } : { delay: 1.15, type: "spring", stiffness: 320, damping: 18 }}
          >
            <circle cx={sun.x} cy={sun.y} r={26} fill="url(#sunarc-glow)" />
            <circle cx={sun.x} cy={sun.y} r={6.5} fill={ROYAL.gold} />
            <circle cx={sun.x} cy={sun.y} r={6.5} fill="none" stroke="#fff" strokeOpacity={0.5} strokeWidth={1} />
            {/* the line down to the horizon: how high the sun is, at a glance */}
            <line x1={sun.x} y1={sun.y + 8} x2={sun.x} y2={base}
                  stroke={ROYAL.gold} strokeOpacity={0.28} strokeWidth={1} strokeDasharray="2 4" />
          </motion.g>
        )}

        {/* end caps */}
        <circle cx={pad} cy={base} r={3} fill={ROYAL.gold} fillOpacity={0.75} />
        <circle cx={W - pad} cy={base} r={3} fill={ROYAL.iris} fillOpacity={0.5} />
      </svg>

      <div className="flex items-baseline justify-between mt-1 px-1">
        <div>
          <div className="text-[9px] uppercase tracking-[0.22em]" style={{ color: ROYAL.gold }}>Sunrise</div>
          <div className="text-[13px] font-semibold tabular-nums" style={{ color: ROYAL.text }}>{clockLabel(sunrise)}</div>
        </div>
        <div className="text-[10px] text-center px-2" style={{ color: ROYAL.dim }}>{lengthLabel}</div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-[0.22em]" style={{ color: ROYAL.iris }}>Sunset</div>
          <div className="text-[13px] font-semibold tabular-nums" style={{ color: ROYAL.text }}>{clockLabel(sunset)}</div>
        </div>
      </div>
    </div>
  );
});

export default SunArc;
