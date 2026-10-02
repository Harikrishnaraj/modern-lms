"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SUBMISSION_BUCKET, supabaseStorage } from "@/services/storage";
import { createAdminClient } from "@/services/supabase/admin";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";
import { getMyAssignment } from "./queries";
import { canSubmit, submitErrorMessage, validateSubmissionFile, validateTextAnswer } from "./rules";

export type UploadTicket =
  | { ok: true; bucket: string; path: string; token: string }
  | { ok: false; error: string };

export type SubmitResult = { ok: true } | { ok: false; error: string };

/** Issues a one-time direct-to-storage upload ticket for the learner own submission file. */
export async function requestSubmissionUpload(
  assignmentId: string,
  file: { name: string; size: number; type: string },
): Promise<UploadTicket> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await rateLimit("upload-initiate", await clientIp(), user.id))) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }
  const assignment = await getMyAssignment(supabase, user.id, assignmentId);
  if (!assignment) return { ok: false, error: "This assignment is not available." };
  if (!canSubmit(assignment.status)) return { ok: false, error: submitErrorMessage(assignment.status === "graded" ? "graded" : "closed") };

  const check = validateSubmissionFile(assignment, file);
  if (!check.ok) return check;
  const path = `${assignmentId}/${user.id}/${randomUUID()}.${check.ext}`;
  try {
    const { token } = await supabaseStorage.createSignedUpload(SUBMISSION_BUCKET, path);
    return { ok: true, bucket: SUBMISSION_BUCKET, path, token };
  } catch {
    return { ok: false, error: "We could not start the upload. Please try again." };
  }
}

/**
 * Submits (or replaces, until the deadline or grading) the learner work. Server-side order:
 * signed in -> enrolled in this exact version (via the learner own RLS) -> input checks -> the file
 * really is in storage under the learner own prefix -> submit_assignment (deadline, lock, rules).
 */
export async function submitAssignment(
  assignmentId: string,
  input: { text: string; file: { path: string; name: string; size: number; type: string } | null },
): Promise<SubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const assignment = await getMyAssignment(supabase, user.id, assignmentId);
  if (!assignment) return { ok: false, error: "This assignment is not available." };

  const text = typeof input.text === "string" ? input.text : "";
  const textError = validateTextAnswer(assignment, text);
  if (textError) return { ok: false, error: textError };

  let file: { path: string; name: string; size: number; type: string } | null = null;
  if (input.file) {
    const check = validateSubmissionFile(assignment, input.file);
    if (!check.ok) return check;
    const path = input.file.path;
    if (typeof path !== "string" || !path.startsWith(`${assignmentId}/${user.id}/`) || path.includes("..")) {
      return { ok: false, error: "That upload does not belong to you." };
    }
    if (!(await supabaseStorage.exists(SUBMISSION_BUCKET, path).catch(() => false))) {
      return { ok: false, error: "The upload did not complete. Please try again." };
    }
    file = { path, name: check.safeName, size: input.file.size, type: check.type };
  }

  const { data, error } = await createAdminClient().rpc("submit_assignment", {
    p_assignment_id: assignmentId,
    p_user_id: user.id,
    p_text: text,
    p_file_path: file?.path ?? null,
    p_file_name: file?.name ?? null,
    p_file_size: file?.size ?? null,
    p_file_type: file?.type ?? null,
  });
  if (error) return { ok: false, error: submitErrorMessage("error") };
  const result = (data as { result: string; previous_file_path?: string | null }) ?? { result: "error" };
  if (result.result !== "ok") {
    // A rejected upload must not linger in storage.
    if (file) await supabaseStorage.remove(SUBMISSION_BUCKET, [file.path]).catch(() => undefined);
    return { ok: false, error: submitErrorMessage(result.result) };
  }
  // Replaced files are removed once the new submission is recorded.
  if (result.previous_file_path && result.previous_file_path !== file?.path) {
    await supabaseStorage.remove(SUBMISSION_BUCKET, [result.previous_file_path]).catch(() => undefined);
  }
  revalidatePath("/learner/assignments");
  revalidatePath(`/learner/assignments/${assignmentId}`);
  return { ok: true };
}
