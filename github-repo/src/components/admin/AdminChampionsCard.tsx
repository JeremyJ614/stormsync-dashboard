import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Loader2, Pencil, Sparkles, Trash2, Trophy, X } from "lucide-react";
import {
  listWinners, standingsFor, setWinner, clearWinner, sealDue,
  periodLabel, periodStartOf, type Winner, type WinnerPeriod,
} from "../../lib/leaderboardWinners";
import { listUsers } from "../../lib/userAdmin";
import { audit } from "../../lib/adminAudit";
import type { User } from "../../hooks/useAuth";
import { ROYAL, HEADING } from "../../lib/royal";

/**
 * Champions, and the ability to overrule them.
 *
 * Periods seal themselves the day after they close, from the real standings, so
 * this is mostly a list to look at. It exists for the cases arithmetic cannot
 * settle: crediting a winner from before the app kept score, correcting a month
 * where somebody's points were logged wrong, or handing the title to the
 * runner-up because the leader was an admin testing the game.
 *
 * A manual crowning is marked as one. An override that looked identical to a
 * computed result would make the whole record untrustworthy.
 */
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function AdminChampionsCard() {
  const [winners, setWinners] = useState<Winner[] | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ period: WinnerPeriod; start: string } | null>(null);

  const load = useCallback(() => {
    void listWinners(36).then(setWinners).catch(() => setWinners([]));
  }, []);
  useEffect(() => {
    load();
    void listUsers().then(setMembers).catch(() => setMembers([]));
  }, [load]);

  async function seal() {
    setBusy("seal"); setNote(null);
    const n = await sealDue();
    setBusy(null);
    setNote(n === 0 ? "Nothing was waiting to be sealed." : `Sealed ${n} period${n === 1 ? "" : "s"}.`);
    load();
  }

  async function remove(w: Winner) {
    if (!confirm(`Remove ${w.userName} as ${periodLabel(w.period, w.periodStart)} champion?`)) return;
    setBusy(w.id);
    const r = await clearWinner(w.period, w.periodStart);
    setBusy(null);
    if (r.ok) {
      await audit("settings.change", { type: "leaderboard", id: w.id, label: periodLabel(w.period, w.periodStart) },
        { removed: w.userName });
      load();
    } else setNote(r.error ?? "Could not remove that.");
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Trophy className="w-4 h-4" style={{ color: ROYAL.gold }} /> Champions
      </h3>
      <p className="text-xs text-muted-foreground">
        A month or a year seals itself the day after it ends, from the standings. Change one here when the
        arithmetic is not the answer — a period from before the app kept score, points logged wrong, or a
        leader who was you testing the game.
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={seal} disabled={busy === "seal"}
          className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs font-medium hover:border-primary/40 disabled:opacity-50 flex items-center gap-1.5">
          {busy === "seal" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Seal anything outstanding
        </button>
        <button onClick={() => setEditing({ period: "month", start: periodStartOf("month", new Date()) })}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
          style={{ background: "rgba(217,183,117,0.12)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
          <Crown className="w-3.5 h-3.5" /> Crown someone
        </button>
        {note && <span className="text-[11px] self-center" style={{ color: ROYAL.dim }}>{note}</span>}
      </div>

      {editing && (
        <CrownEditor
          members={members}
          initial={editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); load(); }}
        />
      )}

      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${ROYAL.hairline}` }}>
        {winners === null ? (
          <div className="px-3 py-4 text-[11.5px]" style={{ color: ROYAL.dim }}>Loading…</div>
        ) : winners.length === 0 ? (
          <div className="px-3 py-4 text-[11.5px]" style={{ color: ROYAL.dim }}>
            No champion has been recorded yet.
          </div>
        ) : winners.map((w) => (
          <div key={w.id} className="px-3 py-2 flex items-center gap-2 text-[11.5px]"
               style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
            <Crown className="w-3.5 h-3.5 shrink-0" style={{ color: w.period === "year" ? ROYAL.gold : "#c084fc" }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate" style={{ color: ROYAL.text }}>
                {w.userName}
                {w.manual && <span style={{ color: ROYAL.dim }}> · set by hand</span>}
              </span>
              <span className="block" style={{ color: ROYAL.dim }}>
                {periodLabel(w.period, w.periodStart)} · {w.points.toLocaleString()} pts
                {w.note ? ` · ${w.note}` : ""}
              </span>
            </span>
            <button onClick={() => setEditing({ period: w.period, start: w.periodStart })}
              className="shrink-0 w-7 h-7 grid place-items-center rounded-md"
              style={{ border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }} title="Change">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => remove(w)} disabled={busy === w.id}
              className="shrink-0 w-7 h-7 grid place-items-center rounded-md disabled:opacity-50"
              style={{ border: `1px solid ${ROYAL.hairline}`, color: ROYAL.dim }} title="Remove">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pick a period, see who actually won it, and choose who gets the title. */
function CrownEditor({
  members, initial, onClose, onDone,
}: {
  members: User[];
  initial: { period: WinnerPeriod; start: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const now = new Date();
  const [period, setPeriod] = useState<WinnerPeriod>(initial.period);
  const [year, setYear] = useState(Number(initial.start.slice(0, 4)));
  const [month, setMonth] = useState(Number(initial.start.slice(5, 7)));
  const [userId, setUserId] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [standings, setStandings] = useState<{ userId: string; userName: string; points: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = period === "year"
    ? `${year}-01-01`
    : `${year}-${String(month).padStart(2, "0")}-01`;

  useEffect(() => {
    setStandings(null);
    void standingsFor(period, start).then(setStandings).catch(() => setStandings([]));
  }, [period, start]);

  const years = useMemo(() => {
    const y = now.getUTCFullYear();
    return [y, y - 1, y - 2, y - 3, y - 4];
  }, [now]);

  const sorted = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );

  async function save() {
    if (!userId) { setErr("Pick a member."); return; }
    setBusy(true); setErr(null);
    const r = await setWinner(period, start, userId, points.trim() ? Number(points) : undefined, reason);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Could not save that."); return; }
    await audit("settings.change", { type: "leaderboard", id: start, label: periodLabel(period, start) },
      { crowned: members.find((m) => m.id === userId)?.name, points, reason });
    onDone();
  }

  const field = "w-full bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary/40";

  return (
    <div className="rounded-lg p-3 space-y-2.5" style={{ border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(217,183,117,0.05)" }}>
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold" style={{ color: ROYAL.gold, fontFamily: HEADING }}>
          {periodLabel(period, start)}
        </span>
        <button onClick={onClose} className="ml-auto" style={{ color: ROYAL.dim }}><X className="w-3.5 h-3.5" /></button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <select value={period} onChange={(e) => setPeriod(e.target.value as WinnerPeriod)} className={field}>
          <option value="month">Monthly</option>
          <option value="year">Yearly</option>
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} disabled={period === "year"} className={`${field} disabled:opacity-40`}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={field}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* What actually happened, so an override is a decision rather than a guess. */}
      <div className="rounded-md px-2.5 py-2" style={{ border: `1px solid ${ROYAL.hairline}` }}>
        <div className="text-[9.5px] uppercase tracking-[0.18em] mb-1" style={{ color: ROYAL.dim }}>
          Actual standings
        </div>
        {standings === null ? (
          <div className="text-[11px]" style={{ color: ROYAL.dim }}>Checking…</div>
        ) : standings.length === 0 ? (
          <div className="text-[11px]" style={{ color: ROYAL.dim }}>Nobody scored in this period.</div>
        ) : (
          <div className="space-y-0.5">
            {standings.slice(0, 3).map((s, i) => (
              <button key={s.userId} onClick={() => { setUserId(s.userId); setPoints(String(s.points)); }}
                className="w-full flex items-center gap-2 text-[11.5px] text-left">
                <span style={{ color: i === 0 ? ROYAL.gold : ROYAL.dim, width: 14 }}>{i + 1}.</span>
                <span className="flex-1 truncate" style={{ color: userId === s.userId ? ROYAL.gold : ROYAL.text }}>{s.userName}</span>
                <span style={{ color: ROYAL.dim }}>{s.points.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <select value={userId} onChange={(e) => setUserId(e.target.value)} className={field}>
        <option value="">Choose the champion…</option>
        {sorted.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>

      <div className="grid grid-cols-2 gap-2">
        <input value={points} onChange={(e) => setPoints(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="Points (blank = what they earned)" className={field} inputMode="numeric" />
        <input value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Note (optional)" className={field} />
      </div>

      {err && <p className="text-[11px] text-red-400">{err}</p>}

      <button onClick={save} disabled={busy}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
        style={{ background: "rgba(217,183,117,0.15)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
        Crown them
      </button>
    </div>
  );
}

export default AdminChampionsCard;
