/**
 * Module usage analytics.
 *
 * The chart that matters here is not the top ten — you already know what the
 * top ten are. It is the tail: which modules nobody opens. That list gets its
 * own section rather than being left as an absence at the bottom of a bar
 * chart, because an absence is the one thing a ranking structurally cannot
 * show.
 *
 * Counting is one increment per member per module per day, first view only per
 * session, so somebody flipping between two tabs does not out-rank somebody who
 * sat and read something.
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Users2, Eye, Loader2, MoonStar, AlertTriangle } from "lucide-react";
import { moduleUsage, usageByDay, unusedModules, type ModuleUsage, type UsageDay } from "../lib/moduleUsage";
import { ROYAL, prefersReducedMotion } from "../lib/royal";

const WINDOWS = [7, 30, 90] as const;

export function AdminUsageTab() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [usage, setUsage] = useState<ModuleUsage[]>([]);
  const [trend, setTrend] = useState<UsageDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const still = prefersReducedMotion();

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [u, t] = await Promise.all([moduleUsage(days), usageByDay(days)]);
      setUsage(u); setTrend(t);
    } catch {
      setErr("Could not load usage. (Admin only.)");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const totalViews = usage.reduce((a, u) => a + u.views, 0);
  const peakViews = Math.max(1, ...usage.map((u) => u.views));
  const peakDay = Math.max(1, ...trend.map((d) => d.views));
  const dark = unusedModules(usage);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: "rgba(255,255,255,0.04)" }}>
          {WINDOWS.map((w) => (
            <button key={w} onClick={() => setDays(w)}
              className="px-3 py-1 rounded-md text-xs font-semibold transition-colors"
              style={days === w
                ? { background: `${ROYAL.gold}22`, color: ROYAL.gold }
                : { color: ROYAL.dim }}>
              {w} days
            </button>
          ))}
        </div>
        {!loading && (
          <p className="text-xs text-muted-foreground ml-auto tabular-nums">
            {totalViews.toLocaleString()} {totalViews === 1 ? "view" : "views"} across {usage.length} modules
          </p>
        )}
      </div>

      {err && (
        <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {err}
        </div>
      )}

      {loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Counting…
        </div>
      ) : usage.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <BarChart3 className="w-8 h-8 mx-auto mb-2" style={{ color: ROYAL.dim }} />
          <p className="text-sm text-muted-foreground">
            No views recorded yet. Counting starts from this build — the numbers fill in as members use the app.
          </p>
        </div>
      ) : (
        <>
          {/* daily trend */}
          {trend.length > 1 && (
            <section className="bg-card border border-border rounded-xl overflow-hidden">
              <header className="px-4 py-3 border-b border-border flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold">Daily activity</h3>
              </header>
              <div className="p-4">
                <div className="flex items-end gap-[3px] h-28">
                  {trend.map((d, i) => (
                    <motion.div
                      key={d.day}
                      title={`${d.day} — ${d.views} views, ${d.uniques} members`}
                      className="flex-1 rounded-t-[3px] min-w-[3px]"
                      initial={still ? false : { height: 0 }}
                      animate={{ height: `${Math.max(3, (d.views / peakDay) * 100)}%` }}
                      transition={{ duration: 0.5, delay: Math.min(i * 0.012, 0.4), ease: [0.22, 1, 0.36, 1] }}
                      style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, ${ROYAL.gold}55)` }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                  <span>{new Date(trend[0].day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  <span>{peakDay} peak</span>
                  <span>{new Date(trend[trend.length - 1].day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>
              </div>
            </section>
          )}

          {/* per-module */}
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <header className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">By module</h3>
              <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                <Users2 className="w-3 h-3" /> distinct members
              </span>
            </header>
            <div className="p-4 space-y-2.5">
              {usage.map((u, i) => (
                <div key={u.moduleId}>
                  <div className="flex items-baseline gap-2 text-xs mb-1">
                    <span className="font-medium truncate">{u.label}</span>
                    <code className="text-[10px] text-muted-foreground/70 truncate hidden sm:inline">{u.moduleId}</code>
                    <span className="ml-auto tabular-nums shrink-0" style={{ color: ROYAL.gold }}>{u.views}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0 w-10 text-right">{u.uniques}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <motion.div
                      className="h-full rounded-full"
                      initial={still ? false : { width: 0 }}
                      animate={{ width: `${(u.views / peakViews) * 100}%` }}
                      transition={{ duration: 0.55, delay: Math.min(i * 0.02, 0.5), ease: [0.22, 1, 0.36, 1] }}
                      style={{ background: ROYAL.gold }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* the tail */}
      {!loading && dark.length > 0 && (
        <section className="bg-card border rounded-xl overflow-hidden" style={{ borderColor: `${ROYAL.iris}30` }}>
          <header className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: `${ROYAL.iris}22` }}>
            <MoonStar className="w-4 h-4" style={{ color: ROYAL.iris }} />
            <h3 className="text-sm font-semibold">Nobody opened these</h3>
            <span className="ml-auto text-[11px] tabular-nums" style={{ color: ROYAL.iris }}>{dark.length}</span>
          </header>
          <div className="p-4">
            <p className="text-xs text-muted-foreground mb-2.5">
              No recorded views in the last {days} days. Some of these are simply gated behind a tier nobody is
              on yet — but a module that is available and still dark is the clearest signal you have that it
              needs a better name, a better home in the menu, or removing.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {dark.map((m) => (
                <span key={m.id} className="px-2 py-1 rounded-md text-[11px]"
                      style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }}>
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        One view is counted per member, per module, per day — and only on the first visit in a session, so
        tab-flipping does not inflate a module's standing. Views recorded while an admin is using
        “view as” are not counted against the member being viewed.
      </p>
    </div>
  );
}

export default AdminUsageTab;
