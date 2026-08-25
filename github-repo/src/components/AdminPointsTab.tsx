/**
 * Points — grant or deduct for the Forecast Game and Daily Trivia.
 *
 * Adjustments are new ledger rows with source `admin`, never edits to an
 * existing award, so a correction shows in the member's history rather than
 * quietly rewriting it — and a mistaken adjustment can be reversed the same way.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Search, Plus, Minus, Loader2, Check, AlertCircle, History } from "lucide-react";
import { listUsers } from "../lib/userAdmin";
import { adjustPoints, getMemberLedger, getMemberTotals, type LedgerRow } from "../lib/gamePoints";
import type { User } from "../hooks/useAuth";
import { ROYAL, EASE } from "../lib/royal";

const SOURCE_LABEL: Record<string, string> = {
  forecast_game: "Forecast Game",
  trivia: "Daily Trivia",
  admin: "Manual adjustment",
};

export function AdminPointsTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [totals, setTotals] = useState<Map<string, { points: number; entries: number }>>(new Map());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<User | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const [u, t] = await Promise.all([listUsers().catch(() => [] as User[]), getMemberTotals()]);
    setUsers(u); setTotals(t); setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!selected) { setLedger([]); return; }
    void getMemberLedger(selected.id).then(setLedger);
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      : users;
    return [...rows].sort((a, b) => (totals.get(b.id)?.points ?? 0) - (totals.get(a.id)?.points ?? 0));
  }, [users, query, totals]);

  async function apply(sign: 1 | -1) {
    if (!selected) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0) { setMsg({ kind: "err", text: "Enter a whole number of points." }); return; }
    setBusy(true); setMsg(null);
    const r = await adjustPoints({
      userId: selected.id, userName: selected.name,
      points: Math.abs(Math.trunc(n)) * sign,
      reason: reason || (sign > 0 ? "Granted by an administrator" : "Deducted by an administrator"),
    });
    setBusy(false);
    if (!r.ok) { setMsg({ kind: "err", text: r.error ?? "Could not apply that." }); return; }
    setMsg({ kind: "ok", text: `${sign > 0 ? "Granted" : "Deducted"} ${Math.abs(Math.trunc(n))} points for ${selected.name}.` });
    setReason("");
    const [t, l] = await Promise.all([getMemberTotals(), getMemberLedger(selected.id)]);
    setTotals(t); setLedger(l);
  }

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
      {/* Member picker */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-primary" /> Members by points
          </h2>
        </div>
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a member…"
                   className="w-full bg-muted/30 border border-border rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-primary/40" />
          </div>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline" />
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto list-virtual">
            {filtered.map((u) => {
              const t = totals.get(u.id);
              const active = selected?.id === u.id;
              return (
                <button key={u.id} onClick={() => { setSelected(u); setMsg(null); }}
                        className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-border/50 ${active ? "bg-primary/10" : "hover:bg-primary/5"}`}
                        style={{ borderLeft: `2px solid ${active ? ROYAL.gold : "transparent"}` }}>
                  <span className="min-w-0">
                    <span className="block text-[13px] truncate">{u.name}</span>
                    <span className="block text-[10.5px] text-muted-foreground truncate">{u.email}</span>
                  </span>
                  <span className="text-[13px] font-bold tabular-nums shrink-0" style={{ color: ROYAL.gold }}>
                    {(t?.points ?? 0).toLocaleString()}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No members match that.</div>
            )}
          </div>
        )}
      </div>

      {/* Adjust */}
      <div className="space-y-4">
        <AnimatePresence mode="wait">
          {!selected ? (
            <motion.div key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="bg-card border border-border rounded-xl p-10 text-center text-sm text-muted-foreground">
              Pick a member to adjust their points.
            </motion.div>
          ) : (
            <motion.div key={selected.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }}
                        className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                  <div className="min-w-0">
                    <div className="text-lg font-bold truncate">{selected.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{selected.email}</div>
                  </div>
                  <div className="text-right">
                    <motion.div key={totals.get(selected.id)?.points ?? 0}
                                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.28, ease: EASE }}
                                className="text-2xl font-bold tabular-nums" style={{ color: ROYAL.gold }}>
                      {(totals.get(selected.id)?.points ?? 0).toLocaleString()}
                    </motion.div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      career points · {totals.get(selected.id)?.entries ?? 0} entries
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-[110px_1fr] gap-2 mb-3">
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground block mb-1">Points</span>
                    <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                           inputMode="numeric"
                           className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 tabular-nums" />
                  </label>
                  <label className="block">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground block mb-1">Reason (shown in their history)</span>
                    <input value={reason} onChange={(e) => setReason(e.target.value)}
                           placeholder="e.g. Corrected a mis-scored round"
                           className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40" />
                  </label>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => apply(1)} disabled={busy}
                          className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                          style={{ background: "rgba(95,217,168,0.14)", border: "1px solid rgba(95,217,168,0.45)", color: "#5fd9a8" }}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Grant
                  </button>
                  <button onClick={() => apply(-1)} disabled={busy}
                          className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                          style={{ background: "rgba(226,55,60,0.12)", border: "1px solid rgba(226,55,60,0.45)", color: "#f3a3a5" }}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Minus className="w-4 h-4" />} Deduct
                  </button>
                </div>

                <AnimatePresence>
                  {msg && (
                    <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="text-xs mt-3 flex items-center gap-1.5 overflow-hidden"
                              style={{ color: msg.kind === "ok" ? "#5fd9a8" : "#f3a3a5" }}>
                      {msg.kind === "ok" ? <Check className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                      {msg.text}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>

              {/* History */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <History className="w-4 h-4 text-primary" /> Points history
                  </h3>
                </div>
                {ledger.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No points recorded yet.</div>
                ) : (
                  <div className="max-h-[320px] overflow-y-auto list-virtual">
                    {ledger.map((r) => (
                      <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-border/50">
                        <span className="min-w-0">
                          <span className="block text-[12.5px]">{SOURCE_LABEL[r.source] ?? r.source}</span>
                          <span className="block text-[10.5px] text-muted-foreground truncate">
                            {new Date(r.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            {r.reason ? ` · ${r.reason}` : ""}
                          </span>
                        </span>
                        <span className="text-[13px] font-bold tabular-nums shrink-0"
                              style={{ color: r.points >= 0 ? "#5fd9a8" : "#f3a3a5" }}>
                          {r.points > 0 ? "+" : ""}{r.points}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default AdminPointsTab;
