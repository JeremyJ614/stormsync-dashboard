/**
 * Mosquito Index.
 *
 * REDESIGNED. The previous version answered "how bad is it" with a blurry
 * canvas gauge and then answered it again, four more times, in four boxes of
 * identically-sized numbers. It never answered the question people actually
 * have, which is *when* — mosquito activity is a two-humped curve pinned to
 * dawn and dusk, and that shape was buried in a 48-hour bar chart with nine
 * pixel labels.
 *
 * So the index is now a clock. The coming twenty-four hours are drawn at their
 * own clock angles, each spoke as long as that hour scores, and the dawn and
 * dusk humps become something you read rather than something you work out.
 *
 * The second change is that the index explains itself. The score has always
 * been four terms added together; showing them as four contributions — with the
 * one that is holding the number down marked as such — turns a number you have
 * to trust into a reading you can check. Same arithmetic, same inputs, nothing
 * new fetched.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Bug, ExternalLink, Info } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";

import { hourIndexNow } from "../lib/currentHour";
import { useOpenMeteo } from "../hooks/useWeatherQuery";
import type { Location } from "../hooks/useLocation";
import { cToF, msToMph } from "../utils/weatherCalc";
import DataUnavailable from "../components/DataUnavailable";
import { ModuleShell, Panel } from "../components/ModuleShell";
import { ActivityDial, type DialHour } from "../components/mosquito/ActivityDial";
import { useCalm } from "../lib/calm";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

interface Props { location: Location }

// ─── the index ───────────────────────────────────────────────────────────────
/**
 * The score, and what it is made of.
 *
 * Identical arithmetic to the version this replaces — the four terms were
 * always there, they were just added up and thrown away. Keeping them is what
 * lets the page say "the wind is what is holding this down" instead of asking
 * anybody to take 34 on faith.
 */
interface Parts { temp: number; humidity: number; water: number; wind: number }
interface Scored { score: number; parts: Parts }

function mosquitoScore(tempC: number, humidity: number, precip: number, windMph: number): Scored {
  const parts: Parts = { temp: 0, humidity: 0, water: 0, wind: 0 };
  const tempF = cToF(tempC);
  if (tempF >= 50 && tempF <= 95) {
    const proximity = 1 - Math.abs(tempF - 80) / 45;
    parts.temp = proximity * 40;
  }
  if (humidity >= 40) parts.humidity = Math.min(30, (humidity - 40) * 0.6);
  parts.water = precip > 0 ? Math.min(20, precip * 100) : 5;
  if (windMph < 5) parts.wind = 10;
  else if (windMph < 10) parts.wind = 5;
  else if (windMph > 15) parts.wind = -10;
  const total = parts.temp + parts.humidity + parts.water + parts.wind;
  return { score: Math.max(0, Math.min(100, Math.round(total))), parts };
}

interface Band { text: string; color: string; desc: string }
function mosquitoLabel(score: number): Band {
  if (score >= 80) return { text: "Very high", color: "#ff5257", desc: "Extreme activity. Repellent and covered skin, not a choice." };
  if (score >= 60) return { text: "High", color: "#ff8a3d", desc: "High activity. Protection strongly recommended." };
  if (score >= 40) return { text: "Moderate", color: "#e8cc4d", desc: "Moderate activity. Worth repellent at dawn and dusk." };
  if (score >= 20) return { text: "Low", color: "#9ed94f", desc: "Low activity. Conditions are mostly against them." };
  return { text: "Very low", color: "#5fd9a8", desc: "Minimal to no activity expected." };
}

function indexColor(score: number): string {
  return mosquitoLabel(score).color;
}

const SCALE = [
  { range: "0–20", label: "Very low", color: "#5fd9a8" },
  { range: "20–40", label: "Low", color: "#9ed94f" },
  { range: "40–60", label: "Moderate", color: "#e8cc4d" },
  { range: "60–80", label: "High", color: "#ff8a3d" },
  { range: "80–100", label: "Very high", color: "#ff5257" },
];

