"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";

export type InstructorActionResult = { ok: true } | { ok: false; error: string };

const NOTE_MAX = 1000;

/** Approves (grants the instructor role) or rejects a pending application. Audited either way. */
export async function reviewApplicationAction(
  applicationId: string,
  decision: "approved" | "rejected",
  note: string,
): Promise<InstructorActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await can(supabase, user.id, "user.manage"))) {
    return { ok: false, error: "You do not have permission to review instructor applications." };
  }
  const trimmedNote = note.trim();
  if (trimmedNote.length > NOTE_MAX) {
    return { ok: false, error: `Keep the note under ${NOTE_MAX} characters.` };
  }
  if (decision === "rejected" && trimmedNote === "") {
    return { ok: false, error: "Add a short note explaining the rejection." };
  }

  const { data: application } = await supabase.from("instructor_applications").select("user_id").eq("id", applicationId).maybeSingle();

  const { error } = await supabase.rpc("review_instructor_application", {
    p_application_id: applicationId,
    p_decision: decision,
    p_note: trimmedNote || null,
  });
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: decision === "approved" ? "instructor.application_approved" : "instructor.application_rejected",
    resourceType: "instructor_application",
    resourceId: applicationId,
    metadata: { userId: application?.user_id ?? null, note: trimmedNote || null },
  });

  revalidatePath("/admin/instructors");
  return { ok: true };
}
