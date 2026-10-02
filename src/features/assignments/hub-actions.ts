"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions/can";
import { sanitizeLessonHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";
import { ASSIGNMENT_RESOURCE_BUCKET, supabaseStorage } from "@/services/storage";
import { isOwnResourcePath, normalizeInstructionsHtml, validateHubAssignment, validateResourceFile, type HubAssignmentInput } from "./hub-rules";
import { removeUnreferencedResources } from "./resources";

export type ResourceTicket = { ok: true; bucket: string; path: string; token: string } | { ok: false; error: string };
export type CreateAssignmentResult =
  | { ok: true; id: string; live: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function instructor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(await can(supabase, user.id, "portal.instructor.access"))) return null;
  return { supabase, user };
}

/**
 * One-time direct-to-storage upload ticket for a reference file. The object key is always under
 * the instructor's own prefix; it is only attached to an assignment by createCourseAssignment
 * (or the course editor), which re-checks the prefix and that the upload completed.
 */
export async function requestAssignmentResourceUpload(file: { name: string; size: number; type: string }): Promise<ResourceTicket> {
  const ctx = await instructor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  if (!(await rateLimit("upload-initiate", await clientIp(), ctx.user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };
  const check = validateResourceFile(file);
  if (!check.ok) return check;
  const path = `${ctx.user.id}/${randomUUID()}.${check.ext}`;
  try {
    const { token } = await supabaseStorage.createSignedUpload(ASSIGNMENT_RESOURCE_BUCKET, path);
    return { ok: true, bucket: ASSIGNMENT_RESOURCE_BUCKET, path, token };
  } catch {
    return { ok: false, error: "We could not start the upload. Please try again." };
  }
}

/** Drops an uploaded reference file that was removed before the assignment was created. */
export async function discardAssignmentResourceUpload(path: string): Promise<{ ok: boolean }> {
  const ctx = await instructor();
  if (!ctx || !isOwnResourcePath(ctx.user.id, path)) return { ok: false };
  // Never touches a file an assignment already uses: only unreferenced objects are removed.
  await removeUnreferencedResources([path]);
  return { ok: true };
}

const LOCKED_MESSAGE = "This course is in review, so new assignments can be added once the review is finished.";

/**
 * Creates an assignment from the Assignments page. In a live course it goes into the published
 * version immediately (ADR-030), plus the newest editable draft if there is one.
 */
export async function createCourseAssignment(input: HubAssignmentInput): Promise<CreateAssignmentResult> {
  const ctx = await instructor();
  if (!ctx) return { ok: false, error: "Please log in again." };

  const parsed = validateHubAssignment({
    ...input,
    instructions: normalizeInstructionsHtml(sanitizeLessonHtml(typeof input?.instructions === "string" ? input.instructions : "")),
  });
  if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };
  const v = parsed.value;

  for (const r of v.resources) {
    if (!isOwnResourcePath(ctx.user.id, r.path)) return { ok: false, error: "That upload does not belong to you." };
    if (!(await supabaseStorage.exists(ASSIGNMENT_RESOURCE_BUCKET, r.path).catch(() => false))) {
      return { ok: false, error: `The upload of "${r.name}" did not complete. Please attach it again.` };
    }
  }

  const { data: course } = await ctx.supabase
    .from("courses")
    .select("id, published_version_id")
    .eq("id", v.courseId)
    .eq("instructor_id", ctx.user.id)
    .maybeSingle();
  if (!course) return { ok: false, error: "This course is not available.", fieldErrors: { courseId: "Choose one of your courses." } };

  const { data, error } = await ctx.supabase.rpc("create_course_assignment", {
    p_course_id: v.courseId,
    p_title: v.title,
    p_instructions: v.instructions,
    p_due_at: v.dueAt,
    p_max_points: v.maxPoints,
    p_allowed_file_types: v.fileTypes,
    p_resources: v.resources.map((r) => ({ name: r.name, storage_path: r.path, mime_type: r.type, size_bytes: r.size })),
  });
  if (error || !data) {
    if (error?.message.includes("locked")) return { ok: false, error: LOCKED_MESSAGE, fieldErrors: { courseId: LOCKED_MESSAGE } };
    return { ok: false, error: "We could not create the assignment. Please try again." };
  }

  revalidatePath("/instructor/assignments");
  revalidatePath(`/instructor/courses/${v.courseId}/assignments`, "layout");
  revalidatePath("/instructor/grading");
  revalidatePath("/learner/assignments");
  return { ok: true, id: data as string, live: course.published_version_id !== null };
}
