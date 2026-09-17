/**
 * System health, drawn rather than tabulated.
 *
 * The brief was explicit: this needs to be readable at a glance, not a table of
 * numbers to decode. So the top of the screen is a single verdict you can read
 * from across the room, each subsystem is a bar whose length *is* its latency,
 * and feed freshness is a strip where the eye finds the one dark cell without
 * reading a single label.
 *
 * Every reading is measured live — see lib/systemHealth. Nothing here is
 * hardcoded green.
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity, RefreshCw, Database, Zap, Radio, Users2, Bell, Server, CheckCircle2, AlertTriangle, XCircle,
  ScrollText, Eye as EyeIcon,
} from "lucide-react";
import {
  runChecks, cacheAges, totals, STATUS_COLOR, STATUS_LABEL,
  type Check, type CacheAge, type Status, type Totals,
} from "../lib/systemHealth";
import { ROYAL, prefersReducedMotion } from "../lib/royal";

const SLOW_CEILING = 2000; // ms — the full width of a latency bar

export function AdminHealthTab() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [ages, setAges] = useState<CacheAge[] | null>(null);
  const [ageErr, setAgeErr] = useState<string | null>(null);
  const [counts, setCounts] = useState<Totals | null>(null);
  const [countsRefused, setCountsRefused] = useState(false);
  const [running, setRunning] = useState(true);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const still = prefersReducedMotion();

  const run = useCallback(async () => {
    setRunning(true);
    const [c, a, t] = await Promise.all([runChecks(), cacheAges(), totals()]);
    setChecks(c);
    setAges(a.ages); setAgeErr(a.error);
    setCounts(t); setCountsRefused(t === null);
    setRanAt(new Date());
    setRunning(false);
  }, []);

  useEffect(() => { void run(); }, [run]);

  const worst: Status = checks.some((c) => c.status === "down") ? "down"
    : checks.some((c) => c.status === "slow") ? "slow"
    : checks.length ? "ok" : "checking";

  const staleFeeds = (ages ?? []).filter((a) => a.status === "stale").length;
  const Verdict = worst === "ok" ? CheckCircle2 : worst === "down" ? XCircle : AlertTriangle;
  const verdictColor = STATUS_COLOR[worst];

  const verdictLine =
    worst === "checking" ? "Running checks…"
    : worst === "down" ? "Something is down"
    : worst === "slow" ? "Everything responding, some of it slowly"
    : staleFeeds > 0 ? "All systems responding"
    : "All systems healthy";

  return (
    <div className="space-y-5">
      {/* the verdict, readable from across the room */}
      <div className="relative bg-card border rounded-2xl p-5 overflow-hidden"
           style={{ borderColor: `${verdictColor}44` }}>
        <motion.div
          aria-hidden
          className="absolute -right-16 -top-16 w-56 h-56 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${verdictColor}22, transparent 68%)` }}
          animate={still || worst === "ok" ? {} : { opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative flex items-center gap-4">
          <span className="w-14 h-14 rounded-2xl grid place-items-center shrink-0"
                style={{ background: `${verdictColor}18`, border: `1px solid ${verdictColor}55` }}>
            <Verdict className="w-7 h-7" style={{ color: verdictColor }} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold tracking-tight" style={{ color: verdictColor }}>{verdictLine}</h2>
            <p className="text-xs text-muted-foreground">
              {ranAt ? `Checked ${ranAt.toLocaleTimeString()}` : "Checking…"}
              {staleFeeds > 0 && ` · ${staleFeeds} cached ${staleFeeds === 1 ? "feed has" : "feeds have"} not refreshed in a day`}
            </p>
          </div>
          <button onClick={() => void run()} disabled={running}
            className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${running && !still ? "animate-spin" : ""}`} /> Re-check
          </button>
        </div>
      </div>

      {/* counts */}
      {countsRefused && (
        <p className="text-[11px] px-3 py-2 rounded-lg" style={{ background: "rgba(226,55,60,0.1)", color: "#f0a2a5" }}>
          System-wide counts were refused — these numbers need an admin session. Showing “—” rather than zero,
          because zero here would read as an empty install.
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Count icon={Users2} label="Members" value={counts?.members} />
        <Count icon={Bell} label="Notifications sent" value={counts?.notifications} />
        <Count icon={Database} label="Cached feeds" value={counts?.cachedFeeds} />
        <Count icon={Radio} label="Push subscribers" value={counts?.pushSubscriptions} />
        <Count icon={EyeIcon} label="Module view rows" value={counts?.moduleViews} />
        <Count icon={ScrollText} label="Audit entries" value={counts?.auditRows} />
      </div>

      {/* latency bars — the length is the reading */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Response times</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">bar full at {SLOW_CEILING} ms</span>
        </header>
        <div className="p-4 space-y-3">
          {checks.length === 0 && running && (
            <p className="text-xs text-muted-foreground">Measuring…</p>
          )}
          {checks.map((c, i) => {
            const color = STATUS_COLOR[c.status];
            const pct = c.ms == null ? 100 : Math.min(100, (c.ms / SLOW_CEILING) * 100);
            return (
              <div key={c.id}>
                <div className="flex items-baseline gap-2 text-xs mb-1">
                  <span className="font-medium truncate">{c.label}</span>
                  <span className="ml-auto tabular-nums shrink-0" style={{ color }}>
                    {c.status === "down" ? STATUS_LABEL.down : `${c.ms} ms`}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    initial={still ? false : { width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.55, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                    style={{ background: color }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{c.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* feed freshness strip */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Server className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Cached feed freshness</h3>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {ages ? `${ages.length} most recent` : "unavailable"}
          </span>
        </header>
        {ages === null ? (
          <p className="p-4 text-xs" style={{ color: "#f0a2a5" }}>
            Could not read the cache table{ageErr ? ` — ${ageErr}` : ""}. This is a permission problem,
            not an empty cache.
          </p>
        ) : ages.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">Nothing cached yet.</p>
        ) : (
          <div className="p-4">
            <div className="flex flex-wrap gap-1">
              {ages.map((a, i) => (
                <motion.span
                  key={a.key}
                  title={`${a.key} — ${fmtAge(a.ageMinutes)} old`}
                  initial={still ? false : { opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.012, 0.5), duration: 0.28 }}
                  className="w-4 h-4 rounded-[3px]"
                  style={{ background: STATUS_COLOR[a.status], opacity: a.status === "ok" ? 0.85 : 1 }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-muted-foreground">
              <Legend color={STATUS_COLOR.ok} label="Under 6 hours" />
              <Legend color={STATUS_COLOR.slow} label="6–24 hours" />
              <Legend color={STATUS_COLOR.stale} label="Over a day — check the source" />
            </div>
            {ages.filter((a) => a.status !== "ok").length > 0 && (
              <ul className="mt-3 space-y-1">
                {ages.filter((a) => a.status !== "ok").slice(0, 8).map((a: CacheAge) => (
                  <li key={a.key} className="text-[11px] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[a.status] }} />
                    <code className="font-mono text-muted-foreground truncate">{a.key}</code>
                    <span className="ml-auto tabular-nums shrink-0" style={{ color: STATUS_COLOR[a.status] }}>
                      {fmtAge(a.ageMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground leading-relaxed flex items-start gap-1.5">
        <Activity className="w-3 h-3 mt-0.5 shrink-0" style={{ color: ROYAL.dim }} />
        Every reading above is taken when this tab loads or you press Re-check — nothing is cached or assumed.
        Upstream feeds are probed through the app's own weather function, since most of those origins send no
        CORS headers and a direct browser fetch would report a false outage.
      </p>
    </div>
  );
}

function fmtAge(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: color }} /> {label}
    </span>
  );
}

function Count({ icon: Icon, label, value }: { icon: typeof Users2; label: string; value?: number }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-xl font-bold tabular-nums">
        {value === undefined ? <span className="text-muted-foreground">—</span> : value.toLocaleString()}
      </div>
    </div>
  );
}

export default AdminHealthTab;
