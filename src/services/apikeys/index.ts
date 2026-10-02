import { createHash, randomBytes } from "node:crypto";

export const API_SCOPES = ["courses:read", "enrollments:read", "completions:read", "certificates:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

export interface GeneratedApiKey {
  /** Shown to the admin exactly once at creation time; never stored or retrievable again. */
  plaintext: string;
  /** First 12 characters of the key, safe to display for identification in the admin UI. */
  prefix: string;
  /** SHA-256 hex digest, the only form persisted. */
  hash: string;
}

const KEY_PREFIX = "mlms_live_";

export function generateApiKey(): GeneratedApiKey {
  const plaintext = `${KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  return { plaintext, prefix: plaintext.slice(0, 18), hash: hashApiKey(plaintext) };
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Parses the Authorization header; returns the raw key or null if the header is malformed/absent. */
export function extractBearerKey(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(\S+)$/.exec(authorizationHeader.trim());
  return match ? match[1] : null;
}
