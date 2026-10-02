import { captureError } from "@/services/error-tracking";
import { notify } from "@/services/notifications";
import { dispatchWebhookEvent } from "@/services/webhooks/dispatch";
import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeCompletion } from "./rules";

export interface EvaluationResult {
  complete: boolean;
  /** Set when the course is complete and a certificate exists (new or previously issued). */
  certificateCode: string | null;
}

const NOT_COMPLETE: EvaluationResult = { complete: false, certificateCode: null };

/** Learner display name for the certificate: profile name, else the email local part. */
async function learnerName(admin: SupabaseClient, userId: string): Promise<string> {
  const { data: profile } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const named = (profile?.full_name as string | null)?.trim();
  if (named) return named.slice(0, 200);
  const { data } = await admin.auth.admin.getUserById(userId);
  const local = data.user?.email?.split("@")[0] ?? "Learner";
  return local.slice(0, 200);
}

/**
 * Server-side, idempotent: recomputes eligibility from the database (never from caller input),
 * marks the enrollment completed and issues the certificate when the course allows it.
 * `admin` is the service-role client; call only after the learner was authorised.
 */
export async function evaluateCompletion(
  admin: SupabaseClient,
  enrollmentId: string,
): Promise<EvaluationResult> {
  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id, user_id, course_id, version_id, status, completed_at")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enrollment || enrollment.status === "cancelled") return NOT_COMPLETE;

  const [sectionsRes, assessmentsRes, progressRes, attemptsRes, versionRes, courseRes] =
    await Promise.all([
      admin.from("course_sections").select("id").eq("version_id", enrollment.version_id),
      admin.from("assessments").select("id, lesson_id").eq("version_id", enrollment.version_id),
      admin
        .from("lesson_progress")
        .select("lesson_id")
        .eq("enrollment_id", enrollmentId)
        .not("completed_at", "is", null),
      admin
        .from("assessment_attempts")
        .select("assessment_id")
        .eq("enrollment_id", enrollmentId)
        .eq("passed", true),
      admin
        .from("course_versions")
        .select("title, certificate_enabled")
        .eq("id", enrollment.version_id)
        .single(),
      admin.from("courses").select("instructor_id").eq("id", enrollment.course_id).single(),
    ]);

  const sectionIds = (sectionsRes.data ?? []).map((s) => s.id as string);
  const { data: lessons } = sectionIds.length
    ? await admin.from("lessons").select("id").in("section_id", sectionIds)
    : { data: [] as { id: string }[] };

  const summary = summarizeCompletion({
    lessons: (lessons ?? []).map((l) => ({ id: l.id as string })),
    completedLessonIds: new Set((progressRes.data ?? []).map((r) => r.lesson_id as string)),
    assessments: (assessmentsRes.data ?? []).map((a) => ({
      id: a.id as string,
      lessonId: (a.lesson_id as string | null) ?? null,
    })),
    passedAssessmentIds: new Set((attemptsRes.data ?? []).map((a) => a.assessment_id as string)),
  });
  if (!summary.complete) return NOT_COMPLETE;

  if (enrollment.status !== "completed") {
    await admin
      .from("enrollments")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", enrollmentId)
      .eq("status", "active");
    await dispatchWebhookEvent("course.completed", {
      userId: enrollment.user_id as string,
      courseId: enrollment.course_id as string,
      enrollmentId,
    });
  }

  if (!versionRes.data?.certificate_enabled) return { complete: true, certificateCode: null };

  // A revoked certificate can be reissued (T-137), which leaves both a revoked history row and a
  // live one for the same enrollment, so this can no longer assume at most one row.
  const existing = await admin
    .from("certificates")
    .select("code, status")
    .eq("enrollment_id", enrollmentId)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.data) {
    return {
      complete: true,
      certificateCode: existing.data.status === "revoked" ? null : (existing.data.code as string),
    };
  }

  const { data: instructor } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", courseRes.data?.instructor_id)
    .maybeSingle();

  const { data: template } = await admin
    .from("certificate_templates")
    .select("signature_title, closing_message")
    .eq("course_id", enrollment.course_id)
    .maybeSingle();

  const { data: cert, error } = await admin
    .from("certificates")
    .insert({
      enrollment_id: enrollmentId,
      user_id: enrollment.user_id,
      course_id: enrollment.course_id,
      version_id: enrollment.version_id,
      learner_name: await learnerName(admin, enrollment.user_id as string),
      course_title: versionRes.data.title,
      instructor_name: (instructor?.full_name as string | null) ?? null,
      signature_title: (template?.signature_title as string | null) ?? null,
      closing_message: (template?.closing_message as string | null) ?? null,
    })
    .select("code")
    .single();

  if (error) {
    // Unique violation = a parallel evaluation issued it first: return that one.
    const again = await admin
      .from("certificates")
      .select("code, status")
      .eq("enrollment_id", enrollmentId)
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (again.data) {
      return {
        complete: true,
        certificateCode: again.data.status === "revoked" ? null : (again.data.code as string),
      };
    }
    throw new Error(`issueCertificate failed: ${error.message}`);
  }
  await notify({
    userId: enrollment.user_id as string,
    category: "course",
    title: `You earned a certificate for ${versionRes.data.title as string}`,
    href: "/learner/certificates",
  });
  await dispatchWebhookEvent("certificate.issued", {
    userId: enrollment.user_id as string,
    courseId: enrollment.course_id as string,
    certificateCode: cert.code as string,
  });
  return { complete: true, certificateCode: cert.code as string };
}

/** Best effort wrapper for hooks: completion problems must never break saving progress. */
export async function tryEvaluateCompletion(
  admin: SupabaseClient,
  enrollmentId: string,
): Promise<EvaluationResult> {
  try {
    return await evaluateCompletion(admin, enrollmentId);
  } catch (err) {
    void captureError("completion.evaluate_failed", err);
    return NOT_COMPLETE;
  }
}
