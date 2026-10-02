import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createSavedReportAction, deleteSavedReportAction, runReportNowAction } from "@/features/admin/report-actions";
import { getReportExports, getSavedReports } from "@/features/admin/reports";
import { REPORT_EXPORT_BUCKET } from "@/services/storage";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-412: Platform analytics — saved reports and scheduled export (T-140), live Supabase.
describe.skipIf(!hasLiveProject)("admin saved reports (T-140, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("rep");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const savedReportIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let plainLearner: { id: string; client: SupabaseClient };

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    plainLearner = await user("plain", "learner");
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);
  }, 200_000);

  afterAll(async () => {
    if (savedReportIds.length) await svc.from("saved_reports").delete().in("id", savedReportIds);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("rejects creating a saved report from a non-admin", async () => {
    currentClient = plainLearner.client;
    const res = await createSavedReportAction({ name: `${tag} Report`, rangeDays: 30, schedule: "none" });
    expect(res.ok).toBe(false);
  });

  it("creates, lists and deletes a saved report", async () => {
    currentClient = admin.client;
    const created = await createSavedReportAction({ name: `${tag} Manual`, rangeDays: 7, schedule: "none" });
    expect(created).toEqual({ ok: true });

    const reports = await getSavedReports(admin.client);
    const found = reports.find((r) => r.name === `${tag} Manual`)!;
    expect(found).toMatchObject({ rangeDays: 7, schedule: "none", nextRunAt: null });
    savedReportIds.push(found.id);

    const deleted = await deleteSavedReportAction(found.id);
    expect(deleted).toEqual({ ok: true });
    savedReportIds.splice(savedReportIds.indexOf(found.id), 1);
    expect((await getSavedReports(admin.client)).some((r) => r.id === found.id)).toBe(false);
  });

  it("sets next_run_at when a schedule is chosen", async () => {
    currentClient = admin.client;
    await createSavedReportAction({ name: `${tag} Weekly`, rangeDays: 30, schedule: "weekly" });
    const reports = await getSavedReports(admin.client);
    const found = reports.find((r) => r.name === `${tag} Weekly`)!;
    savedReportIds.push(found.id);
    expect(found.nextRunAt).not.toBeNull();
    expect(new Date(found.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("runs a report now, storing a CSV export and returning a download link", async () => {
    currentClient = admin.client;
    const reports = await getSavedReports(admin.client);
    const found = reports.find((r) => r.name === `${tag} Weekly`)!;

    const result = await runReportNowAction(found.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toContain("http");

    const exportsList = await getReportExports(admin.client, found.id);
    expect(exportsList.length).toBeGreaterThanOrEqual(1);
    expect(exportsList[0]).toMatchObject({ triggeredBy: "manual" });

    const { data } = await svc.storage.from(REPORT_EXPORT_BUCKET).download(exportsList[0].storagePath);
    const text = await data!.text();
    expect(text.split("\n")[0]).toBe("day,enrollments,completions,signups");
  });

  it("does not let one admin read another admin's saved reports", async () => {
    const other = await user("other", "admin");
    const reports = await getSavedReports(other.client);
    expect(reports.some((r) => r.name.startsWith(tag))).toBe(false);
  });
});
