import { useState, useEffect } from "react";
import {
  DollarSign, Gift, Layers, Package, Ticket, Users2, Loader2, Plus, Trash2, Save, Check, Pencil,
} from "lucide-react";
import { ALL_MODULES, HIDDEN_MODULES } from "../hooks/useAuth";
import {
  TIER_KEYS, type TierKey,
  getTierPricing, saveTierPricing, type TierPricing,
  getLifetimeDeals, saveLifetimeDeals, type LifetimeDeals, type LifetimeDeal,
  getTierModuleConfig, saveTierModuleConfig, type TierModuleConfig,
  listModuleAddonPrices, upsertModuleAddonPrice, deleteModuleAddonPrice, type ModuleAddonPrice,
  listCoupons, createCoupon, updateCoupon, deleteCoupon, COUPON_KIND_LABELS, type Coupon, type CouponKind,
  getPromoCounter, savePromoCounter, type PromoCounter,
} from "../lib/billingAdmin";

type SubTab = "pricing" | "lifetime" | "bundles" | "addons" | "coupons" | "promo";

const TIER_LABELS: Record<TierKey, string> = { free: "Free", basic: "Basic", vip: "VIP", advanced: "Advanced" };

function LoadingRow() {
  return <div className="p-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;
}

export default function AdminBillingTab() {
  const [sub, setSub] = useState<SubTab>("pricing");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap border-b border-border/60 pb-2">
        {([
          { id: "pricing", label: "Tier Pricing", icon: DollarSign },
          { id: "lifetime", label: "Lifetime Deals", icon: Gift },
          { id: "bundles", label: "Tier Bundles", icon: Layers },
          { id: "addons", label: "Module Add-Ons", icon: Package },
          { id: "coupons", label: "Coupons", icon: Ticket },
          { id: "promo", label: "Promo Counter", icon: Users2 },
        ] as { id: SubTab; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setSub(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${sub === t.id ? "bg-primary/20 text-primary border border-primary/40" : "text-muted-foreground hover:text-foreground border border-transparent"}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {sub === "pricing" && <TierPricingCard />}
      {sub === "lifetime" && <LifetimeDealsCard />}
      {sub === "bundles" && <TierBundlesCard />}
      {sub === "addons" && <ModuleAddonsCard />}
      {sub === "coupons" && <CouponsCard />}
      {sub === "promo" && <PromoCounterCard />}
    </div>
  );
}

// ── Tier Pricing ───────────────────────────────────────────────────────────────
function TierPricingCard() {
  const [pricing, setPricing] = useState<TierPricing | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { getTierPricing().then(setPricing); }, []);
  if (!pricing) return <LoadingRow />;

  const set = (tier: TierKey, field: "monthly" | "yearly", v: number) =>
    setPricing({ ...pricing, [tier]: { ...pricing[tier], [field]: v } });

  async function save() {
    setErr(null);
    const r = await saveTierPricing(pricing!);
    if (!r.ok) { setErr(r.error ?? "Failed to save"); return; }
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" /> Tier Pricing</h3>
      <p className="text-xs text-muted-foreground">What each subscription tier costs. Free is always $0.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {TIER_KEYS.map(tier => (
          <div key={tier} className="bg-muted/20 border border-border rounded-lg p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{TIER_LABELS[tier]}</div>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Monthly $</span>
              <input type="number" step="0.01" min={0} disabled={tier === "free"} value={pricing[tier].monthly}
                onChange={e => set(tier, "monthly", parseFloat(e.target.value) || 0)}
                className="w-24 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40 disabled:opacity-50" />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Yearly $</span>
              <input type="number" step="0.01" min={0} disabled={tier === "free"} value={pricing[tier].yearly}
                onChange={e => set(tier, "yearly", parseFloat(e.target.value) || 0)}
                className="w-24 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40 disabled:opacity-50" />
            </label>
          </div>
        ))}
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={save} className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30 flex items-center gap-1.5">
        <Save className="w-3.5 h-3.5" /> {saved ? "Saved ✓" : "Save pricing"}
      </button>
    </div>
  );
}

// ── Lifetime Deals ─────────────────────────────────────────────────────────────
function LifetimeDealsCard() {
  const [deals, setDeals] = useState<LifetimeDeals | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getLifetimeDeals().then(setDeals); }, []);
  if (!deals) return <LoadingRow />;

  const keys: (keyof LifetimeDeals)[] = ["basic_lifetime", "advanced_lifetime"];
  const titles: Record<keyof LifetimeDeals, string> = { basic_lifetime: "Basic Lifetime", advanced_lifetime: "Advanced Lifetime" };

  const set = (key: keyof LifetimeDeals, patch: Partial<LifetimeDeal>) =>
    setDeals({ ...deals, [key]: { ...deals[key], ...patch } });

  async function save() {
    setErr(null);
    const r = await saveLifetimeDeals(deals!);
    if (!r.ok) { setErr(r.error ?? "Failed to save"); return; }
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Gift className="w-4 h-4 text-primary" /> Lifetime Flat-Rate Deals</h3>
      <p className="text-xs text-muted-foreground">Launch-promo one-time deals. Turn "Active" off once the window ends — existing buyers keep what they paid for either way.</p>
      {keys.map(key => {
        const d = deals[key];
        return (
          <div key={key} className="bg-muted/20 border border-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titles[key]}</span>
              <button onClick={() => set(key, { active: !d.active })}
                className={`text-[10px] px-2 py-1 rounded-full border font-semibold ${d.active ? "bg-green-500/15 border-green-500/40 text-green-400" : "bg-muted/30 border-border text-muted-foreground"}`}>
                {d.active ? "Active" : "Inactive"}
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground w-16">Price $</span>
              <input type="number" step="0.01" min={0} value={d.price} onChange={e => set(key, { price: parseFloat(e.target.value) || 0 })}
                className="w-24 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
            </label>
            {key === "basic_lifetime" && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground w-16">Modules</span>
                <input type="number" min={0} value={d.choosableCount ?? 10} onChange={e => set(key, { choosableCount: parseInt(e.target.value) || 0 })}
                  className="w-24 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
                <span className="text-xs text-muted-foreground">how many they get to choose (on top of the Basic free bundle)</span>
              </label>
            )}
            <textarea value={d.label} onChange={e => set(key, { label: e.target.value })} rows={2}
              className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40 resize-none" />
          </div>
        );
      })}
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={save} className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30 flex items-center gap-1.5">
        <Save className="w-3.5 h-3.5" /> {saved ? "Saved ✓" : "Save lifetime deals"}
      </button>
    </div>
  );
}

