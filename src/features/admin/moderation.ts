import type { SupabaseClient } from "@supabase/supabase-js";

export const MODERATION_PAGE_SIZE = 25;

export type ReportKind = "thread" | "post" | "review";
export type ReportStatus = "open" | "resolved";

export interface ModerationReport {
  reportId: string;
  reportKind: ReportKind;
  reporterName: string | null;
  reporterEmail: string | null;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  targetId: string;
  targetHidden: boolean;
  targetSnippet: string;
  authorId: string;
  authorName: string | null;
  courseId: string;
  courseTitle: string;
}

interface Row {
  report_id: string;
  report_kind: ReportKind;
  reporter_name: string | null;
  reporter_email: string | null;
  reason: string;
  status: ReportStatus;
  created_at: string;
  target_id: string;
  target_hidden: boolean;
  target_snippet: string | null;
  author_id: string;
  author_name: string | null;
  course_id: string;
  course_title: string;
  total: number | string;
}

/** The moderation queue (reported discussion threads/posts and reviews). Requires course.read_all. */
export async function getModerationQueue(
  supabase: SupabaseClient,
  status: ReportStatus | "",
  page: number,
): Promise<{ reports: ModerationReport[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_moderation_queue", {
    p_status: status,
    p_limit: MODERATION_PAGE_SIZE,
    p_offset: (page - 1) * MODERATION_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_moderation_queue failed: ${error.message}`);
  const rows = (data ?? []) as Row[];
  return {
    reports: rows.map((r) => ({
      reportId: r.report_id,
      reportKind: r.report_kind,
      reporterName: r.reporter_name,
      reporterEmail: r.reporter_email,
      reason: r.reason,
      status: r.status,
      createdAt: r.created_at,
      targetId: r.target_id,
      targetHidden: r.target_hidden,
      targetSnippet: r.target_snippet ?? "",
      authorId: r.author_id,
      authorName: r.author_name,
      courseId: r.course_id,
      courseTitle: r.course_title,
    })),
    total: rows[0] ? Number(rows[0].total) : 0,
  };
}
