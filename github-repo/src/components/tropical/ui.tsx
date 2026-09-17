/**
 * Presentation primitives for the tropical module.
 *
 * House style: deep indigo glass, champagne hairlines, Raleway small-caps
 * headings and tabular figures. Kept in one place so the basin page and the
 * storm tabs stay visually identical.
 */
import type { ReactNode } from "react";
import { GOLD } from "../../lib/tropical";

export const HEADING_FONT = "'Raleway', 'DM Sans', sans-serif";

/** Section shell: a gold top-rule, a small-caps title, optional right slot. */
export function Panel({
  title, eyebrow, action, children, className = "", flush = false,
}: {
  title?: ReactNode; eyebrow?: ReactNode; action?: ReactNode;
  children: ReactNode; className?: string; flush?: boolean;
}) {
  return (
    <section
      className={`relative rounded-2xl border border-border/70 bg-card/55 backdrop-blur-md overflow-hidden ${className}`}
      style={{ boxShadow: "0 1px 0 0 rgba(217,183,117,0.15) inset, 0 18px 40px -28px rgba(0,0,0,0.9)" }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(217,183,117,0.55), transparent)" }}
      />
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50">
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[10px] uppercase tracking-[0.26em] mb-0.5" style={{ color: GOLD }}>
                {eyebrow}
              </div>
            )}
            {title && (
              <h2
                className="text-sm font-semibold tracking-[0.09em] uppercase text-foreground/90 truncate"
                style={{ fontFamily: HEADING_FONT }}
              >
                {title}
              </h2>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

/** A single reading — big tabular figure, unit, quiet caption. */
export function StatTile({
  label, value, unit, sub, accent, icon,
}: {
  label: string; value: ReactNode; unit?: string; sub?: ReactNode;
  accent?: string; icon?: ReactNode;
}) {
  return (
    <div className="relative rounded-xl border border-border/60 bg-background/45 px-3.5 py-3 overflow-hidden">
      {accent && <div className="absolute left-0 top-0 bottom-0 w-[2px]" style={{ background: accent }} />}
      <div className="flex items-center gap-1.5 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
        {icon}<span className="truncate">{label}</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span
          className="text-2xl font-bold tabular-nums leading-none"
          style={{ fontFamily: HEADING_FONT, color: accent ?? undefined }}
        >
          {value}
        </span>
        {unit && <span className="text-[11px] text-muted-foreground font-medium">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[10.5px] text-muted-foreground/85 truncate">{sub}</div>}
    </div>
  );
}

/** Horizontal scrolling tab bar with a champagne underline on the active tab. */
export function TabBar<T extends string>({
  tabs, active, onChange, className = "",
}: {
  tabs: { key: T; label: string; badge?: ReactNode }[];
  active: T; onChange: (k: T) => void; className?: string;
}) {
  return (
    <div className={`flex overflow-x-auto no-scrollbar border-b border-border/60 ${className}`}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`relative px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] whitespace-nowrap shrink-0 transition-colors
              ${on ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"}`}
            style={{ fontFamily: HEADING_FONT }}
          >
            {t.label}
            {t.badge != null && <span className="ml-1.5 text-[10px] opacity-70">{t.badge}</span>}
            {on && (
              <span
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full"
                style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Pill toggle used for map layer switches. */
export function Toggle({
  on, onClick, children, color,
}: { on: boolean; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium tracking-wide transition-all
        ${on ? "text-foreground" : "text-muted-foreground/70 hover:text-muted-foreground"}`}
      style={{
        borderColor: on ? (color ?? GOLD) + "88" : "hsl(var(--border))",
        background: on ? (color ?? GOLD) + "1f" : "transparent",
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? color ?? GOLD : "hsl(var(--muted-foreground))", opacity: on ? 1 : 0.4 }} />
      {children}
    </button>
  );
}

export function Empty({ title, detail, action }: { title: string; detail?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="text-sm font-semibold tracking-wide" style={{ fontFamily: HEADING_FONT }}>{title}</div>
      {detail && <p className="mt-1.5 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-10 text-xs text-muted-foreground">
      <span
        className="w-3.5 h-3.5 rounded-full border-2 border-transparent animate-spin"
        style={{ borderTopColor: GOLD, borderRightColor: GOLD }}
      />
      {label ?? "Loading…"}
    </div>
  );
}

/** Attribution line shown under every data surface. */
export function Source({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/70 border-t border-border/40 pt-2.5">
      {children}
    </p>
  );
}
