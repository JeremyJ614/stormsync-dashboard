/**
 * River & Flood Gauges — National Water Prediction Service.
 *
 * Flooding kills more people in the United States most years than tornadoes,
 * and until now the app had no coverage of it at all. Every number on this page
 * is an NWPS observation or forecast; nothing here is modelled by us.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Waves, Loader2, AlertTriangle, ExternalLink, MapPin, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Location } from "../hooks/useLocation";
import { listGauges, getGauge, floodStyle, FLOOD_ORDER, type GaugeSummary } from "../lib/riverGauges";
import { GaugeMap } from "../components/water/GaugeMap";
import { Hydrograph } from "../components/water/Hydrograph";
import { ModuleShell } from "../components/ModuleShell";
import { ROYAL, HEADING, EASE } from "../lib/royal";

interface Props { location: Location }

const RANGES = [
  { id: "near",   label: "Nearby",   dx: 1.6, dy: 1.1 },
  { id: "region", label: "Region",   dx: 3.4, dy: 2.3 },
  { id: "wide",   label: "Wide",     dx: 6.5, dy: 4.2 },
] as const;

const SURFACE: React.CSSProperties = {
  background: "linear-gradient(180deg, hsl(var(--card) / 0.95), hsl(var(--card) / 0.8))",
  border: "1px solid hsl(var(--border))",
  boxShadow: "0 24px 50px -34px rgba(0,0,0,0.95)",
};

function fmtAgo(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return "—";
  if (mins < 60) return `${Math.max(0, mins)} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} hr ago` : `${Math.round(h / 24)} d ago`;
}

/** Direction of travel over the last few hours of the observed trace. */
function trendOf(pts: { t: number; stage: number }[]) {
  if (pts.length < 4) return { dir: 0, delta: 0 };
  const last = pts[pts.length - 1];
  const ref = pts.find((p) => p.t >= last.t - 6 * 3600_000) ?? pts[0];
  const delta = last.stage - ref.stage;
  return { dir: Math.abs(delta) < 0.05 ? 0 : delta > 0 ? 1 : -1, delta };
}

