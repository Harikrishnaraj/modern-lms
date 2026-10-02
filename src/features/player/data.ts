import type { SupabaseClient } from "@supabase/supabase-js";
import { signScormToken } from "@/services/scorm/token";
import type { PlayerSection } from "./navigation";

export interface PlayerCourse {
  courseId: string;
  slug: string;
  title: string;
  versionId: string;
  enrollmentId: string | null;
  sections: PlayerSection[];
  completedLessonIds: Set<string>;
  enrolled: boolean;
}

export interface PlayerLessonContent {
  id: string;
  title: string;
  type: "video" | "text" | "quiz" | "assignment" | "scorm";
  /** Raw stored HTML: sanitize before rendering. */
  content: string;
  videoUrl: string | null;
  durationMinutes: number;
  isPreview: boolean;
  /** Set only for type "scorm": the path to request from the SCORM proxy route. */
  scormLaunchPath: string | null;
  /** Signed, short-lived capability for the SCORM asset route (the sandboxed iframe sends no cookies). */
  scormToken: string | null;
}

interface OutlineRow {
  id: string;
  section_id: string;
  title: string;
  type: PlayerSection["lessons"][number]["type"];
  position: number;
  duration_minutes: number;
  is_preview: boolean;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Everything the player sidebar needs for the version the viewer is entitled to: their enrolled
 * version, or the live published version for a non-enrolled viewer (who only sees locks and
 * free previews). Returns null when the course is unknown or not visible to the viewer.
 */
export async function getPlayerCourse(
  supabase: SupabaseClient,
  userId: string | null,
  slug: string,
): Promise<PlayerCourse | null> {
  if (!SLUG.test(slug)) return null;

  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, published_version_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!course) return null;

  let enrollment: { id: string; version_id: string } | null = null;
  if (userId) {
    const { data } = await supabase
      .from("enrollments")
      .select("id, version_id")
      .eq("user_id", userId)
      .eq("course_id", course.id)
      .neq("status", "cancelled")
      .maybeSingle();
    enrollment = data;
  }

  const versionId = enrollment?.version_id ?? course.published_version_id;
  if (!versionId) return null;

  const [outline, progressRes] = await Promise.all([
    loadOutline(supabase, versionId),
    enrollment
      ? supabase
          .from("lesson_progress")
          .select("lesson_id")
          .eq("enrollment_id", enrollment.id)
          .not("completed_at", "is", null)
      : Promise.resolve({ data: [] as { lesson_id: string }[], error: null }),
  ]);
  if (!outline) return null;

  return {
    courseId: course.id,
    slug: course.slug,
    title: outline.title,
    versionId,
    enrollmentId: enrollment?.id ?? null,
    enrolled: enrollment !== null,
    sections: outline.sections,
    completedLessonIds: new Set((progressRes.data ?? []).map((r) => r.lesson_id as string)),
  };
}

/**
 * Title and section/lesson outline of one version, read under the viewer RLS. Null when the
 * version is not visible. Shared by the learner player and the instructor preview.
 */
export async function loadOutline(
  supabase: SupabaseClient,
  versionId: string,
): Promise<{ title: string; sections: PlayerSection[] } | null> {
  const [versionRes, sectionsRes, outlineRes] = await Promise.all([
    supabase.from("course_versions").select("title").eq("id", versionId).maybeSingle(),
    supabase.from("course_sections").select("id, title, position").eq("version_id", versionId).order("position"),
    supabase.rpc("get_lesson_outline", { p_version_id: versionId }),
  ]);
  if (!versionRes.data) return null;
  if (sectionsRes.error || outlineRes.error) throw new Error("player outline failed");

  const lessonsBySection = new Map<string, PlayerSection["lessons"]>();
  for (const l of ((outlineRes.data ?? []) as OutlineRow[]).sort((a, b) => a.position - b.position)) {
    const list = lessonsBySection.get(l.section_id) ?? [];
    list.push({
      id: l.id,
      title: l.title,
      type: l.type,
      durationMinutes: l.duration_minutes,
      isPreview: l.is_preview,
    });
    lessonsBySection.set(l.section_id, list);
  }
  return {
    title: versionRes.data.title as string,
    sections: (sectionsRes.data ?? []).map((s) => ({
      id: s.id as string,
      title: s.title as string,
      lessons: lessonsBySection.get(s.id as string) ?? [],
    })),
  };
}

/** The lesson body. RLS decides access: null means locked / not found for this viewer. */
export async function getLessonContent(
  supabase: SupabaseClient,
  lessonId: string,
): Promise<PlayerLessonContent | null> {
  const { data, error } = await supabase
    .from("lessons")
    .select("id, title, type, content, video_url, duration_minutes, is_preview")
    .eq("id", lessonId)
    .maybeSingle();
  if (error || !data) return null;

  let scormLaunchPath: string | null = null;
  let scormToken: string | null = null;
  if (data.type === "scorm") {
    const { data: pkg } = await supabase.from("scorm_packages").select("launch_path").eq("lesson_id", lessonId).maybeSingle();
    scormLaunchPath = (pkg?.launch_path as string | null) ?? null;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // RLS already let this viewer read the lesson, so they may load its package files.
    if (scormLaunchPath && user) scormToken = signScormToken(user.id, lessonId);
  }

  return {
    id: data.id,
    title: data.title,
    type: data.type,
    content: data.content,
    videoUrl: data.video_url,
    durationMinutes: data.duration_minutes,
    isPreview: data.is_preview,
    scormLaunchPath,
    scormToken,
  };
}

/** Saved resume position and completion for one lesson of the learner enrollment. */
export async function getLessonProgress(
  supabase: SupabaseClient,
  enrollmentId: string,
  lessonId: string,
): Promise<{ completed: boolean; positionSeconds: number }> {
  const { data } = await supabase
    .from("lesson_progress")
    .select("completed_at, last_position_seconds")
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  return {
    completed: Boolean(data?.completed_at),
    positionSeconds: data?.last_position_seconds ?? 0,
  };
}
