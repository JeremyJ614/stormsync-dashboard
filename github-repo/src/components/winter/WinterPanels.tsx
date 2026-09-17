/**
 * The Winter Center's tab bodies.
 *
 * A note that runs through all of them. Winter products are seasonal, and for
 * most of the year the honest answer is "nothing". These panels are built to
 * say that clearly — "no winter alerts anywhere in the country right now" is a
 * real answer and reads as working software, whereas an empty table reads as a
 * page that failed to load. Every panel distinguishes "we asked and the answer
 * was none" from "we could not ask".
 */
import { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Snowflake, TriangleAlert, Loader2, MapPin, Thermometer, Wind, Eye,
  CloudSnow, ChevronRight, Clock, Info, Layers, Gauge,
} from "lucide-react";
import {
  OVERLAYS, OVERLAY_GROUPS, snowOutlookImages, ICE_OUTLOOK,
  fetchCitySnow, fetchWinterAlerts, fetchNationalWinterAlerts, fetchWinterTimeline,
  timelineSummary, PTYPE_STYLE, WINTER_TONE, winterRank,
  type WinterOverlay, type OverlayKind, type CitySnow, type WinterHour,
  type SnowOutlookImage,
} from "../../lib/winter";
import { BaseMap } from "../map/BaseMap";
import { TTL } from "../../lib/queryClient";
import { ROYAL, HEADING, EASE } from "../../lib/royal";
import type { Location } from "../../hooks/useLocation";

const rise = (i: number, still: boolean) => ({
  initial: still ? { opacity: 0 } : { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: still ? 0.2 : 0.42, delay: still ? 0 : i * 0.06, ease: EASE },
});

function Empty({ icon: Icon, title, body }: { icon: typeof Snowflake; title: string; body: string }) {
  return (
    <div className="rounded-2xl p-10 text-center"
         style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
      <Icon className="w-8 h-8 mx-auto mb-2.5" style={{ color: ROYAL.dim }} />
      <p className="text-base font-bold" style={{ color: ROYAL.text, fontFamily: HEADING }}>{title}</p>
      <p className="text-sm mt-1.5 max-w-md mx-auto leading-relaxed" style={{ color: ROYAL.dim }}>{body}</p>
    </div>
  );
}

function Loading({ what }: { what: string }) {
  return (
    <div className="p-10 flex items-center justify-center gap-2 text-sm" style={{ color: ROYAL.dim }}>
      <Loader2 className="w-4 h-4 animate-spin" /> {what}
    </div>
  );
}

