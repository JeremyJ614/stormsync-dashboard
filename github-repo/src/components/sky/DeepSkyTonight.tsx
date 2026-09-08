import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Telescope, Binoculars, Eye } from "lucide-react";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import { targetsTonight, USABLE_ALTITUDE, type Aperture, type TargetTonight } from "../../lib/deepSky";
import { sunPosition } from "../../lib/astro";

/**
 * What to look at tonight, and where to stand.
 *
 * The list this replaces was static: eight objects, a "season" column, and no
 * connection to the sky above the person reading it. This one places every
 * object at the viewer's own coordinates across tonight's real dark window.
 *
 * The plot is the part that does the work. Azimuth runs left to right as a
 * compass, altitude runs bottom to top, and each target sits where it will be
 * at its highest — so the whole answer, "face south-south-east and look about
 * two-thirds of the way up, around eleven", is one glance rather than three
 * columns of numbers.
 */

const APERTURE: Record<Aperture, { label: string; icon: typeof Eye; color: string }> = {
  eye:        { label: "Naked eye",  icon: Eye,        color: "#fde047" },
  binoculars: { label: "Binoculars", icon: Binoculars, color: "#e879f9" },
  telescope:  { label: "Telescope",  icon: Telescope,  color: "#818cf8" },
};

const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function DeepSkyTonight({
  lat, lon, darkStart, darkEnd, calm,
}: {
  lat: number; lon: number;
  darkStart: Date | null; darkEnd: Date | null;
  calm: boolean;
}) {
  const [filter, setFilter] = useState<Aperture | "all">("all");

  const targets = useMemo(() => {
    if (!darkStart || !darkEnd) return null;
    // A window that wraps past midnight is still one window; if the ordering
    // came back reversed the night runs from dusk to the following dawn.
    const to = darkEnd > darkStart ? darkEnd : new Date(darkEnd.getTime() + 86400_000);
    return targetsTonight(lat, lon, darkStart, to);
  }, [lat, lon, darkStart, darkEnd]);

  if (!targets) {
    return (
      <div className="rounded-2xl p-5" style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <div className="text-[10px] uppercase tracking-[0.24em] mb-2" style={{ color: ROYAL.dim }}>Targets tonight</div>
        <p className="text-[12.5px] leading-relaxed" style={{ color: ROYAL.dim }}>
          The sun never gets 18° below your horizon tonight, so there is no astronomically dark
          window to place targets in. This is the normal summer condition above about 49° latitude.
        </p>
      </div>
    );
  }

  const up = targets.filter((t) => t.peakAltitude >= USABLE_ALTITUDE);
  // Above the horizon in broad daylight is not "up" in any sense a person can
  // use, so the row says so rather than dangling a green tick on an invisible
  // object. Civil twilight is the line: brighter than that and only the moon
  // and the planets are showing.
  const daylight = sunPosition(new Date(), lat, lon).altitude > -6;
  const shown = filter === "all" ? up : up.filter((t) => t.object.aperture === filter);
  const below = targets.length - up.length;

  // Plot geometry. Azimuth left-to-right, altitude bottom-to-top, with a little
  // headroom so a target at the zenith is not drawn on the frame.
  const W = 720, H = 232, PAD_L = 26, PAD_R = 12, PAD_T = 16, PAD_B = 26;
  const px = (az: number) => PAD_L + (az / 360) * (W - PAD_L - PAD_R);
  const py = (alt: number) => H - PAD_B - (Math.max(0, alt) / 90) * (H - PAD_T - PAD_B);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
      <span aria-hidden className="block h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      <div className="px-4 pt-3.5 pb-2 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: ROYAL.dim }}>Targets tonight</div>
          <h3 className="text-base font-bold mt-0.5" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            {up.length} object{up.length === 1 ? "" : "s"} clear 20° between {time(darkStart!)} and {time(darkEnd!)}
          </h3>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "eye", "binoculars", "telescope"] as const).map((k) => {
            const on = filter === k;
            const c = k === "all" ? ROYAL.gold : APERTURE[k].color;
            return (
              <button key={k} onClick={() => setFilter(k)}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.12em] transition-colors"
                style={on
                  ? { background: `${c}22`, color: c, border: `1px solid ${c}66` }
                  : { background: "transparent", color: ROYAL.dim, border: `1px solid ${ROYAL.hairline}` }}>
                {k === "all" ? "All" : APERTURE[k].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── the sky, as seen from where you are standing ─────────────────── */}
      <div className="px-2 pb-1 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 460 }}
             role="img" aria-label="Tonight's targets plotted by compass direction and height above the horizon">
          <defs>
            <linearGradient id="dsSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#1a1440" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#070713" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <rect x={PAD_L} y={PAD_T} width={W - PAD_L - PAD_R} height={H - PAD_T - PAD_B} fill="url(#dsSky)" rx="8" />

          {/* altitude rules — 20° is the line below which it is not worth setting up */}
          {[0, 20, 45, 90].map((alt) => (
            <g key={alt}>
              <line x1={PAD_L} x2={W - PAD_R} y1={py(alt)} y2={py(alt)}
                    stroke={alt === USABLE_ALTITUDE ? ROYAL.goldSoft : ROYAL.hairline}
                    strokeWidth={alt === USABLE_ALTITUDE ? 1 : 0.75}
                    strokeDasharray={alt === USABLE_ALTITUDE ? "4 4" : undefined} />
              <text x={4} y={py(alt) + 3} fontSize="9" fill={ROYAL.dim}>{alt}°</text>
            </g>
          ))}

          {/* compass */}
          {[["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315], ["N", 360]].map(
            ([label, az], i) => (
              <g key={i}>
                <line x1={px(az as number)} x2={px(az as number)} y1={PAD_T} y2={H - PAD_B}
                      stroke={ROYAL.hairline} strokeWidth="0.75" />
                <text x={px(az as number)} y={H - 9} fontSize="9.5" textAnchor="middle"
                      fill={label === "S" ? ROYAL.gold : ROYAL.dim} fontWeight={label === "S" ? 700 : 400}>{label}</text>
              </g>
            ))}

          {/* the targets */}
          {shown.map((t, i) => {
            const c = APERTURE[t.object.aperture].color;
            const x = px(t.azimuthAtPeak), y = py(t.peakAltitude);
            return (
              <motion.g key={t.object.id}
                initial={calm ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={calm ? { duration: 0.2 } : { duration: 0.45, delay: 0.05 + i * 0.035, ease: EASE }}
                style={{ transformOrigin: `${x}px ${y}px` }}>
                <circle cx={x} cy={y} r="8" fill={c} opacity="0.16" />
                <circle cx={x} cy={y} r="3.4" fill={c} />
                <text x={x} y={y - 12} fontSize="9.5" textAnchor="middle" fill={ROYAL.text} fontWeight="600">
                  {t.object.id}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>

      {/* ── the list ─────────────────────────────────────────────────────── */}
      <div className="divide-y" style={{ borderColor: ROYAL.hairline }}>
        {shown.map((t) => <TargetRow key={t.object.id} t={t} daylight={daylight} />)}
        {shown.length === 0 && (
          <div className="px-4 py-6 text-center text-[12.5px]" style={{ color: ROYAL.dim }}>
            Nothing in that class gets above 20° tonight from {lat.toFixed(1)}°.
          </div>
        )}
      </div>

      {below > 0 && (
        <p className="px-4 py-2.5 text-[10.5px] leading-relaxed" style={{ color: ROYAL.dim }}>
          {below} more catalogue object{below === 1 ? "" : "s"} {below === 1 ? "stays" : "stay"} below 20° from your
          latitude tonight and {below === 1 ? "is" : "are"} not listed — technically up, practically behind two to
          three times as much air as an object overhead. Positions are J2000 coordinates from SIMBAD, placed for
          your own coordinates; altitudes match the U.S. Naval Observatory to two thousandths of a degree.
        </p>
      )}
    </div>
  );
}

function TargetRow({ t, daylight }: { t: TargetTonight; daylight: boolean }) {
  const meta = APERTURE[t.object.aperture];
  const Icon = meta.icon;
  const upNow = t.altitudeNow > 0;

  return (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <span className="shrink-0 w-8 h-8 rounded-lg grid place-items-center"
            style={{ background: `${meta.color}16`, border: `1px solid ${meta.color}33` }}>
        <Icon className="w-4 h-4" style={{ color: meta.color }} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[13.5px] font-semibold" style={{ color: ROYAL.text }}>{t.object.name}</span>
          <span className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>{t.object.id}</span>
          <span className="text-[10px]" style={{ color: ROYAL.dim }}>· {t.object.kind}</span>
        </div>
        <div className="text-[10.5px] leading-snug mt-0.5" style={{ color: ROYAL.dim }}>{t.object.note}</div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-[15px] font-bold tabular-nums leading-none" style={{ color: meta.color }}>
          {Math.round(t.peakAltitude)}°
        </div>
        <div className="text-[10px] mt-1 tabular-nums" style={{ color: ROYAL.dim }}>
          {t.compass} · {time(t.peakAt)}
        </div>
        <div className="text-[9.5px] mt-0.5" style={{ color: upNow && !daylight ? "#4ade80" : ROYAL.dim }}>
          {!upNow ? "below the horizon now"
            : daylight ? `${Math.round(t.altitudeNow)}° ${t.compassNow}, but it's daylight`
            : `up now, ${Math.round(t.altitudeNow)}° ${t.compassNow}`}
        </div>
      </div>
    </div>
  );
}

export default DeepSkyTonight;
