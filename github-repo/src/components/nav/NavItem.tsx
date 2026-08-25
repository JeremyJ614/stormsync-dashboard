/**
 * One sidebar module row.
 *
 * Three things happen on interaction, and they are deliberately different
 * channels so they read as one gesture rather than three effects:
 *   • the champagne rail physically travels from the previously-active row to
 *     this one (a shared `layoutId`, so it is one element being re-positioned,
 *     not two crossfading);
 *   • a ripple opens from the exact point of contact and dissipates;
 *   • the icon takes a short press, then over-returns.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROYAL, SPRING, prefersReducedMotion } from "../../lib/royal";

interface Ripple { id: number; x: number; y: number }

export function NavItem({
  label, path, icon: Icon, active, expanded, index, locked = false, onNavigate,
}: {
  label: string; path: string; icon: LucideIcon;
  active: boolean; expanded: boolean; index: number;
  /** Not in this member's plan. The row still shows — it just leads to the
   *  place they can add it, because a module nobody can see is a module nobody
   *  buys. */
  locked?: boolean;
  onNavigate: () => void;
}) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [pressed, setPressed] = useState(false);
  const [reduced, setReduced] = useState(false);
  const seq = useRef(0);
  useEffect(() => setReduced(prefersReducedMotion()), []);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!reduced) {
      const r = e.currentTarget.getBoundingClientRect();
      const id = ++seq.current;
      setRipples((p) => [...p, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
      setTimeout(() => setRipples((p) => p.filter((x) => x.id !== id)), 620);
      setPressed(true);
      setTimeout(() => setPressed(false), 180);
    }
    onNavigate();
  }

  return (
    <Link
      href={locked ? `/subscription?add=${encodeURIComponent(path)}` : path}
      onClick={handleClick}
      title={locked ? `${label} — not in your plan` : !expanded ? label : undefined}
      className={cn(
        "flex items-center gap-[11px] px-[10px] py-[9px] rounded-[9px]",
        "relative overflow-hidden group isolate",
        active ? "bg-[rgba(217,183,117,0.09)]" : "hover:bg-[rgba(204,204,255,0.06)]",
      )}
      style={{ transition: "background-color 160ms ease" }}
    >
      {/* Travelling active rail — one element shared across every row. */}
      {active && (
        <motion.span
          layoutId="nav-active-rail"
          transition={reduced ? { duration: 0 } : SPRING.silk}
          className="absolute left-0 top-[18%] h-[64%] w-[3px] rounded-r-full"
          style={{ background: ROYAL.gold, boxShadow: `0 0 10px ${ROYAL.gold}` }}
        />
      )}

      {/* Contact ripple. */}
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            initial={{ opacity: 0.42, scale: 0 }}
            animate={{ opacity: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="absolute rounded-full pointer-events-none -z-10"
            style={{
              left: r.x, top: r.y, width: 260, height: 260,
              marginLeft: -130, marginTop: -130,
              background: `radial-gradient(circle, ${ROYAL.goldSoft} 0%, transparent 62%)`,
            }}
          />
        ))}
      </AnimatePresence>

      <motion.span
        animate={reduced ? {} : { scale: pressed ? 0.82 : 1, rotate: pressed ? -8 : 0 }}
        transition={SPRING.pop}
        className="flex-shrink-0"
      >
        <Icon
          className={cn(
            "w-[17px] h-[17px] transition-colors duration-150",
            active ? "text-[#d9b775]" : locked ? "text-[#5c5c7a]" : "text-[#a3a3cc] group-hover:text-[#ccccff]",
          )}
        />
      </motion.span>

      {/* Label fades and slides in behind the width, staggered down the list so
          the menu opens as a wave instead of everything appearing at once. */}
      <motion.span
        animate={{
          opacity: expanded ? 1 : 0,
          x: expanded ? 0 : -6,
        }}
        transition={reduced ? { duration: 0 } : { ...SPRING.silk, delay: expanded ? Math.min(index, 14) * 0.012 : 0 }}
        className={cn(
          "text-[12.5px] whitespace-nowrap overflow-hidden",
          active ? "text-[#f1f4ff] font-semibold" : locked ? "text-[#7a7a99] font-medium" : "text-[#c8c8e6] font-medium",
        )}
        style={{ fontFamily: "'DM Sans', sans-serif", pointerEvents: expanded ? "auto" : "none" }}
      >
        {label}
      </motion.span>

      {locked && (
        <motion.span
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={reduced ? { duration: 0 } : { ...SPRING.silk, delay: expanded ? Math.min(index, 14) * 0.012 : 0 }}
          className="ml-auto flex-shrink-0"
        >
          <Lock className="w-[11px] h-[11px] text-[#6a6a8c]" />
        </motion.span>
      )}
    </Link>
  );
}

export default NavItem;
