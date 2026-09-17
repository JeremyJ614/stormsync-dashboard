/**
 * The segmented control.
 *
 * Modules were each rolling their own row of pill buttons: a border swap on the
 * active one, no motion, and nothing tying the row together. Six of those in a
 * line reads as six separate controls rather than one instrument with a
 * position.
 *
 * This is one control. A single champagne slab slides between the segments with
 * a shared layout id, so the selection *travels* — you can see where it came
 * from, which is the whole difference between a tab bar and a set of buttons.
 * The label above it crossfades to ink as the slab arrives underneath it.
 *
 * It scrolls horizontally on a phone and keeps the active segment in view, and
 * it is a real tablist: arrow keys move between tabs, Home and End jump to the
 * ends, and the panel it controls is wired up through `aria-controls`.
 */
import { memo, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ROYAL, SPRING, prefersReducedMotion } from "../../lib/royal";

export interface Segment<T extends string> {
  id: T;
  label: string;
  /**
   * A few words under the label saying what the section is.
   *
   * "SPC" and "CPC" are opaque to anyone who does not already work with these
   * products, and a tab nobody understands is a tab nobody presses. Hidden on
   * the narrowest phones, where the row would wrap.
   */
  sub?: string;
  /** Optional trailing count or status dot content. */
  badge?: string | number;
}

interface Props<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Ties the sliding indicator to this control when several are on a page. */
  layoutId?: string;
  /** id of the panel this controls, for assistive technology. */
  controls?: string;
  label?: string;
  className?: string;
}

function SegmentedTabsInner<T extends string>({
  segments, value, onChange, layoutId = "segbar", controls, label = "Sections", className = "",
}: Props<T>) {
  const still = prefersReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  // Keep the selected segment on screen. On a phone the row is wider than the
  // viewport, and a tab you cannot see is a tab you will not press.
  useEffect(() => {
    const el = refs.current.get(value);
    el?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "nearest", inline: "nearest" });
  }, [value, still]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const i = segments.findIndex((s) => s.id === value);
    if (i < 0) return;
    const jump = (n: number) => {
      e.preventDefault();
      const next = segments[(n + segments.length) % segments.length];
      onChange(next.id);
      refs.current.get(next.id)?.focus();
    };
    if (e.key === "ArrowRight") jump(i + 1);
    else if (e.key === "ArrowLeft") jump(i - 1);
    else if (e.key === "Home") jump(0);
    else if (e.key === "End") jump(segments.length - 1);
  }, [segments, value, onChange]);

  return (
    <div
      ref={scroller}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`relative flex gap-1 overflow-x-auto no-scrollbar rounded-2xl p-1 ${className}`}
      style={{
        background: "rgba(10,10,22,0.55)",
        border: `1px solid ${ROYAL.hairline}`,
        boxShadow: `0 1px 0 0 rgba(255,255,255,0.03) inset`,
        scrollbarWidth: "none",
      }}
    >
      {segments.map((s) => {
        const on = s.id === value;
        return (
          <button
            key={s.id}
            ref={(el) => { if (el) refs.current.set(s.id, el); else refs.current.delete(s.id); }}
            role="tab"
            aria-selected={on}
            aria-controls={controls}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(s.id)}
            // A press should feel like a press. Transform only, so it is a
            // compositor job and costs nothing on a phone.
            style={{
              color: on ? "#120f1e" : ROYAL.dim,
              WebkitTapHighlightColor: "transparent",
              // @ts-expect-error custom property for the focus ring colour
              "--tw-ring-color": ROYAL.goldSoft,
            }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.96)"; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = ""; }}
            onPointerLeave={(e) => { e.currentTarget.style.transform = ""; }}
            className="relative shrink-0 px-3.5 sm:px-4 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap outline-none transition-[color,transform] duration-150 focus-visible:ring-2"
          >
            {on && (
              <motion.span
                aria-hidden
                layoutId={layoutId}
                className="absolute inset-0 rounded-xl"
                transition={still ? { duration: 0 } : SPRING.silk}
                style={{
                  background: `linear-gradient(180deg, ${ROYAL.gold}, #c9a25f)`,
                  boxShadow: `0 6px 18px -8px ${ROYAL.gold}, 0 1px 0 0 rgba(255,255,255,0.35) inset`,
                }}
              />
            )}
            <span className="relative flex flex-col items-center leading-tight">
              <span className="flex items-center gap-1.5">
              {s.label}
              {s.badge !== undefined && s.badge !== "" && (
                <span
                  className="text-[10px] font-bold tabular-nums px-1.5 py-px rounded-full"
                  style={{
                    background: on ? "rgba(18,15,30,0.18)" : ROYAL.goldFaint,
                    color: on ? "#120f1e" : ROYAL.gold,
                  }}
                >
                  {s.badge}
                </span>
              )}
              </span>
              {s.sub && (
                <span className="hidden sm:block text-[9px] font-medium tracking-[0.1em] uppercase mt-0.5"
                      style={{ color: on ? "rgba(18,15,30,0.62)" : ROYAL.dim, opacity: on ? 1 : 0.75 }}>
                  {s.sub}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const SegmentedTabs = memo(SegmentedTabsInner) as typeof SegmentedTabsInner;
export default SegmentedTabs;
