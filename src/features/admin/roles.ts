import type { SupabaseClient } from "@supabase/supabase-js";

export interface PermissionDef {
  id: string;
  description: string;
}

export interface RoleMatrix {
  roleIds: string[];
  permissions: PermissionDef[];
  /** roleId -> set of permission ids that role currently has. */
  grants: Record<string, Set<string>>;
}

/** Roles, the permission catalog, and the current role -> permission grants (public reference data). */
export async function getRoleMatrix(supabase: SupabaseClient): Promise<RoleMatrix> {
  const [{ data: roles, error: rolesError }, { data: permissions, error: permsError }, { data: grants, error: grantsError }] =
    await Promise.all([
      supabase.from("roles").select("id").order("id"),
      supabase.from("permissions").select("id, description").order("id"),
      supabase.from("role_permissions").select("role_id, permission_id"),
    ]);
  if (rolesError) throw new Error(`roles failed: ${rolesError.message}`);
  if (permsError) throw new Error(`permissions failed: ${permsError.message}`);
  if (grantsError) throw new Error(`role_permissions failed: ${grantsError.message}`);

  const roleIds = (roles ?? []).map((r) => r.id as string);
  const byRole: Record<string, Set<string>> = Object.fromEntries(roleIds.map((r) => [r, new Set<string>()]));
  for (const g of grants ?? []) {
    byRole[g.role_id as string]?.add(g.permission_id as string);
  }

  return {
    roleIds,
    permissions: (permissions ?? []).map((p) => ({ id: p.id as string, description: p.description as string })),
    grants: byRole,
  };
}
