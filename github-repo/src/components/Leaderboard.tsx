import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Loader2, Crown, Medal, Award, Flame } from "lucide-react";
import { getLeaderboard, PERIODS, type LeaderRow, type Period } from "../lib/gamePoints";

/**
 * Combined leaderboard — Forecast Game + Trivia totalled together (P-5.1),
 * rebuilt for the relaunch.
 *
 * Everything here is presentation over the same `leaderboard(period)` RPC; no
 * new queries. The animation is deliberately CSS-only (no animation library) so
 * it costs nothing in bundle size, and every effect is disabled under
 * prefers-reduced-motion rather than merely shortened.
 */

/** Stable per-user hue so a member's avatar colour never changes between renders. */
function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Counts a number up on mount. Falls straight to the final value if the user
 *  prefers reduced motion — a spinning number is exactly what that setting is for. */
function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      // easeOutExpo — fast start, gentle settle
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setV(Math.round(target * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return v;
}

function CountUp({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={className}>{v.toLocaleString()}</span>;
}

const PODIUM_STYLE = [
  { ring: "#fbbf24", glow: "251,191,36",  label: "CHAMPION", grad: "linear-gradient(160deg,#fef3c7,#fbbf24 45%,#b45309)", Icon: Crown },
  { ring: "#cbd5e1", glow: "203,213,225", label: "SILVER",   grad: "linear-gradient(160deg,#f8fafc,#cbd5e1 45%,#64748b)", Icon: Medal },
  { ring: "#f59e0b", glow: "217,119,6",   label: "BRONZE",   grad: "linear-gradient(160deg,#fed7aa,#d97706 45%,#7c2d12)", Icon: Award },
];

function Avatar({ row, size = 44, ring }: { row: LeaderRow; size?: number; ring?: string }) {
  const h = hueOf(row.userId);
  return (
    <div
      className="rounded-full grid place-items-center font-extrabold shrink-0 select-none"
      style={{
        width: size, height: size, fontSize: size * 0.36,
        background: `linear-gradient(145deg, hsl(${h} 70% 42%), hsl(${(h + 40) % 360} 70% 26%))`,
        color: "#fff",
        border: ring ? `2px solid ${ring}` : "2px solid rgba(255,255,255,.14)",
        boxShadow: ring ? `0 0 14px rgba(255,255,255,.12)` : undefined,
      }}>
      {initials(row.userName)}
    </div>
  );
}

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
  const topPoints = rows[0]?.points || 1;
  const periodIdx = PERIODS.findIndex((p) => p.id === period);

  return (
    <div className="space-y-4">
      <style>{CSS}</style>

      {/* ── Period switch: one sliding pill rather than three toggling backgrounds ── */}
      <div className="relative bg-card border border-border rounded-2xl p-1.5">
        <div className="sswx-lb-pill" style={{ left: `calc(${periodIdx} * (100% - 12px) / 3 + 6px)` }} />
        <div className="relative grid grid-cols-3">
          {PERIODS.map((p) => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`relative z-10 py-2.5 rounded-xl text-sm font-bold tracking-wide transition-colors ${
                period === p.id ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading ? (
        <div className="py-14 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <Trophy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-semibold">Nobody on the board yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Lock in a Forecast Game pick or answer today's trivia to claim first place.
          </p>
        </div>
      ) : (
        <>
          {/* ── Podium ── */}
          <div className="relative bg-gradient-to-b from-card to-transparent border border-border rounded-2xl px-3 pt-5 pb-0 overflow-hidden">
            <div className="sswx-lb-rays" aria-hidden="true" />
            <div className="relative grid grid-cols-3 gap-2 items-end">
              {[1, 0, 2].map((slot) => {            // silver, gold, bronze → winner centred
                const r = podium[slot];
                const st = PODIUM_STYLE[slot];
                if (!r) return <div key={slot} className="min-h-[120px]" />;
                const h = slot === 0 ? 118 : slot === 1 ? 88 : 70;
                const { Icon } = st;
                return (
                  <div key={slot} className={`flex flex-col items-center sswx-lb-col sswx-lb-col-${slot}`}>
                    <div className="relative">
                      <Avatar row={r} size={slot === 0 ? 58 : 46} ring={st.ring} />
                      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full grid place-items-center"
                        style={{ background: st.grad, boxShadow: `0 0 12px rgba(${st.glow},.6)` }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: "#2b1a05" }} />
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] font-bold text-center truncate max-w-full px-1"
                      style={{ color: st.ring }} title={r.userName}>
                      {r.userName}
                    </div>
                    <CountUp value={r.points} className="text-base font-extrabold tabular-nums leading-tight" />
                    <div className="text-[9px] text-muted-foreground">{r.entries} play{r.entries === 1 ? "" : "s"}</div>

                    <div className="w-full rounded-t-xl mt-2 relative overflow-hidden sswx-lb-plinth"
                      style={{ height: h, background: st.grad, opacity: 0.9 }}>
                      <span className="sswx-lb-shine" aria-hidden="true" />
                      <span className="absolute inset-x-0 top-2 text-center text-[9px] font-black tracking-[0.15em]"
                        style={{ color: "rgba(0,0,0,.55)" }}>{st.label}</span>
                      <span className="absolute inset-x-0 bottom-1.5 text-center text-xl font-black"
                        style={{ color: "rgba(0,0,0,.35)" }}>{slot + 1}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Ranks 4+ ── */}
          {rest.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {rest.map((r, i) => {
                const mine = r.userId === meId;
                return (
                  <div key={r.userId}
                    className={`relative px-3 py-2.5 flex items-center gap-3 border-b border-border/50 last:border-b-0 sswx-lb-row ${mine ? "bg-primary/10" : ""}`}
                    style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
                    {/* relative-strength bar sits behind the row */}
                    <span className="absolute inset-y-0 left-0 bg-primary/10 pointer-events-none"
                      style={{ width: `${Math.max(2, (r.points / topPoints) * 100)}%` }} aria-hidden="true" />
                    <span className="relative w-6 text-center text-xs font-black text-muted-foreground tabular-nums">{r.rank}</span>
                    <Avatar row={r} size={30} />
                    <span className="relative flex-1 min-w-0 text-sm font-semibold truncate">
                      {r.userName}{mine && <span className="ml-1.5 text-[9px] font-black text-primary align-middle">YOU</span>}
                    </span>
                    <span className="relative text-[10px] text-muted-foreground tabular-nums hidden sm:inline">{r.entries} plays</span>
                    <span className="relative text-sm font-extrabold tabular-nums">{r.points.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Your standing, if you're off the podium ── */}
          {meRow && meRow.rank > 3 && (
            <div className="bg-primary/10 border border-primary/30 rounded-2xl px-3 py-2.5 flex items-center gap-3">
              <Flame className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs">
                You're <strong className="text-foreground">#{meRow.rank}</strong> with{" "}
                <strong className="text-foreground">{meRow.points.toLocaleString()}</strong> points
                {rows[0] && meRow.rank > 1 && (
                  <> — <strong className="text-foreground">{(rows[0].points - meRow.points).toLocaleString()}</strong> behind the lead.</>
                )}
              </span>
            </div>
          )}
        </>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        Forecast Game and Daily Trivia points are combined into one standing.
      </p>
    </div>
  );
}

const CSS = `
.sswx-lb-pill{position:absolute;top:6px;bottom:6px;width:calc((100% - 12px)/3);border-radius:.75rem;
  background:linear-gradient(135deg,hsl(var(--primary)),hsl(var(--primary)/.75));
  transition:left .32s cubic-bezier(.22,1,.36,1);z-index:0}
.sswx-lb-rays{position:absolute;inset:-40% -20% auto -20%;height:180%;pointer-events:none;
  background:conic-gradient(from 180deg at 50% 0%,transparent 0deg,rgba(251,191,36,.10) 22deg,transparent 44deg,
    rgba(251,191,36,.07) 66deg,transparent 90deg);
  animation:sswx-lb-spin 28s linear infinite}
@keyframes sswx-lb-spin{to{transform:rotate(360deg)}}
.sswx-lb-col{animation:sswx-lb-rise .6s cubic-bezier(.16,1,.3,1) both}
.sswx-lb-col-0{animation-delay:.16s}
.sswx-lb-col-1{animation-delay:.04s}
.sswx-lb-col-2{animation-delay:.28s}
@keyframes sswx-lb-rise{from{opacity:0;transform:translateY(18px) scale(.94)}to{opacity:1;transform:none}}
.sswx-lb-plinth{transform-origin:bottom;animation:sswx-lb-grow .65s cubic-bezier(.2,.8,.2,1) both .18s}
@keyframes sswx-lb-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.sswx-lb-shine{position:absolute;top:0;bottom:0;width:38%;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);
  animation:sswx-lb-sweep 3.6s ease-in-out infinite;animation-delay:1s}
@keyframes sswx-lb-sweep{0%{left:-45%}55%,100%{left:115%}}
.sswx-lb-row{animation:sswx-lb-in .4s ease-out both}
@keyframes sswx-lb-in{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){
  .sswx-lb-pill{transition:none}
  .sswx-lb-rays,.sswx-lb-col,.sswx-lb-plinth,.sswx-lb-shine,.sswx-lb-row{
    animation:none!important;opacity:1!important;transform:none!important}
  .sswx-lb-shine{display:none}
}
`;
