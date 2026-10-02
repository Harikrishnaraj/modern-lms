import type { SupabaseClient } from "@supabase/supabase-js";
import { csvCell } from "./audit";

export interface OrgAssignedLearning {
  id: string;
  scope: "organization" | "team" | "user";
  targetLabel: string;
  contentType: "course" | "path";
  title: string;
  dueAt: string | null;
  createdAt: string;
  totalAssigned: number;
  completedCount: number;
  overdueCount: number;
}

interface Row {
  id: string;
  scope: string;
  team_name: string | null;
  user_full_name: string | null;
  user_email: string | null;
  content_type: string;
  title: string;
  due_at: string | null;
  created_at: string;
  total_assigned: number;
  completed_count: number;
  overdue_count: number;
}

export async function getOrgAssignedLearning(supabase: SupabaseClient, orgId: string): Promise<OrgAssignedLearning[]> {
  const { data, error } = await supabase.rpc("list_org_assigned_learning", { p_org_id: orgId });
  if (error) throw new Error(`list_org_assigned_learning failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    scope: r.scope === "team" ? "team" : r.scope === "user" ? "user" : "organization",
    targetLabel: r.scope === "organization" ? "Whole organization" : r.scope === "team" ? (r.team_name ?? "Team") : (r.user_full_name ?? r.user_email ?? "Member"),
    contentType: r.content_type === "path" ? "path" : "course",
    title: r.title,
    dueAt: r.due_at,
    createdAt: r.created_at,
    totalAssigned: Number(r.total_assigned),
    completedCount: Number(r.completed_count),
    overdueCount: Number(r.overdue_count),
  }));
}

/** F-503: the organization report -- every assignment's completion/overdue status, plus the
 * organization's total learning hours as a header line above the table. */
export function organizationReportToCsv(orgName: string, learningHours: number, rows: OrgAssignedLearning[]): string {
  const summary = [csvCell("organization"), csvCell(orgName), csvCell("total_learning_hours"), csvCell(learningHours)].join(",");
  const header = ["content_type", "title", "assigned_to", "due_at", "total_assigned", "completed", "overdue"];
  const lines = rows.map((r) =>
    [r.contentType, r.title, r.targetLabel, r.dueAt ?? "", r.totalAssigned, r.completedCount, r.overdueCount].map(csvCell).join(","),
  );
  return [summary, header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}

/**
 * Team-scoped assignment is supported by the schema/RLS but not exposed here yet: there is no
 * department/team management UI to create a team to target in the first place (T-160/T-161
 * deliberately left that for later). Only whole-organization and single-member scopes are real
 * choices right now.
 */
export type AssignedLearningScope = "organization" | "user";

export interface AssignedLearningInput {
  scope: AssignedLearningScope;
  userId: string | null;
  contentType: "course" | "path";
  courseId: string | null;
  pathId: string | null;
  dueAt: string | null;
}

export function validateAssignedLearningInput(input: {
  scope: unknown;
  userId: unknown;
  contentType: unknown;
  courseId: unknown;
  pathId: unknown;
  dueAt: unknown;
}): { ok: true; value: AssignedLearningInput } | { ok: false; error: string } {
  if (input.scope !== "organization" && input.scope !== "user") return { ok: false, error: "Choose who this is assigned to." };
  if (input.scope === "user" && (typeof input.userId !== "string" || input.userId === "")) {
    return { ok: false, error: "Choose a member to assign this to." };
  }
  if (input.contentType !== "course" && input.contentType !== "path") return { ok: false, error: "Choose a course or a path." };
  if (input.contentType === "course" && (typeof input.courseId !== "string" || input.courseId === "")) {
    return { ok: false, error: "Choose a course." };
  }
  if (input.contentType === "path" && (typeof input.pathId !== "string" || input.pathId === "")) {
    return { ok: false, error: "Choose a learning path." };
  }
  let dueAt: string | null = null;
  if (typeof input.dueAt === "string" && input.dueAt.trim() !== "") {
    const parsed = new Date(input.dueAt);
    if (Number.isNaN(parsed.getTime())) return { ok: false, error: "Enter a valid due date." };
    dueAt = parsed.toISOString();
  }
  return {
    ok: true,
    value: {
      scope: input.scope,
      userId: input.scope === "user" ? (input.userId as string) : null,
      contentType: input.contentType,
      courseId: input.contentType === "course" ? (input.courseId as string) : null,
      pathId: input.contentType === "path" ? (input.pathId as string) : null,
      dueAt,
    },
  };
}
