import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { AccountFields } from "../components/auth/AccountFields";
import { AuthAurora } from "../components/auth/AuthAurora";
import { getQuestions } from "../lib/userAdmin";
import { ROYAL, HEADING, EASE } from "../lib/royal";
import { useAuth, type SignupQuestion } from "../hooks/useAuth";
import {
  TIER_KEYS, type TierKey,
  getTierPricing, type TierPricing,
  getLifetimeDeals, type LifetimeDeals,
  getTierModuleConfig, type TierModuleConfig,
  listModuleAddonPrices, type ModuleAddonPrice,
  getPromoCounter, type PromoCounter,
  checkCoupon, type CouponCheck,
  selectFreeTier, claimAdvancedPromo, startCheckout,
} from "../lib/plans";
import { Sparkles, Check, Lock, Tag, Loader2, PartyPopper, Crown, Star, Zap, Gift } from "lucide-react";

type Period = "monthly" | "yearly" | "lifetime";

const TIER_LABELS: Record<TierKey, string> = { free: "Free", basic: "Basic", vip: "VIP", advanced: "Advanced" };
const TIER_ICONS: Record<TierKey, React.ComponentType<{ className?: string }>> = { free: Star, basic: Zap, vip: Crown, advanced: Sparkles };
const TIER_BLURBS: Record<TierKey, string> = {
  free: "Pick 1 module, on us.",
  basic: "A solid core toolkit.",
  vip: "Serious storm tracking.",
  advanced: "Everything, always.",
};

// Rendered natively by AccountFields; only admin-added questions render dynamically.
const CORE_QUESTION_IDS = ["name", "email", "pin", "tier"];

