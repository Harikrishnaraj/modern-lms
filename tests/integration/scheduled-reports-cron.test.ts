import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { GET } from "@/app/api/cron/scheduled-reports/route";
import { REPORT_EXPORT_BUCKET } from "@/services/storage";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function request(auth?: string) {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new NextRequest("http://localhost/api/cron/scheduled-reports", { headers });
}

// F-412: scheduled report export cron route (T-140), live Supabase.
describe.skipIf(!hasLiveProject)("scheduled reports cron (T-140, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("cronrep");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let savedReportId: string;
  let priorSecret: string | undefined;

  beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);
    const admin = await createUserWithRole(svc, `${tag}-adm`, "admin");
    userIds.push(admin.id);

    const past = new Date(Date.now() - 60_000).toISOString();
    const { data } = await svc
      .from("saved_reports")
      .insert({ owner_id: admin.id, name: `${tag} Due`, range_days: 7, schedule: "daily", next_run_at: past })
      .select("id")
      .single();
    savedReportId = data!.id;
  }, 200_000);

  beforeEach(() => {
    priorSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = priorSecret;
  });

  afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }), 120_000);

  it("rejects a request with no or wrong secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
  });

  it("processes the due report, records an export and advances next_run_at", async () => {
    const res = await GET(request("Bearer test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBeGreaterThanOrEqual(1);

    const { data: exportsRows } = await svc.from("report_exports").select("storage_path, triggered_by").eq("saved_report_id", savedReportId);
    expect(exportsRows).toHaveLength(1);
    expect(exportsRows![0].triggered_by).toBe("scheduled");

    const { data: report } = await svc.from("saved_reports").select("next_run_at").eq("id", savedReportId).single();
    expect(new Date(report!.next_run_at).getTime()).toBeGreaterThan(Date.now());

    const { data: file } = await svc.storage.from(REPORT_EXPORT_BUCKET).download(exportsRows![0].storage_path);
    expect(file).not.toBeNull();
  });

  it("does not reprocess a report whose next_run_at is now in the future", async () => {
    const res = await GET(request("Bearer test-cron-secret"));
    const body = await res.json();
    const { data: exportsRows } = await svc.from("report_exports").select("id").eq("saved_report_id", savedReportId);
    expect(exportsRows).toHaveLength(1); // still just the one from the previous run
    expect(body.processed).toBe(0);
  });
});
