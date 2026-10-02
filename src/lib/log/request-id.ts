// Pure: the request (correlation) ID every log line and response carries (ARCHITECTURE §19).

export const REQUEST_ID_HEADER = "x-request-id";

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** A client- or edge-supplied ID is reused only when it is a plain token (never logged raw otherwise). */
export function isSafeRequestId(value: string | null | undefined): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

/**
 * The ID for this request: an upstream `x-request-id` if it is safe, else a `cf-ray` (when a
 * Cloudflare proxy/CDN sits in front, so our logs line up with its logs), else a fresh UUID.
 */
export function pickRequestId(headers: { get(name: string): string | null }, generate: () => string = () => crypto.randomUUID()): string {
  const upstream = headers.get(REQUEST_ID_HEADER);
  if (isSafeRequestId(upstream)) return upstream;
  const ray = headers.get("cf-ray");
  if (isSafeRequestId(ray)) return ray;
  return generate();
}
