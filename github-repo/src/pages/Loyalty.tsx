/**
 * Loyalty Dashboard.
 *
 * REDESIGNED as a membership statement rather than a scoreboard. The brief was
 * explicit that this must not read as a children's game, and the honest risk in
 * a points page is exactly that — badges, confetti, a big bouncing number.
 *
 * So the reference is a private-club statement: a standing balance set in
 * display figures, a ladder showing where that balance sits against every tier
 * rather than only the next one, and a ledger underneath with aligned columns
 * you could read down like a bank statement.
 *
 * The one real gain in information is the ladder. A single progress bar towards
 * the next prize tells you nothing about the shape of the programme — how many
 * tiers there are, how far apart they sit, what is already behind you. The
 * ladder shows all of it in the same space, and it is the only place motion is
 * used: it fills once, left to right, to where the member actually stands.
 */
import { useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { getLoyaltyRules, getMyLoyalty, loyaltyKindLabel, type LoyaltyRules } from "../lib/loyalty";
import { Trophy, Star, Users, Gift, History, Sparkles, Lock, Check } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ReferralCard } from "../components/ReferralCard";
import { ModuleShell, Panel } from "../components/ModuleShell";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

/** A balance that settles rather than appears. */
function Balance({ value, still }: { value: number; still: boolean }) {
  const mv = useMotionValue(still ? value : 0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    if (still) { mv.set(value); return; }
    const c = animate(mv, value, { duration: 1.1, ease: EASE });
    return () => c.stop();
  }, [value, still, mv]);
  return <motion.span>{text}</motion.span>;
}

/**
 * The whole programme on one rail.
 *
 * Tiers are placed by their point value, not spaced evenly, so the gaps are the
 * real gaps — a member can see that the last step is four times the first one
 * instead of discovering it after the fourth.
 */