const PREVENTION = [
  { icon: "🧴", tip: "EPA-registered repellent — DEET 20-30%, picaridin or IR3535." },
  { icon: "👕", tip: "Long sleeves and long trousers, above all at dawn and dusk." },
  { icon: "💧", tip: "Empty standing water: flowerpots, bird baths, blocked gutters." },
  { icon: "🌀", tip: "An outdoor fan works. They are weak fliers above about 1 mph." },
  { icon: "🕯️", tip: "Citronella helps a little, and only in still air." },
  { icon: "🏠", tip: "Keep window and door screens in repair." },
];

/** One term of the score, as a bar you can read against its own ceiling. */
function Driver({ label, value, max, reading, color, i, still }: {
  label: string; value: number; max: number; reading: string; color: string; i: number; still: boolean;
}) {
  const negative = value < 0;
  const frac = Math.min(1, Math.abs(value) / max);
  return (
    <motion.div
      initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: still ? 0.2 : 0.4, delay: still ? 0 : 0.3 + i * 0.07, ease: EASE }}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-[0.16em] font-semibold" style={{ color: ROYAL.dim }}>{label}</span>
        <span className="ml-auto text-[13px] font-bold tabular-nums"
              style={{ color: negative ? "#ff8a3d" : color, fontFamily: HEADING }}>
          {negative ? "−" : "+"}{Math.abs(Math.round(value))}
        </span>
      </div>
      <div className="relative h-[6px] rounded-full mt-1.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.055)" }}>
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            background: negative
              ? "repeating-linear-gradient(120deg,#ff8a3d,#ff8a3d 4px,rgba(255,138,61,0.35) 4px,rgba(255,138,61,0.35) 8px)"
              : `linear-gradient(90deg, ${color}77, ${color})`,
          }}
          initial={still ? { width: `${frac * 100}%` } : { width: 0 }}
          animate={{ width: `${frac * 100}%` }}
          transition={still ? { duration: 0 } : { duration: 0.65, delay: 0.35 + i * 0.07, ease: EASE }}
        />
      </div>
      <div className="text-[11px] mt-1" style={{ color: ROYAL.dim }}>{reading}</div>
    </motion.div>
  );
}

