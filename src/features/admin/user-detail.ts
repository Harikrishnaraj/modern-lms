import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminUser } from "./users";

export interface LoginEvent {
  id: number;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const LOGIN_HISTORY_LIMIT = 20;

interface DetailRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  status: string;
  roles: string[];
  created_at: string;
  last_sign_in_at: string | null;
}

/** One user's account/role summary, or null if they do not exist. Requires user.read_all. */
export async function getAdminUserDetail(supabase: SupabaseClient, userId: string): Promise<AdminUser | null> {
  const { data, error } = await supabase.rpc("admin_user_detail", { p_user_id: userId });
  if (error) throw new Error(`admin_user_detail failed: ${error.message}`);
  const row = (data ?? [])[0] as DetailRow | undefined;
  if (!row) return null;
  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    status: row.status === "suspended" ? "suspended" : "active",
    roles: row.roles,
    createdAt: row.created_at,
    lastSignInAt: row.last_sign_in_at,
  };
}

interface LoginRow {
  id: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

/** Recent sign-ins for a user, newest first. Own history, or any user's with user.read_all. */
export async function getLoginHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = LOGIN_HISTORY_LIMIT,
): Promise<LoginEvent[]> {
  const { data, error } = await supabase
    .from("login_history")
    .select("id, ip_address, user_agent, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getLoginHistory failed: ${error.message}`);
  return ((data ?? []) as LoginRow[]).map((r) => ({
    id: r.id,
    ipAddress: r.ip_address,
    userAgent: r.user_agent,
    createdAt: r.created_at,
  }));
}

/** A short, friendly label from a raw User-Agent string, for display only (never parsed for logic). */
export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const ua = userAgent;

  let os = "Unknown OS";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/linux/i.test(ua)) os = "Linux";

  let browser = "Unknown browser";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\/|opera/i.test(ua)) browser = "Opera";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua)) browser = "Safari";

  return `${browser} on ${os}`;
}
