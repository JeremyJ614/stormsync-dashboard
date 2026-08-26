/**
 * Money.
 *
 * The billing tab decides what things cost. This one says what is actually
 * coming in — and, just as importantly, what is not. The headline number is
 * recurring revenue from subscriptions that are genuinely being billed; comped
 * and founding accounts appear beside it as forgone list value, never folded
 * into it. See lib/revenue for why that separation is the whole point.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  DollarSign, TrendingUp, Users2, Gift, Ticket, Loader2, AlertTriangle,
  Repeat, Sparkles, CreditCard,
} from "lucide-react";
import { revenueSummary, money, type RevenueSummary } from "../lib/revenue";
import { ROYAL, prefersReducedMotion } from "../lib/royal";

const TIER_COLOR: Record<string, string> = {
  advanced: "#d9b775", vip: "#c084fc", basic: "#5fd9a8", free: "#7f9fd8",
};

export function AdminMoneyTab() {
  const [data, setData] = useState<RevenueSummary | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    revenueSummary().then(setData).catch(() => setErr("Could not load billing data."));
  }, []);

  if (err) {
    return (
      <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> {err}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Counting…
      </div>
    );
  }

  const maxTier = Math.max(1, ...data.tiers.map((t) => t.members));

  return (
    <div className="space-y-5">
      {/* headline */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Money
          icon={Repeat} label="Recurring / month" value={money(data.mrr)} tone={ROYAL.gold} big
          note={data.payingMembers === 1 ? "1 billed subscription" : `${data.payingMembers} billed subscriptions`}
        />
        <Money icon={TrendingUp} label="Recurring / year" value={money(data.arr)} note="Subscriptions only" />
        <Money icon={Sparkles} label="Lifetime booked" value={money(data.lifetimeTotal)}
               note={`${data.lifetimeMembers} one-time ${data.lifetimeMembers === 1 ? "purchase" : "purchases"}`} />
        <Money icon={CreditCard} label="Add-ons / month" value={money(data.addonMonthly)} note="From paying members" />
      </div>

      {/* the honest caveat, not buried */}
      {data.compedMembers > 0 && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3"
             style={{ background: "rgba(204,204,255,0.05)", border: `1px solid ${ROYAL.hairline}` }}>
          <Gift className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ROYAL.iris }} />
          <div className="text-xs leading-relaxed">
            <strong className="text-foreground">
              {data.compedMembers} {data.compedMembers === 1 ? "account sits" : "accounts sit"} on a paid tier
              with nothing to bill
            </strong>
            <span className="text-muted-foreground">
              {" "}— founding members, comps and admins. At list price that is{" "}
              <span style={{ color: ROYAL.iris }}>{money(data.forgoneMonthly)}/month</span> of access given away.
              It is deliberately kept out of the recurring figure above, because none of it renews.
            </span>
          </div>
        </div>
      )}

      {/* tier mix */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Users2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Where the {data.members} members sit</h3>
          {data.newThisMonth > 0 && (
            <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: `${ROYAL.gold}1c`, color: ROYAL.gold }}>
              +{data.newThisMonth} in 30 days
            </span>
          )}
        </header>
        <div className="p-4 space-y-3">
          {data.tiers.map((t, i) => {
            const color = TIER_COLOR[t.key] ?? ROYAL.iris;
            const pct = (t.members / maxTier) * 100;
            return (
              <div key={t.key}>
                <div className="flex items-baseline gap-2 text-xs mb-1">
                  <span className="font-semibold" style={{ color }}>{t.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {t.members} {t.members === 1 ? "member" : "members"}
                  </span>
                  <span className="ml-auto tabular-nums font-semibold" style={{ color: t.monthly > 0 ? ROYAL.gold : ROYAL.dim }}>
                    {money(t.monthly)}/mo
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: "rgba(255,255,255,0.04)" }}>
                  {/* Paying and comped are drawn as separate runs of the same bar
                      so the ratio is legible at a glance rather than inferred. */}
                  <motion.span
                    initial={prefersReducedMotion() ? false : { width: 0 }}
                    animate={{ width: `${(t.paying / maxTier) * 100}%` }}
                    transition={{ duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                    style={{ background: color }}
                  />
                  <motion.span
                    initial={prefersReducedMotion() ? false : { width: 0 }}
                    animate={{ width: `${pct - (t.paying / maxTier) * 100}%` }}
                    transition={{ duration: 0.6, delay: i * 0.06 + 0.08, ease: [0.22, 1, 0.36, 1] }}
                    style={{ background: `${color}38` }}
                  />
                </div>
                <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span><span style={{ color }}>■</span> {t.paying} paying</span>
                  <span><span style={{ color: `${color}66` }}>■</span> {t.members - t.paying} not billed</span>
                  {t.forgone > 0 && <span className="ml-auto">{money(t.forgone)}/mo forgone</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* coupons */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Ticket className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Coupon usage</h3>
        </header>
        {data.coupons.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No coupons created yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {data.coupons.map((c) => (
              <div key={c.code} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                <code className="font-mono font-semibold" style={{ color: c.active ? ROYAL.gold : ROYAL.dim }}>
                  {c.code}
                </code>
                <span className="text-muted-foreground">{c.kind}</span>
                {!c.active && <span className="text-muted-foreground/70">(inactive)</span>}
                <span className="ml-auto tabular-nums">
                  {c.used}{c.max ? ` / ${c.max}` : ""} used
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Recurring figures count only subscriptions marked active with a monthly or yearly billing type.
        Lifetime purchases are booked once at their deal price and never spread across months — amortising a
        one-off over a guessed lifespan would turn a forecast into what looks like a fact.
      </p>
    </div>
  );
}

function Money({
  icon: Icon, label, value, note, tone, big,
}: {
  icon: typeof DollarSign; label: string; value: string; note?: string; tone?: string; big?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`font-bold tabular-nums ${big ? "text-2xl" : "text-xl"}`} style={tone ? { color: tone } : undefined}>
        {value}
      </div>
      {note && <div className="text-[11px] text-muted-foreground mt-0.5">{note}</div>}
    </div>
  );
}

export default AdminMoneyTab;
