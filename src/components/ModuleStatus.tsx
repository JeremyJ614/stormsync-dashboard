import { type ReactNode } from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { PageSkeleton } from "./WeatherSkeleton";
import { errorMessage } from "@/lib/logger";

// ───────────────────────────────────────────────────────────────────────────────
// THE MODULE STATUS STANDARD (Phase 0)
//
// Every data-driven module must resolve to exactly one of four visible states —
// loading, error, empty, or ok — and NEVER a frozen spinner or silent blank.
//
// Easiest adoption: wrap content in <ModuleState> and feed it a react-query result:
//
//   const q = useQuery(...);
//   return (
//     <ModuleState
//       isLoading={q.isLoading}
//       isError={q.isError}
//       error={q.error}
//       isEmpty={!q.data?.length}
//       onRetry={() => q.refetch()}
//     >
//       {/* the "ok" UI, q.data is present here */}
//     </ModuleState>
//   );
// ───────────────────────────────────────────────────────────────────────────────

export function ModuleLoading({ fallback }: { fallback?: ReactNode }) {
  return <>{fallback ?? <PageSkeleton />}</>;
}

export function ModuleError({
  error,
  onRetry,
  title = "Couldn't load this module",
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[280px] gap-4 p-8 text-center bg-card border border-border rounded-2xl">
      <AlertTriangle className="h-9 w-9 text-destructive" aria-hidden />
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-destructive">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {error !== undefined ? errorMessage(error) : "An unexpected error occurred."}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/15 border border-primary/40 text-primary text-sm hover:bg-primary/25 transition-colors"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Try again
        </button>
      )}
    </div>
  );
}

export function ModuleEmpty({
  message = "No data available right now.",
  icon,
}: {
  message?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 p-8 text-center bg-card border border-border rounded-2xl">
      <div className="text-muted-foreground/70">{icon ?? <Inbox className="h-9 w-9" aria-hidden />}</div>
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
    </div>
  );
}

interface ModuleStateProps {
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  /** Custom loading UI (e.g. a tailored skeleton). Defaults to <PageSkeleton />. */
  loadingFallback?: ReactNode;
  emptyMessage?: string;
  errorTitle?: string;
  children: ReactNode;
}

export function ModuleState({
  isLoading,
  isError = false,
  error,
  isEmpty = false,
  onRetry,
  loadingFallback,
  emptyMessage,
  errorTitle,
  children,
}: ModuleStateProps) {
  if (isLoading) return <ModuleLoading fallback={loadingFallback} />;
  if (isError) return <ModuleError error={error} onRetry={onRetry} title={errorTitle} />;
  if (isEmpty) return <ModuleEmpty message={emptyMessage} />;
  return <>{children}</>;
}
