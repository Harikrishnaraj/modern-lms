"use server";

import { revalidatePath } from "next/cache";
import { validateApiKeyName } from "./integrations";
import { generateApiKey, isApiScope } from "@/services/apikeys";
import { generateWebhookSecret, isSafeWebhookUrl, isWebhookEvent } from "@/services/webhooks";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";

export type IntegrationActionResult = { ok: true } | { ok: false; error: string };
export type CreateApiKeyResult = { ok: true; plaintext: string } | { ok: false; error: string };
export type CreateWebhookResult = { ok: true; secret: string } | { ok: false; error: string };

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await can(supabase, user.id, "integrations.manage"))) return null;
  return { supabase, user };
}

export async function createApiKeyAction(input: { name: string; scopes: string[] }): Promise<CreateApiKeyResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  const name = validateApiKeyName(input.name);
  if (!name.ok) return name;
  const scopes = input.scopes.filter(isApiScope);
  if (scopes.length === 0) return { ok: false, error: "Choose at least one scope." };

  const key = generateApiKey();
  const { error } = await ctx.supabase.from("api_keys").insert({
    name: name.value,
    key_prefix: key.prefix,
    key_hash: key.hash,
    scopes,
    created_by: ctx.user.id,
  });
  if (error) return { ok: false, error: "We could not create that key. Please try again." };

  await recordAudit({
    actorId: ctx.user.id,
    actorEmail: ctx.user.email ?? null,
    action: "integration.api_key_created",
    resourceType: "api_key",
    metadata: { name: name.value, scopes },
  });
  revalidatePath("/admin/integrations");
  return { ok: true, plaintext: key.plaintext };
}

export async function revokeApiKeyAction(keyId: string): Promise<IntegrationActionResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  const { error } = await ctx.supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", keyId);
  if (error) return { ok: false, error: "We could not revoke that key. Please try again." };

  await recordAudit({
    actorId: ctx.user.id,
    actorEmail: ctx.user.email ?? null,
    action: "integration.api_key_revoked",
    resourceType: "api_key",
    resourceId: keyId,
  });
  revalidatePath("/admin/integrations");
  return { ok: true };
}

export async function createWebhookAction(input: { url: string; events: string[] }): Promise<CreateWebhookResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  if (!isSafeWebhookUrl(input.url)) return { ok: false, error: "Enter a valid https:// URL that is not an internal address." };
  const events = input.events.filter(isWebhookEvent);
  if (events.length === 0) return { ok: false, error: "Choose at least one event." };

  const secret = generateWebhookSecret();
  const { error } = await ctx.supabase.from("webhook_endpoints").insert({
    url: input.url,
    secret,
    events,
    created_by: ctx.user.id,
  });
  if (error) return { ok: false, error: "We could not create that webhook. Please try again." };

  await recordAudit({
    actorId: ctx.user.id,
    actorEmail: ctx.user.email ?? null,
    action: "integration.webhook_created",
    resourceType: "webhook_endpoint",
    metadata: { url: input.url, events },
  });
  revalidatePath("/admin/integrations");
  return { ok: true, secret };
}

export async function deleteWebhookAction(endpointId: string): Promise<IntegrationActionResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  const { error } = await ctx.supabase.from("webhook_endpoints").delete().eq("id", endpointId);
  if (error) return { ok: false, error: "We could not delete that webhook. Please try again." };

  await recordAudit({
    actorId: ctx.user.id,
    actorEmail: ctx.user.email ?? null,
    action: "integration.webhook_deleted",
    resourceType: "webhook_endpoint",
    resourceId: endpointId,
  });
  revalidatePath("/admin/integrations");
  return { ok: true };
}
