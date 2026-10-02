"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { normalizeSsoDomain } from "./sso-rules";

export type SsoActionResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function platformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(await can(supabase, user.id, "organizations.manage"))) return null;
  return { supabase, user };
}

/** Links a Google Workspace domain to an organization (T-165). RLS enforces the same rule. */
export async function addSsoDomainAction(orgId: string, rawDomain: string): Promise<SsoActionResult> {
  const ctx = await platformAdmin();
  if (!ctx) return { ok: false, error: "You cannot manage organizations." };
  if (typeof orgId !== "string" || !UUID.test(orgId)) return { ok: false, error: "This organization is not available." };
  const domain = normalizeSsoDomain(rawDomain);
  if (!domain.ok) return domain;

  const { data, error } = await ctx.supabase
    .from("organization_sso_domains")
    .insert({ organization_id: orgId, domain: domain.value, provider: "google", created_by: ctx.user.id })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "That domain is already linked to an organization." };
    if (error?.code === "23503") return { ok: false, error: "This organization is not available." };
    return { ok: false, error: "We could not link that domain. Please try again." };
  }

  await recordAudit({
    actorId: ctx.user.id,
    actorEmail: ctx.user.email ?? null,
    action: "organization.sso_domain_added",
    resourceType: "organization",
    resourceId: orgId,
    metadata: { domain: domain.value, provider: "google" },
  });
  revalidatePath(`/admin/organizations/${orgId}`);
  return { ok: true };
}

/** Unlinks a domain. Existing members stay; only future Google sign-ins stop joining automatically. */
export async function removeSsoDomainAction(domainId: string): Promise<SsoActionResult> {
  const ctx = await platformAdmin();
  if (!ctx) return { ok: false, error: "You cannot manage organizations." };
  if (typeof domainId !== "string" || !UUID.test(domainId)) return { ok: false, error: "That domain is not linked." };

  const { data, error } = await ctx.supabase
    .from("organization_sso_domains")
    .delete()
    .eq("id", domainId)
    .select("organization_id, domain");
  if (error) return { ok: false, error: "We could not unlink that domain. Please try again." };
  const row = data?.[0];
  if (!row) return { ok: false, error: "That domain is not linked." };

  await recordAudit({
    actorId: ctx.user.id,
    actorEmail: ctx.user.email ?? null,
    action: "organization.sso_domain_removed",
    resourceType: "organization",
    resourceId: row.organization_id as string,
    metadata: { domain: row.domain as string, provider: "google" },
  });
  revalidatePath(`/admin/organizations/${row.organization_id as string}`);
  return { ok: true };
}
