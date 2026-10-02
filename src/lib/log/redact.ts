// Pure: strips secrets out of anything about to be logged (SECURITY §20). Unit-tested.

export const REDACTED = "[REDACTED]";

/** Key fragments whose values are never logged: credentials, tokens, cookies, payment and signing secrets. */
const SECRET_FRAGMENTS = [
  "password", "passwd", "passphrase", "secret", "token", "authorization", "authorisation",
  "cookie", "apikey", "servicerole", "jwt", "signature", "privatekey", "cardnumber",
];
/** Whole key tokens that are secrets on their own (too short to match as fragments). */
const SECRET_TOKENS = new Set(["cvc", "cvv", "otp", "pin"]);

/** `serviceRoleKey`, `service_role_key`, `X-Api-Key` → ["service","role","key"]… then matched as words. */
export function isSecretKey(key: string): boolean {
  const tokens = key
    .split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  const joined = tokens.join("");
  return SECRET_FRAGMENTS.some((f) => joined.includes(f)) || tokens.some((t) => SECRET_TOKENS.has(t));
}

/** Values that are credentials whatever their key: JWTs, bearer headers, Stripe/Supabase-style keys. */
const SECRET_VALUE = [
  /\beyJ[\w-]{6,}\.[\w-]{6,}\.[\w-]{6,}/g, // JWT
  /\bBearer\s+[\w.~+/-]+=*/gi,
  /\b(sk|rk|pk)_(live|test)_[\w]{8,}/g, // Stripe-style keys
  /\bsb_(secret|publishable)_[\w-]{8,}/g, // Supabase API keys
];

const MAX_DEPTH = 6;
const MAX_STRING = 2000;

function redactString(s: string): string {
  let out = s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…` : s;
  for (const re of SECRET_VALUE) out = out.replace(re, REDACTED);
  return out;
}

/** Deep copy of `value` that is safe to log: secret keys masked, token-looking strings masked, errors flattened. */
export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (depth >= MAX_DEPTH) return "[Truncated]";
  if (value instanceof Date) return value.toISOString();

  const obj = value as object;
  if (seen.has(obj)) return "[Circular]";
  seen.add(obj);

  if (value instanceof Error) {
    const e = value as Error & { digest?: unknown; code?: unknown; cause?: unknown };
    return {
      name: e.name,
      message: redactString(e.message),
      ...(e.code !== undefined ? { code: redact(e.code, depth + 1, seen) } : {}),
      ...(e.digest !== undefined ? { digest: String(e.digest) } : {}),
      ...(e.stack ? { stack: redactString(e.stack) } : {}),
      ...(e.cause !== undefined ? { cause: redact(e.cause, depth + 1, seen) } : {}),
    };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSecretKey(k) ? REDACTED : redact(v, depth + 1, seen);
  }
  return out;
}
