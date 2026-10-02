import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-412: the analytics screen charts real enrollments and completions and respects permissions.
test.describe("admin analytics", () => {
  const svc = serviceClient();
  const tag = uniqueTag("aa");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    const learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    userIds.push(instructor.id);
    learnerIds.push(learner.id);
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-c`, title: `${tag} Trending`, publish: true });
    courseIds.push(c.courseId);
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: c.courseId, version_id: c.versionId, status: "completed", completed_at: new Date().toISOString() });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("shows totals, the chart with its data table, top courses, and switches range", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/analytics");
      await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
      await expect(page.getByText("Platform activity over the last 30 days.")).toBeVisible();

      const totals = page.getByLabel("Totals for the range");
      for (const label of ["Enrollments", "Completions", "Completion rate", "New sign-ups"]) {
        await expect(totals.getByText(label, { exact: true })).toBeVisible();
      }
      await expect(page.getByRole("img", { name: /Daily enrollments and completions/ })).toBeVisible();

      // The numbers are available as a table.
      await page.getByText("View the numbers").click();
      const table = page.getByRole("table", { name: "Daily platform activity" });
      await expect(table.getByRole("row")).toHaveCount(31); // header + 30 days

      // The project is shared, so busier courses may push ours out of the top five; ranking itself is
      // proven in tests/integration/admin-analytics.test.ts. Here: real rows, at most five, in order.
      const top = page.getByRole("list", { name: "Most enrolled courses" }).getByRole("listitem");
      await expect(top.first()).toBeVisible();
      const rows = await top.allInnerTexts();
      expect(rows.length).toBeLessThanOrEqual(5);
      const counts = rows.map((r) => Number(/(\d+) enrolled/.exec(r)?.[1]));
      expect(counts.every((n) => n >= 1)).toBe(true);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
      if (rows.length < 5) expect(rows.some((r) => r.includes(`${tag} Trending`))).toBe(true);

      await page.getByRole("navigation", { name: "Date range" }).getByRole("link", { name: "7 days" }).click();
      await expect(page).toHaveURL(/range=7/);
      await expect(page.getByText("Platform activity over the last 7 days.")).toBeVisible();
      await page.locator("details").evaluate((d) => ((d as HTMLDetailsElement).open = true));
      await expect(page.getByRole("table", { name: "Daily platform activity" }).getByRole("row")).toHaveCount(8);
    } finally {
      await done();
    }
  });

  test("a support agent is told they cannot view analytics", async ({ page }) => {
    const done = await loginAsRole(page, "support_agent");
    try {
      await page.goto("/admin/analytics");
      await expect(page.getByText("You cannot view analytics")).toBeVisible();
      await expect(page.getByRole("img", { name: /Daily enrollments/ })).toHaveCount(0);
    } finally {
      await done();
    }
  });
});
