import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Check, Loader2, Plus, RefreshCw, Trash2, Zap,
} from "lucide-react";
import {
  listPromos, rungsOf, rewardCatalog, applyCatalogToRung, describeEffects,
  saveReferralRungs,
  type Promo, type ReferralRung, type RewardCatalogEntry,
} from "../../lib/promos";
import { ROYAL } from "../../lib/royal";

/**
 * The referral ladder's rewards, swappable.
 *
 * The ladder used to be five hard-coded rungs whose text described a reward a
 * person then had to go and grant. Both halves of that have moved: the database
 * now applies what a rung says, and this screen decides what each rung says.
 *
 * A rung holds a COPY of its reward's effects rather than a pointer into the
 * catalogue. That is the important design decision here and it is deliberate:
 * somebody who earned "50% off and two add-ons" must keep earning that even
 * after the owner rewrites what `combo_serious` means next month. Editing the
 * catalogue changes what is on offer; editing a rung changes what that rung
 * pays. Keeping those separate is the difference between a menu and a promise.
 *
 * Everything is one `promos` row, so a change is one save and the member-facing
 * ladder, the webhook and this screen can never disagree about what is running.
 */
export function AdminRewardsCard() {
  const [promo, setPromo] = useState<Promo | null>(null);
  const [rungs, setRungs] = useState<ReferralRung[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState<number | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const all = await listPromos();
      const p = all.find((x) => x.key === "referral_ladder") ?? null;
      setPromo(p);
      setRungs(rungsOf(p ?? undefined));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the ladder");
    }
    setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const catalog = useMemo(() => rewardCatalog(promo ?? undefined), [promo]);
  const groups = useMemo(() => {
    const m = new Map<string, RewardCatalogEntry[]>();
    for (const e of catalog) {
      const list = m.get(e.group) ?? [];
      list.push(e);
      m.set(e.group, list);
    }
    return [...m.entries()];
  }, [catalog]);

  async function commit(next: ReferralRung[]) {
    if (!promo) return;
    setRungs(next);
    setSaving(true); setErr(null);
    const r = await saveReferralRungs(promo, next);
    setSaving(false);
    if (!r.ok) { setErr(r.error ?? "Could not save"); return; }
    setSaved(true); setTimeout(() => setSaved(false), 1500);
    // Re-read so the ranks the server now holds are the ranks on screen.
    const all = await listPromos();
    const p = all.find((x) => x.key === "referral_ladder") ?? null;
    setPromo(p);
    setRungs(rungsOf(p ?? undefined));
  }

  function pick(index: number, entry: RewardCatalogEntry) {
    const next = rungs.slice();
    next[index] = applyCatalogToRung(next[index], entry);
    setPicking(null);
    void commit(next);
  }

  function move(index: number, by: number) {
    const to = index + by;
    if (to < 0 || to >= rungs.length) return;
    const next = rungs.slice();
    [next[index], next[to]] = [next[to], next[index]];
    void commit(next);
  }

  function remove(index: number) {
    if (rungs.length <= 1) return;
    void commit(rungs.filter((_, i) => i !== index));
  }

  function add() {
    const first = catalog[0];
    const blank: ReferralRung = {
      rank: rungs.length + 1, label: first?.label ?? "New reward",
      percentOff: 0, addons: 0, addonMonths: 2, freeMonths: 0, tier: null,
    };
    void commit([...rungs, first ? applyCatalogToRung(blank, first) : blank]);
  }

  if (busy) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the ladder…
      </div>
    );
  }

  if (!promo) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 text-sm text-muted-foreground">
        The referral programme is not set up on this project yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ color: ROYAL.gold }} /> Referral rewards
          </h3>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          {saved && !saving && <span className="text-[11px] text-green-400">Saved ✓</span>}
          <button onClick={() => void load()} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Reload
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Each rung is what somebody gets for their 1st, 2nd, 3rd… referral that goes on to pay. Past the last
          rung the ladder keeps paying its top rung. Rewards are <strong>granted automatically</strong> the moment
          the payment clears — coupons are minted and the code is sent to them, modules, alert levels, plan tier,
          points and raffle tickets are applied on the spot, and only a reward marked “fulfilled by hand” lands in
          your queue on the Referrals tab. Swapping a rung's reward changes what future referrals pay; anything
          already earned keeps what it was promised.
        </p>

        {err && <div className="text-xs text-destructive">{err}</div>}

        <div className="rounded-lg border border-border/70 divide-y divide-border/60">
          {rungs.map((r, i) => {
            const bits = describeEffects(r.effects);
            return (
              <div key={`${r.rank}-${r.catalog ?? i}`} className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full grid place-items-center shrink-0 text-[11px] font-bold"
                        style={{ background: "rgba(217,183,117,0.14)", color: ROYAL.gold }}>{r.rank}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium truncate">{r.label}</span>
                    <span className="block text-[10.5px] text-muted-foreground truncate">
                      {bits.length ? bits.join(" · ") : "No automatic effects — this one waits for you"}
                    </span>
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                            className="p-1 rounded hover:bg-muted/40 disabled:opacity-30">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === rungs.length - 1} aria-label="Move down"
                            className="p-1 rounded hover:bg-muted/40 disabled:opacity-30">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setPicking(picking === i ? null : i)}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold border"
                            style={{ borderColor: ROYAL.goldSoft, color: ROYAL.gold }}>
                      {picking === i ? "Close" : "Swap"}
                    </button>
                    <button onClick={() => remove(i)} disabled={rungs.length <= 1} aria-label="Remove rung"
                            className="p-1 rounded hover:bg-destructive/20 text-destructive disabled:opacity-30">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {picking === i && (
                  <div className="mt-2.5 rounded-lg border border-border/70 bg-muted/10 p-2.5 space-y-3 max-h-[340px] overflow-y-auto">
                    {groups.map(([group, entries]) => (
                      <div key={group}>
                        <div className="text-[9.5px] uppercase tracking-[0.24em] mb-1.5" style={{ color: ROYAL.gold }}>
                          {group}
                        </div>
                        <div className="grid sm:grid-cols-2 gap-1.5">
                          {entries.map((e) => {
                            const active = r.catalog === e.key;
                            return (
                              <button
                                key={e.key}
                                onClick={() => pick(i, e)}
                                className="text-left rounded-lg px-2.5 py-2 border transition-colors"
                                style={{
                                  background: active ? "rgba(217,183,117,0.10)" : "rgba(255,255,255,0.02)",
                                  borderColor: active ? ROYAL.goldSoft : "rgba(204,204,255,0.09)",
                                }}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className="text-[11.5px] font-medium">{e.label}</span>
                                  {active && <Check className="w-3 h-3 shrink-0" style={{ color: ROYAL.gold }} />}
                                </span>
                                <span className="block text-[10px] text-muted-foreground mt-0.5">
                                  {describeEffects(e.effects).join(" · ") || "no effects"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={add}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                style={{ borderColor: ROYAL.goldSoft, color: ROYAL.gold }}>
          <Plus className="w-3.5 h-3.5" /> Add a rung
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          The catalogue · {catalog.length} rewards
        </h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Every reward here is built from the same handful of effects the database knows how to carry out — money
          off, free months, add-on modules, alert levels, plan tier, loyalty points, raffle tickets and badges — so
          a new reward is a new combination rather than new code. They live in the promotion's own configuration,
          which means you can edit or extend them without a deploy.
        </p>
      </div>
    </div>
  );
}
