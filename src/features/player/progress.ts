"use server";

import { revalidatePath } from "next/cache";
import { tryEvaluateCompletion } from "@/features/completion/evaluate";
import { deriveLessonStatus, deriveScoreRaw, deriveSuspendData, isDone } from "@/services/scorm/cmi";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/services/supabase/admin";
import { normalizePosition } from "./position";

export type CompleteResult =
  | { completed: true; courseCompleted: boolean; certificateCode: string | null }
  | { error: string };
export type PositionResult = { saved: true } | { error: string };
export type ScormCommitResult = { saved: true; courseCompleted: boolean } | { error: string };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resolves the caller's enrollment for the course and checks the lesson belongs to the version
// they are enrolled in. Everything is re-derived server-side; RLS is the second line of defence.
async function resolveEnrolledLesson(slug: string, lessonId: string) {
  if (typeof slug !== "string" || !SLUG.test(slug)) return null;
  if (typeof lessonId !== "string" || !UUID.test(lessonId)) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: course } = await supabase.from("courses").select("id").eq("slug", slug).maybeSingle();
  if (!course) return null;
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, version_id")
    .eq("user_id", user.id)
    .eq("course_id", course.id)
    .neq("status", "cancelled")
    .maybeSingle();
  if (!enrollment) return null;

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, type, course_sections!inner(version_id)")
    .eq("id", lessonId)
    .eq("course_sections.version_id", enrollment.version_id)
    .maybeSingle();
  if (!lesson) return null;

  return { supabase, enrollmentId: enrollment.id as string, lessonType: lesson.type as string };
}

/** Marks a lesson complete for the signed-in learner. Idempotent: the first completion time is kept. */
export async function completeLesson(slug: string, lessonId: string): Promise<CompleteResult> {
  const ctx = await resolveEnrolledLesson(slug, lessonId);
  if (!ctx) return { error: "You are not enrolled in this lesson." };
  // A SCORM lesson is done only when the package reports passed/completed (submitScormCommit).
  if (ctx.lessonType === "scorm") return { error: "This lesson completes when you finish the course content." };

  const { data: existing } = await ctx.supabase
    .from("lesson_progress")
    .select("id, completed_at")
    .eq("enrollment_id", ctx.enrollmentId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  const now = new Date().toISOString();
  const { error } = existing
    ? existing.completed_at
      ? { error: null }
      : await ctx.supabase.from("lesson_progress").update({ completed_at: now }).eq("id", existing.id)
    : await ctx.supabase
        .from("lesson_progress")
        .insert({ enrollment_id: ctx.enrollmentId, lesson_id: lessonId, completed_at: now });
  if (error) return { error: "We could not save your progress. Please try again." };

  // The course may now be complete: server-side check, issues the certificate if eligible.
  const outcome = await tryEvaluateCompletion(createAdminClient(), ctx.enrollmentId);

  revalidatePath(`/learner/courses/${slug}`, "layout");
  revalidatePath("/learner/my-learning");
  return { completed: true, courseCompleted: outcome.complete, certificateCode: outcome.certificateCode };
}

/** Persists the video resume position (whole seconds) for the signed-in learner. */
export async function saveVideoPosition(
  slug: string,
  lessonId: string,
  seconds: number,
): Promise<PositionResult> {
  const position = normalizePosition(seconds);
  if (position === null) return { error: "Invalid position." };
  const ctx = await resolveEnrolledLesson(slug, lessonId);
  if (!ctx) return { error: "You are not enrolled in this lesson." };

  const { data: existing } = await ctx.supabase
    .from("lesson_progress")
    .select("id")
    .eq("enrollment_id", ctx.enrollmentId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  const { error } = existing
    ? await ctx.supabase
        .from("lesson_progress")
        .update({ last_position_seconds: position })
        .eq("id", existing.id)
    : await ctx.supabase.from("lesson_progress").insert({
        enrollment_id: ctx.enrollmentId,
        lesson_id: lessonId,
        last_position_seconds: position,
      });
  if (error) return { error: "We could not save your position." };
  return { saved: true };
}

/** Persists a SCORM commit/finish payload and marks the lesson complete when it reports done. */
export async function submitScormCommit(
  slug: string,
  lessonId: string,
  cmi: Record<string, string>,
): Promise<ScormCommitResult> {
  const ctx = await resolveEnrolledLesson(slug, lessonId);
  if (!ctx) return { error: "You are not enrolled in this lesson." };
  if (typeof cmi !== "object" || cmi === null) return { error: "Invalid progress data." };

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return { error: "Please log in again." };

  const status = deriveLessonStatus(cmi);
  const { error } = await ctx.supabase.from("scorm_registrations").upsert(
    {
      lesson_id: lessonId,
      enrollment_id: ctx.enrollmentId,
      user_id: user.id,
      cmi,
      lesson_status: status,
      score_raw: deriveScoreRaw(cmi),
      suspend_data: deriveSuspendData(cmi),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "lesson_id,enrollment_id" },
  );
  if (error) return { error: "We could not save your progress. Please try again." };

  let courseCompleted = false;
  if (isDone(status)) {
    const { data: existing } = await ctx.supabase
      .from("lesson_progress")
      .select("id, completed_at")
      .eq("enrollment_id", ctx.enrollmentId)
      .eq("lesson_id", lessonId)
      .maybeSingle();
    if (!existing?.completed_at) {
      const now = new Date().toISOString();
      await (existing
        ? ctx.supabase.from("lesson_progress").update({ completed_at: now }).eq("id", existing.id)
        : ctx.supabase.from("lesson_progress").insert({ enrollment_id: ctx.enrollmentId, lesson_id: lessonId, completed_at: now }));
      const outcome = await tryEvaluateCompletion(createAdminClient(), ctx.enrollmentId);
      courseCompleted = outcome.complete;
      revalidatePath(`/learner/courses/${slug}`, "layout");
      revalidatePath("/learner/my-learning");
    }
  }

  return { saved: true, courseCompleted };
}
