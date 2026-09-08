import { useCallback, useEffect, useMemo, useState } from "react";
import { useSticky } from "../../lib/stickyState";
import {
  Check, Dices, Gift, Loader2, RefreshCw, Search, Square, SquareCheck, Ticket, Trophy,
} from "lucide-react";
import {
  listPrizes, listDraws, ticketOverview, grantTickets,
  syncSubscriptionTickets, prizeOdds, setPrizeWeight, DRAWS, drawMeta, periodLabel,
  type DrawType, type RafflePrize, type RaffleDraw, type TicketHolder, type PrizeOdds,
} from "../../lib/raffles";
import { RaffleMachine } from "./RaffleMachine";
import { AdminTestRaffle } from "./AdminTestRaffle";
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
  const [tab, setTab] = useSticky<"tickets" | "prizes" | "draws" | "test">(
    "admin.raffles.tab", "tickets",
    (v): v is "tickets" | "prizes" | "draws" | "test" =>
      v === "tickets" || v === "prizes" || v === "draws" || v === "test",
  );
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
        {([["tickets", "Who has tickets"], ["prizes", "Prizes"],
           ["draws", "Draws"], ["test", "Test Raffle"]] as const).map(([k, l]) => (
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
      {tab === "test" && <AdminTestRaffle />}
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

/**
 * Prizes, their odds, and running a draw.
 *
 * The prize is drawn as well as the winner. Choosing one first made the
 * interesting half of a raffle a decision the owner had already taken, so the
 * button is per draw type now and says so — the drum shows "?" until the server
 * comes back with what came out.
 *
 * Each prize carries a weight, and the odds beside it are the real ones: they
 * come from `raffle_prize_odds`, the same function the draw uses, rather than
 * from a second calculation here that could drift. Weight is a relative number
 * rather than a percentage because percentages must sum to 100, and adding one
 * prize should not mean re-balancing twenty rows.
 */
function PrizesPane({
  prizes, holders, onDrawn,
}: { prizes: RafflePrize[]; holders: TicketHolder[] | null; onDrawn: () => void }) {
  const [drawType, setDrawType] = useState<DrawType>("monthly");
  const [result, setResult] = useState<string | null>(null);
  // Open the drum for this draw type. The machine owns the draw — including
  // which prize — from here.
  const [machine, setMachine] = useState<DrawType | null>(null);
  const [odds, setOdds] = useState<PrizeOdds[]>([]);
  const [busyWeight, setBusyWeight] = useState<string | null>(null);

  const loadOdds = useCallback(() => { void prizeOdds(drawType).then(setOdds); }, [drawType]);
  useEffect(() => { loadOdds(); }, [loadOdds]);
  const oddsFor = useMemo(() => new Map(odds.map((o) => [o.id, o])), [odds]);

  async function saveWeight(id: string, weight: number) {
    setBusyWeight(id);
    const r = await setPrizeWeight(id, weight);
    setBusyWeight(null);
    if (!r.ok) { setResult(r.error ?? "Could not save that chance."); return; }
    loadOdds();
  }

  const list = useMemo(
    () => prizes.filter((p) => p.drawType === drawType).sort((a, b) => b.rank - a.rank),
    [prizes, drawType]);

  const entrants = useMemo(() => {
    const h = holders ?? [];
    const n = h.filter((x) => (x as unknown as Record<string, number>)[drawType] > 0).length;
    const t = h.reduce((s, x) => s + ((x as unknown as Record<string, number>)[drawType] || 0), 0);
    return { n, t };
  }, [holders, drawType]);

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

      {/* One button. The prize is drawn too — that is the whole change. */}
      <button
        onClick={() => { setResult(null); setMachine(drawType); }}
        disabled={entrants.t === 0}
        className="w-full px-3 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-30"
        style={{ background: "rgba(217,183,117,0.14)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}
      >
        <Dices className="w-4 h-4" />
        Draw the {drawMeta(drawType).label.toLowerCase()} raffle
      </button>
      <p className="text-[11px] -mt-1" style={{ color: ROYAL.dim }}>
        Both halves are random: the prize is drawn from the list below by its chance, then the winner is drawn from
        the tickets. Nobody knows what is coming out — you included.
      </p>

      <div className="flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.2em]"
           style={{ color: ROYAL.dim }}>
        <span>Prize</span>
        <span>Chance · weight</span>
      </div>

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
            <WeightField
              value={p.weight}
              odds={oddsFor.get(p.id)?.odds ?? 0}
              busy={busyWeight === p.id}
              onCommit={(w) => void saveWeight(p.id, w)}
            />
          </div>
        ))}
      </div>

      <p className="text-[11px] px-1" style={{ color: ROYAL.dim }}>
        The percentage is this prize's real chance of being the one drawn, computed from every active prize's weight
        in this draw. The box next to it is the weight — a relative number, so raising one prize lowers the rest
        without you having to touch them. Set a weight to 0 to keep a prize in the list but never draw it.
      </p>

      {machine && (
        <RaffleMachine
          drawType={machine}
          holders={holders ?? []}
          onClose={() => setMachine(null)}
          onDrawn={async (drawn) => {
            await audit("settings.change",
              { type: "raffle", id: drawn?.id ?? machine, label: drawn?.prizeLabel ?? "random prize" },
              { drawType: machine });
            setResult(drawn
              ? `Drawn — "${drawn.prizeLabel}" to ${drawn.winnerName}. The Draws tab has the record.`
              : "Drawn. The Draws tab has the record.");
            onDrawn();
          }}
        />
      )}
    </div>
  );
}

/**
 * One prize's chance of coming up.
 *
 * Shows the odds it actually has and takes the weight that produces them. Two
 * numbers rather than one because they answer different questions: the odds are
 * what you want to know, the weight is what you can change, and conflating them
 * would mean every edit re-scaling every other prize.
 */
function WeightField({
  value, odds, busy, onCommit,
}: { value: number; odds: number; busy: boolean; onCommit: (w: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <span className="shrink-0 flex items-center gap-1.5">
      <span className="text-right tabular-nums text-[11px] w-12" style={{ color: odds > 0 ? ROYAL.gold : ROYAL.dim }}>
        {odds.toFixed(2)}%
      </span>
      <input
        type="number" min={0} step="0.05" value={draft} disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (Number.isFinite(n) && n >= 0 && n !== value) onCommit(n);
          else setDraft(String(value));
        }}
        aria-label="Chance weight"
        className="w-16 rounded-lg px-2 py-1 text-[11px] tabular-nums outline-none disabled:opacity-40"
        style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}
      />
    </span>
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
