/**
 * Pollen & Allergy.
 *
 * Two halves, kept visibly separate because they are different kinds of claim.
 *
 * The dispersal reading is computed from measured meteorology and is honest
 * about being a dispersal reading — it says how readily pollen is getting into
 * the air and how far it is travelling, which is the half that changes hour to
 * hour and the half a forecast can actually tell you. It never calls itself a
 * count.
 *
 * The counts are counts, and appear only when there is a real source behind
 * them. With no source configured this shows nothing rather than zeros: a grid
 * of "0" on a pollen screen reads as "clear air today", which during ragweed
 * season is a genuinely harmful thing to tell someone.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Flower2, Wind, Droplets, CloudRain, Thermometer, Clock, Loader2,
  AlertTriangle, TrendingUp, Sunrise, Sprout,
} from "lucide-react";
import {
  fetchDispersal, fetchPollenForecast, todayHours, dailyPeaks, worstWindow,
  clearestWindow, dispersalTerms, TERM_META, POLLEN_SEASONS,
  DISPERSAL_BAND, POLLEN_BAND, type DispersalHour,
} from "../../lib/pollen";
import { TTL } from "../../lib/queryClient";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../../lib/royal";
import { Panel } from "../ModuleShell";

export function PollenTab({ lat, lon, place }: { lat: number; lon: number; place: string }) {
  const still = prefersReducedMotion();

  const disp = useQuery({
    queryKey: ["pollen-dispersal", lat.toFixed(2), lon.toFixed(2)],
    queryFn: () => fetchDispersal(lat, lon),
    staleTime: TTL.normal,
  });

  const pollen = useQuery({
    queryKey: ["pollen-forecast", lat.toFixed(2), lon.toFixed(2)],
    queryFn: () => fetchPollenForecast(lat, lon),
    staleTime: TTL.slow,
    retry: false,
  });

  const hours = disp.data ?? [];
  const now = hours[0];
  const today = useMemo(() => todayHours(hours), [hours]);
  const peaks = useMemo(() => dailyPeaks(hours).slice(0, 5), [hours]);
  const worst = useMemo(() => worstWindow(hours), [hours]);
  const clear = useMemo(() => clearestWindow(hours), [hours]);
  // The four factors behind the current score, and whichever of them is holding
  // it down — with a multiplicative model that is a single, answerable question.
  const terms = useMemo(() => dispersalTerms({
    temp: now?.temperature ?? 0, humidity: now?.humidity ?? 60,
    wind: now?.wind ?? 0, gust: now?.gust ?? 0,
    recentPrecip: now?.precip ?? 0, hour: now ? new Date(now.time).getHours() : 12,
  }), [now]);
  const limiter = useMemo(
    () => (Object.keys(terms) as (keyof typeof terms)[]).reduce((a, b) => (terms[b] < terms[a] ? b : a)),
    [terms],
  );
  const month = new Date().getMonth();

  if (disp.isLoading) {
    return (
      <div className="p-10 flex items-center justify-center gap-2 text-sm" style={{ color: ROYAL.dim }}>
        <Loader2 className="w-4 h-4 animate-spin" /> Reading the air over {place}…
      </div>
    );
  }

  if (disp.isError || !now) {
    return (
      <Panel>
        <p className="text-sm" style={{ color: "#f0a2a5" }}>
          Could not load conditions for {place}. Air quality on the other tab is unaffected.
        </p>
      </Panel>
    );
  }

  const band = DISPERSAL_BAND[now.band];

  return (
    <div className="space-y-4">
      {/* ── the reading ──────────────────────────────────────────────────── */}
      <div className="relative rounded-2xl overflow-hidden p-5"
           style={{ background: `linear-gradient(150deg, ${band.color}1a, hsl(var(--card)))`,
                    border: `1px solid ${band.color}44` }}>
        {/* Drifting grains. Twelve spans on a slow transform loop — cheap
            enough to leave running, and the only ambient motion on the page. */}
        {!still && (
          <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="absolute rounded-full pollen-grain"
                    style={{
                      width: 3 + (i % 3), height: 3 + (i % 3),
                      background: band.color,
                      opacity: 0.16 + (i % 4) * 0.06,
                      left: `${(i * 8.3) % 100}%`,
                      top: `${(i * 17) % 90}%`,
                      animationDelay: `${i * 1.1}s`,
                      animationDuration: `${14 + (i % 5) * 3}s`,
                    }} />
            ))}
          </div>
        )}

        <div className="relative flex items-start gap-4 flex-wrap">
          <span className="w-14 h-14 rounded-2xl grid place-items-center shrink-0"
                style={{ background: `${band.color}1f`, border: `1px solid ${band.color}66` }}>
            <Flower2 className="w-7 h-7" style={{ color: band.color }} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.28em] font-semibold mb-0.5"
                 style={{ color: ROYAL.dim }}>
              Pollen dispersal right now
            </div>
            <h2 className="text-2xl font-bold leading-tight"
                style={{ fontFamily: HEADING, color: band.color }}>
              {band.label}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: ROYAL.dim }}>{band.blurb}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-4xl font-black tabular-nums" style={{ color: band.color }}>{now.score}</div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: ROYAL.dim }}>of 100</div>
          </div>
        </div>

        {/* the four terms, each a real measurement */}
        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          <Term icon={Wind} label="Wind" value={`${Math.round(now.wind)} mph`}
                note={now.gust > now.wind + 8 ? `gusting ${Math.round(now.gust)}` : "steady"} />
          <Term icon={Droplets} label="Humidity" value={`${Math.round(now.humidity)}%`}
                note={now.humidity >= 70 ? "grains settling" : now.humidity <= 40 ? "staying airborne" : "middling"} />
          <Term icon={CloudRain} label="Rain" value={now.precip > 0 ? `${now.precip.toFixed(2)}"` : "None"}
                note={now.precip > 0 ? "washing out" : "nothing clearing it"} />
          <Term icon={Thermometer} label="Temp" value={`${Math.round(now.temperature)}°`}
                note={now.temperature < 45 ? "too cold to release" : "warm enough to release"} />
        </div>
      </div>

      {/* ── when to stay in ──────────────────────────────────────────────── */}
      {worst && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3"
             style={{ background: `${ROYAL.gold}12`, border: `1px solid ${ROYAL.gold}3a` }}>
          <Clock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ROYAL.gold }} />
          <p className="text-xs leading-relaxed">
            <strong style={{ color: ROYAL.gold }}>Worst window ahead:</strong>
            <span style={{ color: ROYAL.dim }}>
              {" "}{new Date(worst.start).toLocaleString(undefined, { weekday: "long", hour: "numeric" })}
              {" "}— dispersal reaches {worst.score} of 100. If you react badly, that is the couple of hours
              to keep windows shut and take antihistamines before rather than after.
            </span>
          </p>
        </div>
      )}

      {/* ── what is deciding the number ──────────────────────────────────── */}
      <Panel title="What's driving it" aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>lowest factor sets the ceiling</span>}>
        <div className="space-y-2">
          {(Object.keys(TERM_META) as (keyof typeof TERM_META)[]).map((k) => {
            const v = terms[k];
            const meta = TERM_META[k];
            const limiting = k === limiter;
            return (
              <div key={k} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[11px] font-medium"
                      style={{ color: limiting ? ROYAL.gold : ROYAL.dim }}>{meta.label}</span>
                <span className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <motion.span
                    className="block h-full rounded-full"
                    style={{ background: limiting ? ROYAL.gold : ROYAL.iris, opacity: limiting ? 1 : 0.55 }}
                    initial={still ? false : { width: 0 }}
                    animate={{ width: `${Math.round(v * 100)}%` }}
                    transition={still ? { duration: 0 } : { duration: 0.6, ease: EASE }}
                  />
                </span>
                <span className="w-[126px] shrink-0 text-[10px] text-right"
                      style={{ color: limiting ? ROYAL.gold : ROYAL.dim }}>
                  {v >= 0.6 ? meta.high : meta.low}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[10.5px] mt-3 leading-relaxed" style={{ color: ROYAL.dim }}>
          The four multiply rather than add, so the smallest one is the ceiling: today that is{" "}
          <strong style={{ color: ROYAL.gold }}>{TERM_META[limiter].label.toLowerCase()}</strong>. Rain does not
          take points off a windy day — it shuts the whole thing down.
        </p>
      </Panel>

      {/* ── the calm counterpart to the worst window ─────────────────────── */}
      {clear && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3"
             style={{ background: "rgba(95,217,168,0.10)", border: "1px solid rgba(95,217,168,0.34)" }}>
          <Wind className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#5fd9a8" }} />
          <p className="text-xs leading-relaxed">
            <strong style={{ color: "#5fd9a8" }}>Clearest window:</strong>
            <span style={{ color: ROYAL.dim }}>
              {" "}{new Date(clear.start).toLocaleString(undefined, { weekday: "long", hour: "numeric" })}
              {" "}— dispersal falls to {clear.score} of 100. If something has to be done outside today,
              that is the hour to do it in.
            </span>
          </p>
        </div>
      )}

      {/* ── today, hour by hour ──────────────────────────────────────────── */}
      <Panel title="Through today" aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>peak release is mid-morning</span>}>
        <HourCurve hours={today} still={still} />
      </Panel>

      {/* ── the next five days ───────────────────────────────────────────── */}
      <Panel title="Next five days" aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>daily peak</span>}>
        <div className="grid grid-cols-5 gap-2">
          {peaks.map((d, i) => {
            const b = DISPERSAL_BAND[d.band];
            return (
              <motion.div key={d.date}
                initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.4, ease: EASE }}
                className="rounded-xl p-3 text-center"
                style={{ background: `${b.color}12`, border: `1px solid ${b.color}3a` }}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: ROYAL.dim }}>
                  {i === 0 ? "Today" : new Date(d.date + "T12:00").toLocaleDateString(undefined, { weekday: "short" })}
                </div>
                <div className="text-xl font-bold tabular-nums mt-1" style={{ color: b.color }}>{d.peak}</div>
                <div className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: b.color }}>{b.label}</div>
              </motion.div>
            );
          })}
        </div>
      </Panel>

      {/* Counts render only if a source exists. There is no free US pollen-count
          feed, so on most deployments this is simply absent rather than
          explained — an empty panel apologising for itself is worse than no
          panel. */}
      {pollen.data?.available && (
        <Panel title="Pollen counts by species" defer>
          <Counts days={pollen.data.days} still={still} />
        </Panel>
      )}

      {/* ── what is typically in season ──────────────────────────────────── */}
      <Panel title="Typically in season now" aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>climatology, not a measurement</span>}>
        <div className="grid sm:grid-cols-2 gap-2">
          {POLLEN_SEASONS.map((s2) => {
            const on = s2.months.includes(month);
            return (
              <div key={s2.key} className="rounded-xl px-3 py-2.5 flex items-start gap-2.5"
                   style={{
                     background: on ? `${ROYAL.gold}12` : "rgba(255,255,255,0.02)",
                     border: `1px solid ${on ? ROYAL.goldSoft : ROYAL.hairline}`,
                   }}>
                <Sprout className="w-4 h-4 mt-0.5 shrink-0" style={{ color: on ? ROYAL.gold : ROYAL.dim }} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold" style={{ color: on ? ROYAL.text : ROYAL.dim }}>
                    {s2.label}{on ? "" : " · out of season"}
                  </div>
                  <div className="text-[10.5px] leading-snug mt-0.5" style={{ color: ROYAL.dim }}>{s2.note}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <p className="text-[10.5px] text-center leading-relaxed" style={{ color: ROYAL.dim }}>
        The dispersal reading is computed from Open-Meteo forecast fields — wind, humidity, rainfall and
        temperature — and describes how readily pollen is being released and carried. It is not a pollen count,
        and the season panel above is broad US climatology rather than a reading of what is flowering on your
        street. If you have severe allergies, treat all of it as timing guidance and follow your own medical advice.
      </p>
    </div>
  );
}

function Term({
  icon: Icon, label, value, note,
}: { icon: typeof Wind; label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: ROYAL.dim }}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-base font-bold tabular-nums" style={{ color: ROYAL.text }}>{value}</div>
      <div className="text-[10px]" style={{ color: ROYAL.dim }}>{note}</div>
    </div>
  );
}

