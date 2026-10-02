// Pure: one structured log line (JSON). Unit-tested; the logger only adds the clock and the sink.

import { redact } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
  ts: string;
  level: LogLevel;
  event: string;
  requestId?: string;
  [field: string]: unknown;
}

const RESERVED = new Set(["ts", "level", "event", "requestId"]);

/** Builds the record: fields are redacted and can never overwrite the envelope keys. */
export function formatLog(level: LogLevel, event: string, fields: Record<string, unknown> | undefined, requestId: string | undefined, now: Date): LogRecord {
  const safe = (redact(fields ?? {}) ?? {}) as Record<string, unknown>;
  const record: LogRecord = { ts: now.toISOString(), level, event };
  if (requestId) record.requestId = requestId;
  for (const [k, v] of Object.entries(safe)) {
    if (!RESERVED.has(k) && v !== undefined) record[k] = v;
  }
  return record;
}
