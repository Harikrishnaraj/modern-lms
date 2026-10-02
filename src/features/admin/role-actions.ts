"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";

export type RoleActionResult = { ok: true } | { ok: false; error: string };

/** Grants or revokes one permission for one role. Only Super Admin holds permissions.manage. */
export async function setRolePermissionAction(
  roleId: string,
  permissionId: string,
  granted: boolean,
): Promise<RoleActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.rpc("set_role_permission", {
    p_role_id: roleId,
    p_permission_id: permissionId,
    p_granted: granted,
  });
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "role_permission_changed",
    resourceType: "role",
    resourceId: roleId,
    metadata: { permissionId, granted },
  });

  revalidatePath("/admin/roles");
  return { ok: true };
}
