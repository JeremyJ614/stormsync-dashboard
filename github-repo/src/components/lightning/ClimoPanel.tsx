import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, Line, Area, ReferenceLine,
} from "recharts";
import { CalendarDays, TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import { climoStats, monthName, type LightningClimo } from "../../lib/lightningClimo";

/**
 * Thunder-day climatology for one place.
 *
 * The module used to show three numbers and two charts. Everything here beyond
 * those is arithmetic on the SAME station record — nothing is looked up, and
 * nothing is filled in from a national figure. Where the record is too short
 * to support a statistic, the tile says so instead of printing a number that
 * looks measured; a trend line drawn through four noisy years would read as a
 * climate signal, and this module has no business implying one.
 *
 * The charts are the two questions people actually have — when is the season,
 * and is this year normal — so the monthly curve carries the odds of thunder
 * on any given day, and the yearly series carries its own fitted trend and the
 * long-run mean it is being judged against.
 */
const GOLD = "#fbbf24";

export function ClimoPanel({
  data, loading, placeName, calm,
}: { data: LightningClimo | null | undefined; loading: boolean; placeName: string; calm: boolean }) {
  const s = useMemo(() => (data ? climoStats(data) : null), [data]);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: ROYAL.dim }} />
        <p className="text-xs mt-2" style={{ color: ROYAL.dim }}>
          Pulling observed thunder days from NCEI…
        </p>
      </div>
    );
  }

  if (!data || !s) {
    return (
      <div className="p-8 text-center space-y-2">
        <div className="text-3xl">⛈️</div>
        <p className="text-sm font-semibold" style={{ color: ROYAL.text }}>
          No thunder-day record near this location
        </p>
        <p className="text-xs max-w-md mx-auto leading-relaxed" style={{ color: ROYAL.dim }}>
          Thunder days are logged by staffed first-order weather stations. Coverage is sparse outside
          major airports, so some locations have no nearby station reporting this element.
        </p>
      </div>
    );
  }

  const monthly = data.monthly.map((m) => ({
    name: monthName(m.month),
    days: m.avgDays,
    month: m.month,
  }));

  const yearly = s.comparableYears.map((y) => {
    const fit = s.trendLine.find((t) => t.year === y.year)?.fit;
    return { name: String(y.year), days: y.days, fit: fit ?? null };
  });

  const trendIcon = s.trendPerDecade === null ? Minus
    : s.trendPerDecade > 1 ? TrendingUp
    : s.trendPerDecade < -1 ? TrendingDown : Minus;
  const TrendIcon = trendIcon;

  const tiles: { label: string; value: string; sub: string; tone?: string }[] = [
    {
      label: "Thunder days a year",
      value: String(data.annualAvg),
      // The seasons the average is actually taken over, not the span of the
      // record — those differ whenever a year is set aside, and quoting the
      // span would overstate what the number is built from.
      sub: s.comparableYears.length
        ? `average of ${s.comparableYears.length} full season${s.comparableYears.length === 1 ? "" : "s"}`
        : `summed from ${data.sampleYears} years of monthly means`,
      tone: GOLD,
    },
    {
      label: "Busiest month",
      value: data.peakMonth !== null ? monthName(data.peakMonth) : "—",
      sub: data.peakMonth !== null ? `${data.monthly[data.peakMonth].avgDays} days on average` : "no thunder on record",
    },
    {
      label: "Season",
      value: s.seasonStart !== null && s.seasonEnd !== null
        ? `${monthName(s.seasonStart)}–${monthName(s.seasonEnd)}`
        : "—",
      sub: s.seasonMonths > 0 ? `${s.seasonMonths} months averaging 2+ days` : "never averages 2 days",
    },
    {
      label: "Quietest month",
      value: s.quietestMonth !== null ? monthName(s.quietestMonth) : "—",
      sub: s.quietestMonth !== null ? `${data.monthly[s.quietestMonth].avgDays} days on average` : "",
    },
    {
      label: "Busiest year on record",
      value: s.busiestYear ? String(s.busiestYear.days) : "—",
      sub: s.busiestYear ? `days, in ${s.busiestYear.year}` : "no yearly totals",
    },
    {
      label: "Quietest year on record",
      value: s.quietestYear ? String(s.quietestYear.days) : "—",
      sub: s.quietestYear ? `days, in ${s.quietestYear.year}` : "no yearly totals",
    },
    {
      label: "Year to year swing",
      value: s.variability !== null ? `±${s.variability}` : "—",
      sub: s.variability !== null ? "days from the average" : "needs 5+ years",
    },
    {
      label: "Trend",
      value: s.trendPerDecade === null
        ? "—"
        : `${s.trendPerDecade > 0 ? "+" : ""}${s.trendPerDecade}`,
      sub: s.trendPerDecade === null
        ? "needs 5+ years"
        : `days per decade, over ${s.comparableYears.length} full seasons`,
    },
  ];

  return (
    <div className="space-y-4">
      {/* ── the numbers ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {tiles.map((t, i) => (
          <motion.div key={t.label}
            initial={calm ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={calm ? { duration: 0 } : { duration: 0.35, delay: i * 0.04, ease: EASE }}
            className="rounded-xl px-3 py-2.5"
            style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
            <div className="text-[9.5px] uppercase tracking-[0.14em] leading-tight" style={{ color: ROYAL.dim }}>
              {t.label}
            </div>
            <div className="text-xl font-black tabular-nums mt-1 flex items-center gap-1.5"
                 style={{ color: t.tone ?? ROYAL.text }}>
              {t.label === "Trend" && s.trendPerDecade !== null && (
                <TrendIcon className="w-4 h-4" style={{ color: ROYAL.dim }} />
              )}
              {t.value}
            </div>
            <div className="text-[10px] mt-0.5 leading-tight" style={{ color: ROYAL.dim }}>{t.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* ── what it means, in a sentence ─────────────────────────────────── */}
      <p className="text-[12.5px] leading-relaxed px-0.5" style={{ color: ROYAL.text }}>
        {placeName} hears thunder on about <strong style={{ color: GOLD }}>{data.annualAvg} days a year</strong>
        {s.topThreeShare !== null && (
          <> and <strong style={{ color: GOLD }}>{s.topThreeShare}%</strong> of it falls in just three months</>
        )}
        {s.thisMonthAvg > 0 ? (
          <> — right now, in {monthName(s.thisMonth)}, that works out at roughly a{" "}
            <strong style={{ color: GOLD }}>{s.thisMonthOdds}% chance</strong> of thunder on any given day.</>
        ) : (
          <> — {monthName(s.thisMonth)} is not part of it; this station has no thunder on record this month.</>
        )}
      </p>

      {/* ── seasonality ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl p-4"
               style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: ROYAL.text }}>
            <CalendarDays className="w-3.5 h-3.5" style={{ color: GOLD }} /> When the thunder happens
          </div>
          <span className="text-[10px]" style={{ color: ROYAL.dim }}>
            average days per month · the month you are in is outlined
          </span>
        </div>
        <ResponsiveContainer width="100%" height={205}>
          <BarChart data={monthly} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: ROYAL.dim }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: ROYAL.dim }} axisLine={false} tickLine={false} width={26} />
            <Tooltip
              cursor={{ fill: "rgba(204,204,255,0.06)" }}
              contentStyle={{ background: ROYAL.ink2, border: `1px solid ${ROYAL.hairline}`, borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: ROYAL.text }}
              formatter={(v: number) => [`${v} days on average`, "Thunder"]} />
            <Bar dataKey="days" radius={[5, 5, 0, 0]}>
              {monthly.map((m) => (
                <Cell key={m.month}
                  fill={m.month === data.peakMonth ? GOLD : "rgba(251,191,36,0.32)"}
                  stroke={m.month === s.thisMonth ? "#ffffff" : undefined}
                  strokeWidth={m.month === s.thisMonth ? 1.4 : 0} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* ── year to year ─────────────────────────────────────────────────── */}
      {s.comparableYears.length > 1 && (
        <section className="rounded-2xl p-4"
                 style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
            <div className="text-[11px] font-semibold" style={{ color: ROYAL.text }}>
              Year by year{s.recordFrom && s.recordTo ? `, ${s.recordFrom}–${s.recordTo}` : ""}
            </div>
            <span className="text-[10px]" style={{ color: ROYAL.dim }}>
              {s.trendPerDecade !== null
                ? "dashed line is the fitted trend · flat line is the long-run average"
                : "flat line is the long-run average"}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={yearly} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="thunderFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: ROYAL.dim }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: ROYAL.dim }} axisLine={false} tickLine={false} width={26} />
              <Tooltip
                cursor={{ stroke: "rgba(204,204,255,0.2)" }}
                contentStyle={{ background: ROYAL.ink2, border: `1px solid ${ROYAL.hairline}`, borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: ROYAL.text }}
                formatter={(v: number, n: string) => [`${v} days`, n === "fit" ? "Trend" : "Observed"]} />
              {/* The average it is being judged against, drawn rather than described. */}
              <ReferenceLine y={data.annualAvg} stroke={ROYAL.iris} strokeOpacity={0.45} strokeDasharray="2 4" />
              <Area type="monotone" dataKey="days" stroke="none" fill="url(#thunderFill)" isAnimationActive={!calm} />
              <Line type="monotone" dataKey="days" stroke={GOLD} strokeWidth={2}
                    dot={{ r: 2.5, fill: GOLD }} isAnimationActive={!calm} />
              {s.trendPerDecade !== null && (
                <Line type="linear" dataKey="fit" stroke="#ffffff" strokeOpacity={0.55}
                      strokeWidth={1.4} strokeDasharray="5 4" dot={false} isAnimationActive={!calm} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-[10.5px] leading-relaxed mt-1.5" style={{ color: ROYAL.dim }}>
            Only seasons the station reported in full are plotted
            {s.incompleteYears > 0 && (
              <> — {s.incompleteYears} year{s.incompleteYears === 1 ? " was" : "s were"} set aside for
              missing one of the busy months, which makes a year look quiet when it was only
              incompletely observed</>
            )}
            . A trend across this few years reflects the station's record as much as the weather, and
            is not a climate signal.
          </p>
        </section>
      )}

      {/* ── the honesty note, which is the point of the module ───────────── */}
      <div className="rounded-xl px-3.5 py-3 text-[11px] leading-relaxed"
           style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
        <strong style={{ color: ROYAL.text, fontFamily: HEADING }}>Why thunder days?</strong>{" "}
        There is no free public archive of historical strike density — the per-state flash-density
        numbers usually quoted come from Vaisala's NLDN, which is a commercial licence. Thunder days
        (NCEI element <code>DYTS</code>) are the long-standing observed proxy: the count of days on
        which thunder was actually heard or detected at the station. Everything above is arithmetic
        on station {data.stationId}'s own record — real observations for the station nearest you, not
        a model and not a national average.
      </div>
    </div>
  );
}
