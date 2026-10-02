import type { SupabaseClient } from "@supabase/supabase-js";
import { PORTALS } from "@/types/portal";

export interface PlatformSettingsInput {
  minPasswordLength: number;
  mfaRequiredPortals: string[];
  sessionIdleTimeoutMinutes: number | null;
}

export function validatePlatformSettingsInput(input: {
  minPasswordLength: unknown;
  mfaRequiredPortals: unknown;
  sessionIdleTimeoutMinutes: unknown;
}): { ok: true; value: PlatformSettingsInput } | { ok: false; error: string } {
  const minPasswordLength = Number(input.minPasswordLength);
  if (!Number.isInteger(minPasswordLength) || minPasswordLength < 8 || minPasswordLength > 128) {
    return { ok: false, error: "Minimum password length must be between 8 and 128." };
  }

  if (!Array.isArray(input.mfaRequiredPortals) || !input.mfaRequiredPortals.every((p) => typeof p === "string" && (PORTALS as readonly string[]).includes(p))) {
    return { ok: false, error: "Unknown portal in the MFA list." };
  }
  const mfaRequiredPortals = [...new Set(input.mfaRequiredPortals as string[])];

  let sessionIdleTimeoutMinutes: number | null = null;
  if (input.sessionIdleTimeoutMinutes !== null && input.sessionIdleTimeoutMinutes !== "" && input.sessionIdleTimeoutMinutes !== undefined) {
    const minutes = Number(input.sessionIdleTimeoutMinutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 10080) {
      return { ok: false, error: "Idle timeout must be between 5 and 10080 minutes, or left off." };
    }
    sessionIdleTimeoutMinutes = minutes;
  }

  return { ok: true, value: { minPasswordLength, mfaRequiredPortals, sessionIdleTimeoutMinutes } };
}

export interface SecurityEvent {
  id: string;
  createdAt: string;
  action: string;
  actorEmail: string | null;
  resourceType: string;
  resourceId: string | null;
}

/** SECURITY.md §17's security-relevant subset of the audit log, for a quick-glance list here rather than duplicating logging infrastructure (the full log stays on /admin/audit). */
const SECURITY_ACTIONS = ["auth.login_failed", "user.suspended", "user.reinstated", "user.role_changed", "role_permission_changed", "settings.changed"] as const;

interface Row {
  id: string;
  created_at: string;
  action: string;
  actor_email: string | null;
  resource_type: string;
  resource_id: string | null;
}

export async function getRecentSecurityEvents(supabase: SupabaseClient, limit = 25): Promise<SecurityEvent[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, created_at, action, actor_email, resource_type, resource_id")
    .in("action", SECURITY_ACTIONS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`audit_logs failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    action: r.action,
    actorEmail: r.actor_email,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
  }));
}
