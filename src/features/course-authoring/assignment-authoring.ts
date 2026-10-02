import type { SupabaseClient } from "@supabase/supabase-js";
import { isFileTypeKey, LEGACY_FILE_TYPES } from "@/features/assignments/rules";
import type { AssignmentInput } from "./assignment-rules";
import { toDueInput } from "./assignment-rules";

export interface AssignmentSummary {
  id: string;
  title: string;
  dueAt: string | null;
  maxPoints: number;
  submissions: number;
  ungraded: number;
}

export interface AuthoringAssignment extends AssignmentInput {
  id: string;
  versionId: string;
  submissions: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Assignments of a course version with submission counts (owner RLS applies). */
export async function listAssignments(supabase: SupabaseClient, versionId: string): Promise<AssignmentSummary[]> {
  const { data } = await supabase
    .from("assignments")
    .select("id, title, due_at, max_points, position, assignment_submissions(status)")
    .eq("version_id", versionId)
    .order("position")
    .order("created_at");
  return (data ?? []).map((a) => {
    const subs = (a.assignment_submissions as unknown as { status: string }[]) ?? [];
    return {
      id: a.id as string,
      title: a.title as string,
      dueAt: (a.due_at as string | null) ?? null,
      maxPoints: a.max_points as number,
      submissions: subs.length,
      ungraded: subs.filter((s) => s.status !== "graded").length,
    };
  });
}

/** One assignment with its rubric, scoped to the version being authored. */
export async function getAssignmentForEditing(supabase: SupabaseClient, versionId: string, id: string): Promise<AuthoringAssignment | null> {
  if (!UUID.test(id)) return null;
  const { data: a } = await supabase
    .from("assignments")
    .select("id, version_id, title, instructions, due_at, max_points, allow_late, allow_text, allow_file, max_file_mb, allowed_file_types, assignment_submissions(id)")
    .eq("id", id)
    .eq("version_id", versionId)
    .maybeSingle();
  if (!a) return null;
  const { data: criteria } = await supabase
    .from("assignment_rubric_criteria")
    .select("title, description, max_points, position")
    .eq("assignment_id", id)
    .order("position");
  return {
    id: a.id as string,
    versionId: a.version_id as string,
    title: a.title as string,
    instructions: a.instructions as string,
    dueAt: toDueInput((a.due_at as string | null) ?? null),
    maxPoints: a.max_points as number,
    allowLate: a.allow_late as boolean,
    allowText: a.allow_text as boolean,
    allowFile: a.allow_file as boolean,
    maxFileMb: a.max_file_mb as number,
    allowedFileTypes: ((a.allowed_file_types as string[] | null) ?? [...LEGACY_FILE_TYPES]).filter(isFileTypeKey),
    submissions: ((a.assignment_submissions as unknown as unknown[]) ?? []).length,
    criteria: (criteria ?? []).map((c) => ({ title: c.title as string, description: c.description as string, maxPoints: c.max_points as number })),
  };
}
