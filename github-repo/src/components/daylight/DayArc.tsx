/**
 * The shape of the day, drawn.
 *
 * WHAT THIS REPLACES
 * Four tiles with emoji on them — ☀️ 🌙 ⏱️ 📈 — each holding one figure in its
 * own colour: orange sunrise, indigo sunset, white duration, green or amber
 * delta. Four numbers, no relationship between them, and a set of glyphs that
 * render as somebody else's artwork on a page with a typeface and a palette of
 * its own. Underneath sat a 110px sun arc squeezed into a popup, which was the
 * only thing on the page that actually showed anything.
 *
 * WHAT THIS IS
 * One instrument. The whole twenty-four hours run left to right, night shaded
 * at both ends, and the sun's path drawn across the daylight between them. You
 * can see the length of the day as a distance rather than reading it off a
 * label — which is the entire subject of the module — and the figures sit on
 * the drawing instead of beside it.
 *
 * The arc draws itself in once, left to right, the way the day runs. It does
 * not loop: this is a diagram, not an ornament.
 */
import { memo } from "react";
import { motion } from "framer-motion";
import { Sunrise, Sunset } from "lucide-react";
import { ROYAL, HEADING, EASE } from "../../lib/royal";

const W = 1000;
const H = 250;
const GROUND = H - 46;
const TOP = 26;

interface Props {
  /** Minutes past local midnight. */
  riseMin: number;
  setMin: number;
  polarDay: boolean;
  polarNight: boolean;
  /** Pre-formatted, because the page owns the time zone. */
  riseLabel: string;
  setLabel: string;
  lengthLabel: string;
  deltaLabel: string;
  deltaUp: boolean;
  deltaCaption: string;
  monthLabel: string;
  still: boolean;
}

