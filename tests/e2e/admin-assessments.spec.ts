import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-408: Assessment oversight (T-136)
test.describe("assessment oversight", () => {
  const svc = serviceClient();
  const tag = uniqueTag("aoe");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    const { data: assessment } = await svc
      .from("assessments")
      .insert({ version_id: course.versionId, title: `${tag} Quiz`, pass_mark: 70 })
      .select("id")
      .single();
    await svc.from("assessment_questions").insert({ assessment_id: assessment!.id, type: "mcq", prompt: `${tag} question`, points: 1 });

    const learner = await createUserWithRole(svc, `${tag}-lrn`, "learner", { fullName: `${tag} Learner` });
    learnerIds.push(learner.id);
    const { data: enrollment } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId, status: "active" })
      .select("id")
      .single();
    await svc.from("assessment_attempts").insert({
      assessment_id: assessment!.id,
      enrollment_id: enrollment!.id,
      user_id: learner.id,
      attempt_number: 1,
      status: "graded",
      percent: 40,
      score: 40,
      max_score: 100,
      passed: false,
      started_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("shows averages, finds an attempt by learner, and resets it (T-136)", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/assessments");
      await expect(page.getByRole("heading", { level: 1, name: "Assessments" })).toBeVisible();
      await expect(page.getByText(`${tag} Quiz`).first()).toBeVisible();

      await page.getByLabel("Search attempts").fill(`${tag} Learner`);
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(page.getByText(`${tag} Learner`).first()).toBeVisible();

      await page.getByRole("button", { name: "Reset attempt" }).click();
      await page.getByRole("button", { name: "Confirm reset" }).click();
      await expect(page.getByText("No attempts match")).toBeVisible();
    } finally {
      await done();
    }
  });
});
