/**
 * Fire Weather.
 *
 * Fire season is half the calendar for half the country and the app had no
 * module for it — "fire weather" appeared in passing inside two others and was
 * owned by none.
 *
 * Three things, in the order a person needs them: is there a risk area over me
 * today, what are the ingredients doing hour by hour, and what is already
 * burning.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Flame, Loader2, Wind, Droplets, Thermometer, ExternalLink, AlertTriangle } from "lucide-react";
import type { Location } from "../hooks/useLocation";
import { getFireOutlook, listIncidents, getFireHours, riskOf, hdwBand, type FireHour } from "../lib/fireWeather";
import { FireMap } from "../components/fire/FireMap";
import { TTL } from "../lib/queryClient";
import { ROYAL, HEADING, EASE, SPRING, prefersReducedMotion } from "../lib/royal";

interface Props { location: Location }

const SURFACE: React.CSSProperties = {
  background: "linear-gradient(180deg, hsl(var(--card) / 0.95), hsl(var(--card) / 0.8))",
  border: "1px solid hsl(var(--border))",
  boxShadow: "0 24px 50px -34px rgba(0,0,0,0.95)",
};

/** Hourly HDW as a column plot — the shape of the day, not a table of numbers. */
function HdwStrip({ hours }: { hours: FireHour[] }) {
  const reduced = prefersReducedMotion();
  const slice = useMemo(() => {
    const now = Date.now();
    return hours.filter((h) => h.t >= now - 3600_000).slice(0, 48);
  }, [hours]);
  if (slice.length === 0) return null;
  const peak = Math.max(...slice.map((h) => h.hdw), 1);

  return (
    <div className="flex items-end gap-[2px] h-[92px]">
      {slice.map((h, i) => {
        const band = hdwBand(h.hdw);
        const pct = Math.max(3, (h.hdw / peak) * 100);
        const dt = new Date(h.t);
        const isNoon = dt.getHours() === 12;
        return (
          <motion.div
            key={h.t}
            initial={reduced ? undefined : { height: 0 }}
            animate={{ height: `${pct}%` }}
            transition={{ delay: Math.min(0.5, i * 0.008), duration: 0.5, ease: EASE }}
            className="flex-1 rounded-t-[2px] relative group"
            style={{ background: band.color, opacity: 0.85, minWidth: 3 }}
            title={`${dt.toLocaleString(undefined, { weekday: "short", hour: "numeric" })} — HDW ${Math.round(h.hdw)} (${band.label})`}
          >
            {isNoon && (
              <span className="absolute -bottom-[15px] left-1/2 -translate-x-1/2 text-[8px] whitespace-nowrap"
                    style={{ color: ROYAL.dim, fontFamily: "ui-monospace, Menlo, monospace" }}>
                {dt.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export default function FireWeather({ location }: Props) {
  const [day, setDay] = useState<1 | 2 | 3>(1);
  const [showIncidents, setShowIncidents] = useState(true);

  const otlkQ = useQuery({
    queryKey: ["fire-outlook", day],
    queryFn: () => getFireOutlook(day),
    staleTime: TTL.slow,
  });
  const incQ = useQuery({ queryKey: ["fire-incidents"], queryFn: listIncidents, staleTime: TTL.slow });
  const hoursQ = useQuery({
    queryKey: ["fire-hours", location.lat.toFixed(3), location.lon.toFixed(3)],
    queryFn: () => getFireHours(location.lat, location.lon),
    staleTime: TTL.normal,
  });

  const hours = hoursQ.data ?? [];
  const nowHour = useMemo(() => {
    const now = Date.now();
    return hours.find((h) => h.t >= now - 1800_000) ?? hours[0] ?? null;
  }, [hours]);
  const peak24 = useMemo(() => {
    const now = Date.now();
    const win = hours.filter((h) => h.t >= now && h.t <= now + 24 * 3600_000);
    return win.reduce<FireHour | null>((best, h) => (!best || h.hdw > best.hdw ? h : best), null);
  }, [hours]);

  const worst = otlkQ.data?.worst ?? null;
  const worstRisk = worst ? riskOf(worst) : null;
  const nearby = useMemo(() => {
    const rows = (incQ.data ?? []).filter((i) => i.latitude != null && i.longitude != null);
    return rows
      .map((i) => ({ ...i, d: Math.hypot((i.latitude! - location.lat) * 69, (i.longitude! - location.lon) * 53) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);
  }, [incQ.data, location.lat, location.lon]);

  const band = peak24 ? hdwBand(peak24.hdw) : null;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                     transition={{ duration: 0.5, ease: EASE }} className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: ROYAL.gold }}>
          SPC · NWS · InciWeb
        </div>
        <h1 className="text-2xl font-bold tracking-[0.01em]" style={{ fontFamily: HEADING, color: ROYAL.text }}>
          Fire Weather
        </h1>
        <p className="text-sm" style={{ color: ROYAL.dim }}>
          Critical fire weather areas, the hourly ingredients over {location.name}, and what's burning now.
        </p>
      </motion.header>

      {/* Headline */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.05, ease: EASE }}
                  className="rounded-2xl p-4 flex items-center gap-4 flex-wrap" style={SURFACE}>
        <motion.div
          animate={prefersReducedMotion() ? {} : { scale: [1, 1.08, 1] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          className="w-12 h-12 rounded-xl grid place-items-center shrink-0"
          style={{ background: `${(worstRisk?.color ?? ROYAL.gold)}1f`, border: `1px solid ${worstRisk?.color ?? ROYAL.goldSoft}` }}
        >
          <Flame className="w-6 h-6" style={{ color: worstRisk?.color ?? ROYAL.gold }} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[15px]" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            {otlkQ.isLoading ? "Reading the outlook…"
              : worstRisk ? `${worstRisk.label} fire weather risk somewhere in the country`
              : "No fire weather risk areas posted"}
          </div>
          <div className="text-xs" style={{ color: ROYAL.dim }}>
            {otlkQ.data?.valid
              ? `Day ${day} · valid ${new Date(otlkQ.data.valid).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" })}`
              : `Day ${day} outlook`}
            {otlkQ.data?.forecaster ? ` · forecaster ${otlkQ.data.forecaster}` : ""}
          </div>
        </div>
        <LayoutGroup id="fire-day">
          <div className="flex gap-1 p-1 rounded-xl shrink-0"
               style={{ background: "hsl(var(--muted) / 0.3)", border: "1px solid hsl(var(--border))" }}>
            {([1, 2, 3] as const).map((dnum) => (
              <button key={dnum} onClick={() => setDay(dnum)}
                      className="relative px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-[0.1em]"
                      style={{ color: day === dnum ? "#17141f" : ROYAL.dim, zIndex: 1 }}>
                {day === dnum && (
                  <motion.span layoutId="fire-day-slab" transition={SPRING.silk}
                               className="absolute inset-0 rounded-lg -z-10"
                               style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)` }} />
                )}
                Day {dnum}
              </button>
            ))}
          </div>
        </LayoutGroup>
      </motion.div>

      {/* Map */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.1 }}
                  className="rounded-2xl overflow-hidden relative" style={SURFACE}>
        <FireMap features={otlkQ.data?.features ?? []} incidents={incQ.data ?? []}
                 center={{ lat: location.lat, lon: location.lon }} showIncidents={showIncidents} height={400} />
        <div className="absolute left-3 bottom-3 flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 rounded-lg text-[10.5px]"
             style={{ background: "rgba(8,8,20,0.82)", border: "1px solid hsl(var(--border))", color: ROYAL.dim }}>
          {(otlkQ.data?.features ?? []).length === 0 ? (
            <span>No risk areas on this day</span>
          ) : (
            [...new Set((otlkQ.data?.features ?? []).map((f) => String(f.properties?.label)))].map((lab) => (
              <span key={lab} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: riskOf(lab).color }} />
                {riskOf(lab).label}
              </span>
            ))
          )}
          <button onClick={() => setShowIncidents((v) => !v)} className="flex items-center gap-1.5"
                  style={{ color: showIncidents ? "#ffb245" : ROYAL.dim }}>
            <span className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: showIncidents ? "#ffb245" : "transparent", border: "1px solid #ffb245" }} />
            Active fires ({(incQ.data ?? []).length})
          </button>
        </div>
      </motion.div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
        {/* Ingredients */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.14, ease: EASE }}
                    className="rounded-2xl p-4 sm:p-5" style={SURFACE}>
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em]"
                  style={{ fontFamily: HEADING, color: ROYAL.gold }}>
                Hot-Dry-Windy over {location.name}
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>
                Vapour pressure deficit times wind — the combination that makes fires run, hour by hour.
              </p>
            </div>
            {band && (
              <div className="text-right shrink-0">
                <div className="text-2xl font-bold tabular-nums" style={{ fontFamily: HEADING, color: band.color }}>
                  {Math.round(peak24!.hdw)}
                </div>
                <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: ROYAL.dim }}>
                  peak next 24 h · {band.label}
                </div>
              </div>
            )}
          </div>

          {hoursQ.isLoading ? (
            <div className="h-[110px] grid place-items-center text-sm" style={{ color: ROYAL.dim }}>
              <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Reading conditions…</span>
            </div>
          ) : (
            <>
              <HdwStrip hours={hours} />
              <div className="h-4" />
              {band && <p className="text-[12px] mt-1" style={{ color: ROYAL.dim }}>{band.note}</p>}
            </>
          )}

          {nowHour && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              {[
                { k: "Temperature", v: `${Math.round(nowHour.tempC * 9 / 5 + 32)}°F`, Icon: Thermometer },
                { k: "Humidity", v: `${Math.round(nowHour.rh)}%`, Icon: Droplets },
                { k: "Wind", v: `${Math.round(nowHour.windMs * 2.237)} mph`, Icon: Wind },
                { k: "Gusts", v: `${Math.round(nowHour.gustMs * 2.237)} mph`, Icon: Wind },
              ].map((s, i) => (
                <motion.div key={s.k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 + i * 0.05, duration: 0.35, ease: EASE }}
                            className="rounded-lg px-3 py-2.5"
                            style={{ background: "hsl(var(--muted) / 0.3)", border: "1px solid hsl(var(--border))" }}>
                  <div className="text-[9px] uppercase tracking-[0.18em] flex items-center gap-1" style={{ color: ROYAL.dim }}>
                    <s.Icon className="w-3 h-3" style={{ color: ROYAL.gold }} /> {s.k}
                  </div>
                  <div className="text-[15px] font-semibold tabular-nums" style={{ color: ROYAL.text }}>{s.v}</div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Incidents */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.18, ease: EASE }}
                    className="rounded-2xl overflow-hidden" style={SURFACE}>
          <div className="px-4 py-3 text-[10px] uppercase tracking-[0.22em] font-semibold flex items-center gap-1.5"
               style={{ color: ROYAL.gold, borderBottom: "1px solid hsl(var(--border))" }}>
            <AlertTriangle className="w-3 h-3" /> Nearest active fires
          </div>
          <AnimatePresence mode="wait">
            {incQ.isLoading ? (
              <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="p-6 text-center text-sm" style={{ color: ROYAL.dim }}>
                <Loader2 className="w-4 h-4 animate-spin inline" />
              </motion.div>
            ) : nearby.length === 0 ? (
              <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="p-6 text-center text-sm" style={{ color: ROYAL.dim }}>
                No incidents reported on InciWeb right now.
              </motion.div>
            ) : (
              <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="max-h-[380px] overflow-y-auto list-virtual">
                {nearby.map((i, idx) => (
                  <motion.a
                    key={i.link} href={i.link} target="_blank" rel="noreferrer"
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(0.3, idx * 0.04), duration: 0.3, ease: EASE }}
                    className="block px-3.5 py-2.5"
                    style={{ borderBottom: "1px solid hsl(var(--border) / 0.5)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12.5px] min-w-0" style={{ color: ROYAL.text }}>
                        {i.title.replace(/^[A-Z]{2,6}\s+/, "")}
                      </span>
                      <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 opacity-50" style={{ color: ROYAL.dim }} />
                    </div>
                    <div className="text-[10.5px] mt-0.5" style={{ color: ROYAL.dim }}>
                      {i.state || "—"} · {Math.round(i.d)} mi away
                      {i.acres ? ` · ${i.acres.toLocaleString()} acres` : ""}
                    </div>
                  </motion.a>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <p className="text-[10.5px] text-center" style={{ color: ROYAL.dim }}>
        Outlooks: NOAA/NWS Storm Prediction Center. Incidents: InciWeb, positions approximate. Hot-Dry-Windy computed
        from Open-Meteo forecast fields after Srock et al. (2018). Always follow local fire restrictions and evacuation
        orders.
      </p>
    </div>
  );
}
