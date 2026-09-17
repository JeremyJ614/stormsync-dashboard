/**
 * The horizontal subtab bar.
 *
 * One shared `layoutId` pill slides between tabs, which is the cheapest way to
 * make a tab bar feel physical: nothing fades, the highlight travels. The bar
 * scrolls horizontally on a phone rather than wrapping, because a wrapped tab
 * row reads as two rows of chips and loses the sense of a sequence.
 *
 * The active tab is scrolled into view on change, so a tap on tab five does not
 * leave the reader looking at tab one.
 */
import { memo, useEffect, useRef, type ReactElement } from "react";
import { motion } from "framer-motion";
import { ROYAL, HEADING, SPRING } from "../../lib/royal";

export interface TabDef<T extends string> { id: T; label: string; hint?: string }

export const ChaseTabs = memo(function ChaseTabs<T extends string>({
  tabs, active, onChange, color, still,
}: {
  tabs: readonly TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  color: string;
  still: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    el?.scrollIntoView({ behavior: still ? "auto" : "smooth", inline: "center", block: "nearest" });
  }, [active, still]);

  return (
    <div
      ref={barRef}
      role="tablist"
      className="flex gap-1 overflow-x-auto rounded-2xl p-1.5"
      style={{
        background: "rgba(255,255,255,0.035)",
        border: `1px solid ${ROYAL.hairline}`,
        scrollbarWidth: "none",
      }}
    >
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            data-tab={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            title={t.hint}
            className="relative shrink-0 px-3.5 sm:px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-colors"
            style={{ color: on ? "#0d0d18" : ROYAL.dim, fontFamily: HEADING }}
          >
            {on && (
              <motion.span
                layoutId="chase-tab-pill"
                className="absolute inset-0 rounded-xl"
                style={{ background: `linear-gradient(180deg, ${color}, ${color}c4)`, boxShadow: `0 6px 18px -8px ${color}` }}
                transition={still ? { duration: 0 } : SPRING.silk}
              />
            )}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}) as <T extends string>(p: {
  tabs: readonly TabDef<T>[]; active: T; onChange: (id: T) => void; color: string; still: boolean;
}) => ReactElement;

export default ChaseTabs;
