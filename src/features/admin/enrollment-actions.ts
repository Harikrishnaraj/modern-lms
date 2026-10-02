"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { dispatchWebhookEvent } from "@/services/webhooks/dispatch";
import { validateCohortName } from "./enrollments";
import { getAdminUsers } from "./users";

export interface LearnerOption {
  userId: string;
  fullName: string | null;
  email: string | null;
}

export type EnrollmentActionResult = { ok: true } | { ok: false; error: string };
export type BulkEnrollResult = { ok: true; totalMembers: number; enrolled: number } | { ok: false; error: string };

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Learners matching a search string, for the enroll/cohort-member pickers. */
export async function searchLearnersAction(q: string): Promise<LearnerOption[]> {
  const { supabase, user } = await actor();
  if (!user) return [];
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  const { users } = await getAdminUsers(supabase, { q: trimmed, role: "learner", status: "", page: 1 });
  return users.map((u) => ({ userId: u.userId, fullName: u.fullName, email: u.email }));
}

export async function enrollUserAction(userId: string, courseId: string): Promise<EnrollmentActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.rpc("admin_enroll_user", { p_user_id: userId, p_course_id: courseId });
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "enrollment.manual_enroll",
    resourceType: "enrollment",
    resourceId: courseId,
    metadata: { userId, courseId },
  });
  await dispatchWebhookEvent("enrollment.created", { userId, courseId, triggeredBy: "admin" });

  revalidatePath("/admin/enrollments");
  return { ok: true };
}

export async function unenrollUserAction(userId: string, courseId: string): Promise<EnrollmentActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.rpc("admin_unenroll_user", { p_user_id: userId, p_course_id: courseId });
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "enrollment.manual_unenroll",
    resourceType: "enrollment",
    resourceId: courseId,
    metadata: { userId, courseId },
  });

  revalidatePath("/admin/enrollments");
  return { ok: true };
}

export async function createCohortAction(name: string): Promise<EnrollmentActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const parsed = validateCohortName(name);
  if (!parsed.ok) return parsed;

  const { error } = await supabase.from("cohorts").insert({ name: parsed.value, created_by: user.id });
  if (error) return { ok: false, error: "We could not create that cohort. Please try again." };

  revalidatePath("/admin/enrollments");
  return { ok: true };
}

export async function deleteCohortAction(cohortId: string): Promise<EnrollmentActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.from("cohorts").delete().eq("id", cohortId);
  if (error) return { ok: false, error: "We could not delete that cohort. Please try again." };

  revalidatePath("/admin/enrollments");
  return { ok: true };
}

export async function addCohortMemberAction(cohortId: string, userId: string): Promise<EnrollmentActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.from("cohort_members").insert({ cohort_id: cohortId, user_id: userId });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "This learner is already in the cohort." };
    return { ok: false, error: "We could not add that learner. Please try again." };
  }

  revalidatePath("/admin/enrollments");
  return { ok: true };
}

export async function removeCohortMemberAction(cohortId: string, userId: string): Promise<EnrollmentActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.from("cohort_members").delete().eq("cohort_id", cohortId).eq("user_id", userId);
  if (error) return { ok: false, error: "We could not remove that learner. Please try again." };

  revalidatePath("/admin/enrollments");
  return { ok: true };
}

export async function bulkEnrollCohortAction(cohortId: string, courseId: string): Promise<BulkEnrollResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { data, error } = await supabase.rpc("admin_bulk_enroll_cohort", { p_cohort_id: cohortId, p_course_id: courseId });
  if (error) return { ok: false, error: error.message };

  const result = data as { total_members: number; enrolled: number };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "enrollment.bulk_enroll",
    resourceType: "cohort",
    resourceId: cohortId,
    metadata: { courseId, ...result },
  });
  // One aggregate event for the whole batch, not one per learner enrolled.
  await dispatchWebhookEvent("enrollment.created", { cohortId, courseId, enrolled: result.enrolled, triggeredBy: "admin-bulk" });

  revalidatePath("/admin/enrollments");
  return { ok: true, totalMembers: result.total_members, enrolled: result.enrolled };
}