function Ladder({ prizes, points, still }: {
  prizes: { points: number; prize: string }[]; points: number; still: boolean;
}) {
  if (!prizes.length) return null;
  const max = Math.max(prizes[prizes.length - 1].points, points, 1);
  const pct = (v: number) => Math.min(100, (v / max) * 100);

  return (
    <div className="pt-1">
      <div className="relative h-11">
        {/* the rail */}
        <div className="absolute left-0 right-0 top-[15px] h-[3px] rounded-full"
             style={{ background: "rgba(255,255,255,0.07)" }} />
        <motion.div
          className="absolute left-0 top-[15px] h-[3px] rounded-full"
          style={{ background: `linear-gradient(90deg, ${ROYAL.gold}55, ${ROYAL.gold})` }}
          initial={still ? { width: `${pct(points)}%` } : { width: 0 }}
          animate={{ width: `${pct(points)}%` }}
          transition={still ? { duration: 0 } : { duration: 1.1, delay: 0.15, ease: EASE }}
        />

        {prizes.map((p, i) => {
          const reached = points >= p.points;
          return (
            <motion.div
              key={p.points}
              className="absolute -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${pct(p.points)}%`, top: 8 }}
              initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={still ? { duration: 0.2 } : { delay: 0.3 + i * 0.09, type: "spring", stiffness: 380, damping: 20 }}
            >
              <span
                className="w-[17px] h-[17px] rounded-full grid place-items-center"
                style={{
                  background: reached ? ROYAL.gold : "#141427",
                  border: `1.5px solid ${reached ? ROYAL.gold : "rgba(255,255,255,0.16)"}`,
                  boxShadow: reached ? `0 0 14px -2px ${ROYAL.gold}` : undefined,
                }}
                title={`${p.points.toLocaleString()} points`}
              >
                {reached && <Check className="w-2.5 h-2.5" style={{ color: "#120f1e" }} strokeWidth={3.5} />}
              </span>
              <span className="text-[9.5px] tabular-nums mt-1 whitespace-nowrap"
                    style={{ color: reached ? ROYAL.gold : ROYAL.dim }}>
                {p.points >= 1000 ? `${Math.round(p.points / 1000)}k` : p.points}
              </span>
            </motion.div>
          );
        })}

        {/* where the member stands */}
        {points > 0 && (
          <motion.div
            className="absolute -translate-x-1/2"
            style={{ left: `${pct(points)}%`, top: -4 }}
            initial={still ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={still ? { duration: 0.2 } : { delay: 1.15, duration: 0.35, ease: EASE }}
          >
            <span className="block w-px h-[22px]" style={{ background: ROYAL.iris }} />
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default function Loyalty() {
  const { user } = useAuth();
  const still = prefersReducedMotion();

  const { data: rules } = useQuery({ queryKey: ["loyalty-rules"], queryFn: getLoyaltyRules, staleTime: 10 * 60 * 1000 });
  const { data: mine, isLoading } = useQuery({ queryKey: ["my-loyalty", user?.id], queryFn: getMyLoyalty, enabled: !!user, staleTime: 60 * 1000 });

  if (!user) {
    return (
      <div className="p-6 text-center space-y-3">
        <Trophy className="w-10 h-10 mx-auto" style={{ color: ROYAL.gold }} />
        <p className="text-sm" style={{ color: ROYAL.dim }}>Sign in to view your loyalty rewards.</p>
        <Link href="/login" className="inline-block px-4 py-2 rounded-lg text-sm"
              style={{ background: ROYAL.goldFaint, border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
          Sign in
        </Link>
      </div>
    );
  }

  const points = mine?.points ?? 0;
  const events = mine?.events ?? [];
  const prizes = rules?.prizes ?? [];
  const nextPrize = prizes.find((p) => p.points > points);
  const earned = prizes.filter((p) => points >= p.points).length;

  // Ways to earn, straight from the admin-configured rules (custom rules included).
  const earnRules: { label: string; value: number | string; icon: typeof Users }[] = rules ? [
    ...rules.earn_rules.filter((r) => r.points > 0).map((r) => ({ label: r.label, value: r.points, icon: Users })),
    { label: "Forecast Game — 1st", value: rules.game_win_1st, icon: Trophy },
    { label: "Forecast Game — 2nd / 3rd / 4th", value: `${rules.game_win_2nd}/${rules.game_win_3rd}/${rules.game_win_4th}`, icon: Star },
  ] : [];

  return (
    <ModuleShell
      eyebrow="StormSync VIP · Membership"
      title="Loyalty"
      subtitle="Your standing, how it was earned, and what it opens."
    >
      {/* ── the statement ───────────────────────────────────────────────── */}
      <motion.section
        className="relative rounded-3xl overflow-hidden"
        initial={still ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: still ? 0.2 : 0.5, ease: EASE }}
        style={{
          border: `1px solid ${ROYAL.goldSoft}`,
          background:
            `radial-gradient(70% 120% at 10% -20%, rgba(217,183,117,0.18), transparent 60%),` +
            `linear-gradient(180deg, ${ROYAL.ink2}, ${ROYAL.ink})`,
          boxShadow: "0 30px 70px -50px rgba(0,0,0,1)",
        }}
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.gold}, transparent)` }} />

        <div className="relative p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: ROYAL.gold }}>
                Points balance
              </div>
              <div
                className="font-black leading-none tabular-nums mt-1.5"
                style={{
                  fontFamily: HEADING, color: ROYAL.text,
                  fontSize: "clamp(46px, 10vw, 74px)", letterSpacing: "-0.03em",
                  textShadow: "0 16px 44px rgba(0,0,0,0.7)",
                }}
              >
                <Balance value={points} still={still} />
              </div>
            </div>

            <div className="flex gap-6 pb-2">
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.22em]" style={{ color: ROYAL.dim }}>Referrals</div>
                <div className="text-xl font-bold tabular-nums" style={{ color: ROYAL.text, fontFamily: HEADING }}>
                  {user.referrals}
                </div>
              </div>
              <div>
                <div className="text-[9.5px] uppercase tracking-[0.22em]" style={{ color: ROYAL.dim }}>Tiers reached</div>
                <div className="text-xl font-bold tabular-nums" style={{ color: ROYAL.text, fontFamily: HEADING }}>
                  {earned}<span style={{ color: ROYAL.dim, fontSize: "0.7em" }}> / {prizes.length}</span>
                </div>
              </div>
            </div>
          </div>

          <Ladder prizes={prizes} points={points} still={still} />

          <div className="text-[11.5px] mt-2" style={{ color: ROYAL.dim }}>
            {nextPrize
              ? <><span style={{ color: ROYAL.text }}>{(nextPrize.points - points).toLocaleString()}</span> points to the next tier.</>
              : prizes.length
                ? "Every tier reached."
                : "Tiers are being finalised."}
          </div>
        </div>
      </motion.section>

      <ReferralCard />

      {/* ── how it is earned ────────────────────────────────────────────── */}
      <Panel title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4" style={{ color: ROYAL.gold }} /> How points are earned</span>}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {earnRules.map((r, i) => {
            const Icon = r.icon;
            return (
              <motion.div
                key={r.label}
                className="rounded-xl px-3 py-3"
                style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${ROYAL.hairline}` }}
                initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: still ? 0.2 : 0.35, delay: still ? 0 : i * 0.05, ease: EASE }}
              >
                <Icon className="w-3.5 h-3.5 mb-1.5" style={{ color: ROYAL.dim }} />
                <div className="text-lg font-black tabular-nums leading-none"
                     style={{ color: ROYAL.gold, fontFamily: HEADING }}>+{r.value}</div>
                <div className="text-[10.5px] leading-tight mt-1" style={{ color: ROYAL.dim }}>{r.label}</div>
              </motion.div>
            );
          })}
        </div>
        <p className="text-[11px] mt-3" style={{ color: ROYAL.dim }}>
          Referrals and renewals are credited by an admin; game points post automatically when the monthly board is settled.
        </p>
      </Panel>

      {/* ── the tiers ───────────────────────────────────────────────────── */}
      <Panel title={<span className="flex items-center gap-2"><Gift className="w-4 h-4" style={{ color: ROYAL.gold }} /> Tiers</span>} defer>
        <div className="space-y-1.5">
          {prizes.map((p, i) => {
            const unlocked = points >= p.points;
            return (
              <motion.div
                key={p.points}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{
                  background: unlocked ? "rgba(217,183,117,0.09)" : "rgba(255,255,255,0.025)",
                  border: `1px solid ${unlocked ? ROYAL.goldSoft : ROYAL.hairline}`,
                }}
                initial={still ? { opacity: 0 } : { opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: still ? 0.2 : 0.32, delay: still ? 0 : i * 0.05, ease: EASE }}
              >
                <div className="w-8 h-8 rounded-full grid place-items-center shrink-0"
                     style={{
                       background: unlocked ? ROYAL.goldFaint : "rgba(255,255,255,0.04)",
                       border: `1px solid ${unlocked ? ROYAL.goldSoft : ROYAL.hairline}`,
                     }}>
                  {unlocked ? <Gift className="w-3.5 h-3.5" style={{ color: ROYAL.gold }} />
                            : <Lock className="w-3.5 h-3.5" style={{ color: ROYAL.dim }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold flex items-center gap-2"
                       style={{ fontFamily: HEADING, color: ROYAL.text }}>
                    {unlocked ? (
                      <>
                        {p.prize}
                        <span className="text-[9px] uppercase tracking-[0.2em]" style={{ color: ROYAL.gold }}>unlocked</span>
                      </>
                    ) : (
                      <span className="blur-[6px] select-none" style={{ color: ROYAL.dim }}
                            title="Reach the points to reveal this tier">{p.prize}</span>
                    )}
                  </div>
                  <div className="text-[11px] tabular-nums" style={{ color: ROYAL.dim }}>
                    {p.points.toLocaleString()} points
                  </div>
                </div>
                {!unlocked && (
                  <div className="text-[11px] tabular-nums shrink-0" style={{ color: ROYAL.dim }}>
                    {(p.points - points).toLocaleString()} to go
                  </div>
                )}
              </motion.div>
            );
          })}
          {prizes.length === 0 && (
            <p className="text-xs" style={{ color: ROYAL.dim }}>Tiers are being finalised — check back soon.</p>
          )}
        </div>
        <p className="text-[11px] mt-3" style={{ color: ROYAL.dim }}>
          Redeem an unlocked tier with an admin. Specific rewards may change.
        </p>
      </Panel>

      {/* ── the ledger ──────────────────────────────────────────────────── */}
      <Panel
        title={<span className="flex items-center gap-2"><History className="w-4 h-4" style={{ color: ROYAL.gold }} /> Statement</span>}
        aside={events.length > 0
          ? <span className="text-[10px] tabular-nums" style={{ color: ROYAL.dim }}>{events.length} entries</span>
          : undefined}
        padded={false}
        defer
      >
        {isLoading && <p className="text-xs px-4 py-4" style={{ color: ROYAL.dim }}>Loading…</p>}
        {!isLoading && events.length === 0 && (
          <p className="text-xs px-4 py-6 text-center" style={{ color: ROYAL.dim }}>
            No points yet. Refer a member or play the Forecast Game to open the account.
          </p>
        )}
        {events.length > 0 && (
          <div>
            {events.map((e, i) => (
              <div key={e.id}
                   className="flex items-baseline gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
                   style={{ borderTop: i === 0 ? undefined : `1px solid ${ROYAL.hairline}` }}>
                <div className="text-[11px] tabular-nums w-[74px] shrink-0" style={{ color: ROYAL.dim }}>
                  {(() => { try { return format(parseISO(e.createdAt), "d MMM yyyy"); } catch { return ""; } })()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium" style={{ color: ROYAL.text }}>
                    {loyaltyKindLabel(e.kind, rules as LoyaltyRules | undefined)}
                  </div>
                  {e.note && <div className="text-[11px] truncate" style={{ color: ROYAL.dim }}>{e.note}</div>}
                </div>
                <div className="text-[13.5px] font-bold tabular-nums shrink-0"
                     style={{ color: e.points >= 0 ? ROYAL.gold : "#ff8a8a", fontFamily: HEADING }}>
                  {e.points >= 0 ? "+" : ""}{e.points.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </ModuleShell>
  );
}
