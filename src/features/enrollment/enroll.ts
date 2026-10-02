"use server";

import { revalidatePath } from "next/cache";
import { getCourseDetail } from "@/features/catalog/course-detail";
import { can } from "@/lib/permissions/can";
import { unmetPrerequisites } from "@/features/course-authoring/pricing-rules";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhookEvent } from "@/services/webhooks/dispatch";

export type EnrollResult = { enrolled: true } | { error: string };

// Public endpoint: never trust the client. Only the slug is accepted; the course, its live
// version and its price are all re-read here. RLS is the second line of defence (it only
// allows self-enrolment into a published FREE course).
export async function enrollInCourse(slug: string): Promise<EnrollResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in to enroll." };
  if (!(await can(supabase, user.id, "portal.learner.access"))) {
    return { error: "Your account cannot enroll in courses." };
  }

  const course = typeof slug === "string" ? await getCourseDetail(supabase, slug) : null;
  if (!course) return { error: "This course is not available." };
  if (course.priceCents > 0) {
    return { error: "This course requires payment, and checkout is not available yet." };
  }

  // Prerequisites: every required course must be completed first (server-side, never the UI).
  const { data: reqRows } = await supabase
    .from("course_prerequisites")
    .select("prerequisite_course_id")
    .eq("version_id", course.versionId);
  const required = (reqRows ?? []).map((r) => r.prerequisite_course_id as string);
  if (required.length > 0) {
    const { data: done } = await supabase
      .from("enrollments")
      .select("course_id")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .in("course_id", required);
    const missing = unmetPrerequisites(required, new Set((done ?? []).map((d) => d.course_id as string)));
    if (missing.length > 0) {
      const { data: titles } = await supabase.rpc("get_prerequisite_titles", { p_course_ids: missing });
      const names = ((titles ?? []) as { title: string }[]).map((t) => t.title);
      return { error: `Complete these courses first: ${names.length ? names.join(", ") : "the required prerequisites"}.` };
    }
  }

  const { error } = await supabase
    .from("enrollments")
    .insert({ user_id: user.id, course_id: course.id, version_id: course.versionId });

  // 23505 = already enrolled (unique user_id + course_id): idempotent success.
  if (error && error.code !== "23505") {
    return { error: "We could not enroll you. Please try again." };
  }
  if (!error) {
    await dispatchWebhookEvent("enrollment.created", { userId: user.id, courseId: course.id, courseSlug: course.slug });
  }

  revalidatePath(`/courses/${course.slug}`);
  return { enrolled: true };
}
