import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * What a module shows when the data behind it did not arrive.
 *
 * The alternative — and what several of these pages used to do — is to fall
 * back to zeros and render the score anyway. "CAPE 0 J/kg · BENIGN" during a
 * feed outage does not read as a gap, it reads as a measurement, and on a
 * severe-weather product that is the one failure mode we cannot ship. Any
 * module that computes a number from a feed guards on this instead.
 */
export default function DataUnavailable({
  title,
  source = "the weather feed",
  onRetry,
}: {
  title: string;
  source?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="p-4 md:p-6">
      <h2 className="text-xl font-bold tracking-wide uppercase mb-6">{title}</h2>
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-destructive" />
        <p className="font-semibold mb-1">No data to show</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          We could not reach {source}, so there is nothing to calculate this from.
          Rather than show you a number we made up, we are showing you nothing.
          Check your connection and try again.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border
                       bg-muted/20 text-sm font-medium hover:border-primary/40 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-primary" /> Try again
          </button>
        )}
      </div>
    </div>
  );
}
