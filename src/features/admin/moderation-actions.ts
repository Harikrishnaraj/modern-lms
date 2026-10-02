"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import type { ReportKind } from "./moderation";

export type ModerationActionResult = { ok: true } | { ok: false; error: string };

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Hides or restores the reported content, and resolves the report that surfaced it. */
export async function moderateContentAction(
  reportId: string,
  kind: ReportKind,
  targetId: string,
  hidden: boolean,
): Promise<ModerationActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.rpc("admin_moderate_content", { p_kind: kind, p_target_id: targetId, p_hidden: hidden });
  if (error) return { ok: false, error: error.message };

  await supabase.rpc("admin_resolve_report", { p_report_kind: kind, p_report_id: reportId });

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: hidden ? "moderation.content_hidden" : "moderation.content_restored",
    resourceType: kind,
    resourceId: targetId,
    metadata: { reportId },
  });

  revalidatePath("/admin/moderation");
  return { ok: true };
}

/** Dismisses a report without touching the content (admin decided it is not a violation). */
export async function dismissReportAction(reportId: string, kind: ReportKind): Promise<ModerationActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.rpc("admin_resolve_report", { p_report_kind: kind, p_report_id: reportId });
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "moderation.report_dismissed",
    resourceType: kind,
    resourceId: reportId,
  });

  revalidatePath("/admin/moderation");
  return { ok: true };
}
