/**
 * Audit log.
 *
 * Who did what, to whom, when. The table has no UPDATE or DELETE policy, so
 * this view is genuinely a record rather than a summary someone can tidy — that
 * property is enforced in the database, not here.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ScrollText, Search, Loader2, X, Filter, Clock } from "lucide-react";
import { listAudit, auditActions, ACTION_LABEL, type AuditEntry } from "../lib/adminAudit";
import { ROYAL, prefersReducedMotion } from "../lib/royal";

/** Actions that change what someone can access or is charged get the warm mark. */
const NOTABLE = new Set([
  "user.delete", "user.tier", "user.modules", "user.pin", "user.viewas",
  "billing.prices", "billing.coupon", "points.grant", "points.deduct",
]);

export function AdminAuditTab() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const still = prefersReducedMotion();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listAudit({ action: action || undefined, limit: 300 }));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { auditActions().then(setActions).catch(() => {}); }, []);

  // Filtering by text happens here rather than in the query: the result set is
  // already bounded at 300 rows, and doing it locally keeps typing instant.
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) =>
      (r.actorEmail ?? "").toLowerCase().includes(q) ||
      (r.targetLabel ?? "").toLowerCase().includes(q) ||
      r.action.toLowerCase().includes(q) ||
      (ACTION_LABEL[r.action] ?? "").toLowerCase().includes(q));
  }, [rows, q]);

  const days = useMemo(() => {
    const m = new Map<string, AuditEntry[]>();
    for (const r of shown) {
      const key = new Date(r.createdAt).toDateString();
      const list = m.get(key);
      if (list) list.push(r);
      else m.set(key, [r]);
    }
    return [...m.entries()];
  }, [shown]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search admin, member or action…"
            className="w-full bg-muted/25 border border-border rounded-lg pl-9 pr-8 py-2 text-sm outline-none focus:border-primary/50"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="relative">
          <Filter className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <select value={action} onChange={(e) => setAction(e.target.value)}
            className="bg-muted/25 border border-border rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-primary/50">
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Reading the log…
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <ScrollText className="w-8 h-8 mx-auto mb-2" style={{ color: ROYAL.dim }} />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "Nothing logged yet. Admin actions from here on will appear in this list."
              : `No entries match “${query}”.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {days.map(([day, entries]) => (
            <section key={day}>
              <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> {day}
              </h3>
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                {entries.map((e, i) => {
                  const notable = NOTABLE.has(e.action);
                  return (
                    <motion.div
                      key={e.id}
                      initial={still ? false : { opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.015, 0.3), duration: 0.24 }}
                      className="px-4 py-2.5 flex items-start gap-3 text-xs"
                    >
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                            style={{ background: notable ? ROYAL.gold : ROYAL.hairline }} />
                      <div className="min-w-0 flex-1">
                        <p className="leading-relaxed">
                          <span className="text-muted-foreground">{e.actorEmail ?? "unknown admin"}</span>
                          {" · "}
                          <span style={{ color: notable ? ROYAL.gold : ROYAL.text }}>
                            {ACTION_LABEL[e.action] ?? e.action}
                          </span>
                          {e.targetLabel && <> — <strong className="font-medium">{e.targetLabel}</strong></>}
                        </p>
                        {Object.keys(e.detail).length > 0 && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono break-words">
                            {summarise(e.detail)}
                          </p>
                        )}
                      </div>
                      <time className="tabular-nums text-muted-foreground shrink-0"
                            dateTime={e.createdAt}>
                        {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Showing the most recent {rows.length} {rows.length === 1 ? "entry" : "entries"}.
        The log is append-only — the database grants no permission to edit or delete a row, including to admins.
      </p>
    </div>
  );
}

/** `{ from: 2, to: 4 }` reads better than raw JSON and stays one line. */
function summarise(detail: Record<string, unknown>): string {
  if ("from" in detail && "to" in detail) return `${String(detail.from)} → ${String(detail.to)}`;
  return Object.entries(detail)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("  ·  ");
}

export default AdminAuditTab;