function HourCurve({ hours, still }: { hours: DispersalHour[]; still: boolean }) {
  if (!hours.length) return <p className="text-xs" style={{ color: ROYAL.dim }}>No hourly data.</p>;
  const peak = Math.max(1, ...hours.map((h) => h.score));
  const peakHour = hours.find((h) => h.score === peak);

  return (
    <div>
      <div className="flex items-end gap-[3px] h-32">
        {hours.map((h, i) => {
          const b = DISPERSAL_BAND[h.band];
          const isPeak = h === peakHour;
          return (
            <motion.div
              key={h.time}
              title={`${new Date(h.time).toLocaleTimeString(undefined, { hour: "numeric" })} — ${h.score}/100, ${b.label}`}
              className="flex-1 rounded-t-[3px] relative"
              initial={still ? false : { height: 0 }}
              animate={{ height: `${Math.max(4, (h.score / 100) * 100)}%` }}
              transition={{ duration: 0.5, delay: Math.min(i * 0.02, 0.5), ease: EASE }}
              style={{
                background: isPeak
                  ? `linear-gradient(180deg, ${b.color}, ${b.color}77)`
                  : `linear-gradient(180deg, ${b.color}cc, ${b.color}44)`,
                outline: isPeak ? `1px solid ${b.color}` : undefined,
              }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] mt-1.5" style={{ color: ROYAL.dim }}>
        <span>{new Date(hours[0].time).toLocaleTimeString(undefined, { hour: "numeric" })}</span>
        {peakHour && (
          <span className="flex items-center gap-1" style={{ color: DISPERSAL_BAND[peakHour.band].color }}>
            <Sunrise className="w-3 h-3" />
            peak {new Date(peakHour.time).toLocaleTimeString(undefined, { hour: "numeric" })} · {peak}
          </span>
        )}
        <span>{new Date(hours[hours.length - 1].time).toLocaleTimeString(undefined, { hour: "numeric" })}</span>
      </div>
    </div>
  );
}

function Counts({ days, still }: { days: import("../../lib/pollen").PollenDay[]; still: boolean }) {
  const today = days[0];
  if (!today) return <p className="text-xs" style={{ color: ROYAL.dim }}>No counts returned.</p>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {today.types.map((t, i) => {
          const b = POLLEN_BAND[t.band];
          return (
            <motion.div key={t.code}
              initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.4, ease: EASE }}
              className="rounded-xl p-3 text-center"
              style={{ background: `${b.color}14`, border: `1px solid ${b.color}3d` }}>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: ROYAL.dim }}>{t.label}</div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: b.color }}>{t.index}</div>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: b.color }}>{b.label}</div>
              {!t.inSeason && <div className="text-[9px] mt-0.5" style={{ color: ROYAL.dim }}>out of season</div>}
            </motion.div>
          );
        })}
      </div>

      {today.species.length > 0 && (
        <div>
          <h4 className="text-[11px] uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: ROYAL.dim }}>
            <TrendingUp className="w-3 h-3" /> Active species today
          </h4>
          <div className="space-y-1.5">
            {today.species.map((sp) => {
              const b = POLLEN_BAND[sp.band];
              return (
                <div key={sp.code} className="flex items-center gap-3 text-xs">
                  <span className="min-w-0 flex-1 truncate" style={{ color: ROYAL.text }}>
                    {sp.label}
                    {sp.family && <span style={{ color: ROYAL.dim }}> · {sp.family}</span>}
                  </span>
                  <div className="w-24 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(sp.index / 5) * 100}%`, background: b.color }} />
                  </div>
                  <span className="w-16 text-right shrink-0" style={{ color: b.color }}>{b.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {today.types.some((t) => t.advice) && (
        <div className="rounded-xl px-3 py-2.5 flex items-start gap-2.5"
             style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}` }}>
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: ROYAL.gold }} />
          <p className="text-[11px] leading-relaxed" style={{ color: ROYAL.dim }}>
            {today.types.find((t) => t.advice)?.advice}
          </p>
        </div>
      )}
    </div>
  );
}

export default PollenTab;
