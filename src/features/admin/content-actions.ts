"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { SCORM_BUCKET, supabaseStorage } from "@/services/storage";

export type ContentActionResult = { ok: true } | { ok: false; error: string };

export async function deleteResourceAction(resourceId: string): Promise<ContentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.rpc("admin_delete_resource", { p_resource_id: resourceId });
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "content.resource_deleted",
    resourceType: "resource_library_item",
    resourceId,
  });

  revalidatePath("/admin/content");
  return { ok: true };
}

export async function deleteScormPackageAction(packageId: string): Promise<ContentActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { data, error } = await supabase.rpc("admin_delete_scorm_package", { p_package_id: packageId });
  if (error) return { ok: false, error: error.message };

  const deleted = (data as { storage_prefix: string; file_paths: string[] }[])[0];
  if (deleted) {
    await supabaseStorage.remove(SCORM_BUCKET, deleted.file_paths.map((p) => `${deleted.storage_prefix}/${p}`)).catch(() => {});
  }

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "content.scorm_package_deleted",
    resourceType: "scorm_package",
    resourceId: packageId,
  });

  revalidatePath("/admin/content");
  return { ok: true };
}
