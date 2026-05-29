import { Link } from "wouter";
import { useAuth } from "../hooks/useAuth";
import { Trophy, Star, Users, Gift, Calendar, Sparkles } from "lucide-react";

const REWARD_TIERS = [
  { points: 500, label: "Bronze", reward: "StormSync sticker pack", color: "#cd7f32" },
  { points: 1000, label: "Silver", reward: "Exclusive radar overlay theme", color: "#c0c0c0" },
  { points: 2500, label: "Gold", reward: "1 month free tier upgrade", color: "#ffd700" },
  { points: 5000, label: "Platinum", reward: "StormSync t-shirt & beanie", color: "#e5e4e2" },
  { points: 10000, label: "Diamond", reward: "Lifetime tier upgrade + chase ride-along", color: "#b9f2ff" },
];

const REFERRAL_TIERS = [
  { refs: 3, reward: "+500 bonus points" },
  { refs: 10, reward: "Tier upgrade for 1 month" },
  { refs: 25, reward: "StormSync merch package" },
  { refs: 50, reward: "Lifetime tier upgrade" },
];

export default function Loyalty() {
  const { user, loyaltyPoints, monthsActive } = useAuth();

  if (!user) {
    return (
      <div className="p-6 text-center space-y-3">
        <Trophy className="w-10 h-10 text-yellow-400 mx-auto" />
        <p className="text-sm text-muted-foreground">Sign in to view your loyalty rewards.</p>
        <Link href="/login" className="inline-block px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary text-sm">Sign in</Link>
      </div>
    );
  }

  const nextTier = REWARD_TIERS.find(t => t.points > loyaltyPoints);
  const progress = nextTier ? Math.min(100, (loyaltyPoints / nextTier.points) * 100) : 100;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Trophy className="w-6 h-6 text-yellow-400" />
        <h1 className="text-2xl font-bold tracking-wide uppercase">Loyalty Dashboard</h1>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-yellow-400/30 bg-gradient-to-br from-yellow-950/40 via-card to-card p-6">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-yellow-400/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="text-[10px] text-yellow-400 uppercase tracking-[0.3em] mb-1">Your Loyalty Points</div>
          <div className="text-5xl font-bold tabular-nums" style={{ color: "#fde047" }}>{loyaltyPoints.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">
            +100 / month active · +250 / referral · {monthsActive} months active · {user.referrals} referrals
          </div>

          {nextTier && (
            <div className="mt-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Progress to {nextTier.label}</span>
                <span style={{ color: nextTier.color }} className="font-bold tabular-nums">{loyaltyPoints} / {nextTier.points}</span>
              </div>
              <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                <div className="h-2 rounded-full transition-all" style={{ width: `${progress}%`, background: `linear-gradient(to right, #fde047, ${nextTier.color})` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Months Active" value={monthsActive} icon={Calendar} color="#7B8FD9" />
        <Stat label="Referrals" value={user.referrals} icon={Users} color="#fde047" />
        <Stat label="Points" value={loyaltyPoints} icon={Star} color="#a855f7" />
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Gift className="w-4 h-4 text-primary" /> Reward Tiers</h2>
        <p className="text-xs text-muted-foreground">Specific rewards are subject to change. Vague by design — final program details coming soon.</p>
        <div className="space-y-2">
          {REWARD_TIERS.map(t => {
            const unlocked = loyaltyPoints >= t.points;
            return (
              <div key={t.label} className={`flex items-center gap-3 p-3 rounded-lg border ${unlocked ? "bg-yellow-400/10 border-yellow-400/40" : "bg-muted/20 border-border"}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs" style={{ background: t.color + "30", color: t.color, border: `2px solid ${t.color}60` }}>
                  {t.label[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    {t.label}
                    {unlocked && <span className="text-[9px] text-green-400 uppercase tracking-widest">unlocked</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{t.reward}</div>
                </div>
                <div className="text-sm font-bold tabular-nums" style={{ color: t.color }}>{t.points.toLocaleString()} pts</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Referral Bonuses</h2>
        <p className="text-xs text-muted-foreground">Refer friends to StormSync. When they sign up and mention your name, admins add a referral to your count.</p>
        <div className="space-y-1.5">
          {REFERRAL_TIERS.map(t => {
            const unlocked = user.referrals >= t.refs;
            return (
              <div key={t.refs} className={`flex items-center justify-between p-2.5 rounded-lg ${unlocked ? "bg-primary/10" : "bg-muted/20"}`}>
                <div className="text-sm">{t.refs} referrals → <span className="text-muted-foreground">{t.reward}</span></div>
                {unlocked && <Sparkles className="w-4 h-4 text-yellow-400" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 text-center">
      <Icon className="w-5 h-5 mx-auto mb-1" style={{ color }} />
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value.toLocaleString()}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">{label}</div>
    </div>
  );
}
