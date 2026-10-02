import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyPoint, Range } from "./analytics";

export type ReportSchedule = "none" | "daily" | "weekly" | "monthly";

export interface SavedReport {
  id: string;
  name: string;
  rangeDays: Range;
  schedule: ReportSchedule;
  nextRunAt: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  name: string;
  range_days: Range;
  schedule: ReportSchedule;
  next_run_at: string | null;
  created_at: string;
}

export async function getSavedReports(supabase: SupabaseClient): Promise<SavedReport[]> {
  const { data, error } = await supabase.from("saved_reports").select("id, name, range_days, schedule, next_run_at, created_at").order("created_at", { ascending: false });
  if (error) throw new Error(`saved_reports failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    rangeDays: r.range_days,
    schedule: r.schedule,
    nextRunAt: r.next_run_at,
    createdAt: r.created_at,
  }));
}

export interface ReportExport {
  id: string;
  generatedAt: string;
  storagePath: string;
  rowCount: number;
  triggeredBy: "manual" | "scheduled";
}

interface ExportRow {
  id: string;
  generated_at: string;
  storage_path: string;
  row_count: number;
  triggered_by: "manual" | "scheduled";
}

export async function getReportExports(supabase: SupabaseClient, savedReportId: string): Promise<ReportExport[]> {
  const { data, error } = await supabase
    .from("report_exports")
    .select("id, generated_at, storage_path, row_count, triggered_by")
    .eq("saved_report_id", savedReportId)
    .order("generated_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`report_exports failed: ${error.message}`);
  return ((data ?? []) as ExportRow[]).map((r) => ({
    id: r.id,
    generatedAt: r.generated_at,
    storagePath: r.storage_path,
    rowCount: r.row_count,
    triggeredBy: r.triggered_by,
  }));
}

export function validateReportName(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter a report name." };
  const value = input.trim();
  if (value === "") return { ok: false, error: "Enter a report name." };
  if (value.length > 150) return { ok: false, error: "Keep the name under 150 characters." };
  return { ok: true, value };
}

/** Next run time for a schedule, from a given moment. `null` for "none". */
export function computeNextRunAt(schedule: ReportSchedule, from: Date): Date | null {
  if (schedule === "none") return null;
  const next = new Date(from);
  if (schedule === "daily") next.setUTCDate(next.getUTCDate() + 1);
  else if (schedule === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function escapeCsv(value: string | number | null): string {
  if (value === null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) return `"${str.replaceAll('"', '""')}"`;
  return str;
}

/** CSV of the daily analytics points behind a saved report (matches what /admin/analytics shows). */
export function buildReportCsv(points: DailyPoint[]): string {
  const header = "day,enrollments,completions,signups";
  const rows = points.map((p) => [p.day, p.enrollments, p.completions, p.signups].map(escapeCsv).join(","));
  return [header, ...rows].join("\n");
}
