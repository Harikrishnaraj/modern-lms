import type { SupabaseClient } from "@supabase/supabase-js";

export interface SsoDomain {
  id: string;
  domain: string;
  provider: "google";
  createdAt: string;
}

/** Google Workspace domains linked to an organization (platform admins, or that org's admins — RLS). */
export async function getOrganizationSsoDomains(supabase: SupabaseClient, orgId: string): Promise<SsoDomain[]> {
  const { data } = await supabase
    .from("organization_sso_domains")
    .select("id, domain, provider, created_at")
    .eq("organization_id", orgId)
    .order("domain");
  return (data ?? []).map((d) => ({ id: d.id as string, domain: d.domain as string, provider: "google", createdAt: d.created_at as string }));
}
