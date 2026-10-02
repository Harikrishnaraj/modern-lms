import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditAction } from "@/services/audit";
import { PORTALS } from "@/types/portal";

// T-162: org_admin has its own portal too, so it must be a valid MFA-policy entry and a real
// checkbox in the settings UI, not silently dropped like it would be with a separate, stale list.
export const PORTAL_NAMES = PORTALS;
export type PortalName = (typeof PORTAL_NAMES)[number];

/** The audit actions this screen surfaces as "security events" (SECURITY.md §17's login/security list). */
export const SECURITY_EVENT_ACTIONS: AuditAction[] = [
  "auth.login_failed",
  "user.suspended",
  "user.reinstated",
  "user.role_changed",
  "role_permission_changed",
  "settings.changed",
];

export interface SecurityEvent {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
}

interface Row {
  id: string;
  created_at: string;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
}

export async function getRecentSecurityEvents(supabase: SupabaseClient, limit = 20): Promise<SecurityEvent[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, created_at, actor_email, action, resource_type, resource_id")
    .in("action", SECURITY_EVENT_ACTIONS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`audit_logs failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    actorEmail: r.actor_email,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
  }));
}

export function validatePlatformSettingsInput(input: {
  minPasswordLength: number;
  mfaRequiredPortals: string[];
  sessionIdleTimeoutMinutes: number | null;
}): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(input.minPasswordLength) || input.minPasswordLength < 8 || input.minPasswordLength > 128) {
    return { ok: false, error: "Minimum password length must be between 8 and 128." };
  }
  if (!input.mfaRequiredPortals.every((p) => (PORTAL_NAMES as readonly string[]).includes(p))) {
    return { ok: false, error: "Unknown portal in the MFA policy." };
  }
  if (input.sessionIdleTimeoutMinutes !== null) {
    if (!Number.isInteger(input.sessionIdleTimeoutMinutes) || input.sessionIdleTimeoutMinutes < 5 || input.sessionIdleTimeoutMinutes > 10080) {
      return { ok: false, error: "Session idle timeout must be between 5 and 10080 minutes, or left blank." };
    }
  }
  return { ok: true };
}
