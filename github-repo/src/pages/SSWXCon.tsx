import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Activity, RefreshCw, Sparkles, ShieldAlert } from "lucide-react";

import { ConGauge } from "../components/sswxcon/ConGauge";
import { ThreatRadar } from "../components/sswxcon/ThreatRadar";
import { ContributionBar, type Contribution } from "../components/sswxcon/ContributionBar";
import { ScaleLadder, type Band } from "../components/sswxcon/ScaleLadder";
import { ModuleShell } from "../components/ModuleShell";
import DataUnavailable from "../components/DataUnavailable";
import { ROYAL, HEADING, EASE } from "../lib/royal";
import { useCalm } from "../lib/calm";
import { useOpenMeteo } from "../hooks/useWeatherQuery";
import { hourIndexNow } from "../lib/currentHour";
import { fetchAllUSAlerts } from "../utils/weatherApi";
import { useDailyBrief } from "../hooks/useDailyBrief";
import type { Location } from "../hooks/useLocation";
import { computeSRHFromProfile, compute06kmShear, computeSWTI } from "../utils/weatherCalc";
import { computeComponents, scoreLabel, describeDrivers, type AlertItem } from "../lib/sswxcon";

interface Props { location: Location }

const ACTIVATION_THRESHOLD = 107.5;
const GAUGE_MAX = 250;

/**
 * The bands, as a ladder rather than a glossary.
 *
 * Same names and same thresholds as before; what changed is that they now
 * carry both ends of their range as numbers, because the ladder draws each
 * band at its real height and cannot do that from a string like "90–120".
 */
const BANDS: Band[] = [
  { from: 0,   to: 30,  label: "Quiet / Low",      color: "#4ade80" },
  { from: 30,  to: 50,  label: "Notable Activity", color: "#fbbf24" },
  { from: 50,  to: 70,  label: "Elevated",         color: "#f97316" },
  { from: 70,  to: 90,  label: "Significant",      color: "#ef4444" },
  { from: 90,  to: 120, label: "Severe Outbreak",  color: "#cc2222" },
  { from: 120, to: 150, label: "Major Event",      color: "#b91c1c" },
  { from: 150, to: 250, label: "Extreme",          color: "#991b1b" },
];