export default function RiverGauges({ location }: Props) {
  const [range, setRange] = useState<(typeof RANGES)[number]["id"]>("region");
  const [selected, setSelected] = useState<string | null>(null);

  const box = RANGES.find((r) => r.id === range)!;
  const bbox = useMemo(() => ({
    xmin: location.lon - box.dx, xmax: location.lon + box.dx,
    ymin: location.lat - box.dy, ymax: location.lat + box.dy,
  }), [location.lat, location.lon, box.dx, box.dy]);

  const gaugesQ = useQuery({
    queryKey: ["river-gauges", bbox.xmin.toFixed(2), bbox.ymin.toFixed(2), bbox.xmax.toFixed(2), bbox.ymax.toFixed(2)],
    queryFn: () => listGauges(bbox),
    staleTime: 10 * 60 * 1000,
  });

  const gauges = useMemo(() => {
    const list = gaugesQ.data ?? [];
    return [...list].sort((a, b) => {
      const d = floodStyle(b.worst).rank - floodStyle(a.worst).rank;
      if (d !== 0) return d;
      // Then by distance from the member's location.
      const da = (a.latitude - location.lat) ** 2 + (a.longitude - location.lon) ** 2;
      const db = (b.latitude - location.lat) ** 2 + (b.longitude - location.lon) ** 2;
      return da - db;
    });
  }, [gaugesQ.data, location.lat, location.lon]);

  // Open the worst gauge by default so the page answers its own question.
  useEffect(() => {
    if (selected || gauges.length === 0) return;
    setSelected(gauges[0].lid);
  }, [gauges, selected]);

  const detailQ = useQuery({
    queryKey: ["river-gauge", selected],
    queryFn: () => getGauge(selected!),
    enabled: !!selected,
    staleTime: 10 * 60 * 1000,
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of gauges) c[g.worst] = (c[g.worst] ?? 0) + 1;
    return c;
  }, [gauges]);

  const flooding = FLOOD_ORDER.reduce((n, k) => n + (counts[k] ?? 0), 0);
  const d = detailQ.data;
  const trend = d ? trendOf(d.observed) : { dir: 0, delta: 0 };

  return (
    <ModuleShell
      eyebrow="National Water Prediction Service · NOAA"
      title={<>River &amp; Flood Gauges</>}
      subtitle={`Observed stage, forecast crest and flood thresholds for every reporting gauge near ${location.name}.`}
      status={
        <div className="rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap" style={SURFACE}>
        <div className="flex items-center gap-3 min-w-0">
          {flooding > 0
            ? <AlertTriangle className="w-8 h-8 shrink-0" style={{ color: floodStyle(gauges[0]?.worst).color }} />
            : <Waves className="w-8 h-8 shrink-0" style={{ color: ROYAL.gold }} />}
          <div className="min-w-0">
            <div className="font-bold text-[15px]" style={{ fontFamily: HEADING, color: ROYAL.text }}>
              {gaugesQ.isLoading ? "Reading gauges…"
                : flooding > 0
                  ? `${flooding} gauge${flooding === 1 ? "" : "s"} at or above action stage`
                  : gauges.length > 0 ? "No gauges in flood" : "No reporting gauges in range"}
            </div>
            <div className="text-xs" style={{ color: ROYAL.dim }}>
              {gauges.length} gauge{gauges.length === 1 ? "" : "s"} reporting in this window
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{
                background: range === r.id ? "rgba(217,183,117,0.16)" : "hsl(var(--muted) / 0.35)",
                border: `1px solid ${range === r.id ? "rgba(217,183,117,0.55)" : "hsl(var(--border))"}`,
                color: range === r.id ? ROYAL.gold : ROYAL.dim,
                transition: "background 180ms ease, border-color 180ms ease, color 180ms ease",
              }}>
              {r.label}
            </button>
          ))}
        </div>
        </div>
      }
    >
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px]" style={{ color: ROYAL.dim }}>
        {[...FLOOD_ORDER, "no_flooding"].map((k) => {
          const st = floodStyle(k);
          return (
            <span key={k} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: st.color }} />
              {st.label}
              {counts[k] ? <span style={{ color: ROYAL.text }}>· {counts[k]}</span> : null}
            </span>
          );
        })}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.1 }}
                  className="rounded-2xl overflow-hidden" style={SURFACE}>
        <GaugeMap gauges={gauges} center={{ lat: location.lat, lon: location.lon }}
                  selected={selected} onSelect={setSelected} height={380} />
      </motion.div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-4 items-start">
        {/* Gauge list */}
        <div className="rounded-2xl overflow-hidden" style={SURFACE}>
          <div className="px-4 py-3 text-[10px] uppercase tracking-[0.22em] font-semibold"
               style={{ color: ROYAL.gold, borderBottom: "1px solid hsl(var(--border))" }}>
            Gauges · worst first
          </div>
          {gaugesQ.isLoading ? (
            <div className="p-6 flex items-center justify-center gap-2 text-sm" style={{ color: ROYAL.dim }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : gauges.length === 0 ? (
            <div className="p-6 text-center text-sm" style={{ color: ROYAL.dim }}>
              No NWPS gauges report in this window. Try a wider range.
            </div>
          ) : (
            <div className="max-h-[460px] overflow-y-auto list-virtual">
              {gauges.map((g, i) => {
                const st = floodStyle(g.worst);
                const active = g.lid === selected;
                return (
                  <motion.button
                    key={g.lid} onClick={() => setSelected(g.lid)}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(0.3, i * 0.015), duration: 0.3, ease: EASE }}
                    className="w-full text-left px-3.5 py-2.5 flex items-center gap-2.5"
                    style={{
                      background: active ? "rgba(217,183,117,0.10)" : "transparent",
                      borderBottom: "1px solid hsl(var(--border) / 0.5)",
                      borderLeft: `2px solid ${active ? ROYAL.gold : "transparent"}`,
                    }}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: st.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] truncate" style={{ color: ROYAL.text }}>{g.name}</span>
                      <span className="block text-[10.5px]" style={{ color: ROYAL.dim }}>
                        {g.lid} · {g.state} · {st.label}
                      </span>
                    </span>
                    {g.observed?.primary != null && (
                      <span className="text-[12px] font-semibold tabular-nums shrink-0" style={{ color: st.color }}>
                        {g.observed.primary.toFixed(1)}<span className="text-[9px]"> {g.observed.primaryUnit}</span>
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="rounded-2xl p-4 sm:p-5 min-h-[300px]" style={SURFACE}>
          <AnimatePresence mode="wait">
            {detailQ.isLoading || !d ? (
              <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="h-[260px] grid place-items-center text-sm" style={{ color: ROYAL.dim }}>
                {selected ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Reading gauge…</span>
                          : "Pick a gauge to see its record."}
              </motion.div>
            ) : (
              <motion.div key={d.lid} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35, ease: EASE }}
                          className="space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-tight" style={{ fontFamily: HEADING, color: ROYAL.text }}>
                      {d.name}
                    </h2>
                    <p className="text-[11px] flex items-center gap-1.5 mt-0.5" style={{ color: ROYAL.dim }}>
                      <MapPin className="w-3 h-3" />
                      {d.county ? `${d.county} County, ` : ""}{d.state} · {d.lid}
                      {d.usgsId ? ` · USGS ${d.usgsId}` : ""}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-[0.14em] shrink-0"
                        style={{ color: floodStyle(d.category).color, border: `1px solid ${floodStyle(d.category).color}` }}>
                    {floodStyle(d.category).label}
                  </span>
                </div>

                {/* Readings */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    {
                      k: "Stage now",
                      v: d.observed.at(-1) ? `${d.observed.at(-1)!.stage.toFixed(2)} ${d.stageUnit}` : "—",
                      sub: fmtAgo(d.observedIssued),
                    },
                    {
                      k: "6-hr trend",
                      v: trend.dir === 0 ? "Steady" : `${trend.delta > 0 ? "+" : ""}${trend.delta.toFixed(2)} ${d.stageUnit}`,
                      sub: trend.dir > 0 ? "Rising" : trend.dir < 0 ? "Falling" : "No change",
                      icon: trend.dir > 0 ? TrendingUp : trend.dir < 0 ? TrendingDown : Minus,
                    },
                    {
                      k: "Flood stage",
                      v: d.thresholds.minor != null ? `${d.thresholds.minor} ${d.stageUnit}` : "Not set",
                      sub: d.thresholds.major != null ? `Major ${d.thresholds.major}` : "—",
                    },
                    {
                      k: "Record crest",
                      v: d.recordCrest ? `${d.recordCrest.stage} ${d.stageUnit}` : "—",
                      sub: d.recordCrest ? new Date(d.recordCrest.when).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "none published",
                    },
                  ].map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <motion.div key={s.k}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.06 + i * 0.05, duration: 0.35, ease: EASE }}
                        className="rounded-lg px-3 py-2.5"
                        style={{ background: "hsl(var(--muted) / 0.3)", border: "1px solid hsl(var(--border))" }}>
                        <div className="text-[9px] uppercase tracking-[0.18em]" style={{ color: ROYAL.dim }}>{s.k}</div>
                        <div className="text-[15px] font-semibold flex items-center gap-1 tabular-nums"
                             style={{ color: ROYAL.text }}>
                          {Icon && <Icon className="w-3.5 h-3.5" style={{ color: ROYAL.gold }} />}{s.v}
                        </div>
                        <div className="text-[10px]" style={{ color: ROYAL.dim }}>{s.sub}</div>
                      </motion.div>
                    );
                  })}
                </div>

                <Hydrograph g={d} />

                {d.impacts.length > 0 && (
                  <div>
                    <h3 className="text-[10px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: ROYAL.gold }}>
                      What happens as it rises
                    </h3>
                    <div className="space-y-1.5 max-h-[190px] overflow-y-auto pr-1">
                      {d.impacts.map((im, i) => (
                        <div key={i} className="flex gap-2.5 text-[12px] leading-snug">
                          <span className="font-semibold tabular-nums shrink-0 w-[52px] text-right"
                                style={{ color: ROYAL.gold }}>
                            {im.stage} {d.stageUnit}
                          </span>
                          <span style={{ color: ROYAL.dim }}>{im.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-1 text-[11px]" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                  <a href={`https://water.noaa.gov/gauges/${d.lid}`} target="_blank" rel="noreferrer"
                     className="flex items-center gap-1 pt-2.5" style={{ color: ROYAL.gold }}>
                    Full NWPS page <ExternalLink className="w-3 h-3" />
                  </a>
                  {d.inundationUrl && (
                    <a href={d.inundationUrl} target="_blank" rel="noreferrer"
                       className="flex items-center gap-1 pt-2.5" style={{ color: ROYAL.gold }}>
                      Inundation mapping <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {d.usgsId && (
                    <a href={`https://waterdata.usgs.gov/monitoring-location/${d.usgsId}/`} target="_blank" rel="noreferrer"
                       className="flex items-center gap-1 pt-2.5" style={{ color: ROYAL.dim }}>
                      USGS record <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="text-[10.5px] text-center" style={{ color: ROYAL.dim }}>
        Source: NOAA/NWS National Water Prediction Service. Forecasts are issued by the responsible River Forecast
        Center and are not produced by StormSync. Never drive through flood water.
      </p>
    </ModuleShell>
  );
}
