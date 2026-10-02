import type { SupabaseClient } from "@supabase/supabase-js";

export const CONTENT_PAGE_SIZE = 25;

export interface AdminResource {
  resourceId: string;
  name: string;
  ownerId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  usageCount: number;
  createdAt: string;
}

interface ResourceRow {
  resource_id: string;
  name: string;
  owner_id: string;
  owner_name: string | null;
  owner_email: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  usage_count: number | string;
  created_at: string;
  total: number | string;
}

/** Every uploaded resource-library item (media/documents), across every instructor. Requires course.read_all. */
export async function getAdminResources(
  supabase: SupabaseClient,
  q: string,
  page: number,
): Promise<{ resources: AdminResource[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_content_resources", {
    p_q: q,
    p_limit: CONTENT_PAGE_SIZE,
    p_offset: (page - 1) * CONTENT_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_content_resources failed: ${error.message}`);
  const rows = (data ?? []) as ResourceRow[];
  return {
    resources: rows.map((r) => ({
      resourceId: r.resource_id,
      name: r.name,
      ownerId: r.owner_id,
      ownerName: r.owner_name,
      ownerEmail: r.owner_email,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      usageCount: Number(r.usage_count),
      createdAt: r.created_at,
    })),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}

export interface AdminScormPackage {
  packageId: string;
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  courseTitle: string;
  version: "1.2" | "2004";
  title: string | null;
  fileCount: number;
  totalBytes: number;
  uploadedByName: string | null;
  uploadedAt: string;
}

interface ScormRow {
  package_id: string;
  lesson_id: string;
  lesson_title: string;
  course_id: string;
  course_title: string;
  version: "1.2" | "2004";
  title: string | null;
  file_count: number;
  total_bytes: number;
  uploaded_by_name: string | null;
  uploaded_at: string;
  total: number | string;
}

/** Every SCORM package across every course. Requires course.read_all. */
export async function getAdminScormPackages(
  supabase: SupabaseClient,
  q: string,
  page: number,
): Promise<{ packages: AdminScormPackage[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_scorm_packages", {
    p_q: q,
    p_limit: CONTENT_PAGE_SIZE,
    p_offset: (page - 1) * CONTENT_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_scorm_packages failed: ${error.message}`);
  const rows = (data ?? []) as ScormRow[];
  return {
    packages: rows.map((r) => ({
      packageId: r.package_id,
      lessonId: r.lesson_id,
      lessonTitle: r.lesson_title,
      courseId: r.course_id,
      courseTitle: r.course_title,
      version: r.version,
      title: r.title,
      fileCount: r.file_count,
      totalBytes: r.total_bytes,
      uploadedByName: r.uploaded_by_name,
      uploadedAt: r.uploaded_at,
    })),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}
