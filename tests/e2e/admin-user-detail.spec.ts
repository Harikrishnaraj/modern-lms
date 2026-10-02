import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-402: Admin User Detail (T-130) — account, roles, progress, skills, login history, actions.
test.describe("admin user detail", () => {
  const svc = serviceClient();
  const tag = uniqueTag("aud");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let target: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;

  test.beforeAll(async () => {
    target = await createUserWithRole(svc, `${tag}-target`, "learner", { fullName: `${tag} Target Learner` });
    learnerIds.push(target.id);

    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      publish: true,
      sections: [{ title: "S", lessons: [{ title: "L1", minutes: 15 }] }],
    });
    courseIds.push(course.courseId);

    const { data: enr } = await svc
      .from("enrollments")
      .insert({ user_id: target.id, course_id: course.courseId, version_id: course.versionId })
      .select("id")
      .single();
    await svc.from("lesson_progress").insert({
      enrollment_id: enr!.id,
      lesson_id: course.lessonIds[0],
      completed_at: new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("shows account, progress, skills and login history, and lets the admin act on the user (T-130)", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);

    // The target logs in once through the UI first, so a real login-history row exists.
    await page.goto("/login");
    await page.getByLabel("Email").fill(target.email);
    await page.getByLabel("Password").fill(target.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
    await context.clearCookies();

    const done = await loginAsRole(page, "admin");
    try {
      await page.goto(`/admin/users?q=${tag}-target`);
      await page.waitForLoadState("networkidle");
      await page.getByRole("link", { name: `${tag} Target Learner` }).click();
      await page.waitForURL(/\/admin\/users\/[0-9a-f-]{36}$/);

      await expect(page.getByRole("heading", { level: 1, name: `${tag} Target Learner` })).toBeVisible();

      // Account panel.
      await expect(page.getByText("Learner", { exact: true })).toBeVisible();

      // Progress: the completed lesson shows up.
      await expect(page.getByText("15 min")).toBeVisible();
      await expect(page.getByText(`${tag} Course`)).toBeVisible();
      await expect(page.getByText("1/1 · 100%")).toBeVisible();

      // Login history: at least one recorded sign-in.
      await expect(page.getByRole("list", { name: "Login history" }).getByRole("listitem").first()).toBeVisible();

      // Actions: suspend the user from the detail page.
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: `Suspend ${target.email}` }).click();
      await page.getByRole("button", { name: `Confirm suspend ${target.email}` }).click();
      await expect(page.getByText("Suspended", { exact: true })).toBeVisible();
    } finally {
      await done();
    }
  });
});
