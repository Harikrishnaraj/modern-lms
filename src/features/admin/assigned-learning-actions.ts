"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { searchCourses } from "@/features/catalog/search-courses";
import { validateAssignedLearningInput } from "./assigned-learning";

export type AssignedLearningActionResult = { ok: true } | { ok: false; error: string };

export interface CourseOption {
  courseId: string;
  title: string;
}

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Published courses matching a search string, for the assign-learning course picker. */
export async function searchPublishedCoursesAction(q: string): Promise<CourseOption[]> {
  const { supabase, user } = await actor();
  if (!user) return [];
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  const { courses } = await searchCourses(supabase, {
    q: trimmed,
    category: null,
    level: null,
    language: null,
    duration: null,
    price: null,
    rating: null,
    sort: "relevance",
    page: 1,
  });
  return courses.map((c) => ({ courseId: c.id, title: c.title }));
}

export async function createAssignedLearningAction(
  orgId: string,
  revalidateHref: string,
  input: { scope: unknown; userId: unknown; contentType: unknown; courseId: unknown; pathId: unknown; dueAt: unknown },
): Promise<AssignedLearningActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const parsed = validateAssignedLearningInput(input);
  if (!parsed.ok) return parsed;
  const v = parsed.value;

  const { error } = await supabase.from("assigned_learning").insert({
    organization_id: orgId,
    scope: v.scope,
    user_id: v.userId,
    content_type: v.contentType,
    course_id: v.courseId,
    path_id: v.pathId,
    due_at: v.dueAt,
    assigned_by: user.id,
  });
  if (error) return { ok: false, error: "We could not create that assignment. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "organization.learning_assigned",
    resourceType: "assigned_learning",
    resourceId: orgId,
    metadata: { scope: v.scope, contentType: v.contentType, courseId: v.courseId, pathId: v.pathId, dueAt: v.dueAt },
  });

  revalidatePath(revalidateHref);
  return { ok: true };
}

export async function deleteAssignedLearningAction(id: string, revalidateHref: string): Promise<AssignedLearningActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.from("assigned_learning").delete().eq("id", id);
  if (error) return { ok: false, error: "We could not remove that assignment. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "organization.learning_unassigned",
    resourceType: "assigned_learning",
    resourceId: id,
  });

  revalidatePath(revalidateHref);
  return { ok: true };
}
