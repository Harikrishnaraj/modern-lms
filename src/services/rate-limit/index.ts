import { log } from "@/lib/log";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

// Server-only: uses the service-role key (never NEXT_PUBLIC_*).
// ponytail: Postgres-backed sliding window; concurrent requests can slightly
// overshoot the limit. Swap for Redis/Upstash if throughput demands it.
const LIMITS = {
  login: { limit: 10, windowSeconds: 15 * 60 },
  "password-reset": { limit: 5, windowSeconds: 60 * 60 },
  "verify-email": { limit: 5, windowSeconds: 60 * 60 },
  "assessment-submit": { limit: 30, windowSeconds: 60 * 60 },
  "certificate-verify": { limit: 10, windowSeconds: 10 * 60 },
  "discussion-post": { limit: 20, windowSeconds: 10 * 60 },
  "discussion-react": { limit: 60, windowSeconds: 10 * 60 },
  "review-report": { limit: 20, windowSeconds: 10 * 60 },
  "api-request": { limit: 300, windowSeconds: 10 * 60 },
  "instructor-message": { limit: 20, windowSeconds: 10 * 60 },
  "upload-initiate": { limit: 30, windowSeconds: 10 * 60 },
  "analytics-export": { limit: 20, windowSeconds: 10 * 60 },
} as const;

export type RateLimitedAction = keyof typeof LIMITS;

export const RATE_LIMITED_MESSAGE = "Too many attempts. Please wait a while and try again.";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export async function userAgent(): Promise<string | null> {
  const h = await headers();
  return h.get("user-agent");
}

// Shared NATs/offices sit behind one IP, so the per-IP bucket is looser than
// the per-subject (email) one.
const IP_LIMIT_MULTIPLIER = 30;

// Returns true when the request may proceed. The caller's IP and the optional
// subject (e.g. the target email) are checked independently: either one over
// its limit blocks. Fails open on infrastructure errors so an outage in the
// limiter doesn't lock every user out; the error is logged.
export async function rateLimit(
  action: RateLimitedAction,
  ip: string,
  subject?: string,
): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    log.error("rate_limit.not_configured", { detail: "service role key missing; limiting disabled" });
    return true;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { limit, windowSeconds } = LIMITS[action];

  const buckets = [{ id: `ip:${ip}`, limit: limit * IP_LIMIT_MULTIPLIER }];
  if (subject) buckets.push({ id: subject, limit });

  for (const bucket of buckets) {
    const { data, error } = await db.rpc("check_rate_limit", {
      p_key: `${action}:${bucket.id.toLowerCase()}`,
      p_limit: bucket.limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      log.error("rate_limit.check_failed", { message: error.message });
      return true;
    }
    if (data === false) return false;
  }
  return true;
}
