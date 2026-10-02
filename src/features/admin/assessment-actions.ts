"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";

export type ResetAttemptResult = { ok: true } | { ok: false; error: string };

export async function resetAttemptAction(attemptId: string): Promise<ResetAttemptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { data, error } = await supabase.rpc("admin_reset_attempt", { p_attempt_id: attemptId });
  if (error) return { ok: false, error: error.message };

  const deleted = (data as { assessment_id: string; user_id: string; attempt_number: number }[])[0];
  if (!deleted) return { ok: false, error: "That attempt no longer exists." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "assessment.attempt_reset",
    resourceType: "assessment_attempt",
    resourceId: attemptId,
    metadata: { assessmentId: deleted.assessment_id, learnerId: deleted.user_id, attemptNumber: deleted.attempt_number },
  });

  revalidatePath("/admin/assessments");
  return { ok: true };
}
