import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-407: Enrollments & cohorts (T-135)
test.describe("enrollments & cohorts", () => {
  const svc = serviceClient();
  const tag = uniqueTag("ece");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let learner: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;

  test.beforeAll(async () => {
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner", { fullName: `${tag} Learner` });
    learnerIds.push(learner.id);
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);
  });

  test.afterAll(async () => {
    const { data: cohorts } = await svc.from("cohorts").select("id").like("name", `${tag}%`);
    await svc.from("cohorts").delete().in("id", (cohorts ?? []).map((c) => c.id));
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("manually enrolls a learner, creates a cohort, adds a member, and bulk-enrolls (T-135)", async ({ page }) => {
    test.setTimeout(180_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/enrollments");
      await expect(page.getByRole("heading", { level: 1, name: "Enrollments" })).toBeVisible();

      // 1. Manual enroll.
      await page.getByPlaceholder("Search learner by name or email…").fill(`${tag} Learner`);
      await page.getByRole("button", { name: `${tag} Learner` }).click();
      await page.getByLabel("Course to enroll in").selectOption({ label: `${tag} Course` });
      await page.getByRole("button", { name: "Enroll", exact: true }).click();
      await expect(page.getByText("Enrolled.")).toBeVisible();

      // 2. Create a cohort.
      await page.getByPlaceholder("Spring 2026 interns").fill(`${tag} Cohort`);
      await page.getByRole("button", { name: "Create cohort" }).click();
      await expect(page.getByRole("link", { name: `${tag} Cohort` })).toBeVisible();

      // 3. Open the cohort and add the learner.
      await page.getByRole("link", { name: `${tag} Cohort` }).click();
      await page.waitForURL(/\/admin\/enrollments\/cohorts\/[0-9a-f-]{36}$/);
      await page.getByPlaceholder("Search learner by name or email…").fill(`${tag} Learner`);
      await page.getByRole("button", { name: `${tag} Learner` }).click();
      await page.getByRole("button", { name: "Add to cohort" }).click();
      await expect(page.getByText("Members (1)")).toBeVisible();

      // 4. Bulk-enroll the cohort.
      await page.getByLabel("Course").selectOption({ label: `${tag} Course` });
      await page.getByRole("button", { name: "Enroll every member" }).click();
      await expect(page.getByText("Enrolled 1 of 1 members.")).toBeVisible();
    } finally {
      await done();
    }
  });
});
