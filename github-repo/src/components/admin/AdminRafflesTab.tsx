import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, Dices, Gift, Loader2, RefreshCw, Search, Square, SquareCheck, Ticket, Trophy,
} from "lucide-react";
import {
  listPrizes, listDraws, ticketOverview, grantTickets, runRaffle,
  syncSubscriptionTickets, DRAWS, drawMeta, periodLabel,
  type DrawType, type RafflePrize, type RaffleDraw, type TicketHolder,
} from "../../lib/raffles";
import { audit } from "../../lib/adminAudit";
import { ROYAL, HEADING } from "../../lib/royal";

/**
 * Running the raffles.
 *
 * Three questions, in the order they get asked: who holds tickets, what is up
 * for grabs, and who won. Everything else is a button.
 *
 * The draw itself is weighted by tickets — having more of them is the entire
 * point — and the prize is applied to the winner's account in the same
 * transaction, so there is no gap between "you won" and getting it.
 */
export function AdminRafflesTab() {
  const [tab, setTab] = useState<"tickets" | "prizes" | "draws">("tickets");
  const [holders, setHolders] = useState<TicketHolder[] | null>(null);
  const [prizes, setPrizes] = useState<RafflePrize[]>([]);
  const [draws, setDraws] = useState<RaffleDraw[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    void ticketOverview().then(setHolders).catch(() => setHolders([]));
    void listPrizes().then(setPrizes).catch(() => setPrizes([]));
    void listDraws(40).then(setDraws).catch(() => setDraws([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function sync() {
    setBusy("sync"); setNote(null);
    const r = await syncSubscriptionTickets();
    setBusy(null);
    setNote(r.ok
      ? r.granted === 0 ? "Everyone already has this period's entries." : `Handed out ${r.granted} new grants.`
      : r.error ?? "Could not sync.");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Ticket className="w-4 h-4" style={{ color: ROYAL.gold }} /> Raffles
        </h3>
        <p className="text-xs text-muted-foreground">
          Four draws with separate pools. Monthly and yearly reset with their period and come with a plan —
          Basic one monthly, VIP one monthly and one yearly, Advanced two of each. Random and Blessed
          accumulate until they are spent winning.
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={sync} disabled={busy === "sync"}
            className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs font-medium hover:border-primary/40 disabled:opacity-50 flex items-center gap-1.5">
            {busy === "sync" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Hand out this period's plan entries
          </button>
          {note && <span className="text-[11px] self-center" style={{ color: ROYAL.dim }}>{note}</span>}
        </div>
      </div>

      <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
        {([["tickets", "Who has tickets"], ["prizes", "Prizes"], ["draws", "Draws"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 py-2 rounded-lg text-[12.5px] font-semibold ${
              tab === k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "tickets" && <TicketsPane holders={holders} onChanged={load} />}
      {tab === "prizes" && <PrizesPane prizes={prizes} holders={holders} onDrawn={load} />}
      {tab === "draws" && <DrawsPane draws={draws} />}
    </div>
  );
}

// ── who holds tickets ────────────────────────────────────────────────────────

function TicketsPane({ holders, onChanged }: { holders: TicketHolder[] | null; onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [drawType, setDrawType] = useState<DrawType>("random");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = holders ?? [];
    return q ? all.filter((h) => h.name.toLowerCase().includes(q) || (h.email ?? "").toLowerCase().includes(q)) : all;
  }, [holders, query]);

  async function grant() {
    const ids = [...picked];
    const n = parseInt(qty, 10);
    if (ids.length === 0 || !Number.isFinite(n) || n === 0) return;
    setBusy(true); setNote(null);
    const r = await grantTickets(ids, drawType, n, reason);
    setBusy(false);
    if (!r.ok) { setNote(r.error ?? "Could not grant."); return; }
    await audit("points.grant", { type: "raffle", id: drawType, label: `${ids.length} members` },
      { drawType, qty: n, reason });
    setPicked(new Set());
    setNote(`Gave ${n} ${drawType} ticket${Math.abs(n) === 1 ? "" : "s"} to ${ids.length} member${ids.length === 1 ? "" : "s"}.`);
    onChanged();
  }

  if (holders === null) {
    return <div className="py-10 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3 pb-28">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members"
          className="w-full bg-muted/30 border border-border rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-primary/40" />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-3 py-2 grid grid-cols-[auto_1fr_repeat(4,2.2rem)_2.6rem] gap-1.5 items-center text-[9.5px] uppercase tracking-[0.12em]"
             style={{ color: ROYAL.dim, borderBottom: `1px solid ${ROYAL.hairline}` }}>
          <span className="w-4" />
          <span>Member</span>
          {DRAWS.map((d) => <span key={d.key} className="text-center" style={{ color: d.tint }}>{d.label.slice(0, 3)}</span>)}
          <span className="text-center">All</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto divide-y" style={{ borderColor: ROYAL.hairline }}>
          {rows.map((h) => {
            const on = picked.has(h.userId);
            return (
              <button key={h.userId}
                onClick={() => setPicked((p) => { const n = new Set(p); n.has(h.userId) ? n.delete(h.userId) : n.add(h.userId); return n; })}
                className="w-full px-3 py-2 grid grid-cols-[auto_1fr_repeat(4,2.2rem)_2.6rem] gap-1.5 items-center text-left"
                style={{ background: on ? "rgba(217,183,117,0.08)" : "transparent" }}>
                <span style={{ color: on ? ROYAL.gold : ROYAL.dim }}>
                  {on ? <SquareCheck className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] truncate" style={{ color: ROYAL.text }}>{h.name}</span>
                  <span className="block text-[10px] truncate" style={{ color: ROYAL.dim }}>Tier {h.tier}</span>
                </span>
                {([h.monthly, h.yearly, h.random, h.blessed] as const).map((n, i) => (
                  <span key={i} className="text-center text-[12px] tabular-nums"
                        style={{ color: n > 0 ? DRAWS[i].tint : "rgba(163,163,204,0.35)" }}>
                    {n || "·"}
                  </span>
                ))}
                <span className="text-center text-[12px] font-semibold tabular-nums" style={{ color: ROYAL.text }}>
                  {h.total || "·"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {picked.size > 0 && (
        <div className="fixed left-0 right-0 z-40 px-3 py-2.5"
             style={{ bottom: "env(safe-area-inset-bottom, 0px)", background: "rgba(8,8,18,0.96)",
                      borderTop: `1px solid ${ROYAL.goldSoft}`, backdropFilter: "blur(12px)" }}>
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="flex items-center gap-2 flex-wrap text-[12px]">
              <span className="font-semibold" style={{ color: ROYAL.gold }}>{picked.size} selected</span>
              <button onClick={() => setPicked(new Set())} className="text-[11px]" style={{ color: ROYAL.dim }}>clear</button>
              {note && <span className="ml-auto text-[11px]" style={{ color: ROYAL.dim }}>{note}</span>}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <select value={drawType} onChange={(e) => setDrawType(e.target.value as DrawType)}
                className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs outline-none">
                {DRAWS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d-]/g, ""))} inputMode="numeric"
                className="w-14 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs outline-none text-center" />
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)"
                className="flex-1 min-w-[8rem] bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-xs outline-none" />
              <button onClick={grant} disabled={busy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                style={{ background: "rgba(217,183,117,0.16)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ticket className="w-3.5 h-3.5" />} Give
              </button>
            </div>
            <p className="text-[10px]" style={{ color: ROYAL.dim }}>
              A negative number takes tickets away.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── prizes, and running a draw ───────────────────────────────────────────────

function PrizesPane({
  prizes, holders, onDrawn,
}: { prizes: RafflePrize[]; holders: TicketHolder[] | null; onDrawn: () => void }) {
  const [drawType, setDrawType] = useState<DrawType>("monthly");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const list = useMemo(
    () => prizes.filter((p) => p.drawType === drawType).sort((a, b) => b.rank - a.rank),
    [prizes, drawType]);

  const entrants = useMemo(() => {
    const h = holders ?? [];
    const n = h.filter((x) => (x as unknown as Record<string, number>)[drawType] > 0).length;
    const t = h.reduce((s, x) => s + ((x as unknown as Record<string, number>)[drawType] || 0), 0);
    return { n, t };
  }, [holders, drawType]);

  async function draw(p: RafflePrize) {
    if (!confirm(
      `Draw the ${drawType} raffle for "${p.label}"?\n\n` +
      `${entrants.n} member${entrants.n === 1 ? "" : "s"} hold ${entrants.t} ticket${entrants.t === 1 ? "" : "s"}. ` +
      `The winner is picked weighted by tickets and the prize is applied straight away.`,
    )) return;
    setBusy(p.id); setResult(null);
    const r = await runRaffle(drawType, p.id);
    setBusy(null);
    if (!r.ok) { setResult(r.error ?? "Could not draw."); return; }
    await audit("settings.change", { type: "raffle", id: r.drawId ?? "", label: p.label }, { drawType });
    setResult("Drawn. See the Draws tab for who won.");
    onDrawn();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {DRAWS.map((d) => (
          <button key={d.key} onClick={() => { setDrawType(d.key); setResult(null); }}
            className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
            style={{
              background: drawType === d.key ? `${d.tint}22` : "rgba(255,255,255,0.03)",
              border: `1px solid ${drawType === d.key ? d.tint : ROYAL.hairline}`,
              color: drawType === d.key ? d.tint : ROYAL.dim,
            }}>
            {d.label}
          </button>
        ))}
      </div>

      <p className="text-[11.5px]" style={{ color: ROYAL.dim }}>
        {drawMeta(drawType).blurb} {entrants.n} member{entrants.n === 1 ? "" : "s"} hold{entrants.n === 1 ? "s" : ""}{" "}
        {entrants.t} ticket{entrants.t === 1 ? "" : "s"} right now.
      </p>
      {result && <p className="text-[11.5px]" style={{ color: ROYAL.gold }}>{result}</p>}

      <div className="bg-card border border-border rounded-xl divide-y overflow-hidden" style={{ borderColor: ROYAL.hairline }}>
        {list.map((p) => (
          <div key={p.id} className="px-3 py-2.5 flex items-center gap-3">
            <span className="w-7 text-center text-[13px] font-bold tabular-nums shrink-0"
                  style={{ color: p.rank >= 20 ? ROYAL.gold : ROYAL.dim, fontFamily: HEADING }}>
              {p.rank}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold truncate" style={{ color: ROYAL.text }}>{p.label}</span>
              <span className="block text-[10.5px]" style={{ color: ROYAL.dim }}>
                {p.description}
                {p.kind === "manual" && <span style={{ color: "#e2a06a" }}> · you hand this one over</span>}
              </span>
            </span>
            <button onClick={() => draw(p)} disabled={busy === p.id || entrants.t === 0}
              className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 disabled:opacity-30"
              style={{ background: "rgba(217,183,117,0.12)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
              {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Dices className="w-3.5 h-3.5" />} Draw
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── the record ───────────────────────────────────────────────────────────────

function DrawsPane({ draws }: { draws: RaffleDraw[] }) {
  if (draws.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Gift className="w-8 h-8 mx-auto mb-2" style={{ color: ROYAL.goldSoft }} />
        <p className="text-sm">No draw has been run yet.</p>
      </div>
    );
  }
  return (
    <div className="bg-card border border-border rounded-xl divide-y overflow-hidden" style={{ borderColor: ROYAL.hairline }}>
      {draws.map((d) => (
        <div key={d.id} className="px-3 py-2.5 flex items-start gap-2.5">
          <Trophy className="w-4 h-4 shrink-0 mt-0.5" style={{ color: drawMeta(d.drawType).tint }} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold truncate" style={{ color: ROYAL.text }}>
              {d.winnerName} — {d.prizeLabel}
            </div>
            <div className="text-[10.5px]" style={{ color: ROYAL.dim }}>
              {drawMeta(d.drawType).label} · {periodLabel(d.drawType, d.periodStart)} ·{" "}
              {d.winnerTickets} of {d.ticketsTotal} tickets across {d.entrants} entrant{d.entrants === 1 ? "" : "s"} ·{" "}
              {new Date(d.drawnAt).toLocaleDateString()}
            </div>
            {d.fulfilment && (
              <div className="text-[10.5px] mt-0.5" style={{ color: "#9adcc0" }}>{d.fulfilment}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default AdminRafflesTab;
