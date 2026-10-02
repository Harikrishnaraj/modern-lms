// Pure rules for organization SSO (T-165, F-504, ADR-033). Unit-tested; the database enforces the
// same domain rules (organization_sso_domains check constraint).

/** Consumer mail domains never identify one organization. Mirrors the database constraint. */
export const CONSUMER_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
]);

const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "  @Acme.COM " → "acme.com"; rejects URLs, emails, consumer domains and malformed names. */
export function normalizeSsoDomain(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter a domain such as acme.com." };
  const domain = input.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
  if (domain === "") return { ok: false, error: "Enter a domain such as acme.com." };
  if (domain.includes("@") || domain.includes("/") || domain.includes(":")) {
    return { ok: false, error: "Enter just the domain, such as acme.com (no email address or link)." };
  }
  if (domain.length > 253 || !DOMAIN.test(domain)) return { ok: false, error: "That is not a valid domain." };
  if (CONSUMER_DOMAINS.has(domain)) {
    return { ok: false, error: "Personal email domains such as gmail.com cannot be linked to an organization." };
  }
  return { ok: true, value: domain };
}

export type SsoJoinResult = "joined" | "already_member" | "other_org" | "no_match" | "not_sso";

export function parseSsoJoinResult(data: unknown): SsoJoinResult | null {
  const r = (data as { result?: unknown } | null)?.result;
  return r === "joined" || r === "already_member" || r === "other_org" || r === "no_match" || r === "not_sso" ? r : null;
}

/** Only a same-origin relative path is ever used after sign-in (no open redirect). */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
