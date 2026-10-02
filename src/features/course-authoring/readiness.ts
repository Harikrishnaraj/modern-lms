import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseStepId } from "./steps";

// F-209: the publishing readiness rules. `evaluateReadiness` is pure and is also what
// `submitCourseForReview` (T-058) calls server-side, so the checklist and the gate cannot disagree.

export interface ReadinessLesson {
  id: string;
  title: string;
  type: "video" | "text" | "quiz" | "assignment" | "scorm";
  content: string;
  videoUrl: string | null;
}

export interface ReadinessSnapshot {
  version: {
    title: string;
    description: string;
    outcomes: string[];
    thumbnailUrl: string | null;
    certificateEnabled: boolean;
    categorySlug: string | null;
  };
  sections: { id: string; title: string; lessons: ReadinessLesson[] }[];
  assessments: { id: string; title: string; questionCount: number }[];
}

export interface ReadinessItem {
  id: string;
  label: string;
  ok: boolean;
  /** What is missing, when not ok. */
  detail?: string;
  /** Wizard step the fix belongs to. */
  step: CourseStepId | "content" | "assessments";
  /** Deep link (relative to the course) to the first thing that needs fixing, when not ok. */
  fixPath?: string;
}

export interface ReadinessReport {
  items: ReadinessItem[];
  ready: boolean;
  missing: ReadinessItem[];
}

export const MIN_DESCRIPTION_LENGTH = 50;
export const MAX_SUBMISSION_NOTES = 2000;

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim();

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function evaluateReadiness(s: ReadinessSnapshot): ReadinessReport {
  const lessons = s.sections.flatMap((sec) => sec.lessons);
  const emptySections = s.sections.filter((sec) => sec.lessons.length === 0);
  const noContent = lessons.filter((l) =>
    l.type === "video" ? !l.videoUrl : l.type === "text" ? stripHtml(l.content) === "" : false,
  );
  const noQuestions = s.assessments.filter((a) => a.questionCount === 0);
  const descriptionLength = s.version.description.trim().length;

  const items: ReadinessItem[] = [
    { id: "title", label: "Course title", step: "basics", ok: s.version.title.trim().length >= 3, detail: "Give the course a title of at least 3 characters." },
    {
      id: "description",
      label: "Course description",
      step: "basics",
      ok: descriptionLength >= MIN_DESCRIPTION_LENGTH,
      detail: `Write at least ${MIN_DESCRIPTION_LENGTH} characters (you have ${descriptionLength}).`,
    },
    { id: "category", label: "Category", step: "basics", ok: s.version.categorySlug !== null, detail: "Pick a category so learners can find the course." },
    { id: "thumbnail", label: "Thumbnail image", step: "basics", ok: s.version.thumbnailUrl !== null, detail: "Upload a thumbnail." },
    { id: "outcomes", label: "Learning outcomes", step: "basics", ok: s.version.outcomes.length > 0, detail: "List at least one thing learners will achieve." },
    { id: "lessons", label: "At least one lesson", step: "curriculum", ok: lessons.length > 0, detail: "Add a section with a lesson." },
    {
      id: "empty-sections",
      label: "No empty sections",
      step: "curriculum",
      ok: emptySections.length === 0,
      detail: `${plural(emptySections.length, "section")} without lessons: ${emptySections.map((e) => e.title).join(", ")}.`,
    },
    {
      id: "lesson-content",
      label: "Every lesson has content",
      step: "content",
      ok: noContent.length === 0,
      detail: `${plural(noContent.length, "lesson")} still empty: ${noContent.map((l) => l.title).join(", ")}.`,
      fixPath: noContent[0] ? `lessons/${noContent[0].id}` : undefined,
    },
    {
      id: "assessment",
      label: "An assessment for the certificate",
      step: "assessments",
      ok: !s.version.certificateEnabled || s.assessments.length > 0,
      detail: "This course issues a certificate, so add an assessment (or turn certificates off in Pricing & settings).",
    },
    {
      id: "questions",
      label: "Every assessment has questions",
      step: "assessments",
      ok: noQuestions.length === 0,
      detail: `${plural(noQuestions.length, "assessment")} without questions: ${noQuestions.map((a) => a.title).join(", ")}.`,
      fixPath: noQuestions[0] ? `assessments/${noQuestions[0].id}` : undefined,
    },
  ];

  const missing = items.filter((i) => !i.ok);
  return { items, ready: missing.length === 0, missing };
}

/** Href for a checklist item's fix, relative to the course. */
export function readinessFixHref(courseId: string, item: ReadinessItem): string {
  const base = `/instructor/courses/${courseId}`;
  if (item.fixPath) return `${base}/${item.fixPath}`;
  if (item.step === "content") return `${base}/curriculum`;
  return `${base}/${item.step}`;
}

/** Loads what the rules need for one version (instructor RLS applies). */
export async function getReadinessSnapshot(
  supabase: SupabaseClient,
  versionId: string,
  categorySlug: string | null,
): Promise<ReadinessSnapshot | null> {
  const { data: v } = await supabase
    .from("course_versions")
    .select("title, description, outcomes, thumbnail_url, certificate_enabled")
    .eq("id", versionId)
    .maybeSingle();
  if (!v) return null;

  const { data: sections, error: secErr } = await supabase
    .from("course_sections")
    .select("id, title, position")
    .eq("version_id", versionId)
    .order("position");
  if (secErr) throw new Error("readiness sections failed");
  const ids = (sections ?? []).map((x) => x.id as string);
  const { data: lessons, error: lesErr } = ids.length
    ? await supabase
        .from("lessons")
        .select("id, section_id, title, type, content, video_url, position")
        .in("section_id", ids)
        .order("position")
    : { data: [], error: null };
  if (lesErr) throw new Error("readiness lessons failed");

  const { data: assessments, error: asErr } = await supabase
    .from("assessments")
    .select("id, title, position, assessment_questions(id)")
    .eq("version_id", versionId)
    .order("position");
  if (asErr) throw new Error("readiness assessments failed");

  return {
    version: {
      title: v.title as string,
      description: (v.description as string) ?? "",
      outcomes: (v.outcomes as string[]) ?? [],
      thumbnailUrl: (v.thumbnail_url as string | null) ?? null,
      certificateEnabled: v.certificate_enabled as boolean,
      categorySlug,
    },
    sections: (sections ?? []).map((sec) => ({
      id: sec.id as string,
      title: sec.title as string,
      lessons: (lessons ?? [])
        .filter((l) => l.section_id === sec.id)
        .map((l) => ({
          id: l.id as string,
          title: l.title as string,
          type: l.type as ReadinessLesson["type"],
          content: (l.content as string) ?? "",
          videoUrl: (l.video_url as string | null) ?? null,
        })),
    })),
    assessments: (assessments ?? []).map((a) => ({
      id: a.id as string,
      title: a.title as string,
      questionCount: ((a.assessment_questions as unknown as unknown[]) ?? []).length,
    })),
  };
}