export default function SSWXCon({ location }: Props) {
  const { data: weather, isLoading: wxLoading, refetch: refetchWx } = useOpenMeteo(location);
  // SSWXCon is a NATIONAL "DEFCON for storms" score — it must aggregate every
  // active NWS warning across the U.S., not just the user's point (otherwise it
  // reads ~0 whenever no warning is firing on their exact location).
  const { data: alerts = [], isLoading: alertsLoading, isError: alertsFailed, refetch: refetchAlerts } = useQuery({
    queryKey: ["all-us-alerts"],
    queryFn: fetchAllUSAlerts,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
  const { data: brief } = useDailyBrief();
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const isLoading = wxLoading || alertsLoading;

  const hourly = weather?.hourly;
  // `hourly[0]` is midnight local, not now — the series starts at 00:00 on the
  // current day, so the local term was scoring the overnight atmosphere.
  const now = hourIndexNow(weather);
  const cape = hourly?.cape?.[now] ?? 0;
  const li = hourly?.lifted_index?.[now] ?? 0;
  const ws10 = hourly?.wind_speed_10m?.[now] ?? 0;
  const wd10 = hourly?.wind_direction_10m?.[now] ?? 0;
  const ws925 = hourly?.wind_speed_925hPa?.[now] ?? 0;
  const wd925 = hourly?.wind_direction_925hPa?.[now] ?? 0;
  const ws850 = hourly?.wind_speed_850hPa?.[now] ?? 0;
  const wd850 = hourly?.wind_direction_850hPa?.[now] ?? 0;
  const ws700 = hourly?.wind_speed_700hPa?.[now] ?? 0;
  const wd700 = hourly?.wind_direction_700hPa?.[now] ?? 0;
  const ws500 = hourly?.wind_speed_500hPa?.[now] ?? 0;
  const wd500 = hourly?.wind_direction_500hPa?.[now] ?? 0;
  const srh = !isLoading && hourly ? computeSRHFromProfile(ws10, wd10, ws925, wd925, ws850, wd850, ws700, wd700, ws500, wd500) : 0;
  const shear = !isLoading && hourly ? compute06kmShear(ws10, wd10, ws500, wd500) : 0;

  const {
    components, total,
    tornadoWarnings, svrThunderstorm, floodFlash, floodRiver, tropical,
    winterBlizzard, winterStorm, fireredflag,
  } = computeComponents(alerts as AlertItem[], cape, srh, shear, li);
  const { text: levelText, color: levelColor } = scoreLabel(total);
  const saturation = Math.round((total / ACTIVATION_THRESHOLD) * 100);
  const swti = computeSWTI({ cape, srh, shear06km: shear, liftedIndex: li, dewPointC: hourly?.dew_point_2m?.[now] ?? 10 });

  // This score has two independent halves. The national one is NWS warning
  // counts; the LOCAL INSTABILITY term (capped at 12 of ~377) is Open-Meteo. So
  // the page still stands when either is down — but a component whose input has
  // not arrived must read as absent, never as a measured zero.
  const localMissing = !hourly;
  // The dial, the radar and the bars are ornament on top of a number, so they
  // hold still during a warning for this member's own location — the app-wide
  // rule — as well as under reduced motion.
  const { calm: still } = useCalm(location.lat, location.lon);

  const componentState = (label: string) =>
    label === "LOCAL INSTABILITY"
      ? { missing: localMissing, why: wxLoading ? "loading…" : "unavailable" }
      : { missing: alertsLoading || alertsFailed, why: alertsLoading ? "loading…" : "unavailable" };

  const refresh = () => {
    refetchWx();
    refetchAlerts();
    setLastUpdated(new Date());
  };

  useEffect(() => {
    const interval = setInterval(() => { refresh(); }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // The national warning counts are ~97% of this score's range; without them
  // there is no score, only a gauge that reads QUIET because nothing was
  // counted. The local half is not enough to stand in for it.
  if (!alertsLoading && alertsFailed) {
    return (
      <DataUnavailable
        title="SSWXCon Score"
        source="the national NWS alert feed"
        onRetry={() => { refetchAlerts(); refetchWx(); }}
      />
    );
  }

  const parts: Contribution[] = components.map((c) => ({
    label: c.label,
    short: c.short,
    score: c.score,
    color: c.color,
    detail: componentState(c.label).missing ? componentState(c.label).why : `· ${c.desc}`,
    missing: componentState(c.label).missing,
  }));

  const reading = alertsLoading
    ? "Counting every active warning in the country…"
    : describeDrivers(components.filter((c) => !componentState(c.label).missing), total);

  /** The raw warning counts, as counts. No weights, no derived numbers. */
  const counts = [
    { label: "Tornado warnings", n: tornadoWarnings, color: "#ef4444" },
    { label: "Severe t-storm", n: svrThunderstorm, color: "#f97316" },
    { label: "Flash flood", n: floodFlash, color: "#38bdf8" },
    { label: "River flood", n: floodRiver, color: "#0ea5e9" },
    { label: "Tropical", n: tropical, color: "#a855f7" },
    { label: "Blizzard", n: winterBlizzard, color: "#67e8f9" },
    { label: "Winter / ice", n: winterStorm, color: "#a5f3fc" },
    { label: "Red flag", n: fireredflag, color: "#fbbf24" },
  ];

  const rise = (d: number) => ({
    initial: still ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: still ? { duration: 0.2 } : { duration: 0.5, delay: d, ease: EASE },
  });

  return (
    <ModuleShell
      eyebrow="NWS · NOAA · Open-Meteo"
      title="SSWXCon Score"
      subtitle="One number for how much severe weather is happening in the United States right now."
      actions={
        <button onClick={refresh}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-colors"
          style={{ color: ROYAL.dim, border: `1px solid ${ROYAL.hairline}` }}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      }
      status={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" style={{ color: levelColor }} />
            <span className="font-bold uppercase tracking-[0.16em]" style={{ color: levelColor }}>
              {alertsLoading ? "Reading" : levelText}
            </span>
          </span>
          <span style={{ color: ROYAL.dim }}>
            {alertsLoading ? "—" : total.toFixed(1)} of {GAUGE_MAX}
          </span>
          <span style={{ color: ROYAL.dim }}>
            {alertsLoading ? "—" : `${saturation}%`} of the activation threshold
          </span>
          <span style={{ color: ROYAL.dim }}>{alerts.length} active NWS alerts</span>
        </div>
      }
    >
      <div className="space-y-4">
        {brief?.headline && (
          <motion.div {...rise(0.02)}
            className="flex items-start gap-2 rounded-xl px-3 py-2"
            style={{ background: "rgba(217,183,117,0.06)", border: `1px solid ${ROYAL.goldSoft}` }}>
            <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: ROYAL.gold }} />
            <div className="text-xs leading-relaxed">
              <span className="font-semibold" style={{ color: ROYAL.gold }}>National picture: </span>
              <span style={{ color: ROYAL.text }}>{brief.headline}</span>
              {brief.content.risk_overview?.day1_category_name && (
                <span style={{ color: ROYAL.dim }}> · SPC Day 1: {brief.content.risk_overview.day1_category_name}</span>
              )}
            </div>
          </motion.div>
        )}

        {/* ── the instrument ──────────────────────────────────────────────── */}
        <motion.section {...rise(0.06)}
          className="relative rounded-2xl overflow-hidden"
          style={{
            border: `1px solid ${levelColor}44`,
            background:
              `radial-gradient(90% 130% at 50% -20%, ${levelColor}1f, transparent 62%),` +
              `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
          }}>
          {/* A single lit rule in the band's own colour, so the panel reads as
              the level before a single number has been read off it. */}
          <span aria-hidden className="absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${levelColor}, transparent)` }} />

          {alertsLoading ? (
            <div className="h-72 grid place-items-center text-sm" style={{ color: ROYAL.dim }}>
              Counting every active warning in the country…
            </div>
          ) : (
            <div className="p-4 sm:p-5 space-y-4">
              {/* The dial says how bad. The polygon says what kind — a tornado
                  outbreak and a landfalling hurricane can score the same and
                  look nothing alike. */}
              <div className="flex flex-col lg:flex-row items-center justify-center gap-1 lg:gap-8">
                <ConGauge
                  score={total} max={GAUGE_MAX} threshold={ACTIVATION_THRESHOLD}
                  color={levelColor} label={levelText} calm={still}
                />
                <div className="w-full lg:w-auto">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-center mb-1"
                       style={{ color: ROYAL.dim }}>Shape of it</div>
                  <ThreatRadar
                    axes={components.map((c) => ({
                      label: c.short,
                      value: componentState(c.label).missing ? 0 : c.score,
                      cap: c.cap,
                    }))}
                    color={levelColor}
                    calm={still}
                  />
                </div>
              </div>

              {/* Said in words. A number on a dial is only a reading once you
                  know what produced it. */}
              <p className="text-[12.5px] leading-relaxed text-center max-w-2xl mx-auto"
                 style={{ color: ROYAL.text }}>
                {reading}
              </p>

              <ContributionBar parts={parts} total={total} calm={still} />
            </div>
          )}
        </motion.section>

        {/* ── the raw counts ──────────────────────────────────────────────── */}
        <motion.section {...rise(0.12)}
          className="rounded-2xl p-4"
          style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <div className="text-[10px] uppercase tracking-[0.24em] mb-3" style={{ color: ROYAL.dim }}>
            Active warnings, nationwide
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {counts.map((c, i) => (
              <motion.div key={c.label}
                initial={still ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={still ? { duration: 0 } : { duration: 0.35, delay: 0.14 + i * 0.03, ease: EASE }}
                className="rounded-xl px-2 py-2.5 text-center"
                style={{
                  background: c.n > 0 ? `${c.color}14` : "rgba(204,204,255,0.03)",
                  border: `1px solid ${c.n > 0 ? `${c.color}44` : ROYAL.hairline}`,
                }}>
                <div className="text-xl font-black tabular-nums leading-none"
                     style={{ color: c.n > 0 ? c.color : ROYAL.dim }}>
                  {alertsLoading ? "—" : c.n}
                </div>
                <div className="text-[9px] uppercase tracking-wide mt-1.5 leading-tight"
                     style={{ color: ROYAL.dim }}>
                  {c.label}
                </div>
              </motion.div>
            ))}
          </div>
          {/* These are PRODUCTS, not storms, and the difference has bitten this
              page before: one hurricane puts a warning on every coastal zone in
              its path, so two storms can be twenty products and read against
              the Hurricane Tracker as a contradiction. */}
          <p className="text-[10.5px] mt-3 leading-relaxed" style={{ color: ROYAL.dim }}>
            Counts are active NWS <em>products</em>, not storms — one hurricane issues a warning for
            every coastal zone in its path, so a couple of systems can be dozens of warnings. The
            Hurricane Tracker counts the cyclones themselves and will normally say a smaller number.
          </p>
        </motion.section>

        {/* ── local instability, kept apart from the national half ────────── */}
        <motion.section {...rise(0.16)}
          className="rounded-2xl p-4"
          style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-[10px] uppercase tracking-[0.24em]" style={{ color: ROYAL.dim }}>
              Your own air
            </span>
            <span className="text-[10px]" style={{ color: ROYAL.dim }}>
              worth up to 12 of {GAUGE_MAX}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { k: "CAPE", v: localMissing ? "—" : `${Math.round(cape)}`, u: "J/kg" },
              { k: "SRH", v: localMissing ? "—" : `${Math.round(srh)}`, u: "m²/s²" },
              { k: "0–6 km shear", v: localMissing ? "—" : `${Math.round(shear)}`, u: "kt" },
              { k: "Lifted index", v: localMissing ? "—" : li.toFixed(1), u: "°C" },
              { k: "SWTI", v: localMissing ? "—" : swti.score.toFixed(1), u: "index" },
            ].map((m) => (
              <div key={m.k} className="rounded-xl px-2.5 py-2"
                   style={{ background: "rgba(204,204,255,0.04)", border: `1px solid ${ROYAL.hairline}` }}>
                <div className="text-base font-bold tabular-nums" style={{ color: ROYAL.text }}>{m.v}</div>
                <div className="text-[9.5px] uppercase tracking-wide leading-tight mt-0.5" style={{ color: ROYAL.dim }}>
                  {m.k}<span className="ml-1 opacity-60">{m.u}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ── the scale ───────────────────────────────────────────────────── */}
        <motion.section {...rise(0.2)}
          className="rounded-2xl p-4"
          style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <div className="text-[10px] uppercase tracking-[0.24em] mb-3" style={{ color: ROYAL.dim }}>
            Where today sits
          </div>
          <ScaleLadder
            bands={BANDS} score={alertsLoading ? 0 : total}
            threshold={ACTIVATION_THRESHOLD} max={GAUGE_MAX} calm={still}
          />
        </motion.section>

        {/* ── the disclaimer, which is not decoration ─────────────────────── */}
        <motion.div {...rise(0.24)}
          className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
          <p className="text-[11.5px] leading-relaxed" style={{ color: ROYAL.dim }}>
            <strong style={{ color: ROYAL.text }}>This is not an NWS product.</strong> The SSWXCon
            Score is a situational-awareness number for the country as a whole and says nothing
            about your street. A single tornado warning on your county is life-threatening whatever
            this dial reads. Always follow official NWS guidance.
          </p>
        </motion.div>

        <div className="text-center text-[10.5px]" style={{ color: ROYAL.dim, fontFamily: HEADING }}>
          Updated {format(lastUpdated, "h:mm:ss aa")} · refreshes on its own every 60 seconds
        </div>
      </div>
    </ModuleShell>
  );
}
