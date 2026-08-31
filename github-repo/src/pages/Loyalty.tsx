import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { getLoyaltyRules, getMyLoyalty, loyaltyKindLabel } from "../lib/loyalty";
import { Trophy, Star, Users, Gift, History, Sparkles, TrendingUp, Lock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ReferralCard } from "../components/ReferralCard";

export default function Loyalty() {
  const { user } = useAuth();

  const { data: rules } = useQuery({ queryKey: ["loyalty-rules"], queryFn: getLoyaltyRules, staleTime: 10 * 60 * 1000 });
  const { data: mine, isLoading } = useQuery({ queryKey: ["my-loyalty", user?.id], queryFn: getMyLoyalty, enabled: !!user, staleTime: 60 * 1000 });

  if (!user) {
    return (
      <div className="p-6 text-center space-y-3">
        <Trophy className="w-10 h-10 text-yellow-400 mx-auto" />
        <p className="text-sm text-muted-foreground">Sign in to view your loyalty rewards.</p>
        <Link href="/login" className="inline-block px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm">Sign in</Link>
      </div>
    );
  }

  const points = mine?.points ?? 0;
  const events = mine?.events ?? [];
  const prizes = rules?.prizes ?? [];
  const nextPrize = prizes.find(p => p.points > points);
  const progress = nextPrize ? Math.min(100, (points / nextPrize.points) * 100) : 100;

  // Ways to earn, straight from the admin-configured rules (custom rules included).
  const earnRules: { label: string; value: number | string; icon: typeof Users }[] = rules ? [
    ...rules.earn_rules.filter(r => r.points > 0).map(r => ({ label: r.label, value: r.points, icon: Users })),
    { label: "Forecast Game — 1st", value: rules.game_win_1st, icon: Trophy },
    { label: "Forecast Game — 2nd / 3rd / 4th", value: `${rules.game_win_2nd}/${rules.game_win_3rd}/${rules.game_win_4th}`, icon: Star },
  ] : [];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Trophy className="w-6 h-6 text-yellow-400" />
        <h1 className="text-2xl font-bold tracking-wide uppercase">Loyalty Dashboard</h1>
      </div>

      <ReferralCard />

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-yellow-400/30 bg-gradient-to-br from-yellow-950/40 via-card to-card p-6">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-yellow-400/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="text-[10px] text-yellow-400 uppercase tracking-[0.3em] mb-1">Your Loyalty Points</div>
          <div className="text-5xl font-bold tabular-nums" style={{ color: "#fde047" }}>{points.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">{user.referrals} referrals on record · earn points through referrals, renewals & game wins</div>

          {nextPrize && (
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Progress to “{nextPrize.prize}”</span>
                <span className="font-bold tabular-nums text-yellow-300">{points.toLocaleString()} / {nextPrize.points.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                <div className="h-2 rounded-full transition-all" style={{ width: `${progress}%`, background: "linear-gradient(to right, #fde047, #f59e0b)" }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* How to earn */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> How to Earn Points</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {earnRules.map(r => {
            const Icon = r.icon;
            return (
              <div key={r.label} className="bg-muted/20 rounded-lg p-3 text-center">
                <Icon className="w-4 h-4 mx-auto mb-1 text-primary" />
                <div className="text-lg font-bold tabular-nums text-primary">+{r.value}</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{r.label}</div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">Referrals & renewals are credited by an admin; game points post automatically when the monthly board is settled.</p>
      </div>

      {/* Prize ladder */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Gift className="w-4 h-4 text-primary" /> Prizes</h2>
        <div className="space-y-2">
          {prizes.map(p => {
            const unlocked = points >= p.points;
            return (
              <div key={p.points} className={`flex items-center gap-3 p-3 rounded-lg border ${unlocked ? "bg-yellow-400/10 border-yellow-400/40" : "bg-muted/20 border-border"}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${unlocked ? "bg-yellow-400/20 text-yellow-300" : "bg-muted/40 text-muted-foreground"}`}>
                  {unlocked ? <Gift className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    {unlocked
                      ? <>{p.prize}<span className="text-[9px] text-green-400 uppercase tracking-widest">unlocked</span></>
                      : <span className="blur-[6px] select-none text-muted-foreground" title="Reach the points to reveal this prize">{p.prize}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.points.toLocaleString()} points{unlocked ? "" : " to unlock"}</div>
                </div>
                {!unlocked && <div className="text-xs text-muted-foreground tabular-nums shrink-0">{(p.points - points).toLocaleString()} to go</div>}
              </div>
            );
          })}
          {prizes.length === 0 && <p className="text-xs text-muted-foreground">Prizes are being finalized — check back soon.</p>}
        </div>
        <p className="text-[11px] text-muted-foreground">Redeem unlocked prizes with an admin. Specific rewards may change.</p>
      </div>

      {/* Points history */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><History className="w-4 h-4 text-primary" /> Points History</h2>
        {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {!isLoading && events.length === 0 && (
          <p className="text-xs text-muted-foreground">No points yet. Refer a friend or play the Forecast Game to get on the board.</p>
        )}
        <div className="space-y-1.5">
          {events.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-muted/20">
              <div className="min-w-0">
                <div className="text-sm font-medium">{loyaltyKindLabel(e.kind, rules)}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {(() => { try { return format(parseISO(e.createdAt), "MMM d, yyyy"); } catch { return ""; } })()}
                  {e.note ? ` · ${e.note}` : ""}
                </div>
              </div>
              <div className={`text-sm font-bold tabular-nums shrink-0 ${e.points >= 0 ? "text-green-400" : "text-red-400"}`}>
                {e.points >= 0 ? "+" : ""}{e.points.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
