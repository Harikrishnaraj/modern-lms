import type { SupabaseClient } from "@supabase/supabase-js";
import { assignmentStatus, isFileTypeKey, LEGACY_FILE_TYPES, type AssignmentRules, type AssignmentStatus } from "./rules";

export interface LearnerAssignment extends AssignmentRules {
  id: string;
  title: string;
  instructions: string;
  maxPoints: number;
  courseTitle: string;
  courseSlug: string;
  submission: {
    text: string;
    fileName: string | null;
    fileSize: number | null;
    filePath: string | null;
    status: "submitted" | "graded";
    isLate: boolean;
    submittedAt: string;
    grade: number | null;
    feedback: string;
    gradedAt: string | null;
  } | null;
  status: AssignmentStatus;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string;
  title: string;
  instructions: string;
  due_at: string | null;
  max_points: number;
  allow_late: boolean;
  allow_text: boolean;
  allow_file: boolean;
  max_file_mb: number;
  allowed_file_types: string[] | null;
  course_versions: { title: string; courses: { slug: string } | { slug: string }[] } | { title: string; courses: { slug: string } | { slug: string }[] }[];
}

const SELECT =
  "id, title, instructions, due_at, max_points, allow_late, allow_text, allow_file, max_file_mb, allowed_file_types, " +
  "course_versions!inner(title, courses!course_versions_course_id_fkey(slug))";

const one = <T>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);

function build(row: Row, sub: Record<string, unknown> | undefined, now: Date): LearnerAssignment {
  const version = one(row.course_versions);
  const submission = sub
    ? {
        text: (sub.text_answer as string) ?? "",
        fileName: (sub.file_name as string | null) ?? null,
        fileSize: (sub.file_size as number | null) ?? null,
        filePath: (sub.file_path as string | null) ?? null,
        status: sub.status as "submitted" | "graded",
        isLate: Boolean(sub.is_late),
        submittedAt: sub.submitted_at as string,
        grade: (sub.grade as number | null) ?? null,
        feedback: (sub.feedback as string) ?? "",
        gradedAt: (sub.graded_at as string | null) ?? null,
      }
    : null;
  const rules: AssignmentRules = {
    dueAt: row.due_at,
    allowLate: row.allow_late,
    allowText: row.allow_text,
    allowFile: row.allow_file,
    maxFileMb: row.max_file_mb,
    allowedFileTypes: (row.allowed_file_types ?? [...LEGACY_FILE_TYPES]).filter(isFileTypeKey),
  };
  return {
    ...rules,
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    maxPoints: row.max_points,
    courseTitle: version.title,
    courseSlug: one(version.courses).slug,
    submission,
    status: assignmentStatus(rules, submission, now),
  };
}

/**
 * The learner assignments: only those in the exact course version they are enrolled in, with
 * their own submission. Ordered by due date (soonest first, undated last).
 */
export async function getMyAssignments(supabase: SupabaseClient, userId: string, now = new Date()): Promise<LearnerAssignment[]> {
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("version_id")
    .eq("user_id", userId)
    .neq("status", "cancelled");
  const versionIds = [...new Set((enrollments ?? []).map((e) => e.version_id as string))];
  if (versionIds.length === 0) return [];

  const [{ data: rows, error }, { data: subs }] = await Promise.all([
    supabase.from("assignments").select(SELECT).in("version_id", versionIds),
    supabase.from("assignment_submissions").select("*").eq("user_id", userId),
  ]);
  if (error) throw new Error(`assignments failed: ${error.message}`);
  const byAssignment = new Map((subs ?? []).map((s) => [s.assignment_id as string, s as Record<string, unknown>]));
  return ((rows ?? []) as unknown as Row[])
    .map((r) => build(r, byAssignment.get(r.id), now))
    .sort((a, b) => {
      const da = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const db = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      return da - db || a.title.localeCompare(b.title);
    });
}

/** One assignment for an enrolled learner, or null (unknown, malformed, not enrolled in that version). */
export async function getMyAssignment(supabase: SupabaseClient, userId: string, id: string, now = new Date()): Promise<LearnerAssignment | null> {
  if (!UUID.test(id)) return null;
  const all = await getMyAssignments(supabase, userId, now);
  return all.find((a) => a.id === id) ?? null;
}
