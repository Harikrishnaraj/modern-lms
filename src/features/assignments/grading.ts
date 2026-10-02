import type { SupabaseClient } from "@supabase/supabase-js";

export interface QueueRow {
  submissionId: string;
  assignmentId: string;
  assignmentTitle: string;
  courseId: string;
  courseTitle: string;
  learnerName: string;
  submittedAt: string;
  isLate: boolean;
  status: "submitted" | "graded";
  grade: number | null;
  maxPoints: number;
}

export interface GradingSubmission {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  courseId: string;
  maxPoints: number;
  instructions: string;
  text: string;
  fileName: string | null;
  fileSize: number | null;
  filePath: string | null;
  isLate: boolean;
  submittedAt: string;
  status: "submitted" | "graded";
  grade: number | null;
  feedback: string;
  criteria: { id: string; title: string; description: string; maxPoints: number }[];
  scores: Record<string, number>;
}

/** Submissions on the caller own courses, ungraded first, oldest first. */
export async function getGradingQueue(supabase: SupabaseClient): Promise<QueueRow[]> {
  const { data, error } = await supabase.rpc("instructor_grading_queue");
  if (error) throw new Error(`instructor_grading_queue failed: ${error.message}`);
  return ((data ?? []) as {
    submission_id: string; assignment_id: string; assignment_title: string; course_id: string; course_title: string;
    learner_name: string; submitted_at: string; is_late: boolean; status: string; grade: number | null; max_points: number;
  }[]).map((r) => ({
    submissionId: r.submission_id,
    assignmentId: r.assignment_id,
    assignmentTitle: r.assignment_title,
    courseId: r.course_id,
    courseTitle: r.course_title,
    learnerName: r.learner_name,
    submittedAt: r.submitted_at,
    isLate: r.is_late,
    status: r.status === "graded" ? "graded" : "submitted",
    grade: r.grade,
    maxPoints: r.max_points,
  }));
}

export type QueueFilter = "pending" | "graded" | "all";

export function parseQueueFilter(raw: string | string[] | undefined): QueueFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "graded" || v === "all" ? v : "pending";
}

export function filterQueue(rows: QueueRow[], filter: QueueFilter, assignmentId: string | null = null): QueueRow[] {
  const scoped = assignmentId ? rows.filter((r) => r.assignmentId === assignmentId) : rows;
  return filter === "all" ? scoped : scoped.filter((r) => (filter === "graded" ? r.status === "graded" : r.status !== "graded"));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?assignment=<id>` from the Assignments page; anything malformed means "every assignment". */
export function parseAssignmentFilter(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A submission with its assignment and rubric; null unless the caller owns the course. (RLS also
 * lets a learner read their own submission, so ownership is checked explicitly.)
 */
export async function getSubmissionForGrading(supabase: SupabaseClient, userId: string, submissionId: string): Promise<GradingSubmission | null> {
  if (!UUID.test(submissionId)) return null;
  const { data: s } = await supabase.from("assignment_submissions").select("*").eq("id", submissionId).maybeSingle();
  if (!s) return null;
  const { data: a } = await supabase
    .from("assignments")
    .select("id, title, instructions, max_points, course_versions!inner(course_id)")
    .eq("id", s.assignment_id)
    .maybeSingle();
  if (!a) return null;
  const version = a.course_versions as unknown as { course_id: string } | { course_id: string }[];
  const courseId = (Array.isArray(version) ? version[0] : version).course_id;
  const { data: course } = await supabase.from("courses").select("instructor_id").eq("id", courseId).maybeSingle();
  if (!course || course.instructor_id !== userId) return null;
  const { data: criteria } = await supabase
    .from("assignment_rubric_criteria")
    .select("id, title, description, max_points, position")
    .eq("assignment_id", a.id)
    .order("position");
  const scores: Record<string, number> = {};
  for (const r of (s.rubric_scores as { criterion_id: string; points: number }[]) ?? []) scores[r.criterion_id] = r.points;
  return {
    id: s.id as string,
    assignmentId: a.id as string,
    assignmentTitle: a.title as string,
    courseId,
    maxPoints: a.max_points as number,
    instructions: a.instructions as string,
    text: s.text_answer as string,
    fileName: (s.file_name as string | null) ?? null,
    fileSize: (s.file_size as number | null) ?? null,
    filePath: (s.file_path as string | null) ?? null,
    isLate: Boolean(s.is_late),
    submittedAt: s.submitted_at as string,
    status: s.status === "graded" ? "graded" : "submitted",
    grade: (s.grade as number | null) ?? null,
    feedback: (s.feedback as string) ?? "",
    criteria: (criteria ?? []).map((c) => ({ id: c.id as string, title: c.title as string, description: c.description as string, maxPoints: c.max_points as number })),
    scores,
  };
}