const xOf = (m: number) => Math.max(0, Math.min(W, (m / 1440) * W));
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const hourLabel = (h: number) =>
  h === 0 || h === 24 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`;

export const DayArc = memo(function DayArc({
  riseMin, setMin, polarDay, polarNight,
  riseLabel, setLabel, lengthLabel, deltaLabel, deltaUp, deltaCaption, monthLabel, still,
}: Props) {
  // A day whose sunset falls before its sunrise in local clock time has wrapped
  // past midnight — real at high latitudes and near time-zone edges. Rather
  // than draw an arc backwards, clamp it to the end of the day; the figures in
  // the header still state it exactly.
  const wraps = !polarDay && setMin < riseMin;
  const rX = polarDay ? 0 : xOf(riseMin);
  const sX = polarDay ? W : wraps ? W : xOf(setMin);
  const apexX = (rX + sX) / 2;
  const span = Math.max(1, sX - rX);
  // A shallow arc for a short day and a tall one for a long day, so midsummer
  // and midwinter do not draw the same curve at different widths.
  const apexY = GROUND - (GROUND - TOP) * Math.min(1, span / W * 1.35);
  const arc = `M ${rX} ${GROUND} C ${rX + span * 0.28} ${apexY} ${sX - span * 0.28} ${apexY} ${sX} ${GROUND}`;
  const fill = `${arc} L ${sX} ${GROUND} L ${rX} ${GROUND} Z`;

  return (
    <section className="relative rounded-2xl overflow-hidden"
             style={{
               border: `1px solid ${ROYAL.hairline}`,
               background:
                 `radial-gradient(70% 120% at 50% 120%, rgba(217,183,117,0.10), transparent 62%),`
                 + `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
             }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      <header className="px-4 pt-3.5 flex items-end gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: ROYAL.gold }}>
            {monthLabel}
          </div>
          <div className="mt-1 text-[34px] leading-none font-bold tabular-nums"
               style={{ fontFamily: HEADING, color: ROYAL.text }}>
            {lengthLabel}
          </div>
          <div className="mt-1 text-[11px]" style={{ color: ROYAL.dim }}>of daylight</div>
        </div>

        <div className="ml-auto text-right">
          <div className="text-[10px] uppercase tracking-[0.28em]" style={{ color: ROYAL.dim }}>
            {deltaCaption}
          </div>
          <div className="mt-1 text-[22px] leading-none font-bold tabular-nums"
               style={{ fontFamily: HEADING, color: deltaUp ? ROYAL.gold : ROYAL.iris }}>
            {deltaLabel}
          </div>
        </div>
      </header>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-1" role="img"
           aria-label={`Sun path. Sunrise ${riseLabel}, sunset ${setLabel}, ${lengthLabel} of daylight.`}>
        <defs>
          <linearGradient id="dayFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(217,183,117,0.26)" />
            <stop offset="100%" stopColor="rgba(217,183,117,0.02)" />
          </linearGradient>
          <linearGradient id="arcLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(217,183,117,0.5)" />
            <stop offset="50%" stopColor={ROYAL.gold} />
            <stop offset="100%" stopColor="rgba(217,183,117,0.5)" />
          </linearGradient>
        </defs>

        {/* Night, at both ends. Shaded rather than left blank, because the dark
            half of the day is half the subject. */}
        {rX > 0 && <rect x="0" y={TOP - 14} width={rX} height={GROUND - TOP + 14} fill="rgba(204,204,255,0.035)" />}
        {sX < W && <rect x={sX} y={TOP - 14} width={W - sX} height={GROUND - TOP + 14} fill="rgba(204,204,255,0.035)" />}

        {/* Hour ruling. */}
        {HOURS.map((h) => {
          const x = xOf(h * 60);
          return (
            <g key={h}>
              <line x1={x} y1={GROUND} x2={x} y2={GROUND + 6} stroke={ROYAL.hairline} strokeWidth="1" />
              {/* The first and last labels anchor inward, or half of "12a"
                  falls off the viewBox. */}
              <text x={x} y={GROUND + 20}
                    textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}
                    fontSize="11" fill={ROYAL.dim} opacity="0.75">
                {hourLabel(h)}
              </text>
            </g>
          );
        })}

        <line x1="0" y1={GROUND} x2={W} y2={GROUND} stroke="rgba(204,204,255,0.16)" strokeWidth="1" />

        {!polarNight && (
          <>
            <motion.path d={fill} fill="url(#dayFill)"
              initial={still ? { opacity: 0 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: still ? 0.2 : 0.7, delay: still ? 0 : 0.35, ease: EASE }} />
            <motion.path d={arc} fill="none" stroke="url(#arcLine)" strokeWidth="2.5" strokeLinecap="round"
              initial={still ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: still ? 0 : 1.1, ease: EASE }} />

            {/* The sun, at its highest. */}
            <motion.circle cx={apexX} cy={apexY + 2} r="7" fill={ROYAL.gold}
              style={{ filter: `drop-shadow(0 0 10px ${ROYAL.goldSoft})` }}
              initial={still ? { opacity: 0 } : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: still ? 0.2 : 0.45, delay: still ? 0 : 0.9, ease: EASE }} />

            {/* Where it crosses the horizon. */}
            <circle cx={rX} cy={GROUND} r="4.5" fill={ROYAL.ink} stroke={ROYAL.gold} strokeWidth="2" />
            <circle cx={sX} cy={GROUND} r="4.5" fill={ROYAL.ink} stroke={ROYAL.iris} strokeWidth="2" />
          </>
        )}

        {polarNight && (
          <text x={W / 2} y={(GROUND + TOP) / 2} textAnchor="middle" fontSize="22"
                fill={ROYAL.dim} fontFamily={HEADING}>
            The sun does not rise this month
          </text>
        )}
        {polarDay && (
          <text x={W / 2} y={TOP + 8} textAnchor="middle" fontSize="15" fill={ROYAL.gold} fontFamily={HEADING}>
            The sun does not set this month
          </text>
        )}
      </svg>

      <footer className="px-4 pb-4 pt-1 flex items-center gap-6 flex-wrap">
        <Endpoint icon={Sunrise} label="Sunrise" value={riseLabel} color={ROYAL.gold} />
        <Endpoint icon={Sunset} label="Sunset" value={setLabel} color={ROYAL.iris} />
      </footer>
    </section>
  );
});

function Endpoint({
  icon: Icon, label, value, color,
}: { icon: typeof Sunrise; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="w-4 h-4 shrink-0" style={{ color }} />
      <div>
        <div className="text-[10px] uppercase tracking-[0.28em]" style={{ color: ROYAL.dim }}>{label}</div>
        <div className="text-sm font-semibold tabular-nums" style={{ color: ROYAL.text }}>{value}</div>
      </div>
    </div>
  );
}
