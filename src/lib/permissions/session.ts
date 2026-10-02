export const LAST_ACTIVE_COOKIE = "lms_last_active";

/**
 * Whether a session should be forced to re-authenticate under the platform's configured idle
 * timeout (T-143). `timeoutMinutes: null` means no timeout is configured -- never expires.
 * A missing `lastActiveIso` (first request after enabling the policy, or a cleared cookie) counts
 * as expired: fail closed rather than silently granting an unbounded session.
 */
export function isSessionIdleExpired(lastActiveIso: string | null, timeoutMinutes: number | null, now: Date): boolean {
  if (timeoutMinutes === null) return false;
  if (!lastActiveIso) return true;
  const last = new Date(lastActiveIso).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > timeoutMinutes * 60_000;
}
