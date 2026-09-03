/**
 * Subscription — the member's own billing surface.
 *
 * Three tabs: what they have, what every module would cost them right now, and
 * a live editor that takes a change straight to checkout. Free for everyone,
 * because the one thing a subscription page must never do is hide behind a
 * subscription.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import {
  CreditCard, Check, Lock, Loader2, Crown, Star, Zap, Sparkles, ExternalLink,
  ShieldCheck, CalendarClock, AlertCircle, Search, ArrowRight,
} from "lucide-react";
import { useAuth, ALL_MODULES, HIDDEN_MODULES, type Tier } from "../hooks/useAuth";
import {
  TIER_KEYS, type TierKey, getTierPricing, type TierPricing,
  getTierModuleConfig, type TierModuleConfig,
  listModuleAddonPrices, type ModuleAddonPrice,
  getLifetimeDeals, type LifetimeDeals, startCheckout,
} from "../lib/plans";
import { getBillingStatus, openBillingPortal, tierKeyOf, addonPriceFor, moduleStateFor } from "../lib/subscription";
import {
  ALERT_LEVELS, fetchAlertPrices, fetchMyLevels, startAlertLevelCheckout, dropAlertLevel,
  money as alertMoney, type LevelSource,
} from "../lib/alerts";
import { AlertLadder } from "../components/alerts/AlertLadder";
import { TTL } from "../lib/queryClient";
import { ROYAL, HEADING, EASE, SPRING } from "../lib/royal";

type TabId = "plan" | "alerts" | "modules" | "modify";

const TIER_LABEL: Record<TierKey, string> = { free: "Free", basic: "Basic", vip: "VIP", advanced: "Advanced" };
const TIER_ICON: Record<TierKey, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> =
  { free: Star, basic: Zap, vip: Crown, advanced: Sparkles };
const TIER_BLURB: Record<TierKey, string> = {
  free: "One module, on us.",
  basic: "The core toolkit.",
  vip: "Serious storm tracking.",
  advanced: "Everything, always.",
};

const SURFACE: React.CSSProperties = {
  background: "linear-gradient(180deg, hsl(var(--card) / 0.95), hsl(var(--card) / 0.8))",
  border: "1px solid hsl(var(--border))",
  boxShadow: "0 24px 50px -34px rgba(0,0,0,0.95)",
};

const money = (n: number) => `$${n.toFixed(2)}`;

/** Section shell — numbered plate, champagne rule, staggered entrance. */
function Panel({ title, hint, aside, delay = 0, children }: {
  title: string; hint?: string; aside?: React.ReactNode; delay?: number; children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      className="relative rounded-2xl p-4 sm:p-5 overflow-hidden" style={SURFACE}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />
      <header className="flex items-start justify-between gap-3 mb-3.5">
        <div className="min-w-0">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em]"
              style={{ fontFamily: HEADING, color: ROYAL.gold }}>{title}</h2>
          {hint && <p className="text-[11px] mt-0.5 leading-snug" style={{ color: ROYAL.dim }}>{hint}</p>}
        </div>
        {aside && <div className="shrink-0 text-[11px]" style={{ color: ROYAL.dim }}>{aside}</div>}
      </header>
      {children}
    </motion.section>
  );
}

