/**
 * Storm Reports — the ground truth beside the warnings.
 *
 * A warning says what a radar expects. A report says what somebody standing
 * outside actually saw, with a time and a place. Putting them on two subtabs of
 * one module is the point of the change: during an event you want to flip
 * between "what is warned" and "what has verified" without leaving the page.
 *
 * The list is ordered newest first, because during severe weather the last
 * twenty minutes is the only part anyone reads.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  Tornado, CloudHail, Wind, Waves, Snowflake, Flame, Zap, CircleDot,
  Loader2, AlertTriangle, MapPin, Clock, Radio,
} from "lucide-react";
import {
  fetchLocalStormReports, milesBetween, magnitudeLabel, notable,
  KIND_STYLE, REPORTS_TTL, type StormReport, type ReportKind,
} from "../../lib/stormReports";
import { ROYAL, HEADING, prefersReducedMotion } from "../../lib/royal";
import { Panel } from "../ModuleShell";

const ICON: Record<ReportKind, typeof Tornado> = {
  tornado: Tornado, funnel: Tornado, hail: CloudHail, wind: Wind,
  flood: Waves, snow: Snowflake, fire: Flame, lightning: Zap, other: CircleDot,
};

const WINDOWS = [
  { id: 6, label: "6 h" },
  { id: 24, label: "24 h" },
  { id: 72, label: "3 days" },
] as const;

const NEAR_MILES = 250;

export function ReportsTab({ lat, lon, place }: { lat: number; lon: number; place: string }) {
  const [hours, setHours] = useState<number>(24);
  const [nearOnly, setNearOnly] = useState(false);
  const [kind, setKind] = useState<ReportKind | "">("");
  const still = prefersReducedMotion();

  const q = useQuery({
    queryKey: ["lsr", hours],
    queryFn: () => fetchLocalStormReports(hours),
    staleTime: REPORTS_TTL,
    refetchInterval: REPORTS_TTL,
  });

  const all = q.data ?? [];

  const withDistance = useMemo(
    () => all.map((r) => ({ r, miles: milesBetween(lat, lon, r.lat, r.lon) })),
    [all, lat, lon],
  );

  const shown = useMemo(() => {
    let list = withDistance;
    if (nearOnly) list = list.filter((x) => x.miles <= NEAR_MILES);
    if (kind) list = list.filter((x) => x.r.type === kind);
    return list;
  }, [withDistance, nearOnly, kind]);

  // Counts come from the near/far selection but ignore the type filter, so the
  // chips keep showing what else is out there rather than collapsing to one.
  const counts = useMemo(() => {
    const base = nearOnly ? withDistance.filter((x) => x.miles <= NEAR_MILES) : withDistance;
    const m = new Map<ReportKind, number>();
    for (const x of base) m.set(x.r.type, (m.get(x.r.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => KIND_STYLE[a[0]].rank - KIND_STYLE[b[0]].rank);
  }, [withDistance, nearOnly]);

  const big = useMemo(() => notable(shown.map((x) => x.r)), [shown]);

  return (
    <div className="space-y-4">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <LayoutGroup id="lsr-window">
          <div className="flex gap-1 p-1 rounded-xl"
               style={{ background: "hsl(var(--muted) / 0.3)", border: "1px solid hsl(var(--border))" }}>
            {WINDOWS.map((w) => (
              <button key={w.id} onClick={() => setHours(w.id)}
                className="relative px-3 py-1.5 rounded-lg text-[11px] font-semibold uppercase tracking-[0.1em]"
                style={{ color: hours === w.id ? "#17141f" : ROYAL.dim, zIndex: 1 }}>
                {hours === w.id && (
                  <motion.span layoutId="lsr-window-slab"
                    transition={still ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 30 }}
                    className="absolute inset-0 rounded-lg -z-10"
                    style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)` }} />
                )}
                {w.label}
              </button>
            ))}
          </div>
        </LayoutGroup>

        <button onClick={() => setNearOnly((v) => !v)}
          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border transition-colors"
          style={nearOnly
            ? { background: "rgba(217,183,117,0.16)", borderColor: "rgba(217,183,117,0.55)", color: ROYAL.gold }
            : { background: "hsl(var(--muted) / 0.3)", borderColor: "hsl(var(--border))", color: ROYAL.dim }}>
          <MapPin className="w-3.5 h-3.5" />
          Within {NEAR_MILES} mi of {place.split(",")[0]}
        </button>

        <span className="ml-auto text-xs tabular-nums" style={{ color: ROYAL.dim }}>
          {q.isLoading ? "Loading…" : `${shown.length} report${shown.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* the headline, when there is one worth making */}
      {big.length > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3"
             style={{ background: "rgba(226,55,60,0.1)", border: "1px solid rgba(226,55,60,0.32)" }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#e2373c" }} />
          <p className="text-xs leading-relaxed">
            <strong style={{ color: "#f0a2a5" }}>
              {big.length} significant {big.length === 1 ? "report" : "reports"}
            </strong>
            <span style={{ color: ROYAL.dim }}>
              {" "}in this window — {summarise(big)}.
            </span>
          </p>
        </div>
      )}

      {/* type chips */}
      {counts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <Chip active={kind === ""} onClick={() => setKind("")} color={ROYAL.iris}
                label="All" count={counts.reduce((n, [, c]) => n + c, 0)} />
          {counts.map(([k, c]) => (
            <Chip key={k} active={kind === k} onClick={() => setKind(kind === k ? "" : k)}
                  color={KIND_STYLE[k].color} label={KIND_STYLE[k].label} count={c} />
          ))}
        </div>
      )}

      {/* the list */}
      {q.isLoading ? (
        <div className="p-10 flex items-center justify-center gap-2 text-sm" style={{ color: ROYAL.dim }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Reading local storm reports…
        </div>
      ) : q.isError ? (
        <Panel>
          <p className="text-sm" style={{ color: "#f0a2a5" }}>
            Could not reach the Iowa Environmental Mesonet LSR feed. Warnings on the other tab are unaffected.
          </p>
        </Panel>
      ) : shown.length === 0 ? (
        <Panel>
          <div className="py-8 text-center">
            <Radio className="w-8 h-8 mx-auto mb-2" style={{ color: ROYAL.dim }} />
            <p className="text-sm font-semibold" style={{ color: ROYAL.text }}>
              No storm reports {nearOnly ? `within ${NEAR_MILES} miles` : "nationwide"} in the last {labelFor(hours)}
            </p>
            <p className="text-xs mt-1" style={{ color: ROYAL.dim }}>
              {nearOnly
                ? "Try widening to the whole country, or a longer window."
                : "Quiet is a real answer — nobody has reported anything to the NWS in this period."}
            </p>
          </div>
        </Panel>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {shown.slice(0, 200).map(({ r, miles }, i) => (
              <Row key={r.id} r={r} miles={miles} i={i} still={still} />
            ))}
          </AnimatePresence>
          {shown.length > 200 && (
            <p className="text-[11px] text-center pt-2" style={{ color: ROYAL.dim }}>
              Showing the 200 most recent of {shown.length}. Narrow the window or pick a type to see the rest.
            </p>
          )}
        </div>
      )}

      <p className="text-[10.5px] text-center leading-relaxed" style={{ color: ROYAL.dim }}>
        Source: NWS Local Storm Reports via the Iowa Environmental Mesonet. Reports are preliminary, come from
        spotters, sensors and the public, and are frequently revised or removed after survey. Magnitudes are as
        first reported.
      </p>
    </div>
  );
}

