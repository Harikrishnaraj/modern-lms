import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getRoleMatrix } from "@/features/admin/roles";
import { RoleMatrix } from "@/components/admin/role-matrix";
import { PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Roles & Permissions" };

export default async function AdminRolesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "permissions.manage"))) {
    return (
      <>
        <PageHeader title="Roles & Permissions" />
        <PermissionDeniedState
          title="You cannot edit the permission matrix"
          description="Only Super Admin can change which permissions each role has."
        />
      </>
    );
  }

  const matrix = await getRoleMatrix(supabase);
  const initialGrants = Object.fromEntries(matrix.roleIds.map((r) => [r, [...(matrix.grants[r] ?? [])]]));

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Toggle which permissions each role has. Every change is audited."
      />
      <RoleMatrix roleIds={matrix.roleIds} permissions={matrix.permissions} initialGrants={initialGrants} />
    </>
  );
}