export default function Subscription() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<TabId>("plan");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // A locked module in the sidebar links here with ?add=<path>.
  const wanted = useMemo(() => new URLSearchParams(window.location.search).get("add"), []);
  const [pendingAdd, setPendingAdd] = useState<string[]>([]);

  useEffect(() => {
    if (!wanted) return;
    setTab("modify");
    setPendingAdd([wanted]);
    window.history.replaceState({}, "", "/subscription");
  }, [wanted]);

  // Signed-out visitors belong on the join page, not here.
  useEffect(() => {
    if (!authLoading && !user) navigate("/plans");
  }, [authLoading, user, navigate]);

  const cfgQ = useQuery({
    queryKey: ["subscription-config"],
    queryFn: async () => {
      const [pricing, tierCfg, addons, lifetime] = await Promise.all([
        getTierPricing(), getTierModuleConfig(), listModuleAddonPrices(), getLifetimeDeals(),
      ]);
      return { pricing, tierCfg, addons, lifetime } as {
        pricing: TierPricing; tierCfg: TierModuleConfig; addons: ModuleAddonPrice[]; lifetime: LifetimeDeals;
      };
    },
    staleTime: 15 * 60 * 1000,
  });

  const billingQ = useQuery({
    queryKey: ["billing-status", user?.id],
    queryFn: getBillingStatus,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const tier: TierKey = user ? tierKeyOf(user.tier as Tier) : "free";
  const addons = cfgQ.data?.addons ?? [];
  const pricing = cfgQ.data?.pricing;

  /** Every sellable module, joined to its price and this member's state. */
  const catalogue = useMemo(() => {
    const priced = new Map(addons.map((a) => [a.moduleId, a]));
    return ALL_MODULES
      .filter((m) => !m.adminOnly && !HIDDEN_MODULES.has(m.id))
      .map((m) => {
        const p = priced.get(m.id);
        const state = moduleStateFor(m.id, tier, user?.enabledModules ?? [], !!m.alwaysOn);
        return {
          id: m.id,
          label: p?.label ?? m.label,
          alwaysOn: !!m.alwaysOn,
          price: p ? addonPriceFor(p, tier) : null,
          state,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [addons, tier, user?.enabledModules]);

  const owned = catalogue.filter((c) => c.state !== "available").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? catalogue.filter((c) => c.label.toLowerCase().includes(q)) : catalogue;
  }, [catalogue, query]);

  const addTotal = useMemo(
    () => pendingAdd.reduce((sum, id) => sum + (catalogue.find((c) => c.id === id)?.price ?? 0), 0),
    [pendingAdd, catalogue],
  );

  async function buyAddons() {
    if (pendingAdd.length === 0) return;
    setBusy(true); setErr(null);
    const r = await startCheckout({
      tier, period: "monthly", chosenModuleIds: [], addonModuleIds: pendingAdd,
    });
    setBusy(false);
    if (!r.ok || !r.url) { setErr(r.error ?? "Could not start checkout."); return; }
    window.location.href = r.url;
  }

  async function changeTier(next: TierKey, period: "monthly" | "yearly") {
    setBusy(true); setErr(null);
    const r = await startCheckout({ tier: next, period, chosenModuleIds: [], addonModuleIds: [] });
    setBusy(false);
    if (!r.ok || !r.url) { setErr(r.error ?? "Could not start checkout."); return; }
    window.location.href = r.url;
  }

  async function manageBilling() {
    setBusy(true); setErr(null);
    const r = await openBillingPortal();
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "Billing is unavailable right now.");
  }

  if (authLoading || !user || cfgQ.isLoading || !pricing) {
    return (
      <div className="p-10 flex items-center justify-center gap-2" style={{ color: ROYAL.dim }}>
        <Loader2 className="w-5 h-5 animate-spin" /> Loading your subscription…
      </div>
    );
  }

  const sub = billingQ.data?.subscription ?? null;
  const TABS: { id: TabId; label: string }[] = [
    { id: "plan", label: "Your plan" },
    { id: "alerts", label: "Alerts" },
    { id: "modules", label: "All modules" },
    { id: "modify", label: "Modify plan" },
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4 pb-16">
      <motion.header initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                     transition={{ duration: 0.5, ease: EASE }} className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: ROYAL.gold }}>
          StormSync VIP
        </div>
        <h1 className="text-2xl font-bold tracking-[0.01em]" style={{ fontFamily: HEADING, color: ROYAL.text }}>
          Subscription
        </h1>
        <p className="text-sm" style={{ color: ROYAL.dim }}>
          Everything about what you pay for, and everything you could add.
        </p>
      </motion.header>

      {/* Tabs — one travelling champagne slab, not three crossfading buttons. */}
      <LayoutGroup id="sub-tabs">
        <div className="flex gap-1.5 p-1 rounded-xl w-fit"
             style={{ background: "hsl(var(--muted) / 0.3)", border: "1px solid hsl(var(--border))" }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
                    className="relative px-3.5 py-1.5 rounded-lg text-[11.5px] font-semibold uppercase tracking-[0.1em]"
                    style={{ color: tab === t.id ? "#17141f" : ROYAL.dim, zIndex: 1 }}>
              {tab === t.id && (
                <motion.span layoutId="sub-tab-slab" transition={SPRING.silk}
                             className="absolute inset-0 rounded-lg -z-10"
                             style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)` }} />
              )}
              {t.label}
            </button>
          ))}
        </div>
      </LayoutGroup>

      {err && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: "#f3a3a5" }}>
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {err}
        </p>
      )}

      <AnimatePresence mode="wait">
        {/* ── YOUR PLAN ─────────────────────────────────────────────────── */}
        {tab === "plan" && (
          <motion.div key="plan" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.32, ease: EASE }}
                      className="space-y-4">
            <Panel title="Current plan" hint="What you're on today.">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-14 h-14 rounded-xl grid place-items-center shrink-0"
                     style={{ background: "rgba(217,183,117,0.14)", border: `1px solid ${ROYAL.goldSoft}` }}>
                  {(() => { const I = TIER_ICON[tier]; return <I className="w-7 h-7" style={{ color: ROYAL.gold }} />; })()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xl font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
                    {TIER_LABEL[tier]}
                  </div>
                  <div className="text-[12px]" style={{ color: ROYAL.dim }}>{TIER_BLURB[tier]}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums" style={{ fontFamily: HEADING, color: ROYAL.gold }}>
                    {sub?.amount != null ? money(sub.amount) : pricing[tier].monthly === 0 ? "$0" : money(pricing[tier].monthly)}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.16em]" style={{ color: ROYAL.dim }}>
                    per {sub?.interval ?? "month"}
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-2 mt-4">
                {[
                  { k: "Modules unlocked", v: `${owned}`, sub: `of ${catalogue.length} in the app` },
                  {
                    k: sub?.cancelAtPeriodEnd ? "Access ends" : "Renews",
                    v: sub?.currentPeriodEnd
                      ? new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                      : tier === "free" ? "Never" : "—",
                    sub: sub?.status ? sub.status.replace(/_/g, " ") : tier === "free" ? "free tier" : "no billing on file",
                  },
                  { k: "Member since", v: new Date(user.joinedAt || user.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" }), sub: `${user.referrals} referral${user.referrals === 1 ? "" : "s"}` },
                ].map((s, i) => (
                  <motion.div key={s.k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.08 + i * 0.06, duration: 0.35, ease: EASE }}
                              className="rounded-lg px-3 py-2.5"
                              style={{ background: "hsl(var(--muted) / 0.3)", border: "1px solid hsl(var(--border))" }}>
                    <div className="text-[9px] uppercase tracking-[0.18em]" style={{ color: ROYAL.dim }}>{s.k}</div>
                    <div className="text-[15px] font-semibold" style={{ color: ROYAL.text }}>{s.v}</div>
                    <div className="text-[10px] capitalize" style={{ color: ROYAL.dim }}>{s.sub}</div>
                  </motion.div>
                ))}
              </div>

              {sub?.cancelAtPeriodEnd && (
                <div className="mt-3 rounded-lg px-3 py-2.5 text-[12px] flex items-start gap-2"
                     style={{ background: "rgba(232,187,77,0.08)", border: "1px solid rgba(232,187,77,0.35)", color: "#e8bb4d" }}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  Your plan is set to end at the close of this billing period. You keep everything until then, and you
                  can restart any time from Manage billing.
                </div>
              )}

              <div className="flex flex-wrap gap-2 mt-4">
                <button onClick={() => setTab("modify")}
                        className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5"
                        style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
                  Change plan <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button onClick={manageBilling} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
                        style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))", color: ROYAL.text }}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                  Manage billing &amp; cancel <ExternalLink className="w-3 h-3 opacity-60" />
                </button>
              </div>
              <p className="text-[10.5px] mt-2" style={{ color: ROYAL.dim }}>
                Manage billing opens Stripe, where you can change your card, download every invoice, or cancel. Nothing
                is charged there without your confirmation.
              </p>
            </Panel>

            <Panel title="The other plans" hint="What each tier includes, at today's prices." delay={0.06}>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {TIER_KEYS.map((t) => {
                  const I = TIER_ICON[t];
                  const current = t === tier;
                  const picks = cfgQ.data?.tierCfg.choosableCount[t] ?? 0;
                  return (
                    <div key={t} className="rounded-xl p-3.5"
                         style={{
                           background: current
                             ? "linear-gradient(158deg, rgba(217,183,117,0.20), rgba(217,183,117,0.05) 62%, hsl(var(--card) / 0.9))"
                             : "linear-gradient(180deg, hsl(var(--card) / 0.9), hsl(var(--card) / 0.72))",
                           border: `1px solid ${current ? "rgba(217,183,117,0.6)" : "hsl(var(--border))"}`,
                         }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <I className="w-5 h-5" style={{ color: current ? ROYAL.gold : ROYAL.dim }} />
                        {current && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
                                style={{ background: "rgba(217,183,117,0.18)", color: ROYAL.gold, border: `1px solid ${ROYAL.goldSoft}` }}>
                            Your plan
                          </span>
                        )}
                      </div>
                      <div className="text-[15px] font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>{TIER_LABEL[t]}</div>
                      <div className="text-[11px] mb-2" style={{ color: ROYAL.dim }}>{TIER_BLURB[t]}</div>
                      <div className="text-sm font-semibold" style={{ color: current ? ROYAL.gold : ROYAL.text }}>
                        {pricing[t].monthly === 0 ? "$0" : money(pricing[t].monthly)}
                        <span className="text-[11px] font-normal" style={{ color: ROYAL.dim }}>/mo</span>
                        {pricing[t].yearly > 0 && (
                          <span className="text-[10.5px] font-normal ml-2" style={{ color: ROYAL.dim }}>
                            or {money(pricing[t].yearly)}/yr
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] mt-1.5" style={{ color: ROYAL.dim }}>
                        {t === "advanced" ? "Every module in the app" : `Bundle + ${picks} module pick${picks === 1 ? "" : "s"}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </motion.div>
        )}

        {/* ── ALERTS ────────────────────────────────────────────────────── */}
        {tab === "alerts" && (
          <motion.div key="alerts" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.32, ease: EASE }}
                      className="space-y-4">
            <AlertLevelsPanel tier={tier} />
          </motion.div>
        )}

        {/* ── ALL MODULES ───────────────────────────────────────────────── */}
        {tab === "modules" && (
          <motion.div key="modules" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.32, ease: EASE }}>
            <Panel
              title="Every module"
              hint={tier === "advanced"
                ? "Advanced includes all of them — nothing here costs extra."
                : `Add-on prices shown are what you'd pay at the ${TIER_LABEL[tier]} tier, today.`}
              aside={<span>{owned} of {catalogue.length} unlocked</span>}
            >
              <div className="relative mb-3">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: ROYAL.dim }} />
                <input value={query} onChange={(e) => setQuery(e.target.value)}
                       placeholder="Find a module…"
                       className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none"
                       style={{ background: "hsl(var(--muted) / 0.35)", border: "1px solid hsl(var(--border))", color: ROYAL.text, colorScheme: "dark" }} />
              </div>

              <div className="grid sm:grid-cols-2 gap-1.5 max-h-[26rem] overflow-y-auto pr-1 list-virtual">
                {filtered.map((c, i) => {
                  const tone = c.state === "included"
                    ? { bg: "rgba(217,183,117,0.10)", bd: "rgba(217,183,117,0.30)", fg: ROYAL.gold }
                    : c.state === "owned"
                    ? { bg: "rgba(95,217,168,0.10)", bd: "rgba(95,217,168,0.32)", fg: "#5fd9a8" }
                    : { bg: "hsl(var(--muted) / 0.28)", bd: "hsl(var(--border))", fg: ROYAL.dim };
                  return (
                    <motion.div key={c.id}
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(0.35, i * 0.012), duration: 0.28, ease: EASE }}
                                className="flex items-center justify-between gap-2 text-[12px] px-2.5 py-2 rounded-lg"
                                style={{ background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.fg }}>
                      <span className="flex items-center gap-1.5 min-w-0">
                        {c.state === "available" ? <Lock className="w-3 h-3 shrink-0 opacity-70" />
                                                 : <Check className="w-3 h-3 shrink-0" />}
                        <span className="truncate">{c.label}</span>
                      </span>
                      {c.state === "available" ? (
                        <span className="shrink-0 font-semibold tabular-nums">
                          {c.price != null ? `${money(c.price)}/mo` : "—"}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] uppercase tracking-wider opacity-80">
                          {c.state === "included" ? (c.alwaysOn ? "Always on" : "Included") : "Yours"}
                        </span>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {tier !== "advanced" && (
                <button onClick={() => setTab("modify")}
                        className="mt-3.5 w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5"
                        style={{ background: "rgba(217,183,117,0.14)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
                  Add modules or change tier <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </Panel>
          </motion.div>
        )}

        {/* ── MODIFY PLAN ───────────────────────────────────────────────── */}
        {tab === "modify" && (
          <motion.div key="modify" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.32, ease: EASE }}
                      className="space-y-4">
            <Panel title="Move to another tier" hint="Upgrading unlocks that tier's bundle immediately after checkout.">
              <div className="grid sm:grid-cols-2 gap-2.5">
                {TIER_KEYS.filter((t) => t !== "free").map((t) => {
                  const I = TIER_ICON[t];
                  const current = t === tier;
                  return (
                    <div key={t} className="rounded-xl p-3.5 flex flex-col"
                         style={{
                           background: current ? "rgba(217,183,117,0.10)" : "linear-gradient(180deg, hsl(var(--card) / 0.9), hsl(var(--card) / 0.72))",
                           border: `1px solid ${current ? "rgba(217,183,117,0.5)" : "hsl(var(--border))"}`,
                         }}>
                      <div className="flex items-center gap-2 mb-1">
                        <I className="w-4.5 h-4.5" style={{ color: current ? ROYAL.gold : ROYAL.dim }} />
                        <span className="text-[15px] font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
                          {TIER_LABEL[t]}
                        </span>
                      </div>
                      <div className="text-[11px] mb-2.5" style={{ color: ROYAL.dim }}>{TIER_BLURB[t]}</div>
                      {current ? (
                        <div className="mt-auto text-[11px] uppercase tracking-[0.14em] font-semibold py-2 text-center rounded-lg"
                             style={{ color: ROYAL.gold, border: `1px dashed ${ROYAL.goldSoft}` }}>
                          Current plan
                        </div>
                      ) : (
                        <div className="mt-auto flex gap-1.5">
                          <button onClick={() => changeTier(t, "monthly")} disabled={busy}
                                  className="flex-1 py-2 rounded-lg text-[12px] font-semibold disabled:opacity-50"
                                  style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
                            {money(pricing[t].monthly)}/mo
                          </button>
                          <button onClick={() => changeTier(t, "yearly")} disabled={busy}
                                  className="flex-1 py-2 rounded-lg text-[12px] font-semibold disabled:opacity-50"
                                  style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))", color: ROYAL.text }}>
                            {money(pricing[t].yearly)}/yr
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>

            {tier !== "advanced" && (
              <Panel title="Add individual modules" hint="Billed monthly on top of your plan. Cancel any of them any time."
                     aside={pendingAdd.length > 0 ? <span style={{ color: ROYAL.gold }}>{pendingAdd.length} selected</span> : null}
                     delay={0.06}>
                <div className="grid sm:grid-cols-2 gap-1.5 max-h-[22rem] overflow-y-auto pr-1">
                  {catalogue.filter((c) => c.state === "available").map((c) => {
                    const picked = pendingAdd.includes(c.id);
                    return (
                      <button key={c.id} type="button"
                              onClick={() => setPendingAdd((p) => picked ? p.filter((x) => x !== c.id) : [...p, c.id])}
                              className="flex items-center justify-between gap-2 text-[12px] px-2.5 py-2 rounded-lg text-left"
                              style={{
                                background: picked ? "rgba(217,183,117,0.18)" : "hsl(var(--muted) / 0.28)",
                                border: `1px solid ${picked ? "rgba(217,183,117,0.55)" : "hsl(var(--border))"}`,
                                color: picked ? ROYAL.gold : ROYAL.dim,
                                transition: "background 160ms ease, border-color 160ms ease, color 160ms ease",
                              }}>
                        <span className="flex items-center gap-1.5 min-w-0">
                          {picked && <Check className="w-3 h-3 shrink-0" />}
                          <span className="truncate">{c.label}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">
                          {c.price != null ? `${money(c.price)}/mo` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {pendingAdd.length > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: EASE }}
                                className="overflow-hidden">
                      <div className="pt-3.5 mt-3.5 flex items-center justify-between gap-3 flex-wrap"
                           style={{ borderTop: "1px solid hsl(var(--border))" }}>
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.18em]" style={{ color: ROYAL.dim }}>
                            Added to your monthly bill
                          </div>
                          <motion.div key={addTotal.toFixed(2)}
                                      initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                                      transition={{ duration: 0.25, ease: EASE }}
                                      className="text-2xl font-bold tabular-nums"
                                      style={{ fontFamily: HEADING, color: ROYAL.gold }}>
                            {money(addTotal)}
                          </motion.div>
                        </div>
                        <button onClick={buyAddons} disabled={busy}
                                className="px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50"
                                style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
                          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                          Secure checkout
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Panel>
            )}

            <Panel title="Cancel or pause" hint="No retention maze — this is Stripe's own portal." delay={0.1}>
              <div className="flex items-start gap-3 flex-wrap">
                <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" style={{ color: ROYAL.gold }} />
                <p className="text-[12.5px] flex-1 min-w-[220px]" style={{ color: ROYAL.dim }}>
                  Cancelling stops the next payment. You keep every module you've paid for until the end of the period
                  you've already bought, then drop to the Free tier — your account, saved locations and history stay
                  exactly where they are.
                </p>
                <button onClick={manageBilling} disabled={busy}
                        className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                        style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))", color: ROYAL.text }}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                  Open billing portal
                </button>
              </div>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[10.5px] text-center pt-2" style={{ color: ROYAL.dim }}>
        Questions about a charge? <Link href="/contact" style={{ color: ROYAL.gold }}>Contact us</Link> — we answer every one.
      </p>
    </div>
  );
}

/**
 * Changing alert level, from the billing page.
 *
 * The ladder is already sold on the plans page and managed in the profile, but
 * neither is where somebody goes when they are thinking about what they pay for.
 * This is, so it belongs here too — and buying from here is the same checkout,
 * priced server-side against the tier they are actually on.
 */
function AlertLevelsPanel({ tier }: { tier: TierKey }) {
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState<number | null>(null);
  const pricesQ = useQuery({ queryKey: ["alert-prices"], queryFn: fetchAlertPrices, staleTime: TTL.config });
  const levelsQ = useQuery({ queryKey: ["my-alert-levels"], queryFn: fetchMyLevels, staleTime: TTL.config });

  const tierNum: Tier = tier === "free" ? 1 : tier === "basic" ? 2 : tier === "vip" ? 3 : 4;
  const held = levelsQ.data ?? [];
  const top = held.length ? Math.max(...held.map((h) => h.level)) : 0;
  const bought = held.filter((h) => h.source === "purchased");
  const monthly = bought.reduce((sum, h) => {
    const row = (pricesQ.data ?? []).find((p) => p.level === h.level);
    const raw = tierNum === 1 ? row?.free_price : tierNum === 2 ? row?.basic_price : row?.vip_price;
    return sum + Number(raw ?? 0);
  }, 0);

  async function buy(level: number) {
    setBusy(true); setErr(null); setNote(null);
    const r = await startAlertLevelCheckout(level);
    if (r.ok && r.url) { window.location.href = r.url; return; }
    setErr(r.error ?? "Could not start checkout.");
    setBusy(false);
  }

  async function drop(level: number, source: LevelSource) {
    const def = ALERT_LEVELS.find((l) => l.level === level);
    const question = source === "purchased"
      ? `Cancel ${def?.name}? Billing for that level stops and you lose it straight away. Everything your plan includes stays.`
      : `Remove ${def?.name} from your account? You can ask for it again later.`;
    if (!globalThis.confirm(question)) return;
    setDropping(level); setErr(null); setNote(null);
    const r = await dropAlertLevel(level);
    setDropping(null);
    if (!r.ok) { setErr(r.error ?? "Could not change that level."); return; }
    setNote(r.message ?? "That level has been removed.");
    await levelsQ.refetch();
  }

  if (pricesQ.isLoading || levelsQ.isLoading) {
    return (
      <div className="p-10 flex items-center justify-center gap-2" style={{ color: ROYAL.dim }}>
        <Loader2 className="w-5 h-5 animate-spin" /> Loading your alert levels…
      </div>
    );
  }

  return (
    <>
      <Panel
        title="Alert level"
        hint="How far up the ladder you are, and what the next rung costs."
        aside={
          <span className="text-[11px] px-2 py-1 rounded-lg"
                style={{ background: "rgba(217,183,117,0.12)", color: ROYAL.gold }}>
            {top > 0 ? ALERT_LEVELS.find((l) => l.level === top)?.name ?? `Level ${top}` : "None yet"}
          </span>
        }
      >
        <p className="text-[12.5px] mb-3" style={{ color: ROYAL.dim }}>
          Levels are cumulative and are billed monthly on their own, separate from your plan. Buying one takes
          effect the moment the payment clears, and cancelling it in the billing portal removes that level and
          nothing else. Anything your plan already includes stays yours for free.
        </p>
        {err && (
          <p className="text-xs flex items-center gap-1.5 mb-3" style={{ color: "#f3a3a5" }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {err}
          </p>
        )}
        {note && (
          <p className="text-xs flex items-center gap-1.5 mb-3" style={{ color: "#8fe3c4" }}>
            <Check className="w-3.5 h-3.5 shrink-0" /> {note}
          </p>
        )}
        <AlertLadder
          tier={tierNum}
          prices={pricesQ.data ?? []}
          held={held}
          onAdd={busy ? undefined : (level) => void buy(level)}
          onRemove={(level, source) => void drop(level, source)}
          busyLevel={dropping}
        />
      </Panel>

      <Panel title="What alerts cost you" hint="On top of your plan.">
        {bought.length === 0 ? (
          <p className="text-[13px]" style={{ color: ROYAL.dim }}>
            Nothing — every level you hold comes with your plan.
          </p>
        ) : (
          <div className="space-y-2">
            {bought.map((h) => {
              const def = ALERT_LEVELS.find((l) => l.level === h.level);
              const row = (pricesQ.data ?? []).find((p) => p.level === h.level);
              const raw = tierNum === 1 ? row?.free_price : tierNum === 2 ? row?.basic_price : row?.vip_price;
              return (
                <div key={h.level} className="flex items-center gap-2 text-[13px]">
                  <span className="font-semibold" style={{ color: def?.color ?? ROYAL.text }}>{def?.name}</span>
                  <span className="ml-auto tabular-nums" style={{ color: ROYAL.text }}>
                    {raw != null ? `${alertMoney(Number(raw))}/mo` : "—"}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center gap-2 pt-2 text-[13px] font-bold"
                 style={{ borderTop: `1px solid ${ROYAL.hairline}`, color: ROYAL.text }}>
              Alerts total
              <span className="ml-auto tabular-nums" style={{ color: ROYAL.gold }}>{alertMoney(monthly)}/mo</span>
            </div>
          </div>
        )}
        <p className="text-[11.5px] mt-3" style={{ color: ROYAL.dim }}>
          Drop a level with the button on its rung — that cancels its billing and nothing else. The billing
          portal on the Your&nbsp;plan tab is still there for payment details and invoices.
        </p>
      </Panel>
    </>
  );
}
