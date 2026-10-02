import type { SupabaseClient } from "@supabase/supabase-js";

// Roles that use the admin console. Everyone else (instructor, or nobody
// yet) falls through to their own portal / the learner default.
const BACK_OFFICE_ROLES = new Set([
  "super_admin",
  "admin",
  "support_agent",
  "content_reviewer",
]);

export async function getPortalPathForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await supabase.from("user_roles").select("role_id").eq("user_id", userId);
  const roleIds = new Set((data ?? []).map((row) => row.role_id as string));

  // T-162: org_admin has its own scoped portal, not the full admin console.
  if (roleIds.has("org_admin")) return "/org_admin";
  if ([...roleIds].some((role) => BACK_OFFICE_ROLES.has(role))) return "/admin";
  if (roleIds.has("instructor")) return "/instructor";
  return "/learner";
}
