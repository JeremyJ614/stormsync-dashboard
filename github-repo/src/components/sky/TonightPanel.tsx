import { useMemo } from "react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceArea } from "recharts";
import { Moon, Sunset, Sunrise, Telescope } from "lucide-react";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import { sunTimes, moonTimes, moonIllumination, moonPosition } from "../../lib/astro";
import { skyScore, skyLabel, bestWindow, type SkyHour } from "../../lib/stargazing";
import type { OpenMeteoResponse } from "../../utils/weatherApi";
import { hourIndexNow } from "../../lib/currentHour";

/**
 * Tonight, for somebody deciding whether to go outside.
 *
 * The old stargazing half of this page showed one number from cloud, humidity
 * and rain — no moon, no darkness, no sense of when. It would call two in the
 * afternoon PRISTINE. This answers the two questions that are actually being
 * asked: is it worth going out, and WHEN.
 *
 * Everything here is computed for this location from the real sun and moon
 * positions, checked against the U.S. Naval Observatory's own published times.
 */
/**
 * The next time the moon does a given thing, looking forward rather than at
 * the calendar day. Three days is more than enough: the moon rises once every
 * 24h50m, and the only case that needs the third is the far north, where a day
 * can pass with no rise at all.
 */
function nextMoon(kind: "rise" | "set", lat: number, lon: number, from: Date): Date | null {
  for (let d = 0; d < 3; d++) {
    const t = moonTimes(new Date(from.getTime() + d * 86400_000), lat, lon)[kind];
    if (t && t > from) return t;
  }
  return null;
}