export default function Plans() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading } = useAuth();

  // No redirect for signed-out visitors any more — account, tier and modules
  // are one page, so an anonymous visitor builds their plan first and creates
  // the account as the last step.
  const joining = !authLoading && !user;

  // Account step state (only used while `joining`).
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<SignupQuestion[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);

  useEffect(() => {
    if (!joining) return;
    getQuestions()
      .then((qs) => setQuestions(qs.filter((q) => !CORE_QUESTION_IDS.includes(q.id))))
      .catch(() => setQuestions([]));
  }, [joining]);

  const accountReady = name.trim().length > 1 && /.+@.+\..+/.test(email) && pin.length === 4
    && questions.every((q) => !q.required || (answers[q.id] ?? "").trim().length > 0);

  /**
   * Create the account first when one is needed, then run the caller's action.
   * Returns false if the account could not be created, so the caller stops.
   */
  async function ensureAccount(): Promise<boolean> {
    if (!joining) return true;
    setAccountError(null);
    const r = await signup({ name, email, pin, customAnswers: answers });
    if (!r.ok) { setAccountError(r.error ?? "Could not create your account — try again."); return false; }
    return true;
  }

  const [dataLoading, setDataLoading] = useState(true);
  const [tierPricing, setTierPricing] = useState<TierPricing | null>(null);
  const [lifetimeDeals, setLifetimeDeals] = useState<LifetimeDeals | null>(null);
  const [tierCfg, setTierCfg] = useState<TierModuleConfig | null>(null);
  const [addonPrices, setAddonPrices] = useState<ModuleAddonPrice[]>([]);
  const [promo, setPromo] = useState<PromoCounter | null>(null);

  useEffect(() => {
    Promise.all([getTierPricing(), getLifetimeDeals(), getTierModuleConfig(), listModuleAddonPrices(), getPromoCounter()])
      .then(([p, l, c, a, pr]) => { setTierPricing(p); setLifetimeDeals(l); setTierCfg(c); setAddonPrices(a); setPromo(pr); })
      .finally(() => setDataLoading(false));
  }, []);

  const [selectedTier, setSelectedTier] = useState<TierKey | null>(null);
  const [period, setPeriod] = useState<Period>("monthly");
  const [promoMode, setPromoMode] = useState(false);
  const [freeModule, setFreeModule] = useState<string>("");
  const [extras, setExtras] = useState<string[]>([]);
  const [addons, setAddons] = useState<string[]>([]);
  const [couponInput, setCouponInput] = useState("");
  const [couponResult, setCouponResult] = useState<CouponCheck | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);

  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [returnBanner, setReturnBanner] = useState<"success" | "cancelled" | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    if (status === "success" || status === "cancelled") {
      setReturnBanner(status);
      window.history.replaceState({}, "", "/plans");
    }
  }, []);

  const remaining = promo ? Math.max(0, promo.total - promo.claimed) : 0;
  const promoLive = !!promo?.active && remaining > 0;

  function pickTier(tier: TierKey) {
    setSelectedTier(tier);
    setPeriod("monthly");
    setPromoMode(false);
    setFreeModule("");
    setExtras([]);
    setAddons([]);
    setCouponInput("");
    setCouponResult(null);
    setCompleteError(null);
  }

  function claimPromo() {
    setSelectedTier("advanced");
    setPromoMode(true);
    setPeriod("lifetime");
    setCompleteError(null);
  }

  const bundledIds = useMemo(() => {
    if (!tierCfg || !selectedTier) return [];
    if (selectedTier === "basic") return tierCfg.bundledModules.basic;
    if (selectedTier === "vip") return tierCfg.bundledModules.vip;
    return [];
  }, [tierCfg, selectedTier]);

  const allowance = useMemo(() => {
    if (!tierCfg || !selectedTier) return 0;
    if (selectedTier === "advanced") return 0; // everything, nothing to choose
    if (period === "lifetime" && selectedTier === "basic") return lifetimeDeals?.basic_lifetime.choosableCount ?? 10;
    return tierCfg.choosableCount[selectedTier];
  }, [tierCfg, selectedTier, period, lifetimeDeals]);

  function priceFor(m: ModuleAddonPrice, tier: TierKey): number {
    if (tier === "free") return m.freePrice;
    if (tier === "basic") return m.basicPrice;
    if (tier === "vip") return m.vipPrice;
    return 0;
  }

  function toggleModule(id: string) {
    if (!selectedTier || selectedTier === "advanced" || promoMode) return;
    if (bundledIds.includes(id)) return;
    if (selectedTier === "free") {
      setFreeModule(prev => (prev === id ? "" : id));
      setAddons(a => a.filter(x => x !== id));
      return;
    }
    if (extras.includes(id)) { setExtras(e => e.filter(x => x !== id)); return; }
    if (addons.includes(id)) { setAddons(a => a.filter(x => x !== id)); return; }
    if (extras.length < allowance) setExtras(e => [...e, id]);
    else setAddons(a => [...a, id]);
  }

  const lifetimeAvailable = selectedTier === "basic" ? lifetimeDeals?.basic_lifetime.active
    : selectedTier === "advanced" ? lifetimeDeals?.advanced_lifetime.active
    : false;

  const basePrice = useMemo(() => {
    if (!selectedTier) return 0;
    if (promoMode) return 0;
    if (selectedTier === "free") return 0;
    if (period === "lifetime") {
      if (selectedTier === "basic") return lifetimeDeals?.basic_lifetime.price ?? 0;
      if (selectedTier === "advanced") return lifetimeDeals?.advanced_lifetime.price ?? 0;
      return 0;
    }
    return tierPricing?.[selectedTier][period] ?? 0;
  }, [selectedTier, promoMode, period, lifetimeDeals, tierPricing]);

  const addonsMonthly = useMemo(() => {
    if (!selectedTier) return 0;
    return addons.reduce((sum, id) => {
      const m = addonPrices.find(x => x.moduleId === id);
      return m ? sum + priceFor(m, selectedTier) : sum;
    }, 0);
  }, [addons, addonPrices, selectedTier]);

  const couponEligible = period !== "lifetime" && !promoMode && selectedTier !== "free";
  const discount = useMemo(() => {
    if (!couponEligible || !couponResult?.valid || !couponResult.kind) return 0;
    if (couponResult.kind.includes("percent")) return basePrice * ((couponResult.value ?? 0) / 100);
    return Math.min(couponResult.value ?? 0, basePrice);
  }, [couponEligible, couponResult, basePrice]);

  const effectiveBase = Math.max(0, basePrice - discount);
  const dueToday = promoMode ? 0 : effectiveBase + addonsMonthly;
  const isFreeCompletion = promoMode || (selectedTier === "free" && addons.length === 0);

  async function runCouponCheck() {
    if (!selectedTier || !couponInput.trim()) return;
    setCouponChecking(true);
    const r = await checkCoupon(couponInput, selectedTier);
    setCouponChecking(false);
    setCouponResult(r);
  }

  async function complete() {
    setCompleting(true);
    if (!(await ensureAccount())) { setCompleting(false); return; }
    setCompleteError(null);
    const res = promoMode ? await claimAdvancedPromo() : await selectFreeTier(freeModule);
    setCompleting(false);
    if (!res.ok) { setCompleteError(res.error ?? "Something went wrong — try again."); return; }
    setSuccess(true);
    setTimeout(() => { window.location.href = "/"; }, 1400);
  }

  async function goToCheckout() {
    if (!selectedTier) return;
    setCheckingOut(true);
    if (!(await ensureAccount())) { setCheckingOut(false); return; }
    setCheckoutError(null);
    const res = await startCheckout({
      tier: selectedTier,
      period,
      chosenModuleIds: extras,
      addonModuleIds: addons,
      couponCode: couponResult?.valid ? couponResult.code : undefined,
    });
    setCheckingOut(false);
    if (!res.ok || !res.url) { setCheckoutError(res.error ?? "Could not start checkout — try again."); return; }
    window.location.href = res.url;
  }

  if (authLoading || dataLoading || !tierPricing || !lifetimeDeals || !tierCfg) {
    return <div className="p-10 flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Loading plans…</div>;
  }

  if (success) {
    return (
      <div className="p-10 max-w-md mx-auto text-center space-y-3">
        <PartyPopper className="w-12 h-12 text-primary mx-auto" />
        <h2 className="text-xl font-bold">You're all set!</h2>
        <p className="text-sm text-muted-foreground">Taking you into StormSync…</p>
      </div>
    );
  }

  return (
    <div className="relative z-10 p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {joining && <AuthAurora />}
      <div className="space-y-1">
        {joining && (
          <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: ROYAL.gold }}>
            Step 1 — build your plan
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-[0.02em]" style={{ fontFamily: HEADING, color: ROYAL.text }}>
          {joining ? "Join StormSync VIP" : "Choose Your Plan"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {joining
            ? "Pick a tier, build your module set, then create your account — all right here."
            : "Pick a tier, build your module set, see the price update live."}
        </p>
      </div>

      {returnBanner === "success" && (
        <div className="bg-primary/10 border border-primary/40 rounded-xl p-4 text-sm flex items-center gap-2">
          <PartyPopper className="w-5 h-5 text-primary shrink-0" /> Payment received — welcome aboard! It can take a few seconds for your modules to unlock.
        </div>
      )}
      {returnBanner === "cancelled" && (
        <div className="bg-muted/20 border border-border rounded-xl p-4 text-sm text-muted-foreground">
          Checkout was cancelled — no charge was made. Pick up right where you left off whenever you're ready.
        </div>
      )}

      {/* Promo banner */}
      {promoLive ? (
        <div className="bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/40 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Gift className="w-8 h-8 text-primary shrink-0" />
            <div>
              <div className="font-bold">Only {remaining} free Advanced spot{remaining === 1 ? "" : "s"} left!</div>
              <div className="text-xs text-muted-foreground">Every module, forever, on us — no payment, ever.</div>
            </div>
          </div>
          <button onClick={claimPromo} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 shrink-0">
            Claim my free spot
          </button>
        </div>
      ) : (
        <div className="bg-muted/20 border border-border rounded-xl p-4 text-sm text-muted-foreground">
          We've handed out the full version of this app with the highest tier to {promo?.total ?? 25} people now. Unfortunately those spots have been taken — everything must be paid for now.
        </div>
      )}

      {/* Tier cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {TIER_KEYS.map(tier => {
          const Icon = TIER_ICONS[tier];
          const active = selectedTier === tier && !promoMode;
          const price = tierPricing[tier];
          return (
            <button key={tier} onClick={() => pickTier(tier)}
              className={`text-left p-4 rounded-xl border transition-colors space-y-2 ${active ? "bg-primary/15 border-primary/50" : "bg-card border-border hover:border-primary/30"}`}>
              <div className="flex items-center justify-between">
                <Icon className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                {tier === "advanced" && promoLive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold">FREE NOW</span>}
              </div>
              <div className="font-bold">{TIER_LABELS[tier]}</div>
              <div className="text-xs text-muted-foreground">{TIER_BLURBS[tier]}</div>
              <div className="text-sm font-semibold">{price.monthly === 0 ? "$0" : `$${price.monthly}/mo`}</div>
            </button>
          );
        })}
      </div>

      {selectedTier && (
        <div className="space-y-4">
          {/* Billing period */}
          {selectedTier !== "free" && !promoMode && (
            <div className="flex gap-2 flex-wrap">
              {(["monthly", "yearly"] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${period === p ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
                  {p === "monthly" ? "Monthly" : "Yearly"}
                </button>
              ))}
              {lifetimeAvailable && (
                <button onClick={() => setPeriod("lifetime")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${period === "lifetime" ? "bg-primary/20 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}>
                  Lifetime (launch deal)
                </button>
              )}
            </div>
          )}

          {/* Module picker */}
          {selectedTier === "advanced" || promoMode ? (
            <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-primary" /> Every module in the app is included — nothing to pick.
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <h3 className="text-sm font-semibold">Pick your modules</h3>
                <span className="text-xs text-muted-foreground">
                  {selectedTier === "free" ? (freeModule ? "1 of 1 picked" : "Pick 1 module") : `${extras.length} of ${allowance} free picks used`}
                </span>
              </div>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-80 overflow-y-auto pr-1">
                {addonPrices.map(m => {
                  const bundled = bundledIds.includes(m.moduleId);
                  const chosenFree = selectedTier === "free" ? freeModule === m.moduleId : extras.includes(m.moduleId);
                  const isAddon = addons.includes(m.moduleId);
                  const price = priceFor(m, selectedTier);
                  return (
                    <button key={m.moduleId} type="button" onClick={() => toggleModule(m.moduleId)} disabled={bundled}
                      className={`text-left flex items-center justify-between gap-1.5 text-xs px-2.5 py-2 rounded-lg border ${
                        bundled ? "bg-primary/10 border-primary/30 text-primary cursor-default"
                        : chosenFree ? "bg-primary/15 border-primary/40 text-primary"
                        : isAddon ? "bg-yellow-500/10 border-yellow-500/40 text-yellow-300"
                        : "border-border text-muted-foreground hover:text-foreground"
                      }`}>
                      <span className="flex items-center gap-1.5">
                        {bundled ? <Check className="w-3 h-3 shrink-0" /> : chosenFree ? <Check className="w-3 h-3 shrink-0" /> : null}
                        {m.label}
                      </span>
                      {bundled ? <Lock className="w-3 h-3 shrink-0 opacity-60" /> : isAddon ? <span className="shrink-0 font-semibold">${price}/mo</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Receipt */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-semibold">Your Receipt</h3>
            {promoMode ? (
              <div className="flex justify-between text-sm">
                <span>Advanced — launch promo</span>
                <span className="font-semibold text-primary">$0 forever</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span>{TIER_LABELS[selectedTier]}{period === "lifetime" ? " — Lifetime" : period === "yearly" ? " — Yearly" : " — Monthly"}</span>
                  <span className={discount > 0 ? "line-through text-muted-foreground" : "font-semibold"}>${basePrice.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm text-primary">
                    <span>Coupon {couponResult?.code}</span>
                    <span>-${discount.toFixed(2)}</span>
                  </div>
                )}
                {addons.length > 0 && (
                  <div className="pt-1 border-t border-border/60 space-y-1">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Add-Ons (billed monthly)</div>
                    {addons.map(id => {
                      const m = addonPrices.find(x => x.moduleId === id);
                      if (!m) return null;
                      return (
                        <div key={id} className="flex justify-between text-sm">
                          <span>{m.label}</span>
                          <span>${priceFor(m, selectedTier).toFixed(2)}/mo</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            <div className="pt-2 border-t border-border flex justify-between items-baseline">
              <span className="text-sm font-semibold">Due today</span>
              <span className="text-xl font-bold text-primary">${dueToday.toFixed(2)}</span>
            </div>
            {!promoMode && period === "lifetime" && addonsMonthly > 0 && (
              <p className="text-[10px] text-muted-foreground">One-time ${basePrice.toFixed(2)} plan fee, then ${addonsMonthly.toFixed(2)}/mo for your add-ons.</p>
            )}
            {!promoMode && period !== "lifetime" && couponResult?.valid && couponResult.kind?.startsWith("first_month") && (
              <p className="text-[10px] text-muted-foreground">Then ${(basePrice + addonsMonthly).toFixed(2)}/{period === "yearly" ? "yr" : "mo"} after your first payment.</p>
            )}
          </div>

          {/* Coupon */}
          {couponEligible && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Tag className="w-4 h-4 text-primary" /> Coupon Code</h3>
              <div className="flex gap-2">
                <input value={couponInput} onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponResult(null); }}
                  placeholder="CODE" className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary/40 font-mono uppercase" />
                <button onClick={runCouponCheck} disabled={couponChecking || !couponInput.trim()}
                  className="px-3 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm font-semibold hover:bg-primary/30 disabled:opacity-50 flex items-center gap-1.5">
                  {couponChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply"}
                </button>
              </div>
              {couponResult && !couponResult.valid && <p className="text-xs text-red-400">{couponResult.error}</p>}
              {couponResult?.valid && <p className="text-xs text-primary">Applied!</p>}
            </div>
          )}

          {/* Account — the last step of the same page, not a separate route. */}
          <AnimatePresence initial={false}>
            {joining && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="relative rounded-xl p-4 royal-panel royal-rule">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0"
                          style={{ background: "rgba(217,183,117,0.14)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
                      2
                    </span>
                    <div>
                      <h3 className="text-[12px] font-semibold uppercase tracking-[0.16em]"
                          style={{ fontFamily: HEADING, color: ROYAL.gold }}>
                        Create your account
                      </h3>
                      <p className="text-[11px]" style={{ color: ROYAL.dim }}>
                        Last step — your plan above is applied the moment it's created.
                      </p>
                    </div>
                  </div>
                  <AccountFields
                    name={name} email={email} pin={pin} answers={answers} questions={questions}
                    onName={setName} onEmail={setEmail} onPin={setPin}
                    onAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
                  />
                  {accountError && (
                    <p className="text-xs mt-3" style={{ color: "#f3a3a5" }}>{accountError}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Complete */}
          <div className="space-y-2">
            {completeError && <p className="text-xs text-red-400">{completeError}</p>}
            {isFreeCompletion ? (
              <button onClick={complete} disabled={completing || (selectedTier === "free" && !freeModule) || (joining && !accountReady)}
                className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {promoMode ? "Claim my free spot" : joining ? "Create account & finish — Free" : "Complete Signup — Free"}
              </button>
            ) : (
              <div className="space-y-2">
                {checkoutError && <p className="text-xs text-red-400">{checkoutError}</p>}
                <button onClick={goToCheckout} disabled={checkingOut || (joining && !accountReady)}
                  className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                  {checkingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Continue to Secure Checkout — ${dueToday.toFixed(2)} today
                </button>
                <p className="text-[10px] text-muted-foreground text-center">You'll be redirected to Stripe to enter payment details.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
