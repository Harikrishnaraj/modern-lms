import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-503: Organization reports -- completion/overdue/hours + CSV export (T-164)
test.describe("organization report export", () => {
  const svc = serviceClient();
  const tag = uniqueTag("orep");
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  test.afterAll(async () => {
    if (orgIds.length) await svc.from("organizations").delete().in("id", orgIds);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("a platform admin exports an organization's report as CSV", async ({ page }) => {
    test.setTimeout(180_000);
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Report Course`, publish: true });
    courseIds.push(course.courseId);

    const { data: org } = await svc.from("organizations").insert({ name: `${tag} Org`, slug: `${tag}-org` }).select("id").single();
    orgIds.push(org!.id);
    await svc.from("assigned_learning").insert({ organization_id: org!.id, scope: "organization", content_type: "course", course_id: course.courseId, due_at: null });

    const done = await loginAsRole(page, "admin");
    try {
      const res = await page.request.get(`/admin/organizations/${org!.id}/report/export`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/csv");
      expect(res.headers()["content-disposition"]).toContain("attachment");
      const csv = await res.text();
      expect(csv).toContain('"total_learning_hours"');
      expect(csv).toContain(`${tag} Report Course`);
    } finally {
      await done();
    }
  });

  test("an org admin can only export their own organization's report", async ({ page }) => {
    const { data: orgA } = await svc.from("organizations").insert({ name: `${tag} A`, slug: `${tag}-a` }).select("id").single();
    const { data: orgB } = await svc.from("organizations").insert({ name: `${tag} B`, slug: `${tag}-b` }).select("id").single();
    orgIds.push(orgA!.id, orgB!.id);

    const done = await loginAsRole(page, "org_admin");
    try {
      await svc.from("organization_members").insert({ organization_id: orgA!.id, user_id: done.userId, org_role: "org_admin" });
      await done.login();

      const own = await page.request.get("/org_admin/report/export");
      expect(own.status()).toBe(200);
      expect((await own.text())).toContain(`${tag} A`);

      // The admin console's export route is fully off limits to an org admin -- the proxy itself
      // redirects before the route handler (which would otherwise 403 on the permission check)
      // ever runs, since org_admin holds no portal.admin.access at all.
      const other = await page.request.get(`/admin/organizations/${orgB!.id}/report/export`, { maxRedirects: 0 });
      expect([302, 307, 308]).toContain(other.status());
    } finally {
      await done();
    }
  });
});
