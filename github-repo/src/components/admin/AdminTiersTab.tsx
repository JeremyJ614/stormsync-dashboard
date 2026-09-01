import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Check, Crown, Loader2, Search, Shield, Square, SquareCheck, Star, Users,
} from "lucide-react";
import { listUsers, bulkSetTier } from "../../lib/userAdmin";
import { audit } from "../../lib/adminAudit";
import type { Tier, User } from "../../hooks/useAuth";
import { ROYAL, HEADING } from "../../lib/royal";

/**
 * Moving people between tiers.
 *
 * The member list could already change one person's tier, buried three taps
 * into their card. That is the wrong shape for the job it is actually used for
 * — putting a handful of people on a plan, or taking a lapsed group off one —
 * which is a bulk operation and was thirty round trips of clicking.
 *
 * Select anyone, from anywhere, and move them in one transaction. "Keep their
 * modules" is the switch that matters: a sale should rewrite somebody's module
 * list to the tier they bought, but a correction should not silently discard
 * modules an admin hand-picked.
 */
const TIERS: { tier: Tier; label: string; blurb: string; icon: typeof Crown; color: string }[] = [
  { tier: 4, label: "Advanced", blurb: "Every module, always", icon: Crown,  color: "#d9b775" },
  { tier: 3, label: "VIP",      blurb: "Bundle plus picks",    icon: Star,   color: "#c084fc" },
  { tier: 2, label: "Basic",    blurb: "Bundle plus picks",    icon: Shield, color: "#5fd9a8" },
  { tier: 1, label: "Free",     blurb: "One module, on us",    icon: Users,  color: "#7f9fd8" },
];
const metaFor = (t: Tier) => TIERS.find((x) => x.tier === t) ?? TIERS[3];

