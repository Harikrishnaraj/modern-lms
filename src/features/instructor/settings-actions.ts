"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateBio, validateHeadline, validatePayoutDetails } from "./settings";

export type SettingsResult = { ok: true } | { ok: false; error: string };

/** Saves the headline/bio shown publicly on the instructor's published courses. */
export async function updatePublicProfileAction(input: { headline: string; bio: string }): Promise<SettingsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const headline = validateHeadline(input.headline);
  if (!headline.ok) return headline;
  const bio = validateBio(input.bio);
  if (!bio.ok) return bio;

  const { error } = await supabase.from("profiles").update({ headline: headline.value, bio: bio.value }).eq("id", user.id);
  if (error) return { ok: false, error: "We could not save your public profile. Please try again." };

  revalidatePath("/instructor/settings");
  return { ok: true };
}

/** Saves (or replaces) the instructor's payout reference, ahead of real payout processing. */
export async function updatePayoutDetailsAction(input: { method: string; reference: string }): Promise<SettingsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const parsed = validatePayoutDetails(input);
  if (!parsed.ok) return parsed;

  const { error } = await supabase.from("instructor_payout_details").upsert({
    instructor_id: user.id,
    payout_method: parsed.value.method,
    payout_reference: parsed.value.reference,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "We could not save your payout details. Please try again." };

  revalidatePath("/instructor/settings");
  return { ok: true };
}
