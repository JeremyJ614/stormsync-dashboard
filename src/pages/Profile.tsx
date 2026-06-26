import { Link } from "wouter";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth, type BadgeDef } from "../hooks/useAuth";
import { listBadgeDefs } from "../lib/badges";
import { listSavedLocations } from "../lib/savedLocations";
import { getMyLoyalty } from "../lib/loyalty";
import { BadgeChip } from "../components/BadgeChip";
import { AppearancePanel } from "../components/AppearancePanel";
import { StormAlertsCard } from "../components/StormAlertsCard";
import { InstallApp } from "../components/InstallApp";
import { User as UserIcon, Trophy, Shield, Mail, Calendar, MapPin, Star, Award, Sparkles, Gamepad2 } from "lucide-react";

// Core signup fields are shown elsewhere; everything else the member answered
// at signup becomes their "About" section.
const HIDDEN_ANSWER_KEYS = new Set(["name", "email", "pin"]);
const humanize = (k: string) => k.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());

function monthsLabel(n: number): string {
  if (n < 12) return `${n} month${n !== 1 ? "s" : ""}`;
  const y = Math.floor(n / 12), m = n % 12;
  return `${y}y${m ? ` ${m}m` : ""}`;
}

export default function Profile() {
  const { user, monthsActive, logout } = useAuth();
  const [badgeDefs, setBadgeDefs] = useState<BadgeDef[]>([]);
  useEffect(() => { listBadgeDefs().then(setBadgeDefs).catch(() => {}); }, []);

  const { data: savedLocations = [] } = useQuery({
    queryKey: ["saved-locations", user?.id],
    queryFn: listSavedLocations,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const { data: loyalty } = useQuery({
    queryKey: ["my-loyalty", user?.id],
    queryFn: getMyLoyalty,
    enabled: !!user,
    staleTime: 60 * 1000,
  });
  const loyaltyPoints = loyalty?.points ?? 0;

  if (!user) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">You must <Link href="/login" className="text-primary underline">sign in</Link> first.</p>
      </div>
    );
  }

  const initials = user.name.split(" ").map(p => p[0]).slice(0, 2).join("");
  const answers = Object.entries(user.customAnswers ?? {}).filter(([k, v]) => !HIDDEN_ANSWER_KEYS.has(k) && String(v).trim());
  const badges = user.badges ?? [];

  const stats = [
    { label: "Loyalty Points", value: loyaltyPoints.toLocaleString(), color: "#a855f7", icon: Trophy },
    { label: "Referrals", value: user.referrals, color: "#fde047", icon: Sparkles },
    { label: "Member For", value: monthsLabel(monthsActive), color: "#22d3ee", icon: Calendar },
    { label: "Badges", value: badges.length, color: "#4ade80", icon: Award },
  ];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-[#0f0a1f] via-[#160d2a] to-[#0a0518] p-6">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-3xl font-bold text-primary shrink-0 drop-shadow-[0_0_18px_rgba(168,85,247,0.45)]">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{user.name}</h1>
            <div className="text-sm text-muted-foreground flex items-center gap-1 truncate"><Mail className="w-3 h-3 shrink-0" />{user.email}</div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/15 text-primary border border-primary/30 uppercase tracking-widest">Tier {user.tier}</span>
              {user.isAdmin && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-400/15 text-yellow-300 border border-yellow-400/30 uppercase tracking-widest flex items-center gap-1"><Shield className="w-2.5 h-2.5" /> Admin</span>}
              <span className="text-[11px] text-muted-foreground">Joined {new Date(user.joinedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-card border rounded-xl p-4 text-center" style={{ borderColor: s.color + "30" }}>
              <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: s.color }} />
              <div className="text-xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Badges showcase */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Award className="w-4 h-4 text-primary" /> Badges</h2>
        {badges.length === 0 ? (
          <p className="text-xs text-muted-foreground">No badges yet — earn them through referrals, game wins, and community milestones.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {badges.map(id => <BadgeChip key={id} id={id} defs={badgeDefs} size="md" />)}
          </div>
        )}
      </div>

      {/* About you (custom signup answers) */}
      {answers.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><UserIcon className="w-4 h-4 text-primary" /> About You</h2>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {answers.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{humanize(k)}</div>
                <div className="text-sm break-words">{String(v)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Storm Alerts (Web Push) */}
      <StormAlertsCard userId={user.id} />

      {/* Install to home screen (PWA) */}
      <InstallApp />

      {/* Appearance — themes + accent (L4) */}
      <AppearancePanel />

      {/* My Locations */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> My Locations</h2>
        {savedLocations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved locations yet. Use the bookmark menu in the top bar to save your favorite places.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {savedLocations.map(loc => (
              <span key={loc.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/30 border border-border text-xs">
                {loc.isPrimary && <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />}
                <MapPin className="w-3 h-3 text-muted-foreground" />
                {loc.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Account info */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /> Account Info</h2>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3"><span className="text-muted-foreground">User ID</span><span className="font-mono text-xs truncate">{user.id}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Joined</span><span>{new Date(user.joinedAt).toLocaleDateString()}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Modules enabled</span><span>{user.enabledModules.length}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Tier</span><span>Tier {user.tier}</span></div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Link href="/loyalty" className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors flex items-center gap-3">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <div><div className="text-sm font-semibold">Loyalty</div><div className="text-xs text-muted-foreground">Points & rewards</div></div>
        </Link>
        <Link href="/game" className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors flex items-center gap-3">
          <Gamepad2 className="w-5 h-5 text-primary" />
          <div><div className="text-sm font-semibold">Forecast Game</div><div className="text-xs text-muted-foreground">Play & climb the board</div></div>
        </Link>
        <button onClick={logout} className="bg-card border border-red-500/30 hover:bg-red-500/10 rounded-xl p-4 transition-colors flex items-center gap-3 text-left">
          <UserIcon className="w-5 h-5 text-red-400" />
          <div><div className="text-sm font-semibold text-red-300">Log Out</div><div className="text-xs text-muted-foreground">End your session</div></div>
        </button>
      </div>
    </div>
  );
}
