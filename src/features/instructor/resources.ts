import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurriculum } from "@/features/course-authoring/curriculum";
import { getCourseForEditing } from "@/features/course-authoring/queries";

export interface LibraryResource {
  id: string;
  name: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  usageCount: number;
}

interface ResourceRow {
  id: string;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  usage_count: number | string;
}

/** The caller's own resource library, most recent first. */
export async function getResourceLibrary(
  supabase: SupabaseClient,
  query?: string | null,
): Promise<LibraryResource[]> {
  const { data, error } = await supabase.rpc("instructor_resource_library", {
    p_query: query?.trim() || null,
  });
  if (error) throw new Error(`getResourceLibrary failed: ${error.message}`);
  return ((data ?? []) as ResourceRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    storagePath: r.storage_path,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    usageCount: Number(r.usage_count),
  }));
}

export interface AttachableLesson {
  id: string;
  title: string;
  sectionTitle: string;
}

/** Lessons of the caller's own course, for the "attach to lesson" picker. Empty if not the owner. */
export async function getAttachableLessons(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
): Promise<AttachableLesson[]> {
  const course = await getCourseForEditing(supabase, userId, courseId);
  if (!course) return [];
  const sections = await getCurriculum(supabase, course.version.id);
  return sections.flatMap((s) => s.lessons.map((l) => ({ id: l.id, title: l.title, sectionTitle: s.title })));
}
