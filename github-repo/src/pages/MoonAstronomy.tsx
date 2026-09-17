import { useMemo } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot } from "recharts";
import { Moon as MoonIcon, Sun, Orbit, CalendarClock, Telescope } from "lucide-react";

import type { Location } from "../hooks/useLocation";
import { ModuleShell } from "../components/ModuleShell";
import { ROYAL, HEADING, EASE } from "../lib/royal";
import { useCalm } from "../lib/calm";
import {
  moonIllumination, moonPosition, sunTimes, sunPosition,
  currentSeason, seasonEvents, moonPhases, compassPoint, nightWindow, nextMoonEvent,
} from "../lib/astro";
import { planetsTonight } from "../lib/planets";

interface Props { location: Location }

const time = (d: Date | null | undefined) =>
  d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—";
const dayAndTime = (d: Date) =>
  d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/* ── the moon's face ────────────────────────────────────────────────────── */

/**
 * The maria, at roughly their real places on the near side.
 *
 * The moon is tidally locked, so the same face is turned toward us always and
 * these do not move. Drawing them is what stops the disk reading as a clip-art
 * circle — the eye knows the moon's markings even when it cannot name them.
 */
const MARIA = [
  { x: -0.30, y: -0.34, r: 0.24, o: 0.20 }, // Imbrium
  { x: 0.06,  y: -0.30, r: 0.16, o: 0.18 }, // Serenitatis
  { x: 0.20,  y: -0.06, r: 0.19, o: 0.19 }, // Tranquillitatis
  { x: 0.46,  y: 0.06,  r: 0.13, o: 0.17 }, // Crisium
  { x: -0.12, y: 0.24,  r: 0.21, o: 0.15 }, // Nubium
  { x: -0.42, y: 0.20,  r: 0.11, o: 0.14 }, // Procellarum
  { x: 0.0,   y: 0.46,  r: 0.07, o: 0.24 }, // Tycho
  { x: 0.30,  y: 0.34,  r: 0.05, o: 0.20 },
];

/**
 * The moon at its actual phase.
 *
 * The lit part is bounded by the limb on one side and the terminator on the
 * other, and the terminator is the projection of a circle seen edge-on — a
 * half-ellipse whose width is (1 − 2f) of the radius. That is why a quarter
 * moon is a straight line and everything else is a curve, and why drawing this
 * as a circle with another circle over it looks wrong at every phase but new.
 */
function MoonDisk({ illum, waxing, size = 230, id }: {
  illum: number; waxing: boolean; size?: number; id: string;
}) {
  const R = size / 2 - size * 0.052;
  const c = size / 2;
  const f = Math.max(0, Math.min(1, illum / 100));

  const N = 48;
  const pts: string[] = [];
  for (let i = 0; i <= N; i++) {
    const y = -R + (2 * R * i) / N;
    const s = Math.sqrt(Math.max(0, R * R - y * y));
    pts.push(`${(c + (waxing ? -s : s)).toFixed(2)},${(c + y).toFixed(2)}`);
  }
  for (let i = N; i >= 0; i--) {
    const y = -R + (2 * R * i) / N;
    const s = Math.sqrt(Math.max(0, R * R - y * y));
    const xt = (1 - 2 * f) * s * (waxing ? 1 : -1);
    pts.push(`${(c + xt).toFixed(2)},${(c + y).toFixed(2)}`);
  }
  const darkPath = "M" + pts.join("L") + "Z";
  const small = size < 60;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
         aria-label={`Moon, ${Math.round(illum)}% illuminated, ${waxing ? "waxing" : "waning"}`}>
      <defs>
        <radialGradient id={`face-${id}`} cx="40%" cy="36%" r="68%">
          <stop offset="0%" stopColor="#fdfdf6" />
          <stop offset="60%" stopColor="#dcdbd1" />
          <stop offset="100%" stopColor="#a4a399" />
        </radialGradient>
        <radialGradient id={`glow-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="58%" stopColor="#cdd6ff" stopOpacity={0.4 * f + 0.06} />
          <stop offset="100%" stopColor="#cdd6ff" stopOpacity="0" />
        </radialGradient>
        <filter id={`term-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={size * 0.011} />
        </filter>
        <clipPath id={`clip-${id}`}><circle cx={c} cy={c} r={R} /></clipPath>
      </defs>

      <circle cx={c} cy={c} r={R * 1.14} fill={`url(#glow-${id})`} />
      <g clipPath={`url(#clip-${id})`}>
        <circle cx={c} cy={c} r={R} fill={`url(#face-${id})`} />
        {!small && MARIA.map((m, i) => (
          <circle key={i} cx={c + m.x * R} cy={c + m.y * R} r={m.r * R} fill="#6b6a60" opacity={m.o} />
        ))}
        {!small && <>
          <circle cx={c - 0.02 * R} cy={c + 0.44 * R} r={0.03 * R} fill="#fff" opacity={0.5} />
          <circle cx={c + 0.34 * R} cy={c - 0.40 * R} r={0.025 * R} fill="#fff" opacity={0.4} />
        </>}
        <path d={darkPath} fill="#05060f" fillOpacity={0.93} filter={`url(#term-${id})`} />
      </g>
      <circle cx={c} cy={c} r={R} fill="none" stroke="#ffffff" strokeOpacity={0.14} strokeWidth={1} />
    </svg>
  );
}

