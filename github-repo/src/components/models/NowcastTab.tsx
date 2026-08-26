/**
 * Nowcast — the next twelve hours where you are, every fifteen minutes.
 *
 * The other tabs are national maps refreshed four times a day. This one is a
 * single point refreshed on demand, and it exists to answer what a map cannot:
 * when does it start, when does it stop, and is the atmosphere loading or
 * unloading while it happens.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Zap, CloudRain, Wind, Eye, Snowflake, TrendingUp, TrendingDown, Minus,
  Loader2, AlertTriangle, Clock,
} from "lucide-react";
import {
  fetchNowcast, headline, capeTrend, capeBand, rainWindows, miles,
  type NowcastStep,
} from "../../lib/nowcast";
import { TTL } from "../../lib/queryClient";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../../lib/royal";
import { Panel } from "../ModuleShell";

export function NowcastTab({ lat, lon, place }: { lat: number; lon: number; place: string }) {
  const still = prefersReducedMotion();

  const q = useQuery({
    queryKey: ["nowcast", lat.toFixed(3), lon.toFixed(3)],
    queryFn: () => fetchNowcast(lat, lon),
    staleTime: TTL.quick,
    refetchInterval: TTL.quick,
  });

  const steps = q.data?.steps ?? [];
  const head = useMemo(() => headline(steps), [steps]);
  const cape = useMemo(() => capeTrend(steps), [steps]);
  const windows = useMemo(() => rainWindows(steps), [steps]);
  const now = steps[0];

  if (q.isLoading) {
    return (
      <div className="p-10 flex items-center justify-center gap-2 text-sm" style={{ color: ROYAL.dim }}>
        <Loader2 className="w-4 h-4 animate-spin" /> Stepping the next twelve hours over {place}…
      </div>
    );
  }
  if (q.isError || !now) {
    return (
      <Panel>
        <p className="text-sm" style={{ color: "#f0a2a5" }}>
          Could not load short-range data for {place}. The model map tabs are unaffected.
        </p>
      </Panel>
    );
  }

  const band = capeBand(now.cape);
  const TrendIcon = cape.dir > 0 ? TrendingUp : cape.dir < 0 ? TrendingDown : Minus;

  return (
    <div className="space-y-4">
      {/* the sentence */}
      <div className="rounded-2xl p-4 flex items-start gap-3"
           style={{
             background: head.urgent ? "rgba(226,55,60,0.1)" : `${ROYAL.gold}10`,
             border: `1px solid ${head.urgent ? "rgba(226,55,60,0.35)" : `${ROYAL.gold}33`}`,
           }}>
        <Clock className="w-5 h-5 mt-0.5 shrink-0" style={{ color: head.urgent ? "#e2373c" : ROYAL.gold }} />
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] font-semibold mb-1"
               style={{ color: ROYAL.dim }}>
            Next twelve hours · {place}
          </div>
          <p className="text-[15px] leading-relaxed" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            {head.text}
          </p>
        </div>
      </div>

      {/* right now */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Stat icon={Zap} label="CAPE now" value={`${Math.round(now.cape)}`} unit="J/kg"
              tone={band.color} note={band.label} />
        <Stat icon={Wind} label="Gusts" value={`${Math.round(now.gust)}`} unit="mph"
              note={now.gust >= 40 ? "damaging range" : now.gust >= 25 ? "breezy" : "light"} />
        <Stat icon={Eye} label="Visibility" value={miles(now.visibility) >= 10 ? "10+" : miles(now.visibility).toFixed(1)}
              unit="mi" note={miles(now.visibility) < 3 ? "restricted" : "clear"} />
        <Stat icon={Snowflake} label="Freezing level" value={(now.freezingLevel * 3.28084 / 1000).toFixed(1)}
              unit="kft" note={now.freezingLevel < 2500 ? "low — mixed risk" : "well aloft"} />
      </div>

      {/* CAPE through the window */}
      <Panel
        title="Instability trend"
        aside={
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: band.color }}>
            <TrendIcon className="w-3.5 h-3.5" />
            {cape.dir > 0 ? "Loading" : cape.dir < 0 ? "Unloading" : "Steady"}
            <span style={{ color: ROYAL.dim }}>· peak {Math.round(cape.peak)}</span>
          </span>
        }
      >
        <CapeCurve steps={steps} still={still} />
        <p className="text-[11px] mt-2 leading-relaxed" style={{ color: ROYAL.dim }}>
          {cape.dir > 0
            ? `Instability is building — ${Math.round(cape.from)} now to about ${Math.round(cape.to)} J/kg four hours out. Storms forming later will have more to work with than anything going up right now.`
            : cape.dir < 0
              ? `Instability is bleeding off — ${Math.round(cape.from)} now down to about ${Math.round(cape.to)} J/kg four hours out. The window for anything strong is closing rather than opening.`
              : `Instability is holding near ${Math.round(cape.from)} J/kg through the next few hours.`}
        </p>
      </Panel>

      {/* precipitation */}
      <Panel
        title="Precipitation, quarter-hour by quarter-hour"
        aside={<span className="text-[10px]" style={{ color: ROYAL.dim }}>
          {windows.length === 0 ? "nothing forecast" : `${windows.length} window${windows.length === 1 ? "" : "s"}`}
        </span>}
      >
        {windows.length === 0 && steps.every((s) => s.precipChance === 0) ? (
          // An empty chart frame reads as a failed render. Say the thing instead.
          <p className="py-6 text-center text-sm" style={{ color: ROYAL.dim }}>
            Nothing forecast to fall here in the next twelve hours, at any chance above zero.
          </p>
        ) : (
          <PrecipCurve steps={steps} still={still} />
        )}
      </Panel>

      <p className="text-[10.5px] text-center leading-relaxed" style={{ color: ROYAL.dim }}>
        Fifteen-minute steps from Open-Meteo's short-range blend for this exact point, out twelve hours.
        Lightning potential is not shown because the field returns null across the United States — it is an
        ECMWF product over Europe, and a flat zero line would read as "no lightning risk". Model guidance is
        not a forecast: defer to NWS warnings.
      </p>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, unit, tone, note,
}: { icon: typeof Zap; label: string; value: string; unit: string; tone?: string; note: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5"
         style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${tone ? `${tone}3a` : ROYAL.hairline}` }}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: ROYAL.dim }}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold tabular-nums" style={{ color: tone ?? ROYAL.text }}>{value}</span>
        <span className="text-[10px]" style={{ color: ROYAL.dim }}>{unit}</span>
      </div>
      <div className="text-[10px]" style={{ color: ROYAL.dim }}>{note}</div>
    </div>
  );
}

function CapeCurve({ steps, still }: { steps: NowcastStep[]; still: boolean }) {
  const peak = Math.max(500, ...steps.map((s) => s.cape));
  const W = 700, H = 110;
  const pts = steps.map((s, i) => {
    const x = (i / Math.max(1, steps.length - 1)) * W;
    const y = H - (s.cape / peak) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 110 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="cape-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ROYAL.gold} stopOpacity="0.32" />
            <stop offset="1" stopColor={ROYAL.gold} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke={ROYAL.iris} strokeOpacity="0.08" strokeWidth="1" />
        ))}
        <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#cape-fill)" />
        <motion.polyline
          points={pts} fill="none" stroke={ROYAL.gold} strokeWidth="2" strokeLinejoin="round"
          initial={still ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: EASE }}
        />
      </svg>
      <div className="flex justify-between text-[10px] mt-1" style={{ color: ROYAL.dim }}>
        <span>{new Date(steps[0].time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
        <span>peak {Math.round(peak)} J/kg</span>
        <span>{new Date(steps[steps.length - 1].time).toLocaleTimeString(undefined, { hour: "numeric" })}</span>
      </div>
    </div>
  );
}

function PrecipCurve({ steps, still }: { steps: NowcastStep[]; still: boolean }) {
  const peak = Math.max(0.02, ...steps.map((s) => s.precip));
  return (
    <div>
      <div className="flex items-end gap-[2px] h-24">
        {steps.map((s, i) => {
          const wet = s.precip > 0;
          const h = wet ? Math.max(6, (s.precip / peak) * 100) : Math.max(2, s.precipChance * 0.18);
          return (
            <motion.div
              key={s.time}
              title={`${new Date(s.time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} — ${s.precip.toFixed(3)} in, ${s.precipChance}% chance`}
              className="flex-1 rounded-t-[2px] min-w-[2px]"
              initial={still ? false : { height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ duration: 0.45, delay: Math.min(i * 0.012, 0.4), ease: EASE }}
              style={{
                background: wet
                  ? `linear-gradient(180deg, #5fa8d9, #5fa8d955)`
                  : `rgba(204,204,255,0.14)`,
              }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px]" style={{ color: ROYAL.dim }}>
        <span className="flex items-center gap-1"><CloudRain className="w-3 h-3" style={{ color: "#5fa8d9" }} /> forecast precipitation</span>
        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> faint bars are chance only, nothing falling</span>
      </div>
    </div>
  );
}

export default NowcastTab;