export function TonightPanel({
  weather, lat, lon, placeName, calm,
}: {
  weather: OpenMeteoResponse | undefined;
  lat: number; lon: number; placeName: string; calm: boolean;
}) {
  const hourly = weather?.hourly;
  const nowHr = hourIndexNow(weather);

  /**
   * Every hour from now to the end of the forecast, scored.
   *
   * Built from the API's own timestamps rather than by counting hours from an
   * index: `hourly.time` is local wall-clock and the response carries the
   * offset that made it, so the real instant is the stamp read as UTC minus
   * that offset. The sun and moon have to be placed at the real instant or
   * they are placed at the wrong time of day.
   */
  const hours: SkyHour[] = useMemo(() => {
    const times = hourly?.time as string[] | undefined;
    if (!times) return [];
    const offset = (weather?.utc_offset_seconds ?? 0) * 1000;
    return times.slice(nowHr, nowHr + 30).map((stamp, k) => {
      const i = nowHr + k;
      const at = new Date(Date.parse(`${stamp}:00Z`) - offset);
      const s = skyScore({
        at, lat, lon,
        cloudPct: hourly!.cloud_cover?.[i] ?? 50,
        humidityPct: hourly!.relative_humidity_2m?.[i] ?? 60,
        precipIn: hourly!.precipitation?.[i] ?? 0,
      });
      return { at, score: s.score, label: stamp.slice(11, 16) };
    });
  }, [hourly, nowHr, lat, lon, weather?.utc_offset_seconds]);

  const nowScore = useMemo(() => {
    const times = hourly?.time as string[] | undefined;
    if (!times?.[nowHr]) return null;
    const offset = (weather?.utc_offset_seconds ?? 0) * 1000;
    return skyScore({
      at: new Date(Date.parse(`${times[nowHr]}:00Z`) - offset),
      lat, lon,
      cloudPct: hourly!.cloud_cover?.[nowHr] ?? 50,
      humidityPct: hourly!.relative_humidity_2m?.[nowHr] ?? 60,
      precipIn: hourly!.precipitation?.[nowHr] ?? 0,
    });
  }, [hourly, nowHr, lat, lon, weather?.utc_offset_seconds]);

  const window = useMemo(() => bestWindow(hours), [hours]);

  const sky = useMemo(() => {
    const now = new Date();
    const t = sunTimes(now, lat, lon);

    // "Dark ends" and "sunrise" belong to the morning that ENDS tonight. Read
    // at nine in the evening, today's dawn was sixteen hours ago; showing it
    // would be showing this morning under tonight's heading. They land within
    // a minute or two of each other, which is exactly why it is worth getting
    // right rather than shrugging at.
    const tomorrow = sunTimes(new Date(now.getTime() + 86400_000), lat, lon);
    const dawnPassed = t.astronomicalDawn !== null && t.astronomicalDawn < now;
    const risePassed = t.sunrise !== null && t.sunrise < now;

    return {
      t,
      darkEnds: (dawnPassed ? tomorrow.astronomicalDawn : t.astronomicalDawn),
      sunrise: (risePassed ? tomorrow.sunrise : t.sunrise),
      // Same reasoning for the moon, which moves fast enough that the version
      // of this that only looked at today would routinely show a moonrise that
      // already happened and miss the one coming in two hours.
      moonrise: nextMoon("rise", lat, lon, now),
      moonset: nextMoon("set", lat, lon, now),
      ill: moonIllumination(now),
      pos: moonPosition(now, lat, lon),
    };
  }, [lat, lon]);

  const fmt = (d: Date | null | undefined) =>
    d ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—";

  if (!hourly || !nowScore) {
    return (
      <div className="rounded-2xl p-8 text-center"
           style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <p className="text-sm" style={{ color: ROYAL.dim }}>Reading the sky over {placeName}…</p>
      </div>
    );
  }

  const lbl = skyLabel(nowScore.score);

  /**
   * The chart is coloured by the night's PEAK, not by this instant.
   *
   * Colouring it by the current score meant that at two in the afternoon the
   * whole series — including the hours that reach a hundred — was drawn in the
   * NO VIEWING violet, which against this panel is very nearly black. The
   * chart is about tonight; it should be legible in the daytime, which is when
   * most people will be looking at it and deciding whether to go out.
   */
  const peak = hours.reduce((m, h) => Math.max(m, h.score), 0);
  const line = skyLabel(peak);

  /**
   * Indexed, not labelled, because thirty hours contain the same wall clock
   * twice. Recharts matches categories by value, so "13:00" appearing on both
   * days collapsed the two into one — which put two 13:00 ticks on the axis and
   * gave the best-window band a start and an end that resolved to the same
   * point, so it never drew at all.
   */
  const chart = hours.map((h, i) => ({ i, name: h.label, score: h.score }));
  const startIdx = window ? hours.findIndex((h) => h.at.getTime() === window.start.getTime()) : -1;

  return (
    <div className="space-y-4">
      {/* ── the verdict ─────────────────────────────────────────────────── */}
      <motion.section
        initial={calm ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={calm ? { duration: 0.2 } : { duration: 0.5, ease: EASE }}
        className="relative rounded-2xl overflow-hidden p-4 sm:p-5"
        style={{
          border: `1px solid ${lbl.color}44`,
          background:
            `radial-gradient(90% 130% at 50% -20%, ${lbl.color}1c, transparent 62%),`
            + `linear-gradient(180deg, #0d0820, ${ROYAL.ink})`,
        }}>
        <span aria-hidden className="absolute inset-x-0 top-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${lbl.color}, transparent)` }} />

        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="shrink-0">
            <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: ROYAL.dim }}>Right now</div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black tabular-nums leading-none" style={{ color: lbl.color }}>
                {nowScore.score}
              </span>
              <span className="text-lg font-bold tracking-wide" style={{ color: lbl.color, fontFamily: HEADING }}>
                {lbl.text}
              </span>
            </div>
          </div>

          <p className="text-[12.5px] leading-relaxed flex-1" style={{ color: ROYAL.text }}>
            {window
              ? <>The best stretch tonight runs <strong style={{ color: lbl.color }}>{fmt(window.start)} to {fmt(window.end)}</strong>
                  {" "}— {window.hours} hour{window.hours === 1 ? "" : "s"}, peaking at {window.peak}.</>
              : <>No usable window between now and the end of the forecast — nothing tonight clears the bar for going out.</>}
            {nowScore.limiting && (
              <> Right now the limit is <strong style={{ color: lbl.color }}>{nowScore.limiting.label.toLowerCase()}</strong>
                {" "}({nowScore.limiting.detail}).</>
            )}
          </p>
        </div>

        {/* the four factors, each against its own full mark */}
        <div className="text-[10px] uppercase tracking-[0.2em] mt-4 mb-1.5" style={{ color: ROYAL.dim }}>
          What each is costing you — 100% costs nothing
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {nowScore.factors.map((f, i) => (
            <motion.div key={f.key}
              initial={calm ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={calm ? { duration: 0 } : { duration: 0.3, delay: 0.1 + i * 0.05, ease: EASE }}
              className="rounded-xl px-3 py-2.5"
              style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: ROYAL.dim }}>{f.label}</span>
                <span className="text-[11px] font-bold tabular-nums"
                      style={{ color: f.value > 0.75 ? "#4ade80" : f.value > 0.4 ? "#fbbf24" : "#f472b6" }}>
                  {Math.round(f.value * 100)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "rgba(204,204,255,0.08)" }}>
                <motion.div className="h-full rounded-full"
                  initial={calm ? false : { width: 0 }}
                  animate={{ width: `${f.value * 100}%` }}
                  transition={calm ? { duration: 0 } : { duration: 0.5, delay: 0.15 + i * 0.05, ease: EASE }}
                  style={{ background: f.value > 0.75 ? "#4ade80" : f.value > 0.4 ? "#fbbf24" : "#f472b6" }} />
              </div>
              <div className="text-[10px] mt-1 leading-tight" style={{ color: ROYAL.dim }}>{f.detail}</div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── the hours ───────────────────────────────────────────────────── */}
      <section className="rounded-2xl p-4"
               style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <span className="text-[10px] uppercase tracking-[0.24em] flex items-center gap-1.5" style={{ color: ROYAL.dim }}>
            <Telescope className="w-3.5 h-3.5" /> Hour by hour, from now
          </span>
          {window && (
            <span className="text-[10px]" style={{ color: ROYAL.dim }}>
              shaded band is the best window
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart data={chart} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={line.color} stopOpacity={0.45} />
                <stop offset="95%" stopColor={line.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="i" type="category" tick={{ fontSize: 9, fill: ROYAL.dim }} tickLine={false}
                   axisLine={false} interval={3} tickFormatter={(v: number) => chart[v]?.name ?? ""} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: ROYAL.dim }} tickLine={false} axisLine={false} width={26} />
            <Tooltip
              cursor={{ stroke: "rgba(204,204,255,0.2)" }}
              contentStyle={{ background: ROYAL.ink2, border: `1px solid ${ROYAL.hairline}`, borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: ROYAL.text }}
              labelFormatter={(v: number) => chart[v]?.name ?? ""}
              formatter={(v: number) => [`${v} / 100 — ${skyLabel(v).text.toLowerCase()}`, "Sky"]} />
            {window && startIdx >= 0 && (
              <ReferenceArea x1={startIdx} x2={startIdx + window.hours - 1}
                             fill={line.color} fillOpacity={0.12} />
            )}
            <Area type="monotone" dataKey="score" stroke={line.color} fill="url(#skyGrad)"
                  strokeWidth={2} dot={false} isAnimationActive={!calm} />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      {/* ── the clock ───────────────────────────────────────────────────── */}
      <section className="rounded-2xl p-4"
               style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <div className="text-[10px] uppercase tracking-[0.24em] mb-3" style={{ color: ROYAL.dim }}>
          Tonight's clock at {placeName}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { icon: Sunset,  label: "Sunset",       v: fmt(sky.t.sunset) },
            { icon: Moon,    label: "Dark begins",  v: fmt(sky.t.astronomicalDusk) },
            { icon: Moon,    label: "Next moonrise", v: fmt(sky.moonrise) },
            { icon: Moon,    label: "Next moonset",  v: fmt(sky.moonset) },
            { icon: Moon,    label: "Dark ends",    v: fmt(sky.darkEnds) },
            { icon: Sunrise, label: "Sunrise",      v: fmt(sky.sunrise) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl px-2.5 py-2"
                 style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
              <div className="text-[9.5px] uppercase tracking-[0.12em] flex items-center gap-1" style={{ color: ROYAL.dim }}>
                <s.icon className="w-3 h-3" /> {s.label}
              </div>
              <div className="text-[15px] font-bold tabular-nums mt-0.5" style={{ color: ROYAL.text }}>{s.v}</div>
            </div>
          ))}
        </div>
        <p className="text-[10.5px] mt-2.5 leading-relaxed" style={{ color: ROYAL.dim }}>
          "Dark" is astronomical twilight — the sun 18° below the horizon, where it stops adding any
          light to the sky at all. The moon is {Math.round(sky.ill.fraction * 100)}% lit
          {" "}({sky.ill.name.toLowerCase()}) and is currently{" "}
          {sky.pos.altitude > 0
            ? `${Math.round(sky.pos.altitude)}° above the horizon`
            : `${Math.round(Math.abs(sky.pos.altitude))}° below the horizon`}.
          Times are computed for your coordinates and match the U.S. Naval Observatory to within
          two minutes.
        </p>
      </section>
    </div>
  );
}
