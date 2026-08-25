/**
 * The join page — one page for the tier, the modules, the account and checkout.
 *
 * An anonymous visitor and a signed-in member share this page; the only
 * difference is that the account step is present for the former. Nothing here
 * navigates away mid-flow: pick a tier, build the module set, fill in the
 * account, and the single call-to-action at the bottom either completes a free
 * plan or hands off to Stripe.
 *
 * Rebuilt after three faults that all traced to one cause — the fixed aurora
 * was rendered *inside* the `z-10` content wrapper, so it painted over any
 * element that did not happen to have its own stacking context. That hid the
 * page heading, hid a tier card the moment selecting it swapped `.bg-card`
 * away, and hid the checkout button after the phone repainted on closing a
 * <select>. The aurora is now a sibling behind the content, and the surfaces
 * in components/join no longer depend on paint order at all.
 */
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { AccountFields } from "../components/auth/AccountFields";
import { AuthAurora } from "../components/auth/AuthAurora";
import { Section, TierOption, Pill, SURFACE } from "../components/join/JoinUI";
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
import { Sparkles, Check, Lock, Tag, Loader2, PartyPopper, Crown, Star, Zap, Gift, AlertCircle } from "lucide-react";

type Period = "monthly" | "yearly" | "lifetime";

const TIER_LABELS: Record<TierKey, string> = { free: "Free", basic: "Basic", vip: "VIP", advanced: "Advanced" };
const TIER_ICONS: Record<TierKey, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> =
  { free: Star, basic: Zap, vip: Crown, advanced: Sparkles };
const TIER_BLURBS: Record<TierKey, string> = {
  free: "Pick 1 module, on us.",
  basic: "A solid core toolkit.",
  vip: "Serious storm tracking.",
  advanced: "Everything, always.",
};

