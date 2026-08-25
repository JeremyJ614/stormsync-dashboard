/**
 * "New version ready" — shown only when a build lands while someone is
 * actively using the app.
 *
 * If they are idle or the tab is hidden, `lib/pwa` hands over silently and this
 * never appears. That is the whole point: during severe weather the screen must
 * not blink out from under a warning someone is reading.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X } from "lucide-react";
import { subscribeUpdate, updateReady, applyUpdate } from "../lib/pwa";
import { ROYAL, EASE, SPRING, prefersReducedMotion } from "../lib/royal";

export function UpdateChip() {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => subscribeUpdate(() => setReady(updateReady())), []);

  const show = ready && !dismissed;
  // The chip still appears when motion is reduced — it is a notice, not
  // decoration — it just arrives without the travel or the spinning icon.
  const still = prefersReducedMotion();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={still ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={still ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
          transition={still ? { duration: 0.16 } : SPRING.silk}
          role="status"
          className="fixed left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{
            bottom: "calc(1rem + env(safe-area-inset-bottom))",
            background: "linear-gradient(180deg, hsl(var(--card) / 0.97), hsl(var(--card) / 0.9))",
            border: `1px solid ${ROYAL.goldSoft}`,
            boxShadow: "0 22px 44px -26px rgba(0,0,0,0.95)",
            backdropFilter: "blur(10px)",
          }}
        >
          <motion.span
            animate={{ rotate: applying && !still ? 360 : 0 }}
            transition={applying && !still ? { duration: 1, repeat: Infinity, ease: "linear" } : { duration: 0.3, ease: EASE }}
            className="shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" style={{ color: ROYAL.gold }} />
          </motion.span>
          <span className="text-[12.5px] whitespace-nowrap" style={{ color: ROYAL.text }}>
            New version ready
          </span>
          <button
            onClick={() => { setApplying(true); applyUpdate(); }}
            className="px-2.5 py-1 rounded-lg text-[11.5px] font-semibold shrink-0"
            style={{ background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`, color: "#17141f" }}
          >
            Refresh
          </button>
          <button onClick={() => setDismissed(true)} aria-label="Not now"
                  className="p-1 rounded-md shrink-0" style={{ color: ROYAL.dim }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default UpdateChip;
