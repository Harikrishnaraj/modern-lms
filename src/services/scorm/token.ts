import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived capability for one user + one SCORM lesson, carried in the asset URL path
 * (/api/scorm/<lessonId>/<token>/<file>). The player iframe is sandboxed without
 * allow-same-origin, so its requests are cross-site and never carry the session cookie; every
 * relative URL the package loads inherits the token instead. It is minted only after RLS let the
 * viewer read the lesson (getLessonContent).
 * ponytail: access revoked mid-session keeps working until the token expires (TTL below).
 */
export const SCORM_TOKEN_TTL_SECONDS = 8 * 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Derived from the server-only service-role key so no extra secret has to be configured.
function key(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createHmac("sha256", secret).update("scorm-asset-token-v1").digest();
}

function sign(lessonId: string, userId: string, exp: number): string {
  return createHmac("sha256", key()).update(`${lessonId}.${userId}.${exp}`).digest("base64url");
}

export function signScormToken(userId: string, lessonId: string, now = Date.now()): string {
  // Expiry rounded up to the hour, so re-renders within the hour (e.g. revalidatePath after a
  // SCORM commit) produce the same iframe URL and do not reload the running course.
  const exp = (Math.floor(now / 1000 / 3600) + 1) * 3600 + SCORM_TOKEN_TTL_SECONDS;
  return `${userId}.${exp}.${sign(lessonId, userId, exp)}`;
}

/** The user id the token was issued to, or null when it is malformed, forged, expired or for another lesson. */
export function verifyScormToken(token: string, lessonId: string, now = Date.now()): string | null {
  const [userId, expText, sig, ...rest] = token.split(".");
  if (rest.length > 0 || !userId || !expText || !sig || !UUID.test(userId) || !/^\d+$/.test(expText)) return null;
  const exp = Number(expText);
  if (exp * 1000 <= now) return null;
  const expected = Buffer.from(sign(lessonId, userId, exp));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}