export function AdminTiersTab() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [keepModules, setKeepModules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => { void listUsers().then(setUsers).catch(() => setUsers([])); }, []);
  useEffect(() => { load(); }, [load]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = users ?? [];
    if (!q) return all;
    return all.filter((u) =>
      u.name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q));
  }, [users, query]);

  const byTier = useMemo(() => {
    const m = new Map<Tier, User[]>();
    for (const t of TIERS) m.set(t.tier, []);
    for (const u of matches) m.get(u.tier)?.push(u);
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [matches]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setNote(null);
  }

  function toggleTier(tier: Tier) {
    const list = byTier.get(tier) ?? [];
    const allOn = list.length > 0 && list.every((u) => picked.has(u.id));
    setPicked((prev) => {
      const next = new Set(prev);
      for (const u of list) { if (allOn) next.delete(u.id); else next.add(u.id); }
      return next;
    });
    setNote(null);
  }

  async function move(tier: Tier) {
    const ids = [...picked];
    if (ids.length === 0 || busy) return;
    const meta = metaFor(tier);
    const staying = ids.filter((id) => users?.find((u) => u.id === id)?.tier === tier).length;
    const verb = keepModules ? "keeping their current modules" : "resetting their modules to the tier default";
    if (!confirm(
      `Move ${ids.length} member${ids.length === 1 ? "" : "s"} to ${meta.label}, ${verb}?` +
      (staying ? `\n\n${staying} of them ${staying === 1 ? "is" : "are"} already on ${meta.label}.` : ""),
    )) return;

    setBusy(true); setNote(null);
    const r = await bulkSetTier(ids, tier, keepModules);
    if (r.ok) {
      await audit("user.tier.bulk", { type: "user", id: "bulk", label: `${ids.length} members` },
        { to: tier, keepModules, ids });
      setPicked(new Set());
      setNote(`Moved ${r.moved} to ${meta.label}.`);
      load();
    } else {
      setNote(r.error);
    }
    setBusy(false);
  }

  if (users === null) {
    return <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading members…
    </div>;
  }

  return (
    <div className="space-y-3 pb-24">
      <div className="bg-card border border-border rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Crown className="w-4 h-4" style={{ color: ROYAL.gold }} /> Tiers
        </h3>
        <p className="text-xs text-muted-foreground">
          Tick anyone, from any tier, then move them together. Advanced always means every module —
          it does not depend on the list this writes.
        </p>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email"
            className="w-full bg-muted/30 border border-border rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-primary/40"
          />
        </div>
      </div>

      {TIERS.map(({ tier, label, blurb, icon: Icon, color }) => {
        const list = byTier.get(tier) ?? [];
        if (list.length === 0 && query.trim()) return null;
        const allOn = list.length > 0 && list.every((u) => picked.has(u.id));
        return (
          <section key={tier} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 flex items-center gap-2.5" style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
              <button
                onClick={() => toggleTier(tier)}
                disabled={list.length === 0}
                title={allOn ? "Deselect everyone here" : "Select everyone here"}
                className="shrink-0 disabled:opacity-30"
                style={{ color: allOn ? color : ROYAL.dim }}
              >
                {allOn ? <SquareCheck className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              </button>
              <Icon className="w-4 h-4 shrink-0" style={{ color }} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold" style={{ color: ROYAL.text, fontFamily: HEADING }}>
                  {label}
                </span>
                <span className="block text-[10.5px]" style={{ color: ROYAL.dim }}>{blurb}</span>
              </span>
              <span className="text-[11px] shrink-0" style={{ color: ROYAL.dim }}>
                {list.length} member{list.length === 1 ? "" : "s"}
              </span>
            </div>

            {list.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">Nobody on this tier.</p>
            ) : (
              <div className="divide-y" style={{ borderColor: ROYAL.hairline }}>
                {list.map((u) => {
                  const on = picked.has(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggle(u.id)}
                      className="w-full px-4 py-2 flex items-center gap-2.5 text-left"
                      style={{ background: on ? "rgba(217,183,117,0.08)" : "transparent" }}
                    >
                      <span className="shrink-0" style={{ color: on ? ROYAL.gold : ROYAL.dim }}>
                        {on ? <SquareCheck className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] truncate" style={{ color: ROYAL.text }}>
                          {u.name}{u.isAdmin && <span style={{ color: ROYAL.gold }}> · admin</span>}
                        </span>
                        <span className="block text-[10.5px] truncate" style={{ color: ROYAL.dim }}>{u.email}</span>
                      </span>
                      <span className="text-[10.5px] shrink-0" style={{ color: ROYAL.dim }}>
                        {u.enabledModules.length} mod
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {/* The action bar only exists when there is something to act on. */}
      {picked.size > 0 && (
        <div
          className="fixed left-0 right-0 z-40 px-3 py-2.5"
          style={{
            bottom: "env(safe-area-inset-bottom, 0px)",
            background: "rgba(8,8,18,0.96)",
            borderTop: `1px solid ${ROYAL.goldSoft}`,
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-semibold" style={{ color: ROYAL.gold }}>
                {picked.size} selected
              </span>
              <button onClick={() => setPicked(new Set())} className="text-[11px]" style={{ color: ROYAL.dim }}>
                clear
              </button>
              <label className="ml-auto flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: ROYAL.dim }}>
                <input type="checkbox" checked={keepModules} onChange={(e) => setKeepModules(e.target.checked)} className="accent-primary" />
                Keep their current modules
              </label>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />
              {TIERS.slice().reverse().map(({ tier, label, color }) => (
                <button
                  key={tier}
                  onClick={() => move(tier)}
                  disabled={busy}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50"
                  style={{ border: `1px solid ${color}66`, color, background: `${color}14` }}
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : label}
                </button>
              ))}
            </div>
            {note && <p className="text-[11px] flex items-center gap-1" style={{ color: ROYAL.dim }}>
              <Check className="w-3 h-3" /> {note}
            </p>}
          </div>
        </div>
      )}

      {picked.size === 0 && note && (
        <p className="text-[11.5px] flex items-center gap-1 px-1" style={{ color: ROYAL.dim }}>
          <Check className="w-3 h-3" style={{ color: ROYAL.gold }} /> {note}
        </p>
      )}
    </div>
  );
}

export default AdminTiersTab;
