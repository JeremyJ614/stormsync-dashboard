/**
 * What a member sees when they open a module their plan doesn't include.
 *
 * The screen this replaced said "Contact your administrator to enable it" — to
 * a paying consumer, with no price, no button and no way forward. This one
 * names the module, quotes what it actually costs at their tier, and takes one
 * tap to buy it.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Lock, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useAuth, ALL_MODULES, type Tier } from "../hooks/useAuth";
import { listModuleAddonPrices, getTierPricing } from "../lib/plans";
import { tierKeyOf, addonPriceFor } from "../lib/subscription";
import { ROYAL, HEADING, EASE } from "../lib/royal";

export function ModuleUpsell({ path, signedIn }: { path: string; signedIn: boolean }) {
  const { user } = useAuth();
  const tier = user ? tierKeyOf(user.tier as Tier) : "free";
  const label = ALL_MODULES.find((m) => m.id === path)?.label ?? "This module";

  const q = useQuery({
    queryKey: ["upsell-prices"],
    queryFn: async () => {
      const [addons, pricing] = await Promise.all([listModuleAddonPrices(), getTierPricing()]);
      return { addons, pricing };
    },
    staleTime: 15 * 60 * 1000,
  });

  const priced = q.data?.addons.find((a) => a.moduleId === path);
  const price = priced ? addonPriceFor(priced, tier) : null;
  const vipMonthly = q.data?.pricing.vip.monthly ?? null;

  return (
    <div className="p-6 max-w-md mx-auto mt-10">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative rounded-2xl p-6 text-center overflow-hidden"
        style={{
          background: "linear-gradient(180deg, hsl(var(--card) / 0.96), hsl(var(--card) / 0.82))",
          border: "1px solid hsl(var(--border))",
          boxShadow: "0 26px 54px -34px rgba(0,0,0,0.95)",
        }}
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

        <motion.div
          initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.12, type: "spring", stiffness: 420, damping: 24 }}
          className="w-14 h-14 rounded-xl grid place-items-center mx-auto mb-4"
          style={{ background: "rgba(217,183,117,0.14)", border: `1px solid ${ROYAL.goldSoft}` }}
        >
          <Lock className="w-6 h-6" style={{ color: ROYAL.gold }} />
        </motion.div>

        <div className="text-[10px] uppercase tracking-[0.3em] font-semibold mb-1.5" style={{ color: ROYAL.gold }}>
          Not in your plan yet
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ fontFamily: HEADING, color: ROYAL.text }}>{label}</h2>

        {!signedIn ? (
          <>
            <p className="text-sm mb-5" style={{ color: ROYAL.dim }}>
              Create an account to unlock it — the free tier includes a module of your choice, and no card is needed.
            </p>
            <Link href="/plans"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold"
                  style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
              See the plans <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        ) : q.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-sm" style={{ color: ROYAL.dim }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Checking your price…
          </div>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: ROYAL.dim }}>
              {price != null && price > 0
                ? <>Add it to your plan and it unlocks the moment checkout completes.</>
                : <>It's available on a higher tier — or as an add-on once pricing is set.</>}
            </p>

            {price != null && price > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4, ease: EASE }}
                className="mb-5"
              >
                <div className="text-3xl font-bold tabular-nums" style={{ fontFamily: HEADING, color: ROYAL.gold }}>
                  ${price.toFixed(2)}
                  <span className="text-sm font-normal" style={{ color: ROYAL.dim }}>/mo</span>
                </div>
                <div className="text-[10.5px] uppercase tracking-[0.16em]" style={{ color: ROYAL.dim }}>
                  your price at the {tier} tier
                </div>
              </motion.div>
            )}

            <div className="flex flex-col gap-2">
              <Link href={`/subscription?add=${encodeURIComponent(path)}`}
                    className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold"
                    style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
                Add {label} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/subscription"
                    className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-lg text-[13px] font-semibold"
                    style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))", color: ROYAL.text }}>
                <Sparkles className="w-3.5 h-3.5" style={{ color: ROYAL.gold }} />
                {vipMonthly != null
                  ? `Or get far more from $${vipMonthly.toFixed(2)}/mo`
                  : "See every plan"}
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default ModuleUpsell;