function Row({ r, miles, i, still }: { r: StormReport; miles: number; i: number; still: boolean }) {
  const style = KIND_STYLE[r.type];
  const Icon = ICON[r.type];
  const mag = magnitudeLabel(r);
  const when = r.valid ? new Date(r.valid) : null;

  return (
    <motion.article
      initial={still ? { opacity: 0 } : { opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(i * 0.012, 0.35), duration: 0.25 }}
      className="rounded-xl px-3 py-2.5 flex items-start gap-3"
      style={{ background: `${style.color}0d`, border: `1px solid ${style.color}2e` }}
    >
      <span className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
            style={{ background: `${style.color}1f`, border: `1px solid ${style.color}4d` }}>
        <Icon className="w-4 h-4" style={{ color: style.color }} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            {r.typeText}
          </span>
          {mag && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums"
                  style={{ background: `${style.color}26`, color: style.color }}>
              {mag}
            </span>
          )}
          <span className="text-xs" style={{ color: ROYAL.dim }}>
            {r.city}{r.county ? `, ${r.county} Co.` : ""} {r.state}
          </span>
        </div>

        {r.remark && (
          <p className="text-[11.5px] mt-1 leading-relaxed" style={{ color: ROYAL.dim }}>{r.remark}</p>
        )}

        <div className="flex items-center gap-3 mt-1 text-[10px] flex-wrap" style={{ color: ROYAL.dim }}>
          {when && (
            <span className="flex items-center gap-1 tabular-nums">
              <Clock className="w-3 h-3" />
              {when.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <span>{Math.round(miles)} mi away</span>
          {r.source && <span>via {r.source}</span>}
          {r.wfo && <span>NWS {r.wfo}</span>}
        </div>
      </div>
    </motion.article>
  );
}

function Chip({
  label, count, color, active, onClick,
}: { label: string; count: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border transition-colors"
      style={active
        ? { background: `${color}26`, borderColor: `${color}80`, color }
        : { background: "rgba(255,255,255,0.03)", borderColor: ROYAL.hairline, color: ROYAL.dim }}>
      {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}

const labelFor = (h: number) => (h === 6 ? "6 hours" : h === 24 ? "24 hours" : "3 days");

/** "two tornadoes and hail to 2.75 in" — a sentence, not a count table. */
function summarise(list: StormReport[]): string {
  const tor = list.filter((r) => r.type === "tornado").length;
  const hail = list.filter((r) => r.type === "hail");
  const wind = list.filter((r) => r.type === "wind");
  const parts: string[] = [];
  if (tor) parts.push(`${tor} tornado report${tor === 1 ? "" : "s"}`);
  if (hail.length) {
    const max = Math.max(...hail.map((r) => r.magnitude ?? 0));
    parts.push(`hail to ${max.toFixed(2).replace(/0$/, "")} in`);
  }
  if (wind.length) {
    const max = Math.max(...wind.map((r) => r.magnitude ?? 0));
    parts.push(`wind to ${Math.round(max)} mph`);
  }
  return parts.join(", ") || "several severe reports";
}

export default ReportsTab;
