import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "@/lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  pageName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Route all render-time crashes through the centralized logger.
    logger.captureException(error, "React render error", {
      scope: this.props.pageName ?? "ErrorBoundary",
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8 text-center">
          <div className="text-4xl">⚡</div>
          <h2 className="text-xl font-bold text-destructive">
            {this.props.pageName ? `${this.props.pageName} failed to load` : "Something went wrong"}
          </h2>
          <p className="text-muted-foreground text-sm max-w-sm">
            {this.state.error?.message || "An unexpected error occurred loading this module."}
          </p>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90 transition-opacity"
            onClick={() => this.setState({ hasError: false })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
