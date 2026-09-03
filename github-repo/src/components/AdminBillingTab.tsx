import { useState, useEffect } from "react";
import {
  DollarSign, Gift, Layers, Package, Ticket, Users2, Loader2, Plus, Trash2, Save, Check, Pencil,
  Share2, Power, Clock, Zap,
} from "lucide-react";
import { ALL_MODULES, HIDDEN_MODULES } from "../hooks/useAuth";
import {
  TIER_KEYS, type TierKey,
  getTierPricing, saveTierPricing, type TierPricing,
  getLifetimeDeals, saveLifetimeDeals, type LifetimeDeals, type LifetimeDeal,
  getTierModuleConfig, saveTierModuleConfig, syncAdvancedModules, type TierModuleConfig,
  listModuleAddonPrices, upsertModuleAddonPrice, deleteModuleAddonPrice, type ModuleAddonPrice,
  listCoupons, createCoupon, updateCoupon, deleteCoupon, COUPON_KIND_LABELS, type Coupon, type CouponKind,
  getPromoCounter, savePromoCounter, type PromoCounter,
} from "../lib/billingAdmin";
import {
  listPromos, savePromo, setPromoActive, rungsOf,
  adminReferralOverview, adminReferrals, fulfilReferral,
  type Promo, type ReferralOverviewRow, type ReferralRow,
} from "../lib/promos";
import { AdminRewardsCard } from "./admin/AdminRewardsCard";
import { audit } from "../lib/adminAudit";

