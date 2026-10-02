import type { SupabaseClient } from "@supabase/supabase-js";

export interface MyAction {
  id: string;
  createdAt: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
}

interface Row {
  id: string;
  created_at: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
}

/** The signed-in admin's own recent audited actions (F-417 "my recent actions"). */
export async function getMyRecentActions(supabase: SupabaseClient, userId: string, limit = 20): Promise<MyAction[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, created_at, action, resource_type, resource_id")
    .eq("actor_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`audit_logs failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
  }));
}
