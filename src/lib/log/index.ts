// Structured logging (T-242, F-942). One JSON line per event on stdout/stderr, which the host's
// log collector or any log drain indexes by field. Secrets are redacted (SECURITY §20) and
// every line carries the request ID set by src/proxy.ts when it runs inside a request.

import { formatLog, type LogLevel } from "./format";
import { REQUEST_ID_HEADER } from "./request-id";

export { REQUEST_ID_HEADER } from "./request-id";

/** The current request's ID, or undefined outside a request (cron, build, tests). */
export async function currentRequestId(): Promise<string | undefined> {
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get(REQUEST_ID_HEADER) ?? undefined;
  } catch {
    return undefined;
  }
}

function write(level: LogLevel, line: string) {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

async function emit(level: LogLevel, event: string, fields?: Record<string, unknown>, requestId?: string) {
  try {
    const id = requestId ?? (await currentRequestId());
    write(level, JSON.stringify(formatLog(level, event, fields, id, new Date())));
  } catch {
    // Logging must never take a request down.
  }
}

/**
 * `log.error("audit.write_failed", { action, err })`. Fire-and-forget; pass `requestId` when it is
 * already known (e.g. in the proxy or onRequestError) to skip the header lookup.
 */
export const log = {
  debug: (event: string, fields?: Record<string, unknown>, requestId?: string) => void emit("debug", event, fields, requestId),
  info: (event: string, fields?: Record<string, unknown>, requestId?: string) => void emit("info", event, fields, requestId),
  warn: (event: string, fields?: Record<string, unknown>, requestId?: string) => void emit("warn", event, fields, requestId),
  error: (event: string, fields?: Record<string, unknown>, requestId?: string) => void emit("error", event, fields, requestId),
};
