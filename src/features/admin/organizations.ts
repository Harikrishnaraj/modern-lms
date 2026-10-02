import type { SupabaseClient } from "@supabase/supabase-js";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const ORG_NAME_MAX = 200;

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: string;
}

export interface OrganizationDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  learningHours: number;
}

export interface OrganizationMember {
  memberId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  orgRole: "org_admin" | "member";
  teamName: string | null;
  createdAt: string;
}

export function validateOrganizationName(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter a name." };
  const value = input.trim();
  if (value === "") return { ok: false, error: "Enter a name." };
  if (value.length > ORG_NAME_MAX) return { ok: false, error: `Keep the name under ${ORG_NAME_MAX} characters.` };
  return { ok: true, value };
}

export function validateOrganizationSlug(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter a slug." };
  const value = input.trim().toLowerCase();
  if (value === "") return { ok: false, error: "Enter a slug." };
  if (!SLUG.test(value)) return { ok: false, error: "Use lowercase letters, numbers and hyphens only." };
  return { ok: true, value };
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  member_count: number;
  created_at: string;
  total: number;
}

export async function getAdminOrganizations(
  supabase: SupabaseClient,
  opts: { q: string; page: number },
): Promise<{ organizations: AdminOrganization[]; total: number }> {
  const pageSize = 25;
  const { data, error } = await supabase.rpc("admin_organizations", {
    p_q: opts.q,
    p_limit: pageSize,
    p_offset: (opts.page - 1) * pageSize,
  });
  if (error) throw new Error(`admin_organizations failed: ${error.message}`);
  const rows = (data ?? []) as OrgRow[];
  return {
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    organizations: rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, memberCount: Number(r.member_count), createdAt: r.created_at })),
  };
}

interface DetailRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  member_count: number;
  learning_hours: number;
}

export async function getOrganizationDetail(supabase: SupabaseClient, orgId: string): Promise<OrganizationDetail | null> {
  const { data, error } = await supabase.rpc("admin_organization_detail", { p_org_id: orgId });
  if (error) throw new Error(`admin_organization_detail failed: ${error.message}`);
  const row = ((data ?? []) as DetailRow[])[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
    memberCount: Number(row.member_count),
    learningHours: Number(row.learning_hours),
  };
}

interface MemberRow {
  member_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  org_role: string;
  team_name: string | null;
  created_at: string;
}

/** The organization the signed-in user belongs to, or null if they aren't a member of one (T-162). */
export async function getMyOrganizationId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_organization_id");
  if (error) throw new Error(`my_organization_id failed: ${error.message}`);
  return (data as string | null) ?? null;
}

export async function getOrganizationMembers(supabase: SupabaseClient, orgId: string): Promise<OrganizationMember[]> {
  const { data, error } = await supabase.rpc("admin_organization_members", { p_org_id: orgId });
  if (error) throw new Error(`admin_organization_members failed: ${error.message}`);
  return ((data ?? []) as MemberRow[]).map((r) => ({
    memberId: r.member_id,
    userId: r.user_id,
    fullName: r.full_name,
    email: r.email,
    orgRole: r.org_role === "org_admin" ? "org_admin" : "member",
    teamName: r.team_name,
    createdAt: r.created_at,
  }));
}
