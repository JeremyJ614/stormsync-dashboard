import { useCallback, useEffect, useMemo, useState } from "react";
import { Dices, Loader2, Plus, Trash2, Users } from "lucide-react";
import {
  DRAWS, drawMeta, simulateRaffle, ticketOverview,
  type DrawType, type SimEntrant, type SimResult, type TicketHolder,
} from "../../lib/raffles";
import { ROYAL, HEADING } from "../../lib/royal";

/**
 * A draw you can run as many times as you like, that changes nothing.
 *
 * The real draw hands a real prize to a real member and cannot be taken back,
 * which makes it a terrible thing to learn on. This runs the identical
 * weighting — every ticket one entry, every prize weighted by its own number —
 * against an invented field, so you can see what a change to the odds or to
 * somebody's ticket count actually does before it matters.
 *
 * Two modes fall out of one control. One run answers "who won this time"; a
 * few thousand answer "are the odds what the catalogue claims", which is the
 * only way to check a weight is right — a single draw of a 1.3% prize tells you
 * nothing whichever way it lands.
 */
export function AdminTestRaffle() {
  const [drawType, setDrawType] = useState<DrawType>("monthly");
  const [entrants, setEntrants] = useState<SimEntrant[]>([
    { name: "Ann", tickets: 1 },
    { name: "Bob", tickets: 3 },
    { name: "Cass", tickets: 2 },
  ]);
  const [runs, setRuns] = useState(1);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<SimResult | null>(null);
  const [holders, setHolders] = useState<TicketHolder[] | null>(null);

  useEffect(() => { void ticketOverview().then(setHolders).catch(() => setHolders([])); }, []);

  const total = useMemo(
    () => entrants.reduce((n, e) => n + (Number.isFinite(e.tickets) ? Math.max(0, e.tickets) : 0), 0),
    [entrants],
  );

  const patch = useCallback((i: number, next: Partial<SimEntrant>) => {
    setEntrants((list) => list.map((e, j) => (j === i ? { ...e, ...next } : e)));
  }, []);

  /** Load the people who actually hold tickets, so a rehearsal can use real numbers. */
  const useRealField = useCallback(() => {
    const rows = (holders ?? [])
      .map((h) => ({ name: h.name || h.email || "Member", tickets: h[drawType] ?? 0 }))
      .filter((e) => e.tickets > 0);
    if (rows.length === 0) { setRes(null); return; }
    setEntrants(rows);
  }, [holders, drawType]);

  async function run(n: number) {
    setBusy(true); setRuns(n);
    setRes(await simulateRaffle(drawType, entrants.filter((e) => e.tickets > 0), n));
    setBusy(false);
  }

  const field = "bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary/40";

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Dices className="w-4 h-4" style={{ color: ROYAL.gold }} /> Test draw
        </h3>
        <p className="text-xs text-muted-foreground">
          Nothing here touches an account. Same weighting as the real draw — every ticket is one
          entry, every prize weighted by its own number — against whoever you put in the field
          below.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {DRAWS.map((d) => (
            <button key={d.key} onClick={() => { setDrawType(d.key); setRes(null); }}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold"
              style={{
                background: drawType === d.key ? `${d.tint}22` : "rgba(255,255,255,0.03)",
                border: `1px solid ${drawType === d.key ? d.tint : ROYAL.hairline}`,
                color: drawType === d.key ? d.tint : ROYAL.dim,
              }}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── the field ───────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[12px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: ROYAL.dim, fontFamily: HEADING }}>
            Who is in it
          </h4>
          <button onClick={useRealField}
                  className="text-[11px] flex items-center gap-1" style={{ color: ROYAL.gold }}>
            <Users className="w-3 h-3" /> Load the real {drawMeta(drawType).label.toLowerCase()} field
          </button>
        </div>

        <div className="space-y-1.5">
          {entrants.map((e, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={e.name} onChange={(ev) => patch(i, { name: ev.target.value })}
                     placeholder="Name" className={`${field} flex-1 min-w-0`} />
              <input type="number" min={0} value={e.tickets}
                     onChange={(ev) => patch(i, { tickets: Math.max(0, Number(ev.target.value) || 0) })}
                     className={`${field} w-20 tabular-nums`} />
              <span className="text-[10px] w-12 text-right tabular-nums" style={{ color: ROYAL.dim }}>
                {total > 0 ? `${((e.tickets / total) * 100).toFixed(1)}%` : "—"}
              </span>
              <button onClick={() => setEntrants((l) => l.filter((_, j) => j !== i))}
                      style={{ color: ROYAL.dim }} aria-label={`Remove ${e.name}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button onClick={() => setEntrants((l) => [...l, { name: `Member ${l.length + 1}`, tickets: 1 }])}
                  className="text-[11px] flex items-center gap-1" style={{ color: ROYAL.gold }}>
            <Plus className="w-3 h-3" /> Add somebody
          </button>
          <span className="ml-auto text-[11px]" style={{ color: ROYAL.dim }}>
            {entrants.length} entrants · {total} tickets
          </span>
        </div>
      </div>

      {/* ── running it ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {([1, 100, 5000] as const).map((n) => (
          <button key={n} onClick={() => void run(n)} disabled={busy || total === 0}
            className="px-3.5 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5"
            style={{ background: "rgba(217,183,117,0.14)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
            {busy && runs === n ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Dices className="w-3.5 h-3.5" />}
            {n === 1 ? "Draw once" : `Run ${n.toLocaleString()} draws`}
          </button>
        ))}
      </div>

      {res && !res.ok && (
        <p className="text-[12px]" style={{ color: "#f87171" }}>{res.error}</p>
      )}

      {res?.ok && (
        <div className="space-y-3">
          {res.runs === 1 && res.first && (
            <div className="rounded-xl p-4 text-center"
                 style={{ border: `1px solid ${ROYAL.goldSoft}`, background: "rgba(217,183,117,0.07)" }}>
              <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: ROYAL.dim }}>
                Would have won
              </div>
              <div className="text-[19px] font-bold mt-1" style={{ color: ROYAL.gold, fontFamily: HEADING }}>
                {res.first.winner}
              </div>
              <div className="text-[13px] mt-0.5" style={{ color: ROYAL.text }}>{res.first.prize}</div>
            </div>
          )}

          {res.runs > 1 && (
            <div className="grid md:grid-cols-2 gap-3">
              <Tally title="Winners" rows={res.winners} runs={res.runs} tint={drawMeta(drawType).tint} />
              <Tally title="Prizes" rows={res.prizes} runs={res.runs} tint={ROYAL.gold} limit={25} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A share-of-outcomes table. Bars, because a column of percentages is unreadable at 25 rows. */
function Tally({
  title, rows, runs, tint, limit = 12,
}: { title: string; rows: Record<string, number>; runs: number; tint: string; limit?: number }) {
  const sorted = Object.entries(rows).sort((a, b) => b[1] - a[1]).slice(0, limit);
  const top = sorted[0]?.[1] ?? 1;
  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-1.5">
      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: ROYAL.dim }}>
        {title} · {runs.toLocaleString()} draws
      </div>
      {sorted.map(([k, n]) => (
        <div key={k} className="space-y-0.5">
          <div className="flex items-baseline gap-2 text-[11.5px]">
            <span className="flex-1 min-w-0 truncate" style={{ color: ROYAL.text }}>{k}</span>
            <span className="tabular-nums" style={{ color: ROYAL.dim }}>
              {((n / runs) * 100).toFixed(2)}%
            </span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div className="h-full rounded-full" style={{ width: `${(n / top) * 100}%`, background: tint }} />
          </div>
        </div>
      ))}
    </div>
  );
}
