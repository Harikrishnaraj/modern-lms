import type { SupabaseClient } from "@supabase/supabase-js";

export interface MyAssignedLearning {
  id: string;
  contentType: "course" | "path";
  href: string;
  title: string;
  dueAt: string | null;
  isComplete: boolean;
  isOverdue: boolean;
}

interface Row {
  id: string;
  content_type: string;
  course_slug: string | null;
  path_slug: string | null;
  title: string;
  due_at: string | null;
  is_complete: boolean;
  is_overdue: boolean;
}

/** Courses/paths assigned to the signed-in learner via their organization, team or directly (T-163). */
export async function getMyAssignedLearning(supabase: SupabaseClient): Promise<MyAssignedLearning[]> {
  const { data, error } = await supabase.rpc("my_assigned_learning");
  if (error) throw new Error(`my_assigned_learning failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    contentType: r.content_type === "path" ? "path" : "course",
    href: r.content_type === "path" ? `/learner/paths/${r.path_slug}` : `/courses/${r.course_slug}`,
    title: r.title,
    dueAt: r.due_at,
    isComplete: r.is_complete,
    isOverdue: r.is_overdue,
  }));
}
