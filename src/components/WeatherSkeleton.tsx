export function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="bg-card rounded-xl p-5 border border-border animate-pulse space-y-3">
      <div className="h-4 bg-muted rounded w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 bg-muted rounded" style={{ width: `${60 + (i % 3) * 15}%` }} />
      ))}
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="bg-card rounded-xl p-5 border border-border animate-pulse">
      <div className="h-3 bg-muted rounded w-1/2 mb-3" />
      <div className="h-8 bg-muted rounded w-2/3 mb-2" />
      <div className="h-3 bg-muted rounded w-1/3" />
    </div>
  );
}

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div
      className="bg-card rounded-xl border border-border animate-pulse flex items-end gap-1 px-5 pb-4 pt-10"
      style={{ height }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 bg-muted rounded-t"
          style={{ height: `${30 + Math.abs(Math.sin(i) * 50)}%` }}
        />
      ))}
    </div>
  );
}

export function AlertSkeleton() {
  return (
    <div className="bg-card rounded-xl p-4 border border-border animate-pulse space-y-2">
      <div className="h-4 bg-muted rounded w-3/4" />
      <div className="h-3 bg-muted rounded w-full" />
      <div className="h-3 bg-muted rounded w-5/6" />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-7 bg-muted rounded w-1/4 animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
      </div>
      <ChartSkeleton />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CardSkeleton rows={5} />
        <CardSkeleton rows={5} />
      </div>
    </div>
  );
}