type SubTab = "pricing" | "lifetime" | "bundles" | "addons" | "coupons" | "promo" | "rewards" | "referrals";

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
          { id: "promo", label: "Promotions", icon: Users2 },
          { id: "rewards", label: "Referral Rewards", icon: Zap },
          { id: "referrals", label: "Referrals", icon: Share2 },
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
      {sub === "promo" && <PromotionsCard />}
      {sub === "rewards" && <AdminRewardsCard />}
      {sub === "referrals" && <ReferralsCard />}
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
    void audit("billing.prices", { type: "tier_pricing" }, pricing as unknown as Record<string, unknown>);
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

  const keys: (keyof LifetimeDeals)[] = ["basic_lifetime", "vip_lifetime", "advanced_lifetime"];
  const titles: Record<keyof LifetimeDeals, string> = {
    basic_lifetime: "Basic Lifetime", vip_lifetime: "VIP Lifetime", advanced_lifetime: "Advanced Lifetime",
  };

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
            {key !== "advanced_lifetime" && (
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
  const toggleBundled = (tier: "free" | "basic" | "vip", moduleId: string) => {
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
        <p className="text-xs text-muted-foreground">On top of the bundled-free list below. Advanced gets everything, so it's fixed at 0.</p>
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

      {(["free", "basic", "vip"] as const).map(tier => (
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

      <AdvancedEverythingCard />

      {err && <p className="text-xs text-red-400">{err}</p>}
      <button onClick={save} className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30 flex items-center gap-1.5">
        <Save className="w-3.5 h-3.5" /> {saved ? "Saved ✓" : "Save tier bundles"}
      </button>
    </div>
  );
}

/**
 * Advanced has no bundle to edit — it is every module, by rule. This says so,
 * and offers the repair for the cases the rule cannot reach on its own.
 */
function AdvancedEverythingCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true); setMsg(null);
    const r = await syncAdvancedModules();
    setBusy(false);
    setMsg(r.ok
      ? r.changed === 0 ? "Everyone was already up to date." : `Topped up ${r.changed} member${r.changed === 1 ? "" : "s"}.`
      : r.error);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Layers className="w-4 h-4 text-primary" /> Advanced's modules
      </h3>
      <p className="text-xs text-muted-foreground">
        Advanced is every module on the menu — there is no list to keep here. Anything added to the
        sidebar is granted to every Advanced member the moment it appears, and access is decided by
        the tier itself rather than by a saved list, so it cannot go stale.
      </p>
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button onClick={run} disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-muted/30 border border-border text-xs font-medium hover:border-primary/40 disabled:opacity-50">
          {busy ? "Checking…" : "Re-check every Advanced member"}
        </button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
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
    if (r.ok) void audit("billing.prices", { type: "module", id: row.moduleId, label: row.label },
      { free, basic, vip });
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


// ── promotions ───────────────────────────────────────────────────────────────
/**
 * Every offer, and its switch.
 *
 * Promos used to be one hard-coded counter. Three more were asked for, and the
 * thing that makes four offers manageable is not four editors — it is one list
 * where you can see at a glance what is running. The switch is the headline;
 * the settings each promo actually has are underneath it, and only the ones
 * that promo uses are shown.
 *
 * All three new ones ship off. Turning one on is the only thing that makes it
 * do anything, and the copy says exactly what it will do.
 */
function PromotionsCard() {
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = () => listPromos().then(setPromos);
  useEffect(() => { void reload(); }, []);
  if (!promos) return <LoadingRow />;

  async function toggle(p: Promo) {
    setBusy(p.key); setErr(null);
    const r = await setPromoActive(p.key, !p.active);
    if (!r.ok) setErr(r.error ?? "Could not change that.");
    else void audit("billing.promo", { type: "promo", id: p.key, label: p.label }, { active: !p.active });
    await reload();
    setBusy(null);
  }

  async function patchConfig(p: Promo, patch: Record<string, unknown>) {
    setBusy(p.key); setErr(null);
    const r = await savePromo({ ...p, config: { ...p.config, ...patch } });
    if (!r.ok) setErr(r.error ?? "Could not save that.");
    await reload();
    setBusy(null);
  }

  const num = (p: Promo, k: string, fallback = 0) => Number((p.config?.[k] as number) ?? fallback);

  return (
    <div className="space-y-3">
      {err && <p className="text-xs text-red-400">{err}</p>}
      {promos.map((p) => {
        const rungs = rungsOf(p);
        return (
          <div key={p.key} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">{p.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{p.blurb}</p>
              </div>
              <button onClick={() => toggle(p)} disabled={busy === p.key}
                className={`text-xs px-3 py-2 rounded-lg border font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-60 ${
                  p.active ? "bg-green-500/15 border-green-500/40 text-green-400" : "bg-muted/30 border-border text-muted-foreground"}`}>
                {busy === p.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                {p.active ? "Running" : "Off"}
              </button>
            </div>

            {/* Counter promos: how many have gone, how many there are. */}
            {("total" in (p.config ?? {})) && (
              <div className="flex flex-wrap gap-3 items-center">
                <NumField label="Claimed" value={num(p, "claimed")} onCommit={(v) => patchConfig(p, { claimed: v })} />
                <NumField label="Total"   value={num(p, "total", 25)} onCommit={(v) => patchConfig(p, { total: v })} />
                <span className="text-xs text-muted-foreground">
                  {Math.max(0, num(p, "total", 25) - num(p, "claimed"))} left
                </span>
              </div>
            )}

            {p.key === "addon_duo" && (
              <div className="flex flex-wrap gap-3 items-center">
                <NumField label="Add-ons needed" value={num(p, "addonsRequired", 2)} onCommit={(v) => patchConfig(p, { addonsRequired: v })} />
                <NumField label="% off" value={num(p, "percentOff", 50)} onCommit={(v) => patchConfig(p, { percentOff: v })} />
                <span className="text-xs text-muted-foreground">
                  Issues a single-use coupon on their account and tells them the code.
                </span>
              </div>
            )}

            {p.key === "paid_25" && (
              <div className="flex flex-wrap gap-3 items-center">
                <NumField label="Extra add-ons" value={num(p, "extraAddons", 3)} onCommit={(v) => patchConfig(p, { extraAddons: v })} />
                <NumField label="Alert levels up" value={num(p, "alertLevelUp", 1)} onCommit={(v) => patchConfig(p, { alertLevelUp: v })} />
                <span className="text-xs text-muted-foreground">
                  Applied by the billing webhook the moment their payment clears.
                </span>
              </div>
            )}

            {rungs.length > 0 && (
              <div className="rounded-lg border border-border/70 divide-y divide-border/60">
                {rungs.map((r) => (
                  <div key={r.rank} className="px-3 py-2 flex items-center gap-2 text-xs">
                    <span className="w-6 h-6 rounded-full grid place-items-center shrink-0 font-bold"
                          style={{ background: "rgba(217,183,117,0.14)", color: "#d9b775" }}>{r.rank}</span>
                    <span className="flex-1 min-w-0">{r.label}</span>
                    <span className="text-muted-foreground shrink-0">
                      {[r.percentOff ? `${r.percentOff}% off` : null,
                        r.addons ? `${r.addons} add-on${r.addons === 1 ? "" : "s"}` : null,
                        r.freeMonths ? `${r.freeMonths} month${r.freeMonths === 1 ? "" : "s"} free` : null,
                        r.tier ? `→ ${r.tier}` : null].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                ))}
                <p className="px-3 py-2 text-[11px] text-muted-foreground">
                  A referral counts when the person referred actually pays, not when they sign up. Past the last
                  rung the ladder keeps paying its top rung. Rewards are granted automatically the moment payment
                  clears — swap what each rung pays on the <strong>Referral Rewards</strong> tab. Only a reward
                  marked “fulfilled by hand” waits for you on the Referrals tab.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A small number field that only writes when you leave it. */
function NumField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  return (
    <label className="flex items-center gap-2 text-sm bg-muted/20 border border-border rounded-lg px-3 py-2">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <input type="number" min={0} value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(parseInt(draft, 10) || 0)}
        className="w-20 bg-muted/30 border border-border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-primary/40" />
    </label>
  );
}

// ── referrals ────────────────────────────────────────────────────────────────
/**
 * Who brought whom, and what is owed.
 *
 * The list that matters is the unfulfilled one: a reward the programme has
 * promised and nobody has actioned. So it sorts to the top and stays there
 * until it is marked done.
 */
function ReferralsCard() {
  const [rows, setRows] = useState<ReferralRow[] | null>(null);
  const [people, setPeople] = useState<Record<string, ReferralOverviewRow>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [r, o] = await Promise.all([adminReferrals(), adminReferralOverview()]);
      setRows(r);
      setPeople(Object.fromEntries(o.map((x) => [x.referrerId, x])));
      setErr(null);
    } catch (e) { setErr(String((e as Error)?.message ?? e)); setRows([]); }
  };
  useEffect(() => { void reload(); }, []);
  if (!rows) return <LoadingRow />;

  const owed = rows.filter((r) => r.convertedAt && !r.fulfilledAt);
  const rest = rows.filter((r) => !(r.convertedAt && !r.fulfilledAt));
  const who = (id: string) => people[id]?.name || people[id]?.email || id.slice(0, 8);

  async function markDone(r: ReferralRow) {
    setBusy(r.id);
    const res = await fulfilReferral(r.id);
    if (!res.ok) setErr(res.error ?? "Could not mark that done.");
    else void audit("billing.referral", { type: "referral", id: r.id, label: who(r.referrerId) });
    await reload();
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      {err && <p className="text-xs text-red-400">{err}</p>}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" /> Rewards to hand out ({owed.length})
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Someone they referred started paying. Apply the reward however it makes sense — a coupon, a tier
            change, a free month on their subscription — then mark it done so it leaves this list.
          </p>
        </div>
        {owed.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground">Nothing outstanding.</p>
        ) : owed.map((r) => (
          <div key={r.id} className="px-4 py-2.5 border-t border-border flex items-center gap-3 text-xs flex-wrap">
            <span className="font-semibold">{who(r.referrerId)}</span>
            <span className="text-muted-foreground">referral #{r.rank}</span>
            <span className="flex-1 min-w-[160px]">{r.reward?.label ?? "—"}</span>
            <button onClick={() => markDone(r)} disabled={busy === r.id}
              className="px-2.5 py-1.5 rounded-lg bg-primary/20 border border-primary/40 text-primary font-semibold flex items-center gap-1.5 disabled:opacity-60">
              {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Mark done
            </button>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Share2 className="w-4 h-4 text-primary" /> Everything else ({rest.length})
          </h3>
        </div>
        {rest.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground">
            Nobody has used a referral code yet. Codes only work while the referral programme is switched on.
          </p>
        ) : rest.slice(0, 60).map((r) => (
          <div key={r.id} className="px-4 py-2 border-t border-border flex items-center gap-3 text-xs flex-wrap">
            <span className="font-semibold">{who(r.referrerId)}</span>
            <code className="text-muted-foreground">{r.code}</code>
            <span className="flex-1 min-w-[120px] text-muted-foreground">
              {r.convertedAt ? `converted · reward given` : "signed up, not paying yet"}
            </span>
            <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
