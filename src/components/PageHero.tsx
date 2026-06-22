/**
 * Premium page header (Phase 9/redesign pass): an aurora-glass band with a
 * glowing icon tile and a softly-glowing title. Purely cosmetic — pages keep
 * all their existing content below it.
 */
interface Props {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  /** Optional right-aligned slot (e.g. a Refresh button). */
  action?: React.ReactNode;
}

export function PageHero({ icon: Icon, title, subtitle, action }: Props) {
  return (
    <div className="aurora-bg glass glow-primary rounded-2xl px-5 py-4 flex items-center gap-4">
      <div className="relative w-12 h-12 rounded-2xl bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0 ring-glow">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold tracking-wide truncate text-glow">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
