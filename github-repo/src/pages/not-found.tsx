/**
 * 404 — "Lost signal".
 *
 * What was here before was a white card on light grey, in a dark app, reading
 * "Did you forget to add the page to the router?" — a developer's note to
 * himself, shown to paying members.
 *
 * This is a radar scope with nothing on it. The sweep turns, the range rings
 * hold, and no echo returns: the page states its own condition rather than
 * describing it. Everything is drawn, so it costs one component and no assets.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Home, LifeBuoy, ArrowLeft } from "lucide-react";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../lib/royal";

const R = 132;          // scope radius
const C = 150;          // canvas centre

export default function NotFound() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(prefersReducedMotion()), []);

  return (
    <div className="min-h-[78vh] flex items-center justify-center p-6"
         style={{ background: "transparent", color: ROYAL.text }}>
      <div className="w-full max-w-lg text-center">

        {/* ── the empty scope ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="mx-auto mb-7"
          style={{ width: 300, maxWidth: "82vw" }}
        >
          <svg viewBox="0 0 300 300" className="w-full h-auto" role="img" aria-label="An empty radar scope">
            <defs>
              <radialGradient id="nf-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={ROYAL.gold} stopOpacity="0.10" />
                <stop offset="70%" stopColor={ROYAL.gold} stopOpacity="0.02" />
                <stop offset="100%" stopColor={ROYAL.gold} stopOpacity="0" />
              </radialGradient>
              {/* the sweep: a wedge that fades to nothing behind itself */}
              <linearGradient id="nf-sweep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={ROYAL.gold} stopOpacity="0.34" />
                <stop offset="100%" stopColor={ROYAL.gold} stopOpacity="0" />
              </linearGradient>
            </defs>

            <circle cx={C} cy={C} r={R} fill="url(#nf-glow)" />

            {/* range rings */}
            {[0.28, 0.52, 0.76, 1].map((f, i) => (
              <motion.circle
                key={f} cx={C} cy={C} r={R * f}
                fill="none" stroke={ROYAL.iris} strokeWidth={1}
                initial={reduced ? undefined : { opacity: 0, scale: 0.7 }}
                animate={{ opacity: f === 1 ? 0.3 : 0.15, scale: 1 }}
                transition={{ delay: 0.15 + i * 0.09, duration: 0.6, ease: EASE }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            ))}

            {/* spokes */}
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * 30 - 90) * (Math.PI / 180);
              return (
                <line key={i}
                      x1={C + Math.cos(a) * R * 0.1} y1={C + Math.sin(a) * R * 0.1}
                      x2={C + Math.cos(a) * R} y2={C + Math.sin(a) * R}
                      stroke={ROYAL.iris} strokeWidth={1} opacity={i % 3 === 0 ? 0.18 : 0.08} />
              );
            })}

            {/* the sweep, turning and finding nothing */}
            <motion.g
              style={{ transformOrigin: `${C}px ${C}px` }}
              animate={reduced ? { rotate: 45 } : { rotate: 360 }}
              transition={reduced ? { duration: 0 } : { duration: 4.2, repeat: Infinity, ease: "linear" }}
            >
              <path d={`M${C},${C} L${C + R},${C} A${R},${R} 0 0 0 ${C + R * Math.cos(-0.9)},${C + R * Math.sin(-0.9)} Z`}
                    fill="url(#nf-sweep)" />
              <line x1={C} y1={C} x2={C + R} y2={C} stroke={ROYAL.gold} strokeWidth={1.5} opacity={0.75} />
            </motion.g>

            <circle cx={C} cy={C} r={3} fill={ROYAL.gold} opacity={0.9} />

            {/* the only figure on the plate */}
            <text x={C} y={C + 12} textAnchor="middle"
                  style={{ fontFamily: HEADING, fontWeight: 700, fontSize: 62, letterSpacing: "0.02em" }}
                  fill={ROYAL.text} opacity={0.1}>404</text>

            {/* clinical corner annotation, true to the page */}
            <text x={20} y={26} style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 8.5, letterSpacing: "0.16em" }}
                  fill={ROYAL.dim} opacity={0.75}>NO RETURN</text>
            <text x={280} y={286} textAnchor="end"
                  style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 8.5, letterSpacing: "0.16em" }}
                  fill={ROYAL.dim} opacity={0.75}>0 ECHOES</text>
          </svg>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35, duration: 0.55, ease: EASE }} className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.3em] font-semibold" style={{ color: ROYAL.gold }}>
            Nothing on this bearing
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-[0.01em]"
              style={{ fontFamily: HEADING, color: ROYAL.text }}>
            This page isn't out there
          </h1>
          <p className="text-sm mx-auto max-w-sm" style={{ color: ROYAL.dim }}>
            The link may be old, or the module may have moved. The scope is clear — let's get you back to somewhere
            with weather on it.
          </p>

          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <Link href="/"
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5"
                  style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
              <Home className="w-4 h-4" /> Take me home
            </Link>
            <button onClick={() => window.history.back()}
                    className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5"
                    style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))", color: ROYAL.text }}>
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <Link href="/contact"
                  className="px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-1.5"
                  style={{ background: "hsl(var(--muted) / 0.4)", border: "1px solid hsl(var(--border))", color: ROYAL.dim }}>
              <LifeBuoy className="w-4 h-4" /> Report a broken link
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