// ─── 1. The map ──────────────────────────────────────────────────────────────
export const StormMapPanel = memo(function StormMapPanel({
  location, still,
}: { location: Location; still: boolean }) {
  const [group, setGroup] = useState<OverlayKind>("wssi");
  const [overlayId, setOverlayId] = useState("wssi-WSSI_Overall");
  const [hour, setHour] = useState<number | null>(null);   // null = storm total
  const [opacity, setOpacity] = useState(0.85);

  const inGroup = useMemo(() => OVERLAYS.filter((o) => o.group === group), [group]);
  const active: WinterOverlay =
    inGroup.find((o) => o.id === overlayId) ?? inGroup[0] ?? OVERLAYS[0];

  const url = hour != null && active.at ? active.at(hour) : active.url;

  return (
    <div className="space-y-3">
      {/* Which family of product. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {OVERLAY_GROUPS.map((g) => {
          const on = g.id === group;
          return (
            <button key={g.id}
              onClick={() => {
                setGroup(g.id);
                const first = OVERLAYS.find((o) => o.group === g.id);
                if (first) { setOverlayId(first.id); setHour(null); }
              }}
              className="text-left rounded-xl px-3 py-2.5 transition-colors"
              style={{
                background: on ? `${ROYAL.gold}1c` : "rgba(255,255,255,0.03)",
                border: `1px solid ${on ? ROYAL.gold + "66" : ROYAL.hairline}`,
              }}>
              <div className="text-[13px] font-bold" style={{ color: on ? ROYAL.gold : ROYAL.text }}>
                {g.label}
              </div>
              <div className="text-[10px] leading-snug mt-0.5" style={{ color: ROYAL.dim }}>{g.blurb}</div>
            </button>
          );
        })}
      </div>

      {/* Which layer inside it. */}
      <div className="flex flex-wrap gap-1.5">
        {inGroup.map((o) => {
          const on = o.id === active.id;
          return (
            <button key={o.id} onClick={() => { setOverlayId(o.id); setHour(null); }}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors"
              style={on
                ? { background: `${ROYAL.iris}22`, borderColor: `${ROYAL.iris}77`, color: ROYAL.iris }
                : { background: "rgba(255,255,255,0.03)", borderColor: ROYAL.hairline, color: ROYAL.dim }}>
              {o.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl overflow-hidden"
           style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <div className="h-[420px] md:h-[560px] relative">
          <BaseMap
            center={{ lat: location.lat, lon: location.lon }}
            zoom={3.6}
            height="100%"
            images={[{ id: "winter", url, bounds: active.bounds, opacity, underLabels: true }]}
          />
        </div>

        {/* Forecast-hour scrubber, only for the products that have hours. */}
        {active.hours && active.at && (
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap"
               style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
            <span className="text-[11px] uppercase tracking-wider flex items-center gap-1.5"
                  style={{ color: ROYAL.dim }}>
              <Clock className="w-3.5 h-3.5" /> Window
            </span>
            <button onClick={() => setHour(null)}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
              style={hour === null
                ? { background: ROYAL.gold, color: "#17141f" }
                : { background: "rgba(255,255,255,0.04)", color: ROYAL.dim }}>
              Storm total
            </button>
            {active.hours.map((h) => (
              <button key={h} onClick={() => setHour(h)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                style={hour === h
                  ? { background: ROYAL.gold, color: "#17141f" }
                  : { background: "rgba(255,255,255,0.04)", color: ROYAL.dim }}>
                First {h}h
              </button>
            ))}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[11px]" style={{ color: ROYAL.dim }}>Opacity</span>
              <input type="range" min={0.25} max={1} step={0.05} value={opacity}
                     onChange={(e) => setOpacity(Number(e.target.value))}
                     className="w-24" aria-label="Overlay opacity" />
            </div>
          </div>
        )}

        <div className="px-4 py-3 space-y-1" style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
          <div className="text-sm font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            {active.label}
          </div>
          <p className="text-[12px] leading-relaxed" style={{ color: ROYAL.dim }}>{active.legend}</p>
          <p className="text-[11px]" style={{ color: ROYAL.dim }}>Source: {active.source}.</p>
        </div>
      </div>

      <div className="rounded-xl px-3.5 py-3 text-[11px] leading-relaxed flex gap-2"
           style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          A blank map here is usually the right answer rather than a broken one. These products run all year and
          publish an empty field when there is no winter weather to draw, which for most of the country is most of
          the time. The date on each product comes from the source, so a stale one would show as stale.
        </span>
      </div>
    </div>
  );
});

// ─── 2. Snowfall by city ─────────────────────────────────────────────────────
export const SnowfallPanel = memo(function SnowfallPanel({ still }: { still: boolean }) {
  const [onlySnowy, setOnlySnowy] = useState(true);
  const q = useQuery({ queryKey: ["winter-cities"], queryFn: fetchCitySnow, staleTime: TTL.normal });

  const rows = q.data ?? [];
  const snowy = rows.filter((r) => r.totalIn > 0);
  const shown = onlySnowy && snowy.length > 0 ? snowy : rows;
  const sorted = useMemo(() => [...shown].sort((a, b) => b.totalIn - a.totalIn), [shown]);

  if (q.isLoading) return <Loading what="Checking every city…" />;
  if (q.isError) {
    return <Empty icon={CloudSnow} title="Could not reach the forecast"
                  body="The snowfall forecast could not be loaded. Try again in a moment." />;
  }

  const days = rows[0]?.daily.map((d) => d.date) ?? [];

  return (
    <div className="space-y-3">
      <motion.div {...rise(0, still)} className="rounded-2xl p-4"
        style={{ background: snowy.length ? "rgba(137,207,240,0.08)" : ROYAL.panel,
                 border: `1px solid ${snowy.length ? "rgba(137,207,240,0.32)" : ROYAL.hairline}` }}>
        <div className="flex items-center gap-3">
          <Snowflake className="w-6 h-6 shrink-0" style={{ color: snowy.length ? "#89cff0" : ROYAL.dim }} />
          <div>
            <div className="text-lg font-bold leading-tight" style={{ fontFamily: HEADING, color: ROYAL.text }}>
              {snowy.length === 0
                ? "No snow forecast anywhere on the list"
                : `${snowy.length} of ${rows.length} cities are due snow`}
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: ROYAL.dim }}>
              {snowy.length === 0
                ? `Checked all ${rows.length} cities over the next five days. Nothing above a trace.`
                : `Over the next five days. Largest total: ${sorted[0]?.city.name}, ${sorted[0]?.totalIn}".`}
            </p>
          </div>
        </div>
      </motion.div>

      {snowy.length > 0 && (
        <button onClick={() => setOnlySnowy((v) => !v)}
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
          style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
          {onlySnowy ? `Show all ${rows.length} cities` : "Only cities getting snow"}
        </button>
      )}

      <motion.div {...rise(1, still)} className="rounded-2xl overflow-hidden"
        style={{ border: `1px solid ${ROYAL.hairline}` }}>
        <div className="grid gap-px text-[10px] uppercase tracking-wider"
             style={{ gridTemplateColumns: `minmax(9rem,1.4fr) repeat(${days.length}, minmax(3rem,1fr)) 4.5rem`,
                      background: ROYAL.hairline, color: ROYAL.dim }}>
          <div className="px-3 py-2" style={{ background: ROYAL.ink2 }}>City</div>
          {days.map((d) => (
            <div key={d} className="px-1 py-2 text-center" style={{ background: ROYAL.ink2 }}>
              {new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
            </div>
          ))}
          <div className="px-2 py-2 text-center" style={{ background: ROYAL.ink2 }}>Total</div>
        </div>
        <div className="max-h-[30rem] overflow-y-auto">
          {sorted.map((r) => <CityRow key={`${r.city.name}-${r.city.state}`} row={r} days={days.length} />)}
        </div>
      </motion.div>

      <p className="text-[11px] px-1" style={{ color: ROYAL.dim }}>
        Totals are Open-Meteo daily snowfall converted from centimetres to inches. A city showing 0.0 was checked
        and forecast no snow, which is different from not being checked.
      </p>
    </div>
  );
});

function CityRow({ row, days }: { row: CitySnow; days: number }) {
  const heavy = row.totalIn >= 6;
  return (
    <div className="grid gap-px items-center"
         style={{ gridTemplateColumns: `minmax(9rem,1.4fr) repeat(${days}, minmax(3rem,1fr)) 4.5rem`,
                  background: ROYAL.hairline }}>
      <div className="px-3 py-2" style={{ background: ROYAL.ink2 }}>
        <div className="text-[13px] font-semibold truncate" style={{ color: ROYAL.text }}>{row.city.name}</div>
        <div className="text-[10px]" style={{ color: ROYAL.dim }}>{row.city.state}</div>
      </div>
      {row.daily.map((d) => {
        const strength = Math.min(1, d.snowIn / 8);
        return (
          <div key={d.date} className="px-1 py-2 text-center"
               style={{ background: d.snowIn > 0 ? `rgba(137,207,240,${0.08 + strength * 0.4})` : ROYAL.ink2 }}>
            <div className="text-[13px] font-bold tabular-nums"
                 style={{ color: d.snowIn > 0 ? "#dbeeff" : ROYAL.dim }}>
              {d.snowIn > 0 ? d.snowIn.toFixed(1) : "—"}
            </div>
            <div className="text-[9px] tabular-nums" style={{ color: ROYAL.dim }}>{d.highF}/{d.lowF}</div>
          </div>
        );
      })}
      <div className="px-2 py-2 text-center" style={{ background: ROYAL.ink2 }}>
        <div className="text-base font-black tabular-nums"
             style={{ color: heavy ? "#89cff0" : row.totalIn > 0 ? ROYAL.text : ROYAL.dim }}>
          {row.totalIn > 0 ? `${row.totalIn}"` : "—"}
        </div>
      </div>
    </div>
  );
}

// ─── 3. Alerts ───────────────────────────────────────────────────────────────
export const WinterAlertsPanel = memo(function WinterAlertsPanel({
  location, still,
}: { location: Location; still: boolean }) {
  const local = useQuery({
    queryKey: ["winter-alerts", location.lat.toFixed(2), location.lon.toFixed(2)],
    queryFn: () => fetchWinterAlerts(location.lat, location.lon),
    staleTime: TTL.quick,
  });
  const national = useQuery({
    queryKey: ["winter-alerts-national"],
    queryFn: fetchNationalWinterAlerts,
    staleTime: TTL.quick,
  });

  const byState = useMemo(() => {
    const m = new Map<string, { event: string; rank: number }[]>();
    for (const a of national.data ?? []) {
      if (!a.state) continue;
      const list = m.get(a.state) ?? [];
      list.push({ event: a.event, rank: a.rank });
      m.set(a.state, list);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [national.data]);

  if (local.isLoading && national.isLoading) return <Loading what="Checking alerts…" />;

  const mine = local.data ?? [];
  const nat = national.data ?? [];

  return (
    <div className="space-y-3">
      <motion.section {...rise(0, still)} className="rounded-2xl overflow-hidden"
        style={{ background: ROYAL.panel, border: `1px solid ${mine.length ? WINTER_TONE[winterRank(mine[0].properties.event)] + "55" : ROYAL.hairline}` }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
          <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            <MapPin className="w-4 h-4" style={{ color: ROYAL.gold }} /> {location.name}
          </h3>
        </div>
        {mine.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm font-semibold" style={{ color: ROYAL.text }}>No winter alerts for you</p>
            <p className="text-[12px] mt-1" style={{ color: ROYAL.dim }}>
              {local.isError
                ? "The alert feed could not be reached, so this is not a confirmed all-clear."
                : "The Weather Service has nothing winter-related in effect for your location."}
            </p>
          </div>
        ) : (
          <div>
            {mine.map((a, i) => {
              const tone = WINTER_TONE[winterRank(a.properties.event)];
              return (
                <div key={a.properties.id ?? i} className="px-4 py-3"
                     style={{ borderTop: i ? `1px solid ${ROYAL.hairline}` : undefined, background: `${tone}0d` }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <TriangleAlert className="w-4 h-4 shrink-0" style={{ color: tone }} />
                    <span className="font-bold text-sm" style={{ color: tone }}>{a.properties.event}</span>
                  </div>
                  {a.properties.headline && (
                    <p className="text-[12px] mt-1 leading-relaxed" style={{ color: ROYAL.text }}>
                      {a.properties.headline}
                    </p>
                  )}
                  <p className="text-[11px] mt-1" style={{ color: ROYAL.dim }}>{a.properties.areaDesc}</p>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>

      <motion.section {...rise(1, still)} className="rounded-2xl overflow-hidden"
        style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
          <h3 className="text-sm font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            Across the country
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>
            {national.isError
              ? "The national alert feed could not be reached."
              : nat.length === 0
              ? "Not one winter alert is in effect anywhere in the United States right now."
              : `${nat.length} winter alerts in ${byState.length} states.`}
          </p>
        </div>
        {nat.length > 0 && (
          <div className="p-3 space-y-1.5 max-h-[26rem] overflow-y-auto">
            {byState.map(([state, list]) => {
              const worst = Math.max(...list.map((x) => x.rank));
              const tone = WINTER_TONE[worst];
              const kinds = [...new Set(list.map((x) => x.event))];
              return (
                <div key={state} className="rounded-xl px-3 py-2.5 flex items-start gap-2.5"
                     style={{ background: `${tone}0c`, border: `1px solid ${tone}2b` }}>
                  <span className="w-8 h-8 rounded-lg grid place-items-center text-[11px] font-black shrink-0"
                        style={{ background: `${tone}22`, color: tone }}>{state}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold" style={{ color: ROYAL.text }}>
                      {list.length} alert{list.length === 1 ? "" : "s"}
                    </div>
                    <div className="text-[11px] leading-snug" style={{ color: ROYAL.dim }}>
                      {kinds.slice(0, 3).join(" · ")}{kinds.length > 3 ? ` · +${kinds.length - 3} more` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>
    </div>
  );
});

// ─── 4. The hourly timeline ──────────────────────────────────────────────────
export const TimelinePanel = memo(function TimelinePanel({
  location, still,
}: { location: Location; still: boolean }) {
  const q = useQuery({
    queryKey: ["winter-timeline", location.lat.toFixed(2), location.lon.toFixed(2)],
    queryFn: () => fetchWinterTimeline(location.lat, location.lon),
    staleTime: TTL.normal,
  });

  const hours = q.data ?? [];
  const summary = useMemo(() => (hours.length ? timelineSummary(hours) : null), [hours]);
  const peakAccum = Math.max(0.1, ...hours.map((h) => h.accumIn));

  if (q.isLoading) return <Loading what="Building the timeline…" />;
  if (q.isError) return <Empty icon={Clock} title="Could not build the timeline" body="The hourly forecast could not be loaded." />;

  const wet = hours.filter((h) => h.ptype !== "none");

  return (
    <div className="space-y-3">
      <motion.div {...rise(0, still)} className="rounded-2xl p-4"
        style={{
          background: summary?.totalIn ? "rgba(137,207,240,0.08)" : ROYAL.panel,
          border: `1px solid ${summary?.totalIn ? "rgba(137,207,240,0.3)" : ROYAL.hairline}`,
        }}>
        <div className="text-[10px] uppercase tracking-[0.28em]" style={{ color: ROYAL.dim }}>
          Next 72 hours · {location.name}
        </div>
        <div className="text-2xl font-bold mt-1 leading-tight" style={{ fontFamily: HEADING, color: ROYAL.text }}>
          {summary && summary.totalIn > 0
            ? `${summary.totalIn}" of snow expected`
            : wet.length > 0
            ? "Precipitation, but no snow"
            : "Nothing falling"}
        </div>
        {summary?.starts && (
          <p className="text-[12px] mt-1" style={{ color: ROYAL.dim }}>
            Wintry precipitation from {hourLabel(summary.starts)} to {hourLabel(summary.ends!)}.
            {" "}Worst type expected: {PTYPE_STYLE[summary.worst].label.toLowerCase()}.
          </p>
        )}
      </motion.div>

      <motion.div {...rise(1, still)} className="rounded-2xl overflow-hidden"
        style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
        <div className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap"
             style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
          <h3 className="text-sm font-bold flex items-center gap-1.5" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            <Gauge className="w-4 h-4" style={{ color: ROYAL.gold }} /> Hour by hour
          </h3>
          <div className="flex flex-wrap gap-2 text-[10px]">
            {(["snow", "sleet", "freezing", "rain"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1" style={{ color: ROYAL.dim }}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PTYPE_STYLE[k].color }} />
                {PTYPE_STYLE[k].label}
              </span>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="flex items-end gap-px px-3 py-4" style={{ minWidth: `${hours.length * 9}px` }}>
            {hours.map((h, i) => <HourBar key={h.time} h={h} peak={peakAccum} first={i === 0} still={still} index={i} />)}
          </div>
        </div>

        <div className="px-4 py-2.5 text-[11px]" style={{ borderTop: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
          Bar height is running snow accumulation; colour is the precipitation type that hour. Type is decided from
          the temperature aloft as well as at the surface, so a 34°F hour under a cold column still reads as snow.
        </div>
      </motion.div>

      {wet.length > 0 && (
        <motion.div {...rise(2, still)} className="rounded-2xl overflow-hidden"
          style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
            <h3 className="text-sm font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
              The hours that matter
            </h3>
          </div>
          <div className="max-h-[24rem] overflow-y-auto">
            {wet.slice(0, 36).map((h, i) => {
              const style = PTYPE_STYLE[h.ptype];
              return (
                <div key={h.time} className="px-4 py-2.5 flex items-center gap-3 flex-wrap text-[12px]"
                     style={{ borderTop: i ? `1px solid ${ROYAL.hairline}` : undefined }}>
                  <span className="w-20 shrink-0 tabular-nums" style={{ color: ROYAL.text }}>{hourLabel(h.time)}</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0"
                        style={{ background: `${style.color}22`, color: style.color }}>{style.label}</span>
                  <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: ROYAL.dim }}>
                    <Thermometer className="w-3 h-3" />{h.tempF}°
                  </span>
                  {h.snowIn > 0 && (
                    <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: "#89cff0" }}>
                      <Snowflake className="w-3 h-3" />{h.snowIn.toFixed(2)}"
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: ROYAL.dim }}>
                    <Wind className="w-3 h-3" />{h.windMph}{h.gustMph > h.windMph + 8 ? ` g${h.gustMph}` : ""}
                  </span>
                  {h.visibilityMi < 3 && (
                    <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: "#ff8a3d" }}>
                      <Eye className="w-3 h-3" />{h.visibilityMi} mi
                    </span>
                  )}
                  <span className="ml-auto tabular-nums font-semibold" style={{ color: ROYAL.text }}>
                    {h.accumIn > 0 ? `${h.accumIn}"` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
});

function HourBar({ h, peak, still, index }: { h: WinterHour; peak: number; first: boolean; still: boolean; index: number }) {
  const style = PTYPE_STYLE[h.ptype];
  const height = Math.max(2, (h.accumIn / peak) * 88);
  const isNoon = h.time.slice(11, 13) === "12";
  return (
    <div className="flex flex-col items-center gap-1" style={{ width: 8 }}>
      <motion.div
        className="w-full rounded-sm"
        style={{ background: style.color, opacity: h.ptype === "none" ? 0.25 : 0.9 }}
        initial={still ? { height } : { height: 0 }}
        animate={{ height }}
        transition={{ duration: still ? 0 : 0.5, delay: still ? 0 : Math.min(index * 0.004, 0.4), ease: EASE }}
        title={`${hourLabel(h.time)} — ${style.label}, ${h.tempF}°F, ${h.accumIn}" total`}
      />
      {isNoon && (
        <span className="text-[8px] whitespace-nowrap" style={{ color: ROYAL.dim }}>
          {new Date(h.time).toLocaleDateString(undefined, { weekday: "narrow" })}
        </span>
      )}
    </div>
  );
}

function hourLabel(iso: string): string {
  if (!iso || iso.length < 13) return "";
  const hr = Number(iso.slice(11, 13));
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  const day = new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
  return `${day} ${h12}${ampm}`;
}

// ─── 5. The national outlook ─────────────────────────────────────────────────
export const OutlookPanel = memo(function OutlookPanel({ still }: { still: boolean }) {
  const [day, setDay] = useState<1 | 2 | 3>(1);
  const images = snowOutlookImages(day);

  return (
    <div className="space-y-3">
      <motion.div {...rise(0, still)} className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider" style={{ color: ROYAL.dim }}>Forecast day</span>
        {([1, 2, 3] as const).map((d) => (
          <button key={d} onClick={() => setDay(d)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold"
            style={day === d
              ? { background: ROYAL.gold, color: "#17141f" }
              : { background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
            Day {d}
          </button>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div key={day}
          initial={still ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE }}
          className="space-y-3">
          {images.map((img, i) => (
            <OutlookImage key={img.id} img={img} index={i} still={still} />
          ))}
          {day === 1 && <OutlookImage img={ICE_OUTLOOK} index={3} still={still} />}
        </motion.div>
      </AnimatePresence>

      <div className="rounded-xl px-3.5 py-3 text-[11px] leading-relaxed flex gap-2"
           style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
        <Layers className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          These are the Weather Prediction Center's own probability maps, shown exactly as they publish them rather
          than redrawn. When the chance is under ten percent nationwide they say so on the map itself, which is why
          you will often see that sentence rather than colour. Ice probability is published for day 1 only.
        </span>
      </div>
    </div>
  );
});

function OutlookImage({
  img, index, still,
}: { img: SnowOutlookImage; index: number; still: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <motion.figure {...rise(index, still)} className="rounded-2xl overflow-hidden"
      style={{ background: ROYAL.panel, border: `1px solid ${ROYAL.hairline}` }}>
      <figcaption className="px-4 py-3" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
        <div className="text-sm font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>{img.label}</div>
        <div className="text-[11px] mt-0.5" style={{ color: ROYAL.dim }}>{img.detail}</div>
      </figcaption>
      {failed ? (
        <div className="px-4 py-8 text-center text-[12px]" style={{ color: ROYAL.dim }}>
          This product could not be loaded from the Weather Prediction Center.
        </div>
      ) : (
        <img src={img.url} alt={`WPC probability of ${img.label.toLowerCase()}`}
             loading="lazy" width={img.w} height={img.h}
             onError={() => setFailed(true)}
             style={{ width: "100%", height: "auto", display: "block", background: "#fff" }} />
      )}
    </motion.figure>
  );
}
