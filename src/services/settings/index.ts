import type { SupabaseClient } from "@supabase/supabase-js";

export interface PlatformSettings {
  minPasswordLength: number;
  mfaRequiredPortals: string[];
  sessionIdleTimeoutMinutes: number | null;
}

/** Safe defaults matching the platform_settings column defaults, used if the row can't be read. */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  minPasswordLength: 8,
  // Both back-office portals require MFA since T-162 (migration org_admin_portal).
  mfaRequiredPortals: ["admin", "org_admin"],
  sessionIdleTimeoutMinutes: null,
};

/** Publicly readable (RLS allows anon too): signup/reset need min_password_length pre-session. */
export async function getPlatformSettings(supabase: SupabaseClient): Promise<PlatformSettings> {
  const { data } = await supabase
    .from("platform_settings")
    .select("min_password_length, mfa_required_portals, session_idle_timeout_minutes")
    .eq("id", true)
    .maybeSingle();
  if (!data) return DEFAULT_PLATFORM_SETTINGS;
  return {
    minPasswordLength: data.min_password_length as number,
    mfaRequiredPortals: data.mfa_required_portals as string[],
    sessionIdleTimeoutMinutes: (data.session_idle_timeout_minutes as number | null) ?? null,
  };
}
