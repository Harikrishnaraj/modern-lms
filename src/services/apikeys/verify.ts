import type { NextRequest } from "next/server";
import { extractBearerKey, hashApiKey, isApiScope, type ApiScope } from "./index";
import { rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";
import { createAdminClient } from "@/services/supabase/admin";

export type VerifyResult = { ok: true; apiKeyId: string } | { ok: false; status: 401 | 403 | 429; message?: string };

/**
 * Authenticates a public API request by its hashed key, checks it carries `requiredScope`, and
 * records the attempt in api_request_log (T-142's request log) regardless of outcome.
 */
export async function verifyApiRequest(request: NextRequest, requiredScope: ApiScope): Promise<VerifyResult> {
  const admin = createAdminClient();
  const path = request.nextUrl.pathname;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  async function log(statusCode: number, apiKeyId: string | null) {
    await admin.from("api_request_log").insert({ api_key_id: apiKeyId, method: request.method, path, status_code: statusCode, ip });
  }

  const key = extractBearerKey(request.headers.get("authorization"));
  if (!key) {
    await log(401, null);
    return { ok: false, status: 401 };
  }

  const { data: row } = await admin
    .from("api_keys")
    .select("id, scopes, revoked_at")
    .eq("key_hash", hashApiKey(key))
    .maybeSingle();
  if (!row || row.revoked_at) {
    await log(401, row?.id ?? null);
    return { ok: false, status: 401 };
  }

  const scopes = (row.scopes as string[]).filter(isApiScope);
  if (!scopes.includes(requiredScope)) {
    await log(403, row.id as string);
    return { ok: false, status: 403 };
  }

  if (!(await rateLimit("api-request", ip ?? "unknown", row.id as string))) {
    await log(429, row.id as string);
    return { ok: false, status: 429, message: RATE_LIMITED_MESSAGE };
  }

  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  await log(200, row.id as string);
  return { ok: true, apiKeyId: row.id as string };
}
