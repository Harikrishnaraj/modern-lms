"use server";

import { revalidatePath } from "next/cache";
import { validateReason } from "@/features/discussions/discussions";
import { createClient } from "@/lib/supabase/server";
import { RATE_LIMITED_MESSAGE, clientIp, rateLimit } from "@/services/rate-limit";
import { notify } from "@/services/notifications";
import { validateReview } from "./reviews";

export type ReviewResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: { rating?: string; body?: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates or updates the learner review of a course. RLS is the gate: only a learner who has
 * completed the course may insert, only the author may edit, and only rating and text are writable.
 */
export async function saveReview(courseId: string, input: { rating: number; body: string }): Promise<ReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(courseId)) return { ok: false, error: "This course is not available." };
  const parsed = validateReview(input);
  if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };

  const { data: existing } = await supabase.from("course_ratings").select("id").eq("course_id", courseId).eq("user_id", user.id).maybeSingle();
  const { data: course } = await supabase.from("courses").select("slug, instructor_id").eq("id", courseId).maybeSingle();

  const write = existing
    ? await supabase.from("course_ratings").update({ rating: parsed.rating, body: parsed.body }).eq("id", existing.id).select("id")
    : await supabase.from("course_ratings").insert({ course_id: courseId, user_id: user.id, rating: parsed.rating, body: parsed.body }).select("id");
  if (write.error || !write.data?.length) {
    return { ok: false, error: "You can review a course after you have completed it." };
  }

  if (!existing && course?.instructor_id) {
    await notify({
      userId: course.instructor_id as string,
      category: "course",
      title: `New ${parsed.rating}-star review on your course`,
      body: parsed.body.slice(0, 200) || undefined,
      href: `/courses/${course.slug as string}#reviews`,
    });
  }
  if (course) revalidatePath(`/courses/${course.slug as string}`);
  return { ok: true };
}

/** Removes the learner own review. */
export async function deleteReview(courseId: string): Promise<ReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(courseId)) return { ok: false, error: "This course is not available." };
  const { data, error } = await supabase.from("course_ratings").delete().eq("course_id", courseId).eq("user_id", user.id).select("id");
  if (error || !data?.length) return { ok: false, error: "You have no review to delete." };
  const { data: course } = await supabase.from("courses").select("slug").eq("id", courseId).maybeSingle();
  if (course) revalidatePath(`/courses/${course.slug as string}`);
  return { ok: true };
}

export type ReportReviewResult = { ok: true } | { ok: false; error: string };

/** Flags a review for moderator attention (F-411). Cannot report your own review. */
export async function reportReviewAction(reviewId: string, reason: string): Promise<ReportReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(reviewId)) return { ok: false, error: "That review is not available." };
  const parsed = validateReason(reason);
  if (!parsed.ok) return parsed;
  if (!(await rateLimit("review-report", await clientIp(), user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const { error } = await supabase.rpc("report_review", { p_review_id: reviewId, p_reason: parsed.reason });
  if (error) {
    return { ok: false, error: error.message.includes("your own") ? "You cannot report your own review." : "We could not submit that report." };
  }
  return { ok: true };
}
