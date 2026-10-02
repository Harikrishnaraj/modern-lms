import type { SupabaseClient } from "@supabase/supabase-js";

export type LessonType = "video" | "text" | "quiz" | "assignment" | "scorm";
export const LESSON_TYPES: readonly { value: LessonType; label: string }[] = [
  { value: "video", label: "Video lesson" },
  { value: "text", label: "Text lesson" },
  { value: "quiz", label: "Quiz" },
  { value: "assignment", label: "Assignment" },
  { value: "scorm", label: "SCORM package" },
];

export interface CurriculumLesson {
  id: string;
  title: string;
  type: LessonType;
  position: number;
  durationMinutes: number;
  isPreview: boolean;
}

export interface CurriculumSection {
  id: string;
  title: string;
  position: number;
  lessons: CurriculumLesson[];
}

/** Sections with their lessons, ordered, for the version being authored (instructor RLS applies). */
export async function getCurriculum(
  supabase: SupabaseClient,
  versionId: string,
): Promise<CurriculumSection[]> {
  const { data: sections, error } = await supabase
    .from("course_sections")
    .select("id, title, position")
    .eq("version_id", versionId)
    .order("position");
  if (error) throw new Error(`sections failed: ${error.message}`);
  if (!sections?.length) return [];

  const { data: lessons, error: lessonError } = await supabase
    .from("lessons")
    .select("id, section_id, title, type, position, duration_minutes, is_preview")
    .in(
      "section_id",
      sections.map((s) => s.id as string),
    )
    .order("position");
  if (lessonError) throw new Error(`lessons failed: ${lessonError.message}`);

  return sections.map((s) => ({
    id: s.id as string,
    title: s.title as string,
    position: s.position as number,
    lessons: (lessons ?? [])
      .filter((l) => l.section_id === s.id)
      .map((l) => ({
        id: l.id as string,
        title: l.title as string,
        type: l.type as LessonType,
        position: l.position as number,
        durationMinutes: l.duration_minutes as number,
        isPreview: l.is_preview as boolean,
      })),
  }));
}
