import type { SupabaseClient } from "@supabase/supabase-js";
import { ASSIGNMENT_RESOURCE_BUCKET, supabaseStorage } from "@/services/storage";
import { createAdminClient } from "@/services/supabase/admin";

export interface AssignmentResource {
  id: string;
  name: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

/** Reference files of one assignment, under the caller's RLS (enrolled, owner or staff). */
export async function getAssignmentResources(supabase: SupabaseClient, assignmentId: string): Promise<AssignmentResource[]> {
  const { data } = await supabase
    .from("assignment_resources")
    .select("id, name, storage_path, mime_type, size_bytes")
    .eq("assignment_id", assignmentId)
    .order("position")
    .order("created_at");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    storagePath: r.storage_path as string,
    mimeType: r.mime_type as string,
    sizeBytes: Number(r.size_bytes),
  }));
}

/**
 * Short-lived download links. Only call with rows the caller's RLS already returned — the bucket
 * is private and the signing uses the service role.
 */
export async function withDownloadUrls(resources: AssignmentResource[]): Promise<(AssignmentResource & { url: string | null })[]> {
  return Promise.all(
    resources.map(async (r) => ({
      ...r,
      url: await supabaseStorage.createSignedUrl(ASSIGNMENT_RESOURCE_BUCKET, r.storagePath, 600).catch(() => null),
    })),
  );
}

/**
 * Removes storage objects no assignment_resources row points at any more. Copies of an
 * assignment in other course versions share objects (ADR-011/030), so a delete in one version
 * must not remove a file another version still serves. Run AFTER the rows were deleted.
 */
export async function removeUnreferencedResources(paths: string[]): Promise<void> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return;
  const { data } = await createAdminClient().from("assignment_resources").select("storage_path").in("storage_path", unique);
  const stillUsed = new Set((data ?? []).map((r) => r.storage_path as string));
  const orphaned = unique.filter((p) => !stillUsed.has(p));
  if (orphaned.length > 0) await supabaseStorage.remove(ASSIGNMENT_RESOURCE_BUCKET, orphaned).catch(() => undefined);
}
