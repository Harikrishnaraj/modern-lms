"use server";

import { revalidatePath } from "next/cache";
import { validatePlatformSettingsInput } from "./settings";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

export async function updatePlatformSettingsAction(input: {
  minPasswordLength: number;
  mfaRequiredPortals: string[];
  sessionIdleTimeoutMinutes: number | null;
}): Promise<SettingsActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await can(supabase, user.id, "settings.manage"))) return { ok: false, error: "Please log in again." };

  const parsed = validatePlatformSettingsInput(input);
  if (!parsed.ok) return parsed;

  const { error } = await supabase
    .from("platform_settings")
    .update({
      min_password_length: input.minPasswordLength,
      mfa_required_portals: input.mfaRequiredPortals,
      session_idle_timeout_minutes: input.sessionIdleTimeoutMinutes,
      updated_by: user.id,
    })
    .eq("id", true);
  if (error) return { ok: false, error: "We could not save those settings. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "settings.changed",
    resourceType: "platform_settings",
    metadata: input,
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}
