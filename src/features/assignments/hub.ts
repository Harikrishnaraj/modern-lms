import type { SupabaseClient } from "@supabase/supabase-js";

export interface OverviewRow {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  versionId: string;
  versionStatus: string;
  isLive: boolean;
  dueAt: string | null;
  allowLate: boolean;
  maxPoints: number;
  submissions: number;
  ungraded: number;
  enrolled: number;
  createdAt: string;
}

/** Every assignment on the caller's own courses (live version, else newest; archived excluded). */
export async function getAssignmentOverview(supabase: SupabaseClient): Promise<OverviewRow[]> {
  const { data, error } = await supabase.rpc("instructor_assignments_overview");
  if (error) throw new Error(`instructor_assignments_overview failed: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.assignment_id as string,
    title: r.title as string,
    courseId: r.course_id as string,
    courseTitle: r.course_title as string,
    versionId: r.version_id as string,
    versionStatus: r.version_status as string,
    isLive: Boolean(r.is_live),
    dueAt: (r.due_at as string | null) ?? null,
    allowLate: Boolean(r.allow_late),
    maxPoints: Number(r.max_points),
    submissions: Number(r.submissions),
    ungraded: Number(r.ungraded),
    enrolled: Number(r.enrolled),
    createdAt: r.created_at as string,
  }));
}

export type AssignableState = "live" | "draft" | "locked";

export interface AssignableCourse {
  id: string;
  title: string;
  /** live: goes to learners now (ADR-030); draft: not published yet; locked: only in review. */
  state: AssignableState;
}

/** The caller's courses, and whether a new assignment can be added to each right now. */
export async function getAssignableCourses(supabase: SupabaseClient, userId: string): Promise<AssignableCourse[]> {
  const { data } = await supabase
    .from("courses")
    .select("id, published_version_id, course_versions!course_versions_course_id_fkey(id, title, status, version_number)")
    .eq("instructor_id", userId);
  const courses: AssignableCourse[] = [];
  for (const c of data ?? []) {
    const versions = ((c.course_versions as unknown as { id: string; title: string; status: string; version_number: number }[]) ?? []).sort(
      (a, b) => b.version_number - a.version_number,
    );
    const newest = versions[0];
    if (!newest) continue;
    const live = versions.find((v) => v.id === c.published_version_id);
    if (!live && newest.status === "archived") continue;
    const state: AssignableState = live ? "live" : newest.status === "draft" || newest.status === "changes_requested" ? "draft" : "locked";
    courses.push({ id: c.id as string, title: (live ?? newest).title, state });
  }
  return courses.sort((a, b) => a.title.localeCompare(b.title));
}
