import { createHmac, randomBytes } from "node:crypto";

export const WEBHOOK_EVENTS = ["enrollment.created", "course.completed", "certificate.issued"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function signWebhookPayload(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

/**
 * Best-effort SSRF guard for admin-registered webhook URLs (SECURITY.md §8): requires https and
 * rejects obviously-internal literal hosts/IP ranges. It checks the hostname as written, not a
 * resolved DNS answer, so it does not defend against DNS rebinding -- an accepted limitation for
 * an admin-only (not self-service) registration flow.
 */
export function isSafeWebhookUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  // IPv6 literal hosts keep their brackets in url.hostname (e.g. "[::1]"); strip them for matching.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (PRIVATE_HOSTS.has(host)) return false;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return false;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host)) return false;
  if (/^169\.254\.\d+\.\d+$/.test(host)) return false;
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return false;
  return true;
}
