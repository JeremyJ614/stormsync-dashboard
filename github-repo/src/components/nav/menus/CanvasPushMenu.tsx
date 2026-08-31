import { Link } from "wouter";
import { motion } from "framer-motion";
import { Lock, Menu, X } from "lucide-react";
import type { MenuNav } from "./useMenuNav";
import { ROYAL } from "../../../lib/royal";

/**
 * Canvas Push.
 *
 * The app tilts away on the Y axis and the menu stands behind it, which makes
 * the menu feel like a place the app was covering rather than a panel on top of
 * it. The transform itself is applied by Layout to the content wrapper — a
 * child cannot push its own ancestor — so this component draws only the menu
 * and the trigger.
 *
 * It is the one style that shows every section at once, so it does not use the
 * two-level traversal the others do: with 38 modules a single scrolling column
 * under section headings beats making people drill in and back out.
 */
export function CanvasPushMenu({ nav }: { nav: MenuNav }) {
  const { open, sections, toggle, close, calm, containerRef } = nav;

  return (
    <div ref={containerRef} className="fixed inset-0 z-[60] pointer-events-none">
      <motion.div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(120deg, #05060f 0%, #0b0a1c 55%, #150f22 100%)",
          pointerEvents: open ? "auto" : "none",
        }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: calm ? 0 : 0.4 }}
        aria-hidden={!open}
      />

      <motion.nav
        className="absolute inset-y-0 left-0 flex flex-col"
        style={{ width: "min(74vw, 340px)", pointerEvents: open ? "auto" : "none" }}
        initial={false}
        animate={open ? { opacity: 1, x: 0 } : { opacity: 0, x: -24 }}
        transition={{ duration: calm ? 0 : 0.4, delay: calm ? 0 : 0.12 }}
        aria-label="Navigation"
        aria-hidden={!open}
      >
        <div className="px-6 pt-20 pb-4 shrink-0">
          <div className="text-[10px] uppercase tracking-[0.35em]" style={{ color: ROYAL.dim }}>StormSync</div>
          <div className="text-3xl font-extrabold" style={{ color: ROYAL.text }}>Menu</div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-5">
          {sections.map((sec) => (
            <div key={sec.label}>
              <div className="px-2 pb-1.5 text-[10px] uppercase tracking-[0.28em]" style={{ color: ROYAL.dim }}>
                {sec.label}
              </div>
              <div className="space-y-0.5">
                {sec.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.path}
                      href={it.path}
                      onClick={close}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5"
                    >
                      <Icon className="w-4 h-4 shrink-0" style={{ color: ROYAL.gold }} />
                      <span className="truncate text-[15px] font-medium" style={{ color: ROYAL.text }}>{it.label}</span>
                      {it.locked && <Lock className="ml-auto w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.dim }} />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </motion.nav>

      <button
        onClick={toggle}
        aria-label={open ? "Close the menu" : "Open the menu"}
        aria-expanded={open}
        className="absolute grid place-items-center rounded-xl"
        style={{
          top: 14, left: 14, width: 46, height: 46, zIndex: 70,
          background: open ? "rgba(255,255,255,0.1)" : ROYAL.gold,
          color: open ? ROYAL.text : "#0b0b12",
          border: open ? `1px solid ${ROYAL.hairline}` : "none",
          boxShadow: open ? "none" : "0 8px 20px rgba(0,0,0,.4)",
          pointerEvents: "auto",
          transition: calm ? "none" : "all .35s ease",
        }}
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
    </div>
  );
}
