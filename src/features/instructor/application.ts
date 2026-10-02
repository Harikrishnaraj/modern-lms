import type { SupabaseClient } from "@supabase/supabase-js";

export const APPLICATION_MESSAGE_MIN = 20;
export const APPLICATION_MESSAGE_MAX = 2000;

export interface InstructorApplication {
  id: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export function validateApplicationMessage(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Tell us why you'd like to teach." };
  const value = input.trim();
  if (value.length < APPLICATION_MESSAGE_MIN) {
    return { ok: false, error: `Write at least ${APPLICATION_MESSAGE_MIN} characters.` };
  }
  if (value.length > APPLICATION_MESSAGE_MAX) {
    return { ok: false, error: `Keep it under ${APPLICATION_MESSAGE_MAX} characters.` };
  }
  return { ok: true, value };
}

interface Row {
  id: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/** The caller's most recent instructor application, if any. */
export async function getMyInstructorApplication(
  supabase: SupabaseClient,
  userId: string,
): Promise<InstructorApplication | null> {
  const { data, error } = await supabase
    .from("instructor_applications")
    .select("id, message, status, review_note, reviewed_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getMyInstructorApplication failed: ${error.message}`);
  if (!data) return null;
  const row = data as Row;
  return {
    id: row.id,
    message: row.message,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}
