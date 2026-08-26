/**
 * The bar that says you are not looking at your own account.
 *
 * It is deliberately loud and deliberately fixed to the top of the viewport:
 * the whole failure mode of a "view as" feature is forgetting you are in it and
 * mistaking a member's empty module list for a bug in your own. Nothing else in
 * the app is allowed to cover it, and the way out is always one tap away.
 */
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { stopViewingAs } from "../lib/impersonate";
import { ROYAL, prefersReducedMotion } from "../lib/royal";

const TIER_NAME = ["", "Free", "Basic", "VIP", "Advanced"];

export function ViewAsBanner() {
  const { viewAs } = useAuth();
  const still = prefersReducedMotion();

  // The banner occupies real space rather than floating over the header, so
  // push the document down by exactly its height while it is up.
  useEffect(() => {
    document.body.style.paddingTop = viewAs ? "38px" : "";
    return () => { document.body.style.paddingTop = ""; };
  }, [viewAs]);

  return (
    <AnimatePresence>
      {viewAs && (
        <motion.div
          initial={still ? { opacity: 0 } : { y: -38 }}
          animate={still ? { opacity: 1 } : { y: 0 }}
          exit={still ? { opacity: 0 } : { y: -38 }}
          transition={still ? { duration: 0.15 } : { type: "spring", stiffness: 420, damping: 34 }}
          role="status"
          className="fixed top-0 left-0 right-0 z-[95] h-[38px] flex items-center justify-center gap-3 px-3 text-[12.5px]"
          style={{
            background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a55f)`,
            color: "#17141f",
            boxShadow: "0 6px 20px -10px rgba(0,0,0,0.8)",
          }}
        >
          <Eye className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">
            Viewing as <strong>{viewAs.name}</strong>
            <span className="hidden sm:inline"> · {TIER_NAME[viewAs.tier]} · {viewAs.email}</span>
          </span>
          <button
            onClick={stopViewingAs}
            className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold"
            style={{ background: "rgba(23,20,31,0.16)" }}
          >
            <X className="w-3 h-3" /> Exit
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ViewAsBanner;
