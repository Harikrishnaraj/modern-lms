import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiScope } from "@/services/apikeys";
import type { WebhookEvent } from "@/services/webhooks";

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: ApiScope[];
  createdByName: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface KeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

export async function getApiKeys(supabase: SupabaseClient): Promise<ApiKeySummary[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, revoked_at, created_at, profiles(full_name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`api_keys failed: ${error.message}`);
  return ((data ?? []) as unknown as KeyRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    keyPrefix: r.key_prefix,
    scopes: r.scopes as ApiScope[],
    createdByName: r.profiles?.full_name ?? null,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
    createdAt: r.created_at,
  }));
}

export interface ApiRequestLogEntry {
  id: number;
  keyName: string | null;
  method: string;
  path: string;
  statusCode: number;
  createdAt: string;
}

interface LogRow {
  id: number;
  method: string;
  path: string;
  status_code: number;
  created_at: string;
  api_keys: { name: string } | null;
}

export async function getApiRequestLog(supabase: SupabaseClient, limit = 50): Promise<ApiRequestLogEntry[]> {
  const { data, error } = await supabase
    .from("api_request_log")
    .select("id, method, path, status_code, created_at, api_keys(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`api_request_log failed: ${error.message}`);
  return ((data ?? []) as unknown as LogRow[]).map((r) => ({
    id: r.id,
    keyName: r.api_keys?.name ?? null,
    method: r.method,
    path: r.path,
    statusCode: r.status_code,
    createdAt: r.created_at,
  }));
}

export interface WebhookEndpointSummary {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

export async function getWebhookEndpoints(supabase: SupabaseClient): Promise<WebhookEndpointSummary[]> {
  const { data, error } = await supabase.from("webhook_endpoints").select("id, url, events, active, created_at").order("created_at", { ascending: false });
  if (error) throw new Error(`webhook_endpoints failed: ${error.message}`);
  return ((data ?? []) as WebhookRow[]).map((r) => ({
    id: r.id,
    url: r.url,
    events: r.events as WebhookEvent[],
    active: r.active,
    createdAt: r.created_at,
  }));
}

export interface WebhookDeliveryEntry {
  id: string;
  eventType: string;
  status: "pending" | "success" | "failed";
  responseStatus: number | null;
  createdAt: string;
}

interface DeliveryRow {
  id: string;
  event_type: string;
  status: "pending" | "success" | "failed";
  response_status: number | null;
  created_at: string;
}

export async function getWebhookDeliveries(supabase: SupabaseClient, endpointId: string, limit = 20): Promise<WebhookDeliveryEntry[]> {
  const { data, error } = await supabase
    .from("webhook_deliveries")
    .select("id, event_type, status, response_status, created_at")
    .eq("webhook_endpoint_id", endpointId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`webhook_deliveries failed: ${error.message}`);
  return ((data ?? []) as DeliveryRow[]).map((r) => ({
    id: r.id,
    eventType: r.event_type,
    status: r.status,
    responseStatus: r.response_status,
    createdAt: r.created_at,
  }));
}

export function validateApiKeyName(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter a name for this key." };
  const value = input.trim();
  if (value === "") return { ok: false, error: "Enter a name for this key." };
  if (value.length > 150) return { ok: false, error: "Keep the name under 150 characters." };
  return { ok: true, value };
}
