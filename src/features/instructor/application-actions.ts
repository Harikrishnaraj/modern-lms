"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateApplicationMessage } from "./application";

export type ApplicationResult = { ok: true } | { ok: false; error: string };

/** Applies to become an instructor. Blocked (by RLS) if already an instructor or already pending. */
export async function applyToTeachAction(input: { message: string }): Promise<ApplicationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const parsed = validateApplicationMessage(input.message);
  if (!parsed.ok) return parsed;

  const { error } = await supabase.from("instructor_applications").insert({
    user_id: user.id,
    message: parsed.value,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "You already have an application pending review." };
    }
    return { ok: false, error: "We could not submit your application. Please try again." };
  }

  revalidatePath("/learner/settings");
  return { ok: true };
}
