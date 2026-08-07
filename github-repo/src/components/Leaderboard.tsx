import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Loader2, Crown, Medal, Award } from "lucide-react";
import { getLeaderboard, PERIODS, PODIUM, type Period } from "../lib/gamePoints";

/**
 * Combined leaderboard (Phase 5) — Forecast Game + Trivia totalled together,
 * with Week / Month / Year tabs and an animated gold/silver/bronze podium.
 */
export function Leaderboard({ meId }: { meId?: string }) {
  const [period, setPeriod] = useState<Period>("month");
  const q = useQuery({
    queryKey: ["leaderboard", period],
    queryFn: () => getLeaderboard(period),
    staleTime: 60_000,
  });

  const rows = q.data ?? [];
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const meRow = meId ? rows.find((r) => r.userId === meId) : undefined;

  return (
    <div className="space-y-4">
      <style>{PODIUM_CSS}</style>

      {/* Period tabs */}
      <div className="grid grid-cols-3 gap-2 bg-card border border-border rounded-xl p-1.5">
        {PERIODS.map((p) => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              period === p.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            {p.label}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <Trophy className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No points scored {period === "week" ? "this week" : period === "year" ? "this year" : "this month"} yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Lock in a Forecast Game pick or answer today's trivia to get on the board.</p>
        </div>
      ) : (
        <>
          {/* ── Podium ── */}
          <div className="grid grid-cols-3 gap-2 items-end">
            {[1, 0, 2].map((slot) => {          // silver, gold, bronze — centre the winner
              const r = podium[slot];
              if (!r) return <div key={slot} />;
              const st = PODIUM[slot];
              const h = slot === 0 ? 120 : slot === 1 ? 96 : 82;
              const Icon = slot === 0 ? Crown : slot === 1 ? Medal : Award;
              return (
                <div key={slot} className="flex flex-col items-center">
                  <div className={`sswx-pod-badge sswx-pod-${slot}`}
                    style={{ background: st.grad, boxShadow: `0 0 22px ${st.glow}` }}>
                    <Icon className="w-5 h-5" style={{ color: "#2b1a05" }} />
                  </div>
                  <div className="text-[11px] font-bold mt-1.5 text-center truncate max-w-full px-1"
                    style={{ color: st.ring }}>{r.userName}</div>
                  <div className="text-sm font-extrabold tabular-nums">{r.points.toLocaleString()}</div>
                  <div className="w-full rounded-t-lg mt-1.5 relative overflow-hidden sswx-pod-plinth"
                    style={{ height: h, background: st.grad, opacity: 0.28 }}>
                    <span className="absolute inset-x-0 top-1.5 text-center text-[10px] font-black tracking-widest"
                      style={{ color: st.ring }}>{st.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Ranks 4+ ── */}
          {rest.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border/60">
              {rest.map((r) => (
                <div key={r.userId}
                  className={`px-3 py-2.5 flex items-center gap-3 ${r.userId === meId ? "bg-primary/10" : ""}`}>
                  <span className="w-7 text-center text-xs font-bold text-muted-foreground tabular-nums">{r.rank}</span>
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">{r.userName}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{r.entries} plays</span>
                  <span className="text-sm font-bold tabular-nums">{r.points.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          {/* your standing, if off-screen */}
          {meRow && meRow.rank > 3 && (
            <div className="text-xs text-center text-muted-foreground">
              You're <strong className="text-foreground">#{meRow.rank}</strong> with{" "}
              <strong className="text-foreground">{meRow.points.toLocaleString()}</strong> points.
            </div>
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        Forecast Game and Trivia points are combined into one standing.
      </p>
    </div>
  );
}

const PODIUM_CSS = `
.sswx-pod-badge{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;
  animation:sswx-pod-in .55s cubic-bezier(.16,1,.3,1) both;}
.sswx-pod-0{animation-delay:.05s}
.sswx-pod-1{animation-delay:.18s}
.sswx-pod-2{animation-delay:.30s}
@keyframes sswx-pod-in{0%{opacity:0;transform:translateY(14px) scale(.6)}100%{opacity:1;transform:none}}
.sswx-pod-plinth{animation:sswx-plinth .6s cubic-bezier(.2,.8,.2,1) both;transform-origin:bottom;}
@keyframes sswx-plinth{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.sswx-pod-badge::after{content:"";position:absolute;width:44px;height:44px;border-radius:50%;
  background:radial-gradient(circle,rgba(255,255,255,.55),transparent 60%);
  animation:sswx-shine 2.6s ease-in-out infinite;}
@keyframes sswx-shine{0%,100%{opacity:0}50%{opacity:.7}}
@media (prefers-reduced-motion:reduce){
  .sswx-pod-badge,.sswx-pod-plinth,.sswx-pod-badge::after{animation:none!important;opacity:1!important;transform:none!important}
}
`;
