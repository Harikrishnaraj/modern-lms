import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-409: Certificate administration (T-137)
test.describe("certificate administration", () => {
  const svc = serviceClient();
  const tag = uniqueTag("cae");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    const learner = await createUserWithRole(svc, `${tag}-lrn`, "learner", { fullName: `${tag} Learner` });
    learnerIds.push(learner.id);
    const { data: enrollment } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId, status: "completed" })
      .select("id")
      .single();
    await svc.from("certificates").insert({
      enrollment_id: enrollment!.id,
      user_id: learner.id,
      course_id: course.courseId,
      version_id: course.versionId,
      learner_name: `${tag} Learner`,
      course_title: `${tag} Course`,
    });
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("finds a certificate, revokes it with a reason, and reissues it (T-137)", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/certificates");
      await expect(page.getByRole("heading", { level: 1, name: "Certificates" })).toBeVisible();

      await page.getByLabel("Search certificates").fill(`${tag} Learner`);
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(page.getByText(`${tag} Learner`).first()).toBeVisible();

      await page.getByRole("button", { name: "Revoke", exact: true }).click();
      await page.getByLabel("Reason for revoking").fill("Academic integrity violation");
      await page.getByRole("button", { name: "Confirm revoke" }).click();
      await expect(page.getByRole("table").getByText("Revoked")).toBeVisible();
      await expect(page.getByText("Academic integrity violation")).toBeVisible();

      await page.getByRole("button", { name: "Reissue", exact: true }).click();
      await page.getByRole("button", { name: "Confirm reissue" }).click();
      await expect(page.getByText(/Reissued as MLC-/)).toBeVisible();
    } finally {
      await done();
    }
  });
});
