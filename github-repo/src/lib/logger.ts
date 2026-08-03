// Centralized logging / error reporting.
//
// Every caught error in the app should flow through here (ErrorBoundary, global
// handlers, data-layer catches) so we have ONE place to later forward to an external
// service (Sentry, Supabase `events_log`, etc.) without touching call sites again.
//
// Phase 0: console transport only. To add a real sink later, implement and register
// a transport via `addTransport` — do not scatter logging logic across the app.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  /** Short area/module tag, e.g. "supabase", "WarningCenter". */
  scope?: string;
  [key: string]: unknown;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: unknown;
  timestamp: string;
}

export type LogTransport = (entry: LogEntry) => void;

const transports: LogTransport[] = [];

/** Register an additional sink (e.g. Sentry/Supabase). Returns an unsubscribe fn. */
export function addTransport(transport: LogTransport): () => void {
  transports.push(transport);
  return () => {
    const i = transports.indexOf(transport);
    if (i >= 0) transports.splice(i, 1);
  };
}

const consoleTransport: LogTransport = (entry) => {
  const tag = entry.context?.scope ? `[${entry.context.scope}]` : "[app]";
  const args: unknown[] = [`${tag} ${entry.message}`];
  if (entry.error !== undefined) args.push(entry.error);
  if (entry.context && Object.keys(entry.context).length > 0) args.push(entry.context);

  if (entry.level === "error") console.error(...args);
  else if (entry.level === "warn") console.warn(...args);
  else if (entry.level === "debug") console.debug(...args);
  else console.info(...args);
};

function emit(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
  const entry: LogEntry = {
    level,
    message,
    context,
    error,
    timestamp: new Date().toISOString(),
  };
  consoleTransport(entry);
  for (const t of transports) {
    try {
      t(entry);
    } catch {
      // A failing transport must never break the app.
    }
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
  /** Report a thrown error with an optional message + context. */
  captureException: (error: unknown, message?: string, context?: LogContext) =>
    emit("error", message ?? errorMessage(error), context, error),
};

/** Best-effort human-readable message from any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

/**
 * Install global handlers so nothing fails silently. Call once at startup.
 * Returns a cleanup function.
 */
export function installGlobalErrorHandlers(): () => void {
  const onError = (event: ErrorEvent) => {
    logger.captureException(event.error ?? event.message, "Uncaught error", {
      scope: "window.onerror",
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    logger.captureException(event.reason, "Unhandled promise rejection", {
      scope: "window.onunhandledrejection",
    });
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