// ── Tier Bundles ───────────────────────────────────────────────────────────────
function TierBundlesCard() {
  const [cfg, setCfg] = useState<TierModuleConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getTierModuleConfig().then(setCfg); }, []);
  if (!cfg) return <LoadingRow />;

  // admin-only modules are never sellable (see ALL_MODULES.adminOnly)
  const purchasable = ALL_MODULES.filter(m => !m.alwaysOn && !m.adminOnly && !HIDDEN_MODULES.has(m.id));

  const setChoosable = (tier: TierKey, v: number) => setCfg({ ...cfg, choosableCount: { ...cfg.choosableCount, [tier]: v } });
  const toggleBundled = (tier: "basic" | "vip", moduleId: string) => {
    const list = cfg.bundledModules[tier];
    const next = list.includes(moduleId) ? list.filter(m => m !== moduleId) : [...list, moduleId];
    setCfg({ ...cfg, bundledModules: { ...cfg.bundledModules, [tier]: next } });
  };

  async function save() {
    setErr(null);
    const r = await saveTierModuleConfig(cfg!);
    if (!r.ok) { setErr(r.error ?? "Failed to save"); return; }
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Layers className="w-4 h-4 text-primary" /> Choosable modules per tier</h3>
        <p className="text-xs text-muted-foreground">On top of the bundled-free list below. Free has no bundle — this number is its only pick(s). Advanced gets everything, so it's fixed at 0.</p>
        <div className="flex flex-wrap gap-3">
          {TIER_KEYS.map(tier => (
            <label key={tier} className="flex items-center gap-2 text-sm bg-muted/20 border border-border rounded-lg px-3 py-2">
              <span className="text-xs uppercase text-muted-foreground w-16">{TIER_LABELS[tier]}</span>
              <input type="number" min={0} disabled={tier === "advanced"} value={cfg.choosableCount[tier]}
                onChange={e => setChoosable(tier, parseInt(e.target.value) || 0)}
                className="w-16 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40 disabled:opacity-50" />
            </label>
          ))}
        </div>
      </div>

      {(["basic", "vip"] as const).map(tier => (
        <div key={tier} className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold">{TIER_LABELS[tier]}'s bundled-free modules ({cfg.bundledModules[tier].length})</h3>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-72 overflow-y-auto pr-1">
            {purchasable.map(m => {
              const checked = cfg.bundledModules[tier].includes(m.id);
              return (
                <label key={m.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg border cursor-pointer ${checked ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleBundled(tier, m.id)} className="accent-primary" />
                  {m.label}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={save} className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30 flex items-center gap-1.5">
        <Save className="w-3.5 h-3.5" /> {saved ? "Saved ✓" : "Save tier bundles"}
      </button>
    </div>
  );
}

// ── Module Add-Ons ─────────────────────────────────────────────────────────────
function ModuleAddonsCard() {
  const [rows, setRows] = useState<ModuleAddonPrice[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const reload = () => listModuleAddonPrices().then(setRows);
  useEffect(() => { reload(); }, []);
  if (!rows) return <LoadingRow />;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Package className="w-4 h-4 text-primary" /> Module Add-On Pricing</h3>
        <button onClick={() => setShowAdd(s => !s)} className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/30 flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> Add module
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Monthly Add-On price per module. Free pays the most, Basic the middle rate, VIP the cheapest. Advanced never buys add-ons — it already has everything.</p>

      {showAdd && <AddAddonRow existingIds={rows.map(r => r.moduleId)} onDone={() => { setShowAdd(false); reload(); }} />}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-muted-foreground border-b border-border">
              <th className="pb-2 pr-2">Module</th>
              <th className="pb-2 px-2">Free $</th>
              <th className="pb-2 px-2">Basic $</th>
              <th className="pb-2 px-2">VIP $</th>
              <th className="pb-2 pl-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => <AddonRow key={r.moduleId} row={r} onSaved={reload} onDeleted={reload} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddonRow({ row, onSaved, onDeleted }: { row: ModuleAddonPrice; onSaved: () => void; onDeleted: () => void }) {
  const [free, setFree] = useState(row.freePrice);
  const [basic, setBasic] = useState(row.basicPrice);
  const [vip, setVip] = useState(row.vipPrice);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const dirty = free !== row.freePrice || basic !== row.basicPrice || vip !== row.vipPrice;

  async function save() {
    setBusy(true);
    const r = await upsertModuleAddonPrice({ ...row, freePrice: free, basicPrice: basic, vipPrice: vip });
    setBusy(false);
    if (!r.ok) { alert(r.error ?? "Failed to save"); return; }
    setSaved(true); setTimeout(() => setSaved(false), 1200);
    onSaved();
  }
  async function del() {
    if (!confirm(`Remove "${row.label}" from Add-On pricing? (The module itself stays in the app — it just won't be purchasable as an add-on anymore.)`)) return;
    const r = await deleteModuleAddonPrice(row.moduleId);
    if (!r.ok) { alert(r.error ?? "Failed to delete"); return; }
    onDeleted();
  }

  const priceInput = (v: number, set: (n: number) => void) => (
    <input type="number" step="0.01" min={0} value={v} onChange={e => set(parseFloat(e.target.value) || 0)}
      className="w-20 bg-muted/30 border border-border rounded-lg px-2 py-1 text-sm outline-none focus:border-primary/40" />
  );

  return (
    <tr className="border-b border-border/50">
      <td className="py-1.5 pr-2 text-xs">{row.label}<div className="text-[10px] text-muted-foreground font-mono">{row.moduleId}</div></td>
      <td className="py-1.5 px-2">{priceInput(free, setFree)}</td>
      <td className="py-1.5 px-2">{priceInput(basic, setBasic)}</td>
      <td className="py-1.5 px-2">{priceInput(vip, setVip)}</td>
      <td className="py-1.5 pl-2">
        <div className="flex items-center gap-1">
          {dirty && (
            <button onClick={save} disabled={busy} className="p-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            </button>
          )}
          <button onClick={del} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/40">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddAddonRow({ existingIds, onDone }: { existingIds: string[]; onDone: () => void }) {
  const options = ALL_MODULES.filter(m => !m.alwaysOn && !m.adminOnly && !HIDDEN_MODULES.has(m.id) && !existingIds.includes(m.id));
  const [moduleId, setModuleId] = useState(options[0]?.id ?? "");
  const [label, setLabel] = useState(options[0]?.label ?? "");
  const [err, setErr] = useState<string | null>(null);

  function pick(id: string) {
    setModuleId(id);
    setLabel(ALL_MODULES.find(m => m.id === id)?.label ?? label);
  }

  async function add() {
    setErr(null);
    const r = await upsertModuleAddonPrice({ moduleId, label, freePrice: 0, basicPrice: 0, vipPrice: 0 });
    if (!r.ok) { setErr(r.error ?? "Failed to add"); return; }
    onDone();
  }

  return (
    <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-2">
      {options.length > 0 ? (
        <select value={moduleId} onChange={e => pick(e.target.value)}
          className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40">
          {options.map(o => <option key={o.id} value={o.id}>{o.label} ({o.id})</option>)}
        </select>
      ) : (
        <input value={moduleId} onChange={e => setModuleId(e.target.value)} placeholder="/module-id"
          className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40 font-mono" />
      )}
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Display label"
        className="w-full bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={add} className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/30">
        Add
      </button>
    </div>
  );
}

// ── Coupons ────────────────────────────────────────────────────────────────────
function CouponsCard() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const reload = () => listCoupons().then(setCoupons);
  useEffect(() => { reload(); }, []);
  if (!coupons) return <LoadingRow />;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Ticket className="w-4 h-4 text-primary" /> Coupons</h3>
        <button onClick={() => setShowAdd(s => !s)} className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/30 flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> New coupon
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Recurring tiers only (Basic/VIP/Advanced) — lifetime deals are never discounted.</p>
      {showAdd && <CouponForm onDone={() => { setShowAdd(false); reload(); }} onCancel={() => setShowAdd(false)} />}
      <div className="space-y-2">
        {coupons.length === 0 && <p className="text-xs text-muted-foreground italic">No coupons yet.</p>}
        {coupons.map(c => <CouponRow key={c.code} coupon={c} onChanged={reload} />)}
      </div>
    </div>
  );
}

function CouponForm({ initial, onDone, onCancel }: { initial?: Coupon; onDone: () => void; onCancel?: () => void }) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [kind, setKind] = useState<CouponKind>(initial?.kind ?? "percent_off");
  const [value, setValue] = useState(initial?.value ?? 10);
  const [active, setActive] = useState(initial?.active ?? true);
  const [maxUses, setMaxUses] = useState<string>(initial?.maxUses?.toString() ?? "");
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt?.slice(0, 10) ?? "");
  const [tiers, setTiers] = useState<TierKey[]>(initial?.appliesToTiers ?? ["basic", "vip", "advanced"]);
  const [err, setErr] = useState<string | null>(null);

  function toggleTier(t: TierKey) {
    setTiers(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  async function save() {
    setErr(null);
    const payload = {
      code, kind, value, active,
      maxUses: maxUses.trim() ? parseInt(maxUses) : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      appliesToTiers: tiers,
    };
    const r = initial ? await updateCoupon(initial.code, payload) : await createCoupon(payload);
    if (!r.ok) { setErr(r.error ?? "Failed to save"); return; }
    onDone();
  }

  return (
    <div className="bg-muted/20 border border-border rounded-lg p-3 space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="CODE" disabled={!!initial}
          className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40 font-mono uppercase disabled:opacity-60" />
        <select value={kind} onChange={e => setKind(e.target.value as CouponKind)}
          className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40">
          {(Object.keys(COUPON_KIND_LABELS) as CouponKind[]).map(k => <option key={k} value={k}>{COUPON_KIND_LABELS[k]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground text-xs w-16">Value</span>
          <input type="number" step="0.01" min={0} value={value} onChange={e => setValue(parseFloat(e.target.value) || 0)}
            className="w-24 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
          <span className="text-xs text-muted-foreground">{kind.includes("percent") ? "%" : "$"}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground text-xs w-16">Max uses</span>
          <input value={maxUses} onChange={e => setMaxUses(e.target.value.replace(/\D/g, ""))} placeholder="unlimited"
            className="w-24 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground text-xs w-16">Expires</span>
          <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
            className="bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="accent-primary" />
          <span className="text-muted-foreground">Active</span>
        </label>
      </div>
      <div className="flex gap-2 flex-wrap">
        {(["free", "basic", "vip", "advanced"] as TierKey[]).map(t => (
          <button key={t} type="button" onClick={() => toggleTier(t)}
            className={`text-xs px-2.5 py-1 rounded-full border font-medium ${tiers.includes(t) ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
            {TIER_LABELS[t]}
          </button>
        ))}
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} className="px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary text-xs font-semibold hover:bg-primary/30">
          {initial ? "Save changes" : "Create coupon"}
        </button>
        {onCancel && <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs hover:text-foreground">Cancel</button>}
      </div>
    </div>
  );
}

function CouponRow({ coupon, onChanged }: { coupon: Coupon; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);

  async function del() {
    if (!confirm(`Delete coupon "${coupon.code}"? This can't be undone.`)) return;
    const r = await deleteCoupon(coupon.code);
    if (!r.ok) { alert(r.error ?? "Failed to delete"); return; }
    onChanged();
  }

  if (editing) return <CouponForm initial={coupon} onDone={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />;

  return (
    <div className="flex items-center justify-between gap-2 bg-muted/10 border border-border rounded-lg px-3 py-2 text-sm">
      <div>
        <span className="font-mono font-semibold">{coupon.code}</span>{" "}
        <span className="text-xs text-muted-foreground">
          {COUPON_KIND_LABELS[coupon.kind]} · {coupon.kind.includes("percent") ? `${coupon.value}%` : `$${coupon.value}`}
          {" · "}{coupon.appliesToTiers.map(t => TIER_LABELS[t]).join(", ")}
          {coupon.maxUses !== null && ` · ${coupon.usedCount}/${coupon.maxUses} used`}
          {!coupon.active && " · inactive"}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={del} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/40"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

// ── Promo Counter ──────────────────────────────────────────────────────────────
function PromoCounterCard() {
  const [counter, setCounter] = useState<PromoCounter | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getPromoCounter().then(setCounter); }, []);
  if (!counter) return <LoadingRow />;

  const remaining = Math.max(0, counter.total - counter.claimed);

  async function save() {
    setErr(null);
    const r = await savePromoCounter(counter!);
    if (!r.ok) { setErr(r.error ?? "Failed to save"); return; }
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2"><Users2 className="w-4 h-4 text-primary" /> Free Advanced-Tier Promo</h3>
      <p className="text-xs text-muted-foreground">The signup page reads this live. Once claimed reaches total, it automatically switches to the "spots are gone" message.</p>
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-sm bg-muted/20 border border-border rounded-lg px-3 py-2">
          <span className="text-xs uppercase text-muted-foreground">Claimed</span>
          <input type="number" min={0} value={counter.claimed} onChange={e => setCounter({ ...counter, claimed: parseInt(e.target.value) || 0 })}
            className="w-20 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
        </label>
        <label className="flex items-center gap-2 text-sm bg-muted/20 border border-border rounded-lg px-3 py-2">
          <span className="text-xs uppercase text-muted-foreground">Total</span>
          <input type="number" min={0} value={counter.total} onChange={e => setCounter({ ...counter, total: parseInt(e.target.value) || 0 })}
            className="w-20 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
        </label>
        <button onClick={() => setCounter({ ...counter, active: !counter.active })}
          className={`text-xs px-3 py-2 rounded-lg border font-semibold ${counter.active ? "bg-green-500/15 border-green-500/40 text-green-400" : "bg-muted/30 border-border text-muted-foreground"}`}>
          {counter.active ? "Promo Active" : "Promo Ended"}
        </button>
      </div>
      <div className="text-xs bg-muted/10 border border-border rounded-lg p-2 text-muted-foreground">
        Preview: {counter.active && remaining > 0
          ? `"Only ${remaining} free Advanced spots left — you've got one!"`
          : `"We've handed out the full version of this app with the highest tier to ${counter.total} people now. Unfortunately those spots have been taken — everything must be paid for now."`}
      </div>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={save} className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30 flex items-center gap-1.5">
        <Save className="w-3.5 h-3.5" /> {saved ? "Saved ✓" : "Save promo counter"}
      </button>
    </div>
  );
}