/** A drifting starfield behind the moon. Ornament, so it stops during calm. */
const STAR_BG: React.CSSProperties = {
  backgroundImage: [
    "radial-gradient(1px 1px at 12% 22%, #ffffffcc, transparent)",
    "radial-gradient(1px 1px at 28% 64%, #ffffff99, transparent)",
    "radial-gradient(1.4px 1.4px at 46% 28%, #ffffffbb, transparent)",
    "radial-gradient(1px 1px at 62% 74%, #ffffff88, transparent)",
    "radial-gradient(1px 1px at 76% 18%, #ffffffaa, transparent)",
    "radial-gradient(1.3px 1.3px at 88% 52%, #ffffffaa, transparent)",
    "radial-gradient(1px 1px at 8% 82%, #ffffff77, transparent)",
    "radial-gradient(1px 1px at 53% 88%, #ffffff88, transparent)",
    "radial-gradient(1px 1px at 35% 8%, #ffffff88, transparent)",
    "linear-gradient(160deg, #070a1f 0%, #0a0f2b 55%, #0b0820 100%)",
  ].join(","),
};

/* ── the page ───────────────────────────────────────────────────────────── */

export default function MoonAstronomy({ location }: Props) {
  const { calm } = useCalm(location.lat, location.lon);
  const { lat, lon } = location;

  const now = useMemo(() => new Date(), []);

  const moon = useMemo(() => {
    const ill = moonIllumination(now);
    const pos = moonPosition(now, lat, lon);
    // The NEXT rise and set, not the current UTC day's. The moon rises about
    // fifty minutes later each night, so on plenty of days one of the two does
    // not fall inside the calendar day at all and the card read "—".
    const rise = nextMoonEvent("rise", lat, lon, now);
    const set = nextMoonEvent("set", lat, lon, now);

    /**
     * How this month's distance compares with the rest of the month.
     *
     * "384,400 km" means nothing on its own. Whether tonight is the near end or
     * the far end of an orbit that varies by about 12% is the part a person can
     * actually see — the disc is noticeably bigger at perigee, which is the
     * whole of what a "supermoon" is.
     */
    let near = Infinity, far = -Infinity;
    for (let d = -15; d <= 15; d++) {
      const km = moonPosition(new Date(now.getTime() + d * 86400_000), lat, lon).distanceKm;
      near = Math.min(near, km); far = Math.max(far, km);
    }
    const spread = far - near;
    const closeness = spread > 0 ? 1 - (pos.distanceKm - near) / spread : 0.5;

    return { ill, pos, rise, set, near, far, closeness };
  }, [now, lat, lon]);

  const sun = useMemo(() => {
    const today = sunTimes(now, lat, lon);
    const yesterday = sunTimes(new Date(now.getTime() - 86400_000), lat, lon);
    const span = (t: ReturnType<typeof sunTimes>) =>
      t.sunrise && t.sunset ? t.sunset.getTime() - t.sunrise.getTime() : null;
    const len = span(today), prev = span(yesterday);
    return { t: today, dayLength: len, delta: len !== null && prev !== null ? len - prev : null };
  }, [now, lat, lon]);

  const season = useMemo(() => {
    const cur = currentSeason(now);
    const year = seasonEvents(now.getUTCFullYear());
    return { ...cur, year };
  }, [now]);

  const phases = useMemo(() => moonPhases(now, 4), [now]);

  /** The next 24 hours of sun and moon altitude, on one pair of axes. */
  const arc = useMemo(() => {
    const out: { label: string; sun: number; moon: number; t: number }[] = [];
    for (let m = 0; m <= 24 * 6; m++) {
      const at = new Date(now.getTime() + m * 10 * 60_000);
      out.push({
        t: at.getTime(),
        label: at.toLocaleTimeString("en-US", { hour: "numeric" }),
        sun: Math.round(sunPosition(at, lat, lon).altitude * 10) / 10,
        moon: Math.round(moonPosition(at, lat, lon).altitude * 10) / 10,
      });
    }
    return out;
  }, [now, lat, lon]);

  /**
   * Planets across tonight's dark window, or across the coming night when the
   * sun never gets far enough down for one.
   */
  const planets = useMemo(() => {
    const night = nightWindow(lat, lon, now);
    return planetsTonight(lat, lon, night.start, night.end, now);
  }, [now, lat, lon]);

  const moonUp = moon.pos.altitude > 0;

  return (
    <ModuleShell
      wide
      eyebrow="USNO algorithms · JPL elements"
      title="Moon & Astronomy"
      subtitle={<>{moon.ill.name} over {location.name}, {Math.round(moon.ill.fraction * 100)}% lit — and everything else above you tonight.</>}
    >
      {/* ── the moon, and the sun's day ──────────────────────────────────── */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <motion.section
          initial={calm ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={calm ? { duration: 0.2 } : { duration: 0.55, ease: EASE }}
          className="relative rounded-2xl overflow-hidden border p-5 flex flex-col items-center text-center"
          style={{ ...STAR_BG, borderColor: ROYAL.hairline }}>
          <div className="text-[10px] tracking-[0.32em] uppercase mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
            Tonight's moon
          </div>

          <motion.div
            initial={calm ? false : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={calm ? { duration: 0 } : { duration: 0.7, ease: EASE }}>
            <MoonDisk id="hero" illum={moon.ill.fraction * 100} waxing={moon.ill.waxing} size={216} />
          </motion.div>

          <div className="text-xl font-bold mt-1" style={{ fontFamily: HEADING, color: "#fff", textShadow: "0 0 22px rgba(205,214,255,0.5)" }}>
            {moon.ill.name}
          </div>
          <div className="text-[12.5px] mb-3" style={{ color: "rgba(255,255,255,0.72)" }}>
            {Math.round(moon.ill.fraction * 100)}% lit · {moon.ill.age.toFixed(1)} days old · {moon.ill.waxing ? "waxing" : "waning"}
          </div>

          <div className="w-full max-w-xs h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
            <motion.div className="h-full rounded-full"
              initial={calm ? false : { width: 0 }}
              animate={{ width: `${moon.ill.fraction * 100}%` }}
              transition={calm ? { duration: 0 } : { duration: 0.9, ease: EASE }}
              style={{ background: "linear-gradient(to right,#64748b,#f8fafc)", boxShadow: "0 0 12px #f8fafc88" }} />
          </div>

          <div className="grid grid-cols-2 gap-2 w-full mt-4">
            {[
              { k: "Next moonrise", v: time(moon.rise) },
              { k: "Next moonset", v: time(moon.set) },
              { k: "Right now", v: moonUp ? `${Math.round(moon.pos.altitude)}° ${compassPoint(moon.pos.azimuth)}` : "below the horizon" },
              { k: "Distance", v: `${moon.pos.distanceKm.toLocaleString()} km` },
            ].map((s) => (
              <div key={s.k} className="rounded-xl px-3 py-2 text-left"
                   style={{ background: "rgba(7,7,19,0.5)", border: `1px solid ${ROYAL.hairline}` }}>
                <div className="text-[9.5px] uppercase tracking-[0.14em]" style={{ color: ROYAL.dim }}>{s.k}</div>
                <div className="text-[13.5px] font-bold mt-0.5" style={{ color: ROYAL.text }}>{s.v}</div>
              </div>
            ))}
          </div>

          <p className="text-[10.5px] mt-3 leading-relaxed text-left" style={{ color: "rgba(255,255,255,0.55)" }}>
            The orbit is an ellipse, so the moon swings between about {Math.round(moon.near / 1000)},000 and
            {" "}{Math.round(moon.far / 1000)},000 km this month. Tonight it is{" "}
            {moon.closeness > 0.75 ? "near the close end — the disc is at its largest"
              : moon.closeness < 0.25 ? "near the far end — the disc is at its smallest"
              : "about mid-range"}, subtending {(moon.pos.apparentDiameter * 60).toFixed(1)} arcminutes.
          </p>
        </motion.section>

        <div className="space-y-4">
          <Card title="The sun today" icon={Sun}>
            <div className="grid grid-cols-2 gap-2">
              {[
                { k: "Sunrise", v: time(sun.t.sunrise) },
                { k: "Sunset", v: time(sun.t.sunset) },
                { k: "Solar noon", v: time(sun.t.solarNoon) },
                { k: "Day length", v: sun.dayLength !== null
                    ? `${Math.floor(sun.dayLength / 3600_000)}h ${Math.round((sun.dayLength % 3600_000) / 60_000)}m`
                    : sun.t.alwaysUp ? "all day" : "no sunrise" },
              ].map((s) => (
                <div key={s.k} className="rounded-xl px-3 py-2"
                     style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
                  <div className="text-[9.5px] uppercase tracking-[0.14em]" style={{ color: ROYAL.dim }}>{s.k}</div>
                  <div className="text-[15px] font-bold tabular-nums mt-0.5" style={{ color: ROYAL.text }}>{s.v}</div>
                </div>
              ))}
            </div>

            {sun.delta !== null && (
              <p className="text-[11.5px] mt-2.5 leading-relaxed" style={{ color: ROYAL.dim }}>
                That is{" "}
                <strong style={{ color: sun.delta >= 0 ? "#4ade80" : "#fbbf24" }}>
                  {Math.abs(Math.round(sun.delta / 1000))} seconds {sun.delta >= 0 ? "longer" : "shorter"}
                </strong>{" "}
                than yesterday. The rate peaks at the equinoxes and falls to nothing at the solstices, which is
                what "solstice" means — the sun standing still.
              </p>
            )}

            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { k: "Civil dusk", v: time(sun.t.civilDusk), d: "−6°" },
                { k: "Nautical", v: time(sun.t.nauticalDusk), d: "−12°" },
                { k: "Astronomical", v: time(sun.t.astronomicalDusk), d: "−18°" },
              ].map((s) => (
                <div key={s.k} className="rounded-xl px-2.5 py-2"
                     style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
                  <div className="text-[9px] uppercase tracking-[0.1em]" style={{ color: ROYAL.dim }}>{s.k} {s.d}</div>
                  <div className="text-[13px] font-bold tabular-nums mt-0.5" style={{ color: ROYAL.text }}>{s.v}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Where the year is" icon={CalendarClock}>
            <SeasonTrack season={season.season} events={season.year} next={season.next} now={now} calm={calm} />
          </Card>
        </div>
      </div>

      {/* ── sun and moon on one pair of axes ─────────────────────────────── */}
      <Card title="The next 24 hours, sun and moon" icon={Orbit}>
        <div className="flex items-center gap-4 mb-1 text-[10.5px]">
          {[{ k: "Sun", c: "#fbbf24" }, { k: "Moon", c: "#ccccff" }].map((l) => (
            <span key={l.k} className="flex items-center gap-1.5" style={{ color: ROYAL.dim }}>
              <span className="w-4 h-[2px] rounded-full" style={{ background: l.c }} />{l.k}
            </span>
          ))}
          <span className="ml-auto" style={{ color: ROYAL.dim }}>height above the horizon</span>
        </div>
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={arc} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="sunArc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="moonArc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ccccff" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ccccff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: ROYAL.dim }} tickLine={false} axisLine={false} interval={17} />
            <YAxis domain={[-90, 90]} ticks={[-90, -45, 0, 45, 90]} width={30}
                   tick={{ fontSize: 9, fill: ROYAL.dim }} tickLine={false} axisLine={false}
                   tickFormatter={(v: number) => `${v}°`} />
            <ReferenceLine y={0} stroke={ROYAL.goldSoft} strokeWidth={1.2}
                           label={{ value: "horizon", fill: ROYAL.gold, fontSize: 9, position: "insideTopRight" }} />
            <ReferenceLine y={-18} stroke={ROYAL.hairline} strokeDasharray="3 3"
                           label={{ value: "full dark", fill: ROYAL.dim, fontSize: 9, position: "insideTopRight" }} />
            <Tooltip
              contentStyle={{ background: ROYAL.ink2, border: `1px solid ${ROYAL.hairline}`, borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: ROYAL.text }}
              formatter={(v: number, n: string) => [`${v}° above the horizon`, n === "sun" ? "Sun" : "Moon"]} />
            <Area type="monotone" dataKey="sun" stroke="#fbbf24" fill="url(#sunArc)" strokeWidth={2}
                  dot={false} isAnimationActive={!calm} />
            <Area type="monotone" dataKey="moon" stroke="#ccccff" fill="url(#moonArc)" strokeWidth={2}
                  dot={false} isAnimationActive={!calm} />
            <ReferenceDot x={arc[0].label} y={arc[0].moon} r={3.5} fill="#ccccff" stroke="none" />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-[11px] leading-relaxed mt-1" style={{ color: ROYAL.dim }}>
          Both curves are computed for your coordinates. The gap worth looking for is where the gold curve is
          below −18° and the pale one is below zero at the same time: that is a genuinely dark sky, and it is
          the only condition under which faint things are visible.
        </p>
      </Card>

      {/* ── the lunar month ──────────────────────────────────────────────── */}
      <Card title="The lunar month from here" icon={MoonIcon}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {phases.map((p, i) => {
            const ill = moonIllumination(p.at);
            const days = (p.at.getTime() - now.getTime()) / 86400_000;
            return (
              <motion.div key={p.name + p.at.toISOString()}
                initial={calm ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={calm ? { duration: 0 } : { duration: 0.4, delay: 0.06 * i, ease: EASE }}
                className="rounded-xl p-3 flex flex-col items-center text-center"
                style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
                <MoonDisk id={`p${i}`} illum={ill.fraction * 100} waxing={ill.waxing} size={54} />
                <div className="text-[11.5px] font-semibold mt-1.5" style={{ color: ROYAL.text }}>{p.name}</div>
                <div className="text-[11px] tabular-nums" style={{ color: ROYAL.gold }}>{dayAndTime(p.at)}</div>
                <div className="text-[10px] mt-0.5" style={{ color: ROYAL.dim }}>
                  in {days < 1 ? `${Math.round(days * 24)} hours` : `${Math.round(days)} days`}
                </div>
              </motion.div>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed mt-3" style={{ color: ROYAL.dim }}>
          These are instants, not dates — a full moon is the moment the moon is opposite the sun, and it is only
          exactly full for that moment. Computed from the real geometry rather than counted off a fixed epoch,
          and within a few minutes of the U.S. Naval Observatory's own published times.
        </p>
      </Card>

      {/* ── planets ──────────────────────────────────────────────────────── */}
      <Card title="Planets tonight" icon={Telescope}>
        <div className="divide-y" style={{ borderColor: ROYAL.hairline }}>
          {planets.map((p) => {
            const up = p.altitude > 0;
            return (
              <div key={p.name} className="py-2.5 flex items-center gap-3 first:pt-0">
                <span className="shrink-0 w-9 h-9 rounded-lg grid place-items-center text-lg"
                      style={{ background: `${p.color}16`, border: `1px solid ${p.color}33`, color: p.color }}>
                  {p.symbol}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold" style={{ color: ROYAL.text }}>{p.name}</div>
                  <div className="text-[10.5px] leading-snug mt-0.5" style={{ color: ROYAL.dim }}>{p.note}</div>
                </div>
                <div className="shrink-0 text-right">
                  {p.upTonight ? (
                    <>
                      <div className="text-[15px] font-bold tabular-nums leading-none" style={{ color: p.color }}>
                        {Math.round(p.peakAltitude)}°
                      </div>
                      <div className="text-[10px] mt-1 tabular-nums" style={{ color: ROYAL.dim }}>
                        {p.clipped === "rising-at-dawn" ? `${p.peakCompass} · still rising at dawn`
                          : p.clipped === "past-best-at-dusk" ? `${p.peakCompass} · already past its best at dusk`
                          : `${p.peakCompass} · ${time(p.peakAt)}`}
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px]" style={{ color: ROYAL.dim }}>not up tonight</div>
                  )}
                  <div className="text-[9.5px] mt-0.5" style={{ color: up ? "#4ade80" : ROYAL.dim }}>
                    {up ? `up now, ${Math.round(p.altitude)}° ${p.compass}` : "below the horizon now"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed mt-3" style={{ color: ROYAL.dim }}>
          Positions are computed here from JPL's approximate orbital elements and placed for your own
          coordinates. Checked against the U.S. Naval Observatory's almanac: Venus and Jupiter land within about
          a hundredth of a degree, Saturn within four hundredths — far finer than anyone can point by eye. Light
          travels {(planets[0]?.distanceAu ?? 1).toFixed(2)} au from {planets[0]?.name ?? "the nearest"} in about{" "}
          {Math.round((planets[0]?.distanceAu ?? 1) * 8.317)} minutes, so you are always looking at the past.
        </p>
      </Card>
    </ModuleShell>
  );
}

/* ── small pieces ───────────────────────────────────────────────────────── */

function Card({ title, icon: Icon, children }: {
  title: string; icon: typeof Sun; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl overflow-hidden"
             style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
      <span aria-hidden className="block h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
      <header className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: ROYAL.hairline }}>
        <Icon className="w-4 h-4" style={{ color: ROYAL.gold }} />
        <h2 className="text-sm font-semibold" style={{ color: ROYAL.text }}>{title}</h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * The year as a line, with the four turning points on it and a marker for now.
 *
 * The version this replaces held the dates as constants — "Sep 22", "Dec 21" —
 * which is wrong in most years by a day, and it showed no time at all. These
 * are the real instants, and they move: the September equinox was the 22nd in
 * 2025 and is the 23rd in 2026.
 */
function SeasonTrack({ season, events, next, now, calm }: {
  season: string;
  events: { name: string; at: Date }[];
  next: { name: string; at: Date };
  now: Date;
  calm: boolean;
}) {
  const year = now.getUTCFullYear();
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
  const pct = (d: number) => ((d - start) / (end - start)) * 100;
  const days = (next.at.getTime() - now.getTime()) / 86400_000;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: ROYAL.dim }}>Right now</div>
          <div className="text-lg font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>{season}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: ROYAL.dim }}>{next.name}</div>
          <div className="text-[13.5px] font-bold tabular-nums" style={{ color: ROYAL.gold }}>{dayAndTime(next.at)}</div>
        </div>
      </div>

      <div className="relative h-14">
        <div className="absolute inset-x-0 top-4 h-1.5 rounded-full"
             style={{ background: "linear-gradient(90deg,#60a5fa,#4ade80,#fbbf24,#fb923c,#60a5fa)", opacity: 0.55 }} />
        {events.map((e) => (
          <div key={e.name} className="absolute" style={{ left: `${pct(e.at.getTime())}%`, top: 0 }}>
            <div className="w-px h-6 mx-auto" style={{ background: ROYAL.irisSoft }} />
            <div className="text-[9px] whitespace-nowrap -translate-x-1/2 mt-0.5 tabular-nums" style={{ color: ROYAL.dim }}>
              {e.at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </div>
        ))}
        <motion.div className="absolute top-1"
          initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }}
          transition={calm ? { duration: 0 } : { duration: 0.5, delay: 0.3 }}
          style={{ left: `${pct(now.getTime())}%` }}>
          <div className="w-[3px] h-8 -translate-x-1/2 rounded-full" style={{ background: ROYAL.gold }} />
        </motion.div>
      </div>

      <p className="text-[11.5px] leading-relaxed" style={{ color: ROYAL.dim }}>
        {Math.round(days)} days to go. These are the instants the sun's ecliptic longitude crosses 0°, 90°, 180°
        and 270° — computed, not looked up, and within about five minutes of the U.S. Naval Observatory.
      </p>
    </div>
  );
}
