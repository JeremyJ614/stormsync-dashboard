import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Ticket, Trophy, X } from "lucide-react";
import {
  runRaffle, getDraw, drawMeta, periodLabel, currentPeriod,
  type DrawType, type RafflePrize, type RaffleDraw, type TicketHolder,
} from "../../lib/raffles";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../../lib/royal";

/**
 * The draw, as a machine.
 *
 * A raffle that reports "drawn — see the Draws tab" is a database transaction
 * wearing a party hat. The point of a raffle is watching it happen, so this is
 * a real tumbler: every eligible ticket becomes a ball, the drum spins them,
 * and one comes out of the chute.
 *
 * One ball per TICKET, not per member — that is the whole reason a ball pool is
 * the right picture. Weighting by tickets is invisible in a list of names and
 * obvious when someone with nine balls in the drum keeps coming out.
 *
 * WHAT THIS DOES NOT DO: it does not pick the winner, and it no longer knows
 * the prize either. `admin_run_raffle` draws both — the prize by weight from the
 * active prizes for this draw type, the winner by ticket — server-side, in the
 * same transaction that hands the prize over. The request goes out as the drum
 * starts and the animation simply lands on whichever ball belongs to the member
 * the database already chose. An animation that decided anything would be a lie
 * told to an admin about their own raffle, and it would not survive a page
 * refresh.
 *
 * The prize being unknown until the ball lands is the point. A raffle where the
 * person running it already knows what is coming out is a giveaway with extra
 * steps, so the drum shows "?" until the draw comes back.
 */

/** Rendering every ball stops being legible — and smooth — long before this. */
const MAX_BALLS = 240;
const SPIN_MS = 3200;

interface Ball {
  x: number; y: number; vx: number; vy: number; r: number;
  userId: string; hue: string; winner: boolean;
}

function ballsFor(holders: TicketHolder[], drawType: DrawType): { userId: string; tickets: number }[] {
  return holders
    .map((h) => ({ userId: h.userId, tickets: (h as unknown as Record<string, number>)[drawType] || 0 }))
    .filter((e) => e.tickets > 0);
}

