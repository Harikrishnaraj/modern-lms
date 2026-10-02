import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-411: Moderation (T-139)
test.describe("moderation queue", () => {
  const svc = serviceClient();
  const tag = uniqueTag("mode2e");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let threadId: string;

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    const author = await createUserWithRole(svc, `${tag}-auth`, "learner", { fullName: `${tag} Author` });
    learnerIds.push(author.id);
    await svc.from("enrollments").insert({ user_id: author.id, course_id: course.courseId, version_id: course.versionId, status: "active" });

    const { data: thread } = await svc
      .from("discussions")
      .insert({ course_id: course.courseId, author_id: author.id, title: `${tag} thread`, body: "offensive body" })
      .select("id")
      .single();
    threadId = thread!.id;

    const reporter = await createUserWithRole(svc, `${tag}-rep`, "learner");
    learnerIds.push(reporter.id);
    await svc.from("discussion_reports").insert({ reporter_id: reporter.id, target_type: "thread", target_id: threadId, reason: "abusive content" });
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("finds a reported thread and hides it (T-139)", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/moderation");
      await expect(page.getByRole("heading", { level: 1, name: "Moderation" })).toBeVisible();
      await expect(page.getByText(`${tag} thread`)).toBeVisible();
      await expect(page.getByText("abusive content")).toBeVisible();

      // The queue is shared with other runs, so act on and assert about this test's own report only.
      const report = () => page.getByRole("listitem").filter({ hasText: `${tag} thread` });
      await report().getByRole("button", { name: "Hide" }).click();
      await expect(report()).toHaveCount(0);

      await page.getByRole("link", { name: "Resolved" }).click();
      await expect(report()).toBeVisible();
      await expect(report().getByText("Hidden")).toBeVisible();
    } finally {
      await done();
    }
  });
});
