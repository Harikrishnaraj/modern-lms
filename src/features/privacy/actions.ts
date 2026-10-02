"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";

export type PrivacyResult = { ok: true } | { ok: false; error: string };

const REVALIDATE_PATHS = ["/learner/settings", "/instructor/settings", "/admin/profile"];

/** Marks the account for deletion; a nightly job (purge_expired_accounts) removes it after a 30-day grace period. */
export async function requestAccountDeletionAction(): Promise<PrivacyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.from("profiles").update({ deletion_requested_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return { ok: false, error: "We could not process that. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "account.deletion_requested",
    resourceType: "profile",
    resourceId: user.id,
  });
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return { ok: true };
}

/** Cancels a pending deletion request, any time before the 30-day grace period elapses. */
export async function cancelAccountDeletionAction(): Promise<PrivacyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.from("profiles").update({ deletion_requested_at: null }).eq("id", user.id);
  if (error) return { ok: false, error: "We could not process that. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "account.deletion_cancelled",
    resourceType: "profile",
    resourceId: user.id,
  });
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return { ok: true };
}