// Rendered natively by AccountFields; only admin-added questions render dynamically.
const CORE_QUESTION_IDS = ["name", "email", "pin", "tier"];

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function Plans() {
  const { user, loading: authLoading, signup } = useAuth();

  // Account, tier and modules are one page, so an anonymous visitor builds
  // their plan first and creates the account as the last step.
  const joining = !authLoading && !user;

  // ── account step (only while `joining`) ────────────────────────────────────
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

  // ── billing data ───────────────────────────────────────────────────────────
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

  // ── plan selection ─────────────────────────────────────────────────────────
  const [selectedTier, setSelectedTier] = useState<TierKey | null>(null);
  const [period, setPeriod] = useState<Period>("monthly");
  const [promoMode, setPromoMode] = useState(false);
  const [freeModule, setFreeModule] = useState<string>("");
  const [extras, setExtras] = useState<string[]>([]);
  const [addons, setAddons] = useState<string[]>([]);
  const [couponInput, setCouponInput] = useState("");
  const [couponResult, setCouponResult] = useState<CouponCheck | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
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
    setSubmitError(null);
  }

  function claimPromo() {
    setSelectedTier("advanced");
    setPromoMode(true);
    setPeriod("lifetime");
    setSubmitError(null);
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

  const couponEligible = period !== "lifetime" && !promoMode && selectedTier !== null && selectedTier !== "free";
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

  // ── what is still missing before the CTA can run ───────────────────────────
  // Rendered next to a button that is always on screen: a disabled button with
  // a reason beats a button that quietly isn't there.
  const blockers = useMemo(() => {
    const out: string[] = [];
    if (!selectedTier) { out.push("Choose a tier"); return out; }
    if (selectedTier === "free" && !promoMode && !freeModule) out.push("Pick your 1 free module");
    if (joining) {
      if (name.trim().length < 2) out.push("Enter your full name");
      if (!/.+@.+\..+/.test(email)) out.push("Enter a valid email address");
      if (pin.length !== 4) out.push("Choose a 4-digit PIN");
      for (const q of questions) {
        if (q.required && !(answers[q.id] ?? "").trim()) out.push(`Answer “${q.label}”`);
      }
    }
    return out;
  }, [selectedTier, promoMode, freeModule, joining, name, email, pin, questions, answers]);

  const ready = blockers.length === 0;

  /** Create the account when one is needed. Returns false if it failed. */
  async function ensureAccount(): Promise<boolean> {
    if (!joining) return true;
    setAccountError(null);
    const r = await signup({ name, email, pin, customAnswers: answers });
    if (!r.ok) { setAccountError(r.error ?? "Could not create your account — try again."); return false; }
    return true;
  }

  async function submit() {
    if (!selectedTier || !ready || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    if (!(await ensureAccount())) { setSubmitting(false); return; }

    if (isFreeCompletion) {
      const res = promoMode ? await claimAdvancedPromo() : await selectFreeTier(freeModule);
      setSubmitting(false);
      if (!res.ok) { setSubmitError(res.error ?? "Something went wrong — try again."); return; }
      setSuccess(true);
      setTimeout(() => { window.location.href = "/"; }, 1400);
      return;
    }

    const res = await startCheckout({
      tier: selectedTier,
      period,
      chosenModuleIds: extras,
      addonModuleIds: addons,
      couponCode: couponResult?.valid ? couponResult.code : undefined,
    });
    setSubmitting(false);
    if (!res.ok || !res.url) { setSubmitError(res.error ?? "Could not start checkout — try again."); return; }
    window.location.href = res.url;
  }

  if (authLoading || dataLoading || !tierPricing || !lifetimeDeals || !tierCfg) {
    return (
      <div className="p-10 flex items-center justify-center gap-2" style={{ color: ROYAL.dim }}>
        <Loader2 className="w-5 h-5 animate-spin" /> Loading plans…
      </div>
    );
  }

  if (success) {
    return (
      <div className="p-10 max-w-md mx-auto text-center space-y-3">
        <PartyPopper className="w-12 h-12 mx-auto" style={{ color: ROYAL.gold }} />
        <h2 className="text-xl font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>You're all set!</h2>
        <p className="text-sm" style={{ color: ROYAL.dim }}>Taking you into StormSync…</p>
      </div>
    );
  }

  const cadenceNote = period === "yearly" ? "/yr" : period === "lifetime" ? " once" : "/mo";

  return (
    <>
      {/* Behind the content, never inside it — see the note at the top. */}
      {joining && <AuthAurora />}

      <div className="relative z-10 p-4 md:p-6 max-w-3xl mx-auto space-y-4 pb-16">
        <motion.header
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="space-y-1 pt-1"
        >
          <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: ROYAL.gold }}>
            StormSync VIP
          </div>
          <h1 className="text-[26px] leading-tight font-bold tracking-[0.01em]"
              style={{ fontFamily: HEADING, color: ROYAL.text }}>
            {joining ? "Join StormSync VIP" : "Choose Your Plan"}
          </h1>
          <p className="text-sm" style={{ color: ROYAL.dim }}>
            {joining
              ? "Tier, modules and account — all on this one page. Nothing is charged until the last step."
              : "Pick a tier, build your module set, and watch the price update as you go."}
          </p>
        </motion.header>

        {returnBanner === "success" && (
          <div className="rounded-xl p-4 text-sm flex items-center gap-2"
               style={{ ...SURFACE, borderColor: "rgba(217,183,117,0.45)" }}>
            <PartyPopper className="w-5 h-5 shrink-0" style={{ color: ROYAL.gold }} />
            Payment received — welcome aboard! It can take a few seconds for your modules to unlock.
          </div>
        )}
        {returnBanner === "cancelled" && (
          <div className="rounded-xl p-4 text-sm" style={{ ...SURFACE, color: ROYAL.dim }}>
            Checkout was cancelled — no charge was made. Pick up right where you left off whenever you're ready.
          </div>
        )}

        {/* Promo */}
        {promoLive ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.04, ease: EASE }}
            className="rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap"
            style={{
              background: "linear-gradient(120deg, rgba(217,183,117,0.18), hsl(var(--card) / 0.9) 68%)",
              border: "1px solid rgba(217,183,117,0.45)",
              boxShadow: "0 20px 44px -32px rgba(0,0,0,0.95)",
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Gift className="w-8 h-8 shrink-0" style={{ color: ROYAL.gold }} />
              <div className="min-w-0">
                <div className="font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
                  Only {remaining} free Advanced spot{remaining === 1 ? "" : "s"} left
                </div>
                <div className="text-xs" style={{ color: ROYAL.dim }}>Every module, forever, on us — no payment, ever.</div>
              </div>
            </div>
            <button onClick={claimPromo}
                    className="px-4 py-2 rounded-lg text-sm font-semibold shrink-0"
                    style={{ background: ROYAL.gold, color: "#14141f" }}>
              Claim my free spot
            </button>
          </motion.div>
        ) : (
          <div className="rounded-2xl p-4 text-sm" style={{ ...SURFACE, color: ROYAL.dim }}>
            We've handed out the full version of this app with the highest tier to {promo?.total ?? 25} people now.
            Those spots have all been taken — everything is paid from here on.
          </div>
        )}

        {/* 1 — Tier */}
        <Section step={1} title="Choose your tier" hint="Every tier can be changed later from your profile." delay={0.06}>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {TIER_KEYS.map(tier => {
              const p = tierPricing[tier];
              const monthly = p.monthly;
              return (
                <TierOption
                  key={tier}
                  icon={TIER_ICONS[tier]}
                  label={TIER_LABELS[tier]}
                  blurb={TIER_BLURBS[tier]}
                  price={monthly === 0 ? "$0" : money(monthly)}
                  cadence={monthly === 0 ? undefined : "/mo"}
                  badge={tier === "advanced" && promoLive ? "Free now" : undefined}
                  selected={selectedTier === tier && !promoMode}
                  onSelect={() => pickTier(tier)}
                />
              );
            })}
          </div>

          {promoMode && (
            <div className="mt-3 text-[12px] flex items-center gap-2" style={{ color: ROYAL.gold }}>
              <Gift className="w-4 h-4" /> Launch promo applied — Advanced, free forever.
              <button onClick={() => { setPromoMode(false); pickTier("advanced"); }}
                      className="underline underline-offset-2" style={{ color: ROYAL.dim }}>
                cancel
              </button>
            </div>
          )}

          {selectedTier && selectedTier !== "free" && !promoMode && (
            <div className="mt-4 pt-3.5 flex items-center gap-2 flex-wrap"
                 style={{ borderTop: "1px solid hsl(var(--border))" }}>
              <span className="text-[10px] uppercase tracking-[0.2em] mr-1" style={{ color: ROYAL.dim }}>Billing</span>
              <Pill active={period === "monthly"} onClick={() => setPeriod("monthly")}>Monthly</Pill>
              <Pill active={period === "yearly"} onClick={() => setPeriod("yearly")}>Yearly</Pill>
              {lifetimeAvailable && (
                <Pill active={period === "lifetime"} onClick={() => setPeriod("lifetime")}>Lifetime — launch deal</Pill>
              )}
            </div>
          )}
        </Section>

        {/* 2 — Modules */}
        {selectedTier && (
          <Section
            step={2}
            title="Your modules"
            hint={
              selectedTier === "advanced" || promoMode
                ? undefined
                : selectedTier === "free"
                ? "Pick the one module you want unlocked."
                : "Free picks first; anything beyond your allowance is added as a paid add-on."
            }
            aside={
              selectedTier === "advanced" || promoMode ? null
                : selectedTier === "free"
                ? (freeModule ? "1 of 1 picked" : "Pick 1")
                : `${extras.length} of ${allowance} free picks`
            }
            delay={0.02}
          >
            {selectedTier === "advanced" || promoMode ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: ROYAL.text }}>
                <Check className="w-4 h-4" style={{ color: ROYAL.gold }} />
                Every module in the app is included — nothing to pick.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-1.5 max-h-[22rem] overflow-y-auto pr-1 list-virtual">
                {addonPrices.map(m => {
                  const bundled = bundledIds.includes(m.moduleId);
                  const chosen = selectedTier === "free" ? freeModule === m.moduleId : extras.includes(m.moduleId);
                  const isAddon = addons.includes(m.moduleId);
                  const price = priceFor(m, selectedTier);
                  const tone = bundled
                    ? { bg: "rgba(217,183,117,0.10)", bd: "rgba(217,183,117,0.30)", fg: ROYAL.gold }
                    : chosen
                    ? { bg: "rgba(217,183,117,0.18)", bd: "rgba(217,183,117,0.55)", fg: ROYAL.gold }
                    : isAddon
                    ? { bg: "rgba(124,110,255,0.14)", bd: "rgba(160,150,255,0.45)", fg: "#c3bcff" }
                    : { bg: "hsl(var(--muted) / 0.28)", bd: "hsl(var(--border))", fg: ROYAL.dim };
                  return (
                    <button
                      key={m.moduleId} type="button" onClick={() => toggleModule(m.moduleId)} disabled={bundled}
                      className="text-left flex items-center justify-between gap-1.5 text-[12px] px-2.5 py-2 rounded-lg"
                      style={{
                        background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.fg,
                        cursor: bundled ? "default" : "pointer",
                        transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
                      }}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        {(bundled || chosen) && <Check className="w-3 h-3 shrink-0" />}
                        <span className="truncate">{m.label}</span>
                      </span>
                      {bundled
                        ? <Lock className="w-3 h-3 shrink-0 opacity-60" />
                        : isAddon
                        ? <span className="shrink-0 font-semibold">{money(price)}/mo</span>
                        : null}
                    </button>
                  );
                })}
              </div>
            )}
          </Section>
        )}

        {/* 3 — Account (joining only) */}
        {selectedTier && joining && (
          <Section step={3} title="Create your account"
                   hint="Your plan above is applied the moment the account is created." delay={0.02}>
            <AccountFields
              name={name} email={email} pin={pin} answers={answers} questions={questions}
              onName={setName} onEmail={setEmail} onPin={setPin}
              onAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
            />
            {accountError && (
              <p className="text-xs mt-3 flex items-center gap-1.5" style={{ color: "#f3a3a5" }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {accountError}
              </p>
            )}
          </Section>
        )}

        {/* 4 — Review */}
        {selectedTier && (
          <Section step={joining ? 4 : 3} title="Review &amp; confirm" delay={0.02}>
            {/* Coupon */}
            {couponEligible && (
              <div className="mb-4">
                <span className="text-[10px] uppercase tracking-[0.18em] flex items-center gap-1.5 mb-1.5"
                      style={{ color: ROYAL.dim }}>
                  <Tag className="w-3 h-3" style={{ color: ROYAL.gold }} /> Coupon code
                </span>
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponResult(null); }}
                    placeholder="CODE"
                    className="flex-1 rounded-lg px-3 py-2 text-sm outline-none font-mono uppercase"
                    style={{ background: "hsl(var(--muted) / 0.35)", border: "1px solid hsl(var(--border))", color: ROYAL.text, colorScheme: "dark" }}
                  />
                  <button onClick={runCouponCheck} disabled={couponChecking || !couponInput.trim()}
                          className="px-3.5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
                          style={{ background: "rgba(217,183,117,0.16)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
                    {couponChecking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Apply"}
                  </button>
                </div>
                {couponResult && !couponResult.valid && <p className="text-xs mt-1.5" style={{ color: "#f3a3a5" }}>{couponResult.error}</p>}
                {couponResult?.valid && <p className="text-xs mt-1.5" style={{ color: ROYAL.gold }}>Applied!</p>}
              </div>
            )}

            {/* Receipt */}
            <div className="space-y-2">
              {promoMode ? (
                <div className="flex justify-between text-sm" style={{ color: ROYAL.text }}>
                  <span>Advanced — launch promo</span>
                  <span className="font-semibold" style={{ color: ROYAL.gold }}>$0 forever</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-sm" style={{ color: ROYAL.text }}>
                    <span>
                      {TIER_LABELS[selectedTier]}
                      {period === "lifetime" ? " — Lifetime" : period === "yearly" ? " — Yearly" : " — Monthly"}
                    </span>
                    <span className={discount > 0 ? "line-through" : "font-semibold"}
                          style={discount > 0 ? { color: ROYAL.dim } : undefined}>
                      {money(basePrice)}
                    </span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm" style={{ color: ROYAL.gold }}>
                      <span>Coupon {couponResult?.code}</span>
                      <span>-{money(discount)}</span>
                    </div>
                  )}
                  {addons.length > 0 && (
                    <div className="pt-2 space-y-1" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                      <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: ROYAL.dim }}>
                        Add-ons (billed monthly)
                      </div>
                      {addons.map(id => {
                        const m = addonPrices.find(x => x.moduleId === id);
                        if (!m) return null;
                        return (
                          <div key={id} className="flex justify-between text-sm" style={{ color: ROYAL.text }}>
                            <span>{m.label}</span>
                            <span>{money(priceFor(m, selectedTier))}/mo</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              <div className="pt-2.5 flex justify-between items-baseline" style={{ borderTop: "1px solid hsl(var(--border))" }}>
                <span className="text-sm font-semibold" style={{ color: ROYAL.text }}>Due today</span>
                <motion.span
                  key={dueToday.toFixed(2)}
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="text-2xl font-bold"
                  style={{ fontFamily: HEADING, color: ROYAL.gold }}
                >
                  {money(dueToday)}
                </motion.span>
              </div>

              {!promoMode && period === "lifetime" && addonsMonthly > 0 && (
                <p className="text-[10px]" style={{ color: ROYAL.dim }}>
                  One-time {money(basePrice)} plan fee, then {money(addonsMonthly)}/mo for your add-ons.
                </p>
              )}
              {!promoMode && period !== "lifetime" && couponResult?.valid && couponResult.kind?.startsWith("first_month") && (
                <p className="text-[10px]" style={{ color: ROYAL.dim }}>
                  Then {money(basePrice + addonsMonthly)}{cadenceNote} after your first payment.
                </p>
              )}
            </div>
          </Section>
        )}

        {/* Call to action — always rendered once a tier exists, disabled with a
            reason rather than hidden. */}
        {selectedTier && (
          <div className="space-y-2.5">
            {blockers.length > 0 && (
              <ul className="text-[12px] space-y-1" style={{ color: ROYAL.dim }}>
                {blockers.slice(0, 4).map(b => (
                  <li key={b} className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full shrink-0" style={{ background: ROYAL.gold }} />
                    {b}
                  </li>
                ))}
              </ul>
            )}
            {submitError && (
              <p className="text-xs flex items-center gap-1.5" style={{ color: "#f3a3a5" }}>
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {submitError}
              </p>
            )}
            <motion.button
              onClick={submit}
              disabled={!ready || submitting}
              whileTap={ready ? { scale: 0.99 } : undefined}
              className="w-full py-3.5 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 text-[15px] text-center"
              style={{
                background: ready
                  ? `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`
                  : "hsl(var(--muted) / 0.5)",
                color: ready ? "#171420" : ROYAL.dim,
                border: `1px solid ${ready ? "rgba(217,183,117,0.7)" : "hsl(var(--border))"}`,
                boxShadow: ready ? "0 16px 34px -22px rgba(217,183,117,0.7)" : "none",
                cursor: ready && !submitting ? "pointer" : "not-allowed",
                transition: "background 200ms ease, color 200ms ease, border-color 200ms ease, box-shadow 200ms ease",
              }}
            >
              {submitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : isFreeCompletion ? <Check className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
              {submitting
                ? "Working…"
                : promoMode ? "Claim my free spot"
                : isFreeCompletion ? (joining ? "Create account & finish — Free" : "Complete signup — Free")
                : `Secure checkout — ${money(dueToday)} today`}
            </motion.button>
            {!isFreeCompletion && (
              <p className="text-[10px] text-center" style={{ color: ROYAL.dim }}>
                You'll be redirected to Stripe to enter payment details.
              </p>
            )}
          </div>
        )}

        {!selectedTier && (
          <p className="text-[12px] text-center pt-1" style={{ color: ROYAL.dim }}>
            Pick a tier above to keep going.
          </p>
        )}
      </div>
    </>
  );
}
