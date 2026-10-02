import type { SupabaseClient } from "@supabase/supabase-js";

export interface OutlineLesson {
  id: string;
  title: string;
  type: "video" | "text" | "quiz" | "assignment" | "scorm";
  durationMinutes: number;
  isPreview: boolean;
}

export interface OutlineSection {
  id: string;
  title: string;
  lessons: OutlineLesson[];
}

export interface CourseDetail {
  id: string;
  slug: string;
  versionId: string;
  title: string;
  subtitle: string | null;
  description: string;
  level: string;
  language: string;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  thumbnailUrl: string | null;
  outcomes: string[];
  requirements: string[];
  certificateEnabled: boolean;
  ratingAvg: number;
  ratingCount: number;
  categoryName: string | null;
  instructorName: string | null;
  instructorHeadline: string | null;
  instructorBio: string | null;
  publishedAt: string | null;
  sections: OutlineSection[];
  lessonCount: number;
  /** Courses a learner must complete before enrolling. */
  prerequisites: { id: string; title: string }[];
}

interface DetailRow {
  id: string;
  slug: string;
  version_id: string;
  title: string;
  subtitle: string | null;
  description: string;
  level: string;
  language: string;
  price_cents: number;
  currency: string;
  duration_minutes: number;
  thumbnail_url: string | null;
  outcomes: string[];
  requirements: string[];
  certificate_enabled: boolean;
  rating_avg: number | string;
  rating_count: number;
  category_name: string | null;
  instructor_name: string | null;
  instructor_headline: string | null;
  instructor_bio: string | null;
  published_at: string | null;
}

interface OutlineRow {
  id: string;
  section_id: string;
  title: string;
  type: OutlineLesson["type"];
  position: number;
  duration_minutes: number;
  is_preview: boolean;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Published course by slug with its curriculum outline, or null (unknown / unpublished / bad slug). */
export async function getCourseDetail(
  supabase: SupabaseClient,
  slug: string,
): Promise<CourseDetail | null> {
  if (!SLUG.test(slug)) return null;

  const { data, error } = await supabase.rpc("get_course_detail", { p_slug: slug });
  if (error) throw new Error(`get_course_detail failed: ${error.message}`);
  const row = ((data ?? []) as DetailRow[])[0];
  if (!row) return null;

  const { data: prereqRows } = await supabase
    .from("course_prerequisites")
    .select("prerequisite_course_id")
    .eq("version_id", row.version_id);
  const prereqIds = (prereqRows ?? []).map((r) => r.prerequisite_course_id as string);
  const { data: prereqTitles } = prereqIds.length
    ? await supabase.rpc("get_prerequisite_titles", { p_course_ids: prereqIds })
    : { data: [] as { course_id: string; title: string }[] };

  const [sectionsRes, outlineRes] = await Promise.all([
    supabase
      .from("course_sections")
      .select("id, title, position")
      .eq("version_id", row.version_id)
      .order("position"),
    supabase.rpc("get_lesson_outline", { p_version_id: row.version_id }),
  ]);
  if (sectionsRes.error) throw new Error(`sections failed: ${sectionsRes.error.message}`);
  if (outlineRes.error) throw new Error(`outline failed: ${outlineRes.error.message}`);

  const lessonsBySection = new Map<string, OutlineLesson[]>();
  for (const l of ((outlineRes.data ?? []) as OutlineRow[]).sort(
    (a, b) => a.position - b.position,
  )) {
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
  const sections = (sectionsRes.data ?? []).map((s) => ({
    id: s.id as string,
    title: s.title as string,
    lessons: lessonsBySection.get(s.id as string) ?? [],
  }));

  return {
    id: row.id,
    slug: row.slug,
    versionId: row.version_id,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    level: row.level,
    language: row.language,
    priceCents: row.price_cents,
    currency: row.currency,
    durationMinutes: row.duration_minutes,
    thumbnailUrl: row.thumbnail_url,
    outcomes: row.outcomes,
    requirements: row.requirements,
    certificateEnabled: row.certificate_enabled,
    ratingAvg: Number(row.rating_avg),
    ratingCount: row.rating_count,
    categoryName: row.category_name,
    instructorName: row.instructor_name,
    instructorHeadline: row.instructor_headline,
    instructorBio: row.instructor_bio,
    publishedAt: row.published_at,
    sections,
    lessonCount: sections.reduce((n, s) => n + s.lessons.length, 0),
    prerequisites: ((prereqTitles ?? []) as { course_id: string; title: string }[]).map((t) => ({
      id: t.course_id,
      title: t.title,
    })),
  };
}

/** Plain-text description -> paragraphs (never rendered as HTML). */
export function descriptionParagraphs(description: string): string[] {
  return description
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
