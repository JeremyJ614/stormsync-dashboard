/**
 * Premium page header: an aurora band with a champagne rule, a glowing icon
 * tile and a display-face title. Every module opens with this, so it carries a
 * large share of the app's visual identity.
 */
import { motion } from "framer-motion";
import { ROYAL, HEADING, EASE, auroraStyle } from "../lib/royal";

interface Props {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  /** Optional right-aligned slot (e.g. a Refresh button). */
  action?: React.ReactNode;
  /** Small uppercase kicker above the title. */
  eyebrow?: string;
}

export function PageHero({ icon: Icon, title, subtitle, action, eyebrow }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="relative rounded-2xl px-5 py-4 flex items-center gap-4 overflow-hidden border"
      style={{ borderColor: ROYAL.hairline, ...auroraStyle }}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.06, type: "spring", stiffness: 240, damping: 18 }}
        className="relative w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
        style={{
          background: ROYAL.goldFaint,
          border: `1px solid ${ROYAL.goldSoft}`,
          boxShadow: `0 0 26px -8px ${ROYAL.gold}`,
        }}
      >
        <Icon className="w-6 h-6" style={{ color: ROYAL.gold }} />
      </motion.div>

      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-[0.28em] mb-0.5" style={{ color: ROYAL.gold }}>
            {eyebrow}
          </div>
        )}
        <h1 className="text-xl font-bold tracking-[0.02em] truncate"
            style={{ fontFamily: HEADING, color: ROYAL.text }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs truncate mt-0.5" style={{ color: ROYAL.dim }}>{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </motion.div>
  );
}
