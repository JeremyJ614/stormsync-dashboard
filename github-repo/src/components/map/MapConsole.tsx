/**
 * The floating control console for a map-led module.
 *
 * The radar module used to be a sandwich: group tabs and a rail of product
 * pills above the map, an opacity slider and three paragraphs of caption below
 * it. The map — the entire point of the page — got whatever height was left,
 * and on a desktop it sat in a narrow column with hundreds of pixels of empty
 * space either side of the controls.
 *
 * So the controls come off the page and onto the map, as one glass panel that
 * floats over the corner and can be folded away entirely. The map is then free
 * to be as large as the viewport allows, which is what a radar mosaic wants,
 * and the thing you are adjusting is visible while you adjust it.
 *
 * On a phone it docks to the bottom instead of the corner and opens as a sheet,
 * because a floating panel over a 390px-wide map is just a smaller map.
 */
import { memo, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { ROYAL, HEADING, EASE, SPRING, prefersReducedMotion } from "../../lib/royal";

interface Props {
  title: string;
  /** One line summarising the current selection, shown when folded. */
  summary?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

export const MapConsole = memo(function MapConsole({
  title, summary, children, defaultOpen = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const still = prefersReducedMotion();

  return (
    <motion.div
      className="absolute z-20 left-2 right-2 bottom-2 sm:right-auto sm:top-2 sm:bottom-auto sm:w-[310px] sm:left-2"
      initial={still ? { opacity: 0 } : { opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: still ? 0.2 : 0.45, delay: 0.1, ease: EASE }}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "rgba(8,8,18,0.82)",
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
          border: `1px solid ${ROYAL.hairline}`,
          boxShadow: "0 26px 60px -34px rgba(0,0,0,1)",
        }}
      >
        <span aria-hidden className="block h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${ROYAL.goldSoft}, transparent)` }} />

        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full px-3.5 py-2.5 flex items-center gap-2 text-left"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL.gold }} />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-[0.26em] font-semibold"
                  style={{ color: ROYAL.gold }}>{title}</span>
            {!open && summary && (
              <span className="block text-[11px] truncate mt-0.5" style={{ color: ROYAL.text }}>{summary}</span>
            )}
          </span>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={still ? { duration: 0 } : SPRING.silk}
            className="shrink-0"
          >
            <ChevronDown className="w-4 h-4" style={{ color: ROYAL.dim }} />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="body"
              initial={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={still ? { opacity: 1 } : { height: "auto", opacity: 1 }}
              exit={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: still ? 0.15 : 0.3, ease: EASE }}
              style={{ overflow: "hidden" }}
            >
              <div className="px-3.5 pb-3.5 space-y-3 max-h-[46vh] sm:max-h-[64vh] overflow-y-auto">
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

/** A labelled section inside the console. */
export function ConsoleSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.24em] mb-1.5" style={{ color: ROYAL.dim }}>{label}</div>
      {children}
    </div>
  );
}

/**
 * A product row.
 *
 * The selection is a shared-layout slab that slides between rows, so switching
 * product reads as moving a selector rather than as two independent highlights
 * blinking. Each row carries its own one-line purpose: a rail of bare names
 * ("N0Q", "MERGEDREF") asks the reader to already know the answer.
 */
export function ProductRow({
  label, hint, active, onClick, layoutId,
}: { label: string; hint?: string; active: boolean; onClick: () => void; layoutId: string }) {
  const still = prefersReducedMotion();
  return (
    <button
      onClick={onClick}
      className="relative w-full text-left px-2.5 py-2 rounded-xl transition-colors"
      aria-pressed={active}
    >
      {active && (
        <motion.span
          aria-hidden
          layoutId={layoutId}
          className="absolute inset-0 rounded-xl"
          transition={still ? { duration: 0 } : SPRING.silk}
          style={{
            background: `linear-gradient(90deg, ${ROYAL.goldFaint}, rgba(217,183,117,0.02))`,
            border: `1px solid ${ROYAL.goldSoft}`,
          }}
        />
      )}
      <span className="relative block">
        <span className="block text-[12.5px] font-semibold leading-tight"
              style={{ color: active ? ROYAL.gold : ROYAL.text, fontFamily: HEADING }}>
          {label}
        </span>
        {hint && (
          <span className="block text-[10.5px] leading-snug mt-0.5" style={{ color: ROYAL.dim }}>{hint}</span>
        )}
      </span>
    </button>
  );
}

/**
 * The legend as a continuous ramp.
 *
 * A reflectivity scale IS a gradient; drawing it as five separate squares in a
 * column throws that away and takes five times the room. End labels carry the
 * direction, which is all anybody reads off a radar legend anyway.
 */
export function RampLegend({ title, swatches }: { title: string; swatches: { color: string; label: string }[] }) {
  if (!swatches.length) return null;
  const stops = swatches.map((s, i) => `${s.color} ${(i / (swatches.length - 1)) * 100}%`).join(", ");
  return (
    <div>
      <div className="text-[9px] uppercase tracking-[0.24em] mb-1" style={{ color: ROYAL.dim }}>{title}</div>
      <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${stops})` }} />
      <div className="flex justify-between mt-1 gap-2">
        <span className="text-[9.5px] truncate" style={{ color: ROYAL.dim }}>{swatches[0].label}</span>
        <span className="text-[9.5px] truncate text-right" style={{ color: ROYAL.dim }}>
          {swatches[swatches.length - 1].label}
        </span>
      </div>
    </div>
  );
}

export default MapConsole;
