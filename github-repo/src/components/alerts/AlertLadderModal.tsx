/**
 * The alert ladder as a popup, for the signup page.
 *
 * Someone choosing a tier is making one decision with several parts, and the
 * alert ladder is the part that is hardest to summarise in a line. So it gets a
 * modal: full detail on all five levels, with the levels their chosen tier
 * includes already marked, and a running note of what the paid ones would cost
 * at that tier.
 *
 * It is a popup rather than a section because it must not push the tier picker
 * off the screen. Someone who does not care can never open it and lose nothing.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, BellRing, Check } from "lucide-react";
import { ALERT_LEVELS, TIER_NAME, type AlertPriceRow } from "../../lib/alerts";
import type { Tier } from "../../hooks/useAuth";
import { ROYAL, HEADING, EASE, prefersReducedMotion } from "../../lib/royal";
import { AlertLadder } from "./AlertLadder";

export function AlertLadderModal({
  open, onClose, tier, prices,
}: { open: boolean; onClose: () => void; tier: Tier; prices: AlertPriceRow[] }) {
  const still = prefersReducedMotion();

  // Escape closes, and the page behind must not scroll while this is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  const included = ALERT_LEVELS.filter((l) => tier >= l.includedFrom);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <div className="absolute inset-0" onClick={onClose}
               style={{ background: "rgba(4,4,12,0.78)", backdropFilter: "blur(6px)" }} />

          <motion.div
            role="dialog" aria-modal="true" aria-label="Alert levels"
            initial={still ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={still ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[86vh] overflow-hidden flex flex-col rounded-t-3xl sm:rounded-3xl"
            style={{ background: ROYAL.ink2, border: `1px solid ${ROYAL.hairline}`, boxShadow: "0 40px 90px -40px rgba(0,0,0,0.95)" }}
          >
            <div className="px-5 py-4 flex items-start gap-3 shrink-0"
                 style={{ borderBottom: `1px solid ${ROYAL.hairline}` }}>
              <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0"
                    style={{ background: `${ROYAL.gold}1f`, border: `1px solid ${ROYAL.gold}55` }}>
                <BellRing className="w-5 h-5" style={{ color: ROYAL.gold }} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold leading-tight"
                    style={{ fontFamily: HEADING, color: ROYAL.text }}>
                  How we warn you
                </h2>
                <p className="text-[12px] mt-0.5 leading-snug" style={{ color: ROYAL.dim }}>
                  Five levels, each one everything below it plus something more.
                  {" "}
                  <span style={{ color: ROYAL.gold }}>
                    {TIER_NAME[tier]} includes {included.length === 1 ? "level 1" : `levels 1 to ${included[included.length - 1]?.level ?? 1}`} free.
                  </span>
                  {" "}Any of the rest can be added on its own, whatever tier you are on.
                </p>
              </div>
              <button onClick={onClose} aria-label="Close"
                      className="shrink-0 p-1.5 rounded-lg"
                      style={{ background: "rgba(255,255,255,0.05)", color: ROYAL.dim }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-4 flex-1">
              <AlertLadder tier={tier} prices={prices} still={still} />
            </div>

            <div className="px-5 py-3.5 shrink-0 flex items-center gap-2 flex-wrap"
                 style={{ borderTop: `1px solid ${ROYAL.hairline}` }}>
              <p className="text-[11px] flex-1 min-w-[12rem] leading-snug" style={{ color: ROYAL.dim }}>
                You can change all of this later from your profile, and add a level any time without changing tier.
              </p>
              <button onClick={onClose}
                      className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5"
                      style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}>
                <Check className="w-4 h-4" /> Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/**
 * The teaser that opens it. Small on purpose: it sits inside the tier step and
 * must not compete with the tier cards for attention.
 */
export function AlertLadderTeaser({
  tier, onOpen, still = false,
}: { tier: Tier; onOpen: () => void; still?: boolean }) {
  const included = ALERT_LEVELS.filter((l) => tier >= l.includedFrom);
  const top = included[included.length - 1];

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="w-full text-left rounded-2xl px-4 py-3 flex items-center gap-3 transition-colors"
      style={{ background: `${ROYAL.gold}0d`, border: `1px solid ${ROYAL.gold}33` }}
    >
      <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
            style={{ background: `${ROYAL.gold}1f`, border: `1px solid ${ROYAL.gold}55` }}>
        <BellRing className="w-4 h-4" style={{ color: ROYAL.gold }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold" style={{ fontFamily: HEADING, color: ROYAL.text }}>
          Alerts: you get {included.length} of 5 levels free
        </div>
        <div className="text-[11px] leading-snug" style={{ color: ROYAL.dim }}>
          Up to <span style={{ color: top?.color }}>{top?.name}</span>. Tap to see all five and what the rest cost.
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {ALERT_LEVELS.map((l) => (
          <span key={l.level} className="w-1.5 rounded-full"
                style={{
                  height: 10 + l.level * 3,
                  background: tier >= l.includedFrom ? l.color : "rgba(255,255,255,0.14)",
                  alignSelf: "flex-end",
                }} />
        ))}
      </div>
    </motion.button>
  );
}

export default AlertLadderModal;
