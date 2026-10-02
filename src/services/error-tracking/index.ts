// Error tracking adapter (T-242, ADR-015). Server errors are always written as structured
// `error` log lines with their request ID, which the host's log collector keeps and indexes.
// A third-party tracker (e.g. Sentry) plugs in here via setErrorReporter() once a
// key exists; until then reporting is log-only. Reporting never throws.

import { log } from "@/lib/log";

export interface ErrorContext {
  requestId?: string;
  [field: string]: unknown;
}

export interface ErrorReporter {
  capture(error: unknown, context: ErrorContext): void | Promise<void>;
}

let reporter: ErrorReporter | null = null;

/** Registers an external tracker; pass null to go back to log-only. */
export function setErrorReporter(next: ErrorReporter | null) {
  reporter = next;
}

/** Logs the error (redacted, with request ID) and forwards it to the registered tracker, if any. */
export async function captureError(event: string, error: unknown, context: ErrorContext = {}): Promise<void> {
  const { requestId, ...fields } = context;
  log.error(event, { ...fields, err: error }, requestId);
  if (!reporter) return;
  try {
    await reporter.capture(error, context);
  } catch {
    // A failing tracker must not mask the original error.
  }
}
