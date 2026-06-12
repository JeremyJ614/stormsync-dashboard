import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useAuth, type BadgeDef } from "../hooks/useAuth";
import { listBadgeDefs } from "../lib/badges";
import { BadgeChip } from "../components/BadgeChip";
import { User as UserIcon, Trophy, Shield, Mail, Calendar } from "lucide-react";

export default function Profile() {
  const { user, loyaltyPoints, monthsActive, logout } = useAuth();
  const [badgeDefs, setBadgeDefs] = useState<BadgeDef[]>([]);
  useEffect(() => { listBadgeDefs().then(setBadgeDefs).catch(() => {}); }, []);
  if (!user) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">You must <Link href="/login" className="text-primary underline">sign in</Link> first.</p>
      </div>
    );
  }
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-2xl font-bold text-primary">
            {user.name.split(" ").map(p => p[0]).slice(0, 2).join("")}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{user.name}</h1>
            <div className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{user.email}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/30 uppercase tracking-widest">Tier {user.tier}</span>
              {user.isAdmin && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-400/15 text-yellow-300 border border-yellow-400/30 uppercase tracking-widest flex items-center gap-1"><Shield className="w-2.5 h-2.5" /> Admin</span>}
              {(user.badges ?? []).map(id => <BadgeChip key={id} id={id} defs={badgeDefs} />)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-primary tabular-nums">{loyaltyPoints}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Loyalty Points</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400 tabular-nums">{user.referrals}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Referrals</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold tabular-nums">{monthsActive}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Months Active</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <div className="text-2xl font-bold tabular-nums">{user.enabledModules.length}</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-1">Modules Enabled</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Account Info</h2>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">User ID</span><span className="font-mono text-xs">{user.id}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Joined</span><span>{new Date(user.joinedAt).toLocaleDateString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tier</span><span>Tier {user.tier}</span></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/loyalty" className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors flex items-center gap-3">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <div><div className="text-sm font-semibold">Loyalty Dashboard</div><div className="text-xs text-muted-foreground">View points & rewards</div></div>
        </Link>
        <button onClick={logout} className="bg-card border border-red-500/30 hover:bg-red-500/10 rounded-xl p-4 transition-colors flex items-center gap-3 text-left">
          <UserIcon className="w-5 h-5 text-red-400" />
          <div><div className="text-sm font-semibold text-red-300">Log Out</div><div className="text-xs text-muted-foreground">End your session</div></div>
        </button>
      </div>
    </div>
  );
}