export default function MosquitoIndex({ location }: Props) {
  const { data: weather, isLoading, refetch } = useOpenMeteo(location);
  const { calm } = useCalm(location.lat, location.lon);
  const still = prefersReducedMotion() || calm;

  const hourly = weather?.hourly;
  // The hour we are actually in. The Open-Meteo series starts at 00:00 local,
  // so index 0 is MIDNIGHT — every "current" reading below was overnight's.
  const nowHr = hourIndexNow(weather);

  const tempC = hourly?.temperature_2m?.[nowHr] ?? 20;
  const humidity = hourly?.relative_humidity_2m?.[nowHr] ?? 60;
  const precip = hourly?.precipitation?.[nowHr] ?? 0;
  const windMph = msToMph(hourly?.wind_speed_10m?.[nowHr] ?? 0);

  const { score, parts } = mosquitoScore(tempC, humidity, precip, windMph);
  const band = mosquitoLabel(score);

  /** Every hour Open-Meteo returned, scored. */
  const series = useMemo(() => {
    const times = hourly?.time as string[] | undefined;
    if (!times) return [];
    return times.map((t, i) => {
      const s = mosquitoScore(
        hourly!.temperature_2m?.[i] ?? 20,
        hourly!.relative_humidity_2m?.[i] ?? 60,
        hourly!.precipitation?.[i] ?? 0,
        msToMph(hourly!.wind_speed_10m?.[i] ?? 0),
      ).score;
      return { t, hour: Number(t.slice(11, 13)), label: format(parseISO(t), "EEE ha"), score: s };
    });
  }, [hourly]);

  /** The next twenty-four hours, which is one of every clock hour. */
  const dial = useMemo<DialHour[]>(
    () => series.slice(nowHr, nowHr + 24).map((h) => ({ hour: h.hour, score: h.score, color: indexColor(h.score) })),
    [series, nowHr],
  );
  const forecast = useMemo(() => series.slice(nowHr, nowHr + 48), [series, nowHr]);

  if (isLoading) {
    return (
      <ModuleShell eyebrow="Open-Meteo" title="Mosquito Index" subtitle={location.name}>
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl h-40 animate-pulse"
                 style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }} />
          ))}
        </div>
      </ModuleShell>
    );
  }

  // Loading is over and the hourly profile never arrived: every number below
  // would come from the `?? 20` / `?? 60` fallbacks, not from the atmosphere.
  if (!hourly) return <DataUnavailable title="Mosquito Index" source="Open-Meteo" onRetry={() => refetch()} />;

  return (
    <ModuleShell
      eyebrow="Open-Meteo"
      title="Mosquito Index"
      subtitle={`${location.name} — scored from temperature, humidity, standing water and wind.`}
    >
      {/* ── the reading ─────────────────────────────────────────────────── */}
      <motion.section
        className="relative rounded-3xl overflow-hidden"
        initial={still ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: still ? 0.2 : 0.5, ease: EASE }}
        style={{
          border: `1px solid ${band.color}33`,
          background:
            `radial-gradient(75% 110% at 50% -12%, ${band.color}1f, transparent 62%),` +
            `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
          boxShadow: "0 30px 70px -50px rgba(0,0,0,1)",
        }}
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${band.color}55, transparent)` }} />

        <div className="relative p-5 sm:p-6 grid lg:grid-cols-[minmax(0,300px)_1fr] gap-6 lg:gap-9 items-center">
          <ActivityDial
            hours={dial}
            nowAt={0}
            score={score}
            level={band.text}
            levelColor={band.color}
            still={still}
          />

          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: ROYAL.gold }}>
              The next 24 hours
            </div>
            <p className="text-[15px] leading-relaxed mt-1.5 mb-5" style={{ color: ROYAL.text }}>
              {band.desc}
            </p>

            <div className="text-[10px] uppercase tracking-[0.24em] mb-3" style={{ color: ROYAL.dim }}>
              What is driving it
            </div>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <Driver
                i={0} still={still} label="Warmth" value={parts.temp} max={40} color="#ff9d4d"
                reading={`${Math.round(cToF(tempC))}°F — ${parts.temp > 30 ? "close to their best" : parts.temp > 15 ? "workable for them" : "outside their range"}`}
              />
              <Driver
                i={1} still={still} label="Humidity" value={parts.humidity} max={30} color="#37c5dd"
                reading={`${Math.round(humidity)}% — ${humidity >= 70 ? "muggy, they thrive" : humidity >= 50 ? "comfortable for them" : "dry, they dehydrate"}`}
              />
              <Driver
                i={2} still={still} label="Standing water" value={parts.water} max={20} color="#6fb6ff"
                reading={precip > 0 ? `${precip.toFixed(2)}" this hour — fresh breeding water` : "No rain this hour — only what is already lying"}
              />
              <Driver
                i={3} still={still} label="Wind" value={parts.wind} max={10} color="#9ed94f"
                reading={`${Math.round(windMph)} mph — ${windMph > 15 ? "too breezy for them to fly" : windMph >= 10 ? "enough to slow them" : "calm, nothing in their way"}`}
              />
            </div>
          </div>
        </div>

        {/* the band rail */}
        <div className="relative px-5 sm:px-6 pb-5">
          <div className="relative h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="absolute inset-0"
                 style={{ background: "linear-gradient(90deg,#5fd9a8 0%,#9ed94f 25%,#e8cc4d 50%,#ff8a3d 75%,#ff5257 100%)", opacity: 0.85 }} />
            <motion.span
              className="absolute inset-y-0 rounded-full"
              style={{ background: "rgba(7,7,19,0.78)", right: 0 }}
              initial={still ? { left: `${score}%` } : { left: "100%" }}
              animate={{ left: `${score}%` }}
              transition={still ? { duration: 0 } : { duration: 0.9, delay: 0.3, ease: EASE }}
            />
          </div>
          <div className="flex justify-between text-[10px] mt-1.5" style={{ color: ROYAL.dim }}>
            <span>0 · very low</span>
            <span>100 · very high</span>
          </div>
        </div>
      </motion.section>

      {/* ── two days out ────────────────────────────────────────────────── */}
      <Panel
        title="The next two days"
        aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>hourly index</span>}
      >
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={forecast} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="mozG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff5257" stopOpacity={0.55} />
                <stop offset="40%" stopColor="#e8cc4d" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#5fd9a8" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={ROYAL.hairline} strokeDasharray="2 6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: ROYAL.dim }} tickLine={false}
                   axisLine={false} interval="preserveStartEnd" minTickGap={34} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: ROYAL.dim }} tickLine={false} axisLine={false} width={40} />
            {SCALE.slice(1).map((s, i) => (
              <ReferenceLine key={s.range} y={(i + 1) * 20} stroke={s.color} strokeOpacity={0.16} strokeDasharray="4 6" />
            ))}
            <Tooltip
              cursor={{ stroke: ROYAL.goldSoft }}
              contentStyle={{
                background: "rgba(10,10,22,0.94)", border: `1px solid ${ROYAL.goldSoft}`,
                borderRadius: 12, fontSize: 12, color: ROYAL.text,
              }}
              labelStyle={{ color: ROYAL.gold, fontWeight: 600 }}
              formatter={(v) => [`${v} / 100 · ${mosquitoLabel(Number(v)).text}`, "Index"]}
            />
            <Area type="monotone" dataKey="score" stroke={band.color} fill="url(#mozG)" strokeWidth={2.25} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      {/* ── scale ───────────────────────────────────────────────────────── */}
      <Panel title="The scale" defer>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {SCALE.map((s) => {
            const on = s.label.toLowerCase() === band.text.toLowerCase();
            return (
              <div
                key={s.range}
                className="rounded-xl px-3 py-2.5 transition-colors"
                style={{
                  background: on ? `${s.color}1f` : "rgba(255,255,255,0.025)",
                  border: `1px solid ${on ? s.color + "66" : ROYAL.hairline}`,
                  boxShadow: on ? `0 0 24px -14px ${s.color}` : undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: on ? s.color : ROYAL.text }}>
                    {s.range}
                  </span>
                </div>
                <div className="text-[11px] mt-0.5 pl-4" style={{ color: ROYAL.dim }}>{s.label}</div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ── what to do about it ─────────────────────────────────────────── */}
      <Panel title="Keeping them off you" defer>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
          {PREVENTION.map((p, i) => (
            <motion.div
              key={p.tip}
              className="flex items-start gap-3"
              initial={still ? { opacity: 0 } : { opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: still ? 0.2 : 0.35, delay: still ? 0 : i * 0.05, ease: EASE }}
            >
              <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden>{p.icon}</span>
              <p className="text-[13px] leading-relaxed" style={{ color: ROYAL.dim }}>{p.tip}</p>
            </motion.div>
          ))}
        </div>
      </Panel>

      <div className="grid sm:grid-cols-2 gap-3">
        {[
          { href: "https://www.cdc.gov/mosquitoes/", title: "CDC — mosquitoes", sub: "Prevention and disease information" },
          { href: "https://www.epa.gov/insect-repellents", title: "EPA — insect repellents", sub: "Find the right repellent" },
        ].map((l) => (
          <a
            key={l.href} href={l.href} target="_blank" rel="noopener noreferrer"
            className="group rounded-2xl px-4 py-3 transition-colors"
            style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}
          >
            <div className="text-[13px] font-semibold flex items-center gap-1.5" style={{ color: ROYAL.text }}>
              <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                            style={{ color: ROYAL.gold }} />
              {l.title}
            </div>
            <div className="text-[11px] mt-0.5 pl-5" style={{ color: ROYAL.dim }}>{l.sub}</div>
          </a>
        ))}
      </div>

      <div className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[11px] leading-relaxed"
           style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
        <Info className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: ROYAL.gold }} />
        <span>
          Computed here from current atmospheric conditions. It is not an official public health product —
          for disease risk, consult your local health authority.
        </span>
      </div>

      <div className="flex items-center gap-2 text-[10px] pt-1" style={{ color: ROYAL.dim }}>
        <Bug className="w-3 h-3 shrink-0" />
        Hourly temperature, humidity, precipitation and wind from Open-Meteo.
      </div>
    </ModuleShell>
  );
}