export function RaffleMachine({
  prize, drawType, holders, onClose, onDrawn,
}: {
  /** Omit to let the server draw the prize as well — the normal case. */
  prize?: RafflePrize | null;
  drawType: DrawType;
  holders: TicketHolder[];
  onClose: () => void;
  onDrawn: (drawn: RaffleDraw | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const balls = useRef<Ball[]>([]);
  const raf = useRef<number>(0);
  const phase = useRef<"idle" | "spin" | "eject" | "done">("idle");
  const ejecting = useRef<Ball | null>(null);

  const [state, setState] = useState<"ready" | "drawing" | "won" | "error">("ready");
  const [draw, setDraw] = useState<RaffleDraw | null>(null);
  const [error, setError] = useState<string | null>(null);
  const still = prefersReducedMotion();
  const tint = drawMeta(drawType).tint;

  const pool = useMemo(() => ballsFor(holders, drawType), [holders, drawType]);
  const totals = useMemo(() => ({
    entrants: pool.length,
    tickets: pool.reduce((n, e) => n + e.tickets, 0),
  }), [pool]);

  /**
   * Build the ball pool. Over MAX_BALLS the drum holds a proportional sample
   * rather than the whole pool — every member keeps at least one ball, and the
   * caption says the real number, so the picture stays honest about being a
   * picture.
   */
  const seed = useCallback((w: number, h: number) => {
    const scale = totals.tickets > MAX_BALLS ? MAX_BALLS / totals.tickets : 1;
    const out: Ball[] = [];
    for (const e of pool) {
      const n = Math.max(1, Math.round(e.tickets * scale));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const rad = Math.random() * (Math.min(w, h) / 2 - 26);
        out.push({
          x: w / 2 + Math.cos(a) * rad,
          y: h / 2 + Math.sin(a) * rad,
          vx: (Math.random() - 0.5) * 5.5,
          vy: (Math.random() - 0.5) * 5.5,
          r: 7,
          userId: e.userId,
          hue: tint,
          winner: false,
        });
      }
    }
    balls.current = out;
  }, [pool, totals.tickets, tint]);

  // ── the drum ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    seed(w, h);

    const cx = w / 2, cy = h / 2, drum = Math.min(w, h) / 2 - 10;
    let spinUntil = 0;

    const step = () => {
      ctx.clearRect(0, 0, w, h);

      // drum wall
      ctx.beginPath();
      ctx.arc(cx, cy, drum, 0, Math.PI * 2);
      ctx.strokeStyle = ROYAL.goldSoft;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.015)";
      ctx.fill();

      const spinning = phase.current === "spin" && performance.now() < spinUntil;

      for (const b of balls.current) {
        if (b === ejecting.current) continue;
        if (spinning) {
          // Swirl + jitter + drag. The swirl alone is a centrifuge: it scales
          // with radius, so every ball ends pinned to the wall and the drum
          // looks like a ring. Keeping it weak, the jitter strong and the drag
          // real is what makes the balls churn through the middle.
          const dx = b.x - cx, dy = b.y - cy;
          b.vx += -dy * 0.0016 + (Math.random() - 0.5) * 1.5;
          b.vy += dx * 0.0016 + (Math.random() - 0.5) * 1.5 + 0.04;
          b.vx *= 0.97; b.vy *= 0.97;
        } else {
          b.vy += 0.22;
          b.vx *= 0.985;
        }
        b.x += b.vx; b.y += b.vy;

        // keep inside the drum
        const dx = b.x - cx, dy = b.y - cy;
        const d = Math.hypot(dx, dy);
        if (d > drum - b.r) {
          const nx = dx / d, ny = dy / d;
          b.x = cx + nx * (drum - b.r);
          b.y = cy + ny * (drum - b.r);
          const dot = b.vx * nx + b.vy * ny;
          b.vx = (b.vx - 2 * dot * nx) * 0.6;
          b.vy = (b.vy - 2 * dot * ny) * 0.6;
        }

        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.hue;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        // one highlight, so a ball looks spherical rather than printed
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.34, b.r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fill();
      }

      // the winning ball, climbing out of the chute
      const e = ejecting.current;
      if (e) {
        // Rises to the crown of the drum and rests there. Letting it run off
        // the top meant the reveal card appeared next to an empty circle.
        const restY = 34;
        e.y += (restY - e.y) * 0.12;
        e.x += (cx - e.x) * 0.12;
        e.r = Math.min(e.r + 0.5, 22);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = ROYAL.gold;
        ctx.shadowColor = ROYAL.gold;
        ctx.shadowBlur = 22;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf.current = requestAnimationFrame(step);
    };

    const start = () => { spinUntil = performance.now() + SPIN_MS; };
    (cv as HTMLCanvasElement & { __start?: () => void }).__start = start;
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [seed]);

  async function go() {
    if (state !== "ready") return;
    setState("drawing"); setError(null);
    phase.current = "spin";
    (canvas.current as (HTMLCanvasElement & { __start?: () => void }) | null)?.__start?.();

    // The draw and the spin run together: the drum is not stalling for effect,
    // it is turning while the database actually decides.
    const started = performance.now();
    const r = await runRaffle(drawType, prize?.id ?? null);
    if (!r.ok || !r.drawId) {
      phase.current = "idle";
      setState("error");
      setError(r.error ?? "Could not draw.");
      return;
    }
    const row = await getDraw(r.drawId);

    const wait = Math.max(0, SPIN_MS - (performance.now() - started));
    window.setTimeout(() => {
      phase.current = "eject";
      // Eject a ball that genuinely belongs to the winner the server chose.
      const mine = balls.current.filter((b) => b.userId === row?.winnerId);
      const pick = mine[Math.floor(Math.random() * mine.length)] ?? balls.current[0];
      if (pick) { pick.winner = true; ejecting.current = pick; }
      window.setTimeout(() => {
        phase.current = "done";
        setDraw(row);
        setState("won");
        onDrawn(row);
      }, still ? 0 : 900);
    }, still ? 0 : wait);
  }

  const odds = draw && draw.ticketsTotal > 0
    ? ((draw.winnerTickets / draw.ticketsTotal) * 100).toFixed(1)
    : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4"
         style={{ background: "rgba(4,4,10,0.86)", backdropFilter: "blur(6px)" }}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="relative w-full max-w-md rounded-2xl overflow-hidden royal-panel p-5 space-y-4"
      >
        <button onClick={onClose} aria-label="Close"
                className="absolute top-3 right-3 p-1 rounded-md" style={{ color: ROYAL.dim }}>
          <X className="w-4 h-4" />
        </button>

        <div>
          <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: tint }}>
            {drawMeta(drawType).label} draw · {periodLabel(drawType, currentPeriod(drawType))}
          </div>
          {/* The prize is not known until the draw comes back, so the header
              says so rather than pretending. Once it lands it stays. */}
          <h2 className="text-lg font-bold mt-0.5" style={{ fontFamily: HEADING, color: ROYAL.text }}>
            {prize?.label ?? draw?.prizeLabel ?? (state === "drawing" ? "Drawing a prize…" : "Prize drawn at random")}
          </h2>
          <p className="text-[11.5px] mt-0.5" style={{ color: ROYAL.dim }}>
            {totals.entrants} member{totals.entrants === 1 ? "" : "s"} · {totals.tickets} ticket
            {totals.tickets === 1 ? "" : "s"} in the drum
            {totals.tickets > MAX_BALLS && ` · showing a ${MAX_BALLS}-ball sample`}
          </p>
        </div>

        <canvas ref={canvas} className="w-full rounded-xl"
                style={{ height: 260, background: "radial-gradient(circle at 50% 40%, #10131f, #070713 70%)" }} />

        <AnimatePresence mode="wait">
          {state === "won" && draw && (
            <motion.div key="won"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-xl px-3.5 py-3 text-center"
              style={{ background: "rgba(217,183,117,0.10)", border: `1px solid ${ROYAL.goldSoft}` }}>
              <Trophy className="w-5 h-5 mx-auto mb-1" style={{ color: ROYAL.gold }} />
              <div className="text-base font-bold" style={{ fontFamily: HEADING, color: ROYAL.gold }}>
                {draw.winnerName}
              </div>
              <div className="text-[11px] mt-0.5 font-semibold" style={{ color: ROYAL.text }}>
                won {draw.prizeLabel}
              </div>
              <div className="text-[11.5px] mt-0.5" style={{ color: ROYAL.dim }}>
                held {draw.winnerTickets} of {draw.ticketsTotal} ticket{draw.ticketsTotal === 1 ? "" : "s"}
                {odds && ` · ${odds}% chance`}
              </div>
              {draw.fulfilment && (
                <div className="text-[11px] mt-1.5" style={{ color: ROYAL.iris }}>{draw.fulfilment}</div>
              )}
            </motion.div>
          )}
          {state === "error" && (
            <motion.p key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-[12px] text-center" style={{ color: "#f3a3a5" }}>{error}</motion.p>
          )}
        </AnimatePresence>

        {state === "won" ? (
          <button onClick={onClose}
            className="w-full py-2.5 rounded-lg text-[13px] font-semibold"
            style={{ background: "rgba(217,183,117,0.14)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
            Done
          </button>
        ) : (
          <button onClick={go} disabled={state === "drawing" || totals.tickets === 0}
            className="w-full py-2.5 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: "rgba(217,183,117,0.14)", border: `1px solid ${ROYAL.goldSoft}`, color: ROYAL.gold }}>
            {state === "drawing"
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Drawing…</>
              : <><Ticket className="w-4 h-4" /> Turn the drum</>}
          </button>
        )}
      </motion.div>
    </div>
  );
}

export default RaffleMachine;
