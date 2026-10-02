"use server";

import { revalidatePath } from "next/cache";
import { getDailyAnalytics } from "./analytics";
import { buildReportCsv, computeNextRunAt, validateReportName, type ReportSchedule } from "./reports";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { REPORT_EXPORT_BUCKET, supabaseStorage } from "@/services/storage";

export type ReportActionResult = { ok: true } | { ok: false; error: string };
export type RunReportResult = { ok: true; url: string } | { ok: false; error: string };

const RANGE_VALUES = [7, 30, 90];
const SCHEDULE_VALUES: ReportSchedule[] = ["none", "daily", "weekly", "monthly"];

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await can(supabase, user.id, "analytics.read"))) return null;
  return { supabase, user };
}

export async function createSavedReportAction(input: { name: string; rangeDays: number; schedule: string }): Promise<ReportActionResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  const name = validateReportName(input.name);
  if (!name.ok) return name;
  if (!RANGE_VALUES.includes(input.rangeDays)) return { ok: false, error: "Choose a valid date range." };
  if (!SCHEDULE_VALUES.includes(input.schedule as ReportSchedule)) return { ok: false, error: "Choose a valid schedule." };
  const schedule = input.schedule as ReportSchedule;
  const nextRunAt = computeNextRunAt(schedule, new Date());

  const { error } = await ctx.supabase.from("saved_reports").insert({
    owner_id: ctx.user.id,
    name: name.value,
    range_days: input.rangeDays,
    schedule,
    next_run_at: nextRunAt ? nextRunAt.toISOString() : null,
  });
  if (error) return { ok: false, error: "We could not save that report. Please try again." };
  revalidatePath("/admin/analytics");
  return { ok: true };
}

export async function deleteSavedReportAction(reportId: string): Promise<ReportActionResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  const { error } = await ctx.supabase.from("saved_reports").delete().eq("id", reportId).eq("owner_id", ctx.user.id);
  if (error) return { ok: false, error: "We could not delete that report. Please try again." };
  revalidatePath("/admin/analytics");
  return { ok: true };
}

/** Generates the CSV right now (manual trigger) and returns a short-lived download link. */
export async function runReportNowAction(reportId: string): Promise<RunReportResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };

  const { data: report } = await ctx.supabase
    .from("saved_reports")
    .select("id, range_days")
    .eq("id", reportId)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();
  if (!report) return { ok: false, error: "That report is not available." };

  const points = await getDailyAnalytics(ctx.supabase, report.range_days as number);
  const csv = buildReportCsv(points);
  const path = `${ctx.user.id}/${reportId}/${Date.now()}.csv`;
  await supabaseStorage.upload(REPORT_EXPORT_BUCKET, path, new TextEncoder().encode(csv), "text/csv");

  const { error } = await ctx.supabase.from("report_exports").insert({
    saved_report_id: reportId,
    storage_path: path,
    row_count: points.length,
    triggered_by: "manual",
  });
  if (error) return { ok: false, error: "We could not record that export. Please try again." };

  const url = await supabaseStorage.createSignedUrl(REPORT_EXPORT_BUCKET, path, 300);
  revalidatePath("/admin/analytics");
  return { ok: true, url };
}

/** A fresh short-lived download link for a past export. */
export async function getExportDownloadUrlAction(exportId: string): Promise<RunReportResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  const { data } = await ctx.supabase
    .from("report_exports")
    .select("storage_path, saved_reports!inner(owner_id)")
    .eq("id", exportId)
    .eq("saved_reports.owner_id", ctx.user.id)
    .maybeSingle();
  if (!data) return { ok: false, error: "That export is not available." };
  const url = await supabaseStorage.createSignedUrl(REPORT_EXPORT_BUCKET, data.storage_path as string, 300);
  return { ok: true, url };
}
