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
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Users2, Eye, Loader2, MoonStar, AlertTriangle, ChevronRight } from "lucide-react";
import {
  moduleUsage, usageByDay, unusedModules, moduleViewers,
  type ModuleUsage, type UsageDay, type ModuleViewer,
} from "../lib/moduleUsage";
import { ROYAL, EASE, prefersReducedMotion } from "../lib/royal";

const WINDOWS = [7, 30, 90] as const;

export function AdminUsageTab() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [usage, setUsage] = useState<ModuleUsage[]>([]);
  const [trend, setTrend] = useState<UsageDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
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

  useEffect(() => { void load(); setOpen(null); }, [load]);

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
                  {/* The whole row is the control. A bar chart that answers
                      "how many" and refuses "who" is half an answer, and the
                      counters already know — they are keyed by member. */}
                  <button
                    onClick={() => setOpen(open === u.moduleId ? null : u.moduleId)}
                    aria-expanded={open === u.moduleId}
                    className="w-full text-left"
                  >
                    <div className="flex items-baseline gap-2 text-xs mb-1">
                      <ChevronRight
                        className="w-3 h-3 shrink-0 self-center transition-transform"
                        style={{
                          color: open === u.moduleId ? ROYAL.gold : ROYAL.dim,
                          transform: open === u.moduleId ? "rotate(90deg)" : undefined,
                        }}
                      />
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
                  </button>
                  <AnimatePresence initial={false}>
                    {open === u.moduleId && (
                      <motion.div
                        key="who"
                        initial={still ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: still ? 0 : 0.26, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <ViewerList moduleId={u.moduleId} days={days} expected={u.uniques} />
                      </motion.div>
                    )}
                  </AnimatePresence>
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

/**
 * The members behind one module's bar.
 *
 * Loaded when the row is opened rather than up front: pulling the viewer list
 * for all 37 modules to show one of them would be most of a table nobody asked
 * for. `expected` comes from the aggregate that is already on screen, so a
 * mismatch between the two is visible rather than quietly reconciled.
 */
function ViewerList({ moduleId, days, expected }: { moduleId: string; days: number; expected: number }) {
  const [rows, setRows] = useState<ModuleViewer[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setRows(null); setErr("");
    moduleViewers(moduleId, days)
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) setErr("Could not load the members for this module."); });
    return () => { alive = false; };
  }, [moduleId, days]);

  const when = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="mt-2 mb-1 rounded-lg overflow-hidden"
         style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${ROYAL.hairline}` }}>
      {err && <p className="px-3 py-2.5 text-[11px]" style={{ color: "#f3a3a5" }}>{err}</p>}
      {!err && rows === null && (
        <p className="px-3 py-2.5 text-[11px] flex items-center gap-1.5" style={{ color: ROYAL.dim }}>
          <Loader2 className="w-3 h-3 animate-spin" /> Loading members…
        </p>
      )}
      {rows !== null && rows.length === 0 && (
        <p className="px-3 py-2.5 text-[11px]" style={{ color: ROYAL.dim }}>
          Nobody opened this in the last {days} days.
        </p>
      )}
      {rows !== null && rows.length > 0 && (
        <>
          <div className="px-3 py-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]"
               style={{ color: ROYAL.gold, borderBottom: `1px solid ${ROYAL.hairline}` }}>
            <span>Who opened it</span>
            <span className="ml-auto normal-case tracking-normal" style={{ color: ROYAL.dim }}>
              views · days · last
            </span>
          </div>
          {rows.map((r) => (
            <div key={r.userId} className="px-3 py-1.5 flex items-center gap-2 text-[11.5px]"
                 style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
              <span className="truncate" style={{ color: ROYAL.text }}>{r.name || r.email || r.userId.slice(0, 8)}</span>
              {r.name && r.email && (
                <span className="truncate hidden sm:inline text-[10px]" style={{ color: ROYAL.dim }}>{r.email}</span>
              )}
              <span className="ml-auto tabular-nums shrink-0" style={{ color: ROYAL.gold }}>{r.views}</span>
              <span className="tabular-nums shrink-0 w-8 text-right" style={{ color: ROYAL.dim }}>{r.daysSeen}</span>
              <span className="shrink-0 w-16 text-right" style={{ color: ROYAL.dim }}>{when(r.lastSeen)}</span>
            </div>
          ))}
          {rows.length !== expected && (
            <p className="px-3 py-1.5 text-[10.5px]"
               style={{ color: ROYAL.dim, borderTop: `1px solid ${ROYAL.hairline}` }}>
              The bar counts {expected} distinct member{expected === 1 ? "" : "s"} and this list has {rows.length}.
              The difference is accounts deleted since the views were recorded — their counters survive, their
              profiles do not.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default AdminUsageTab;
