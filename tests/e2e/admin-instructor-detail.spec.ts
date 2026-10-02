import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-403: Admin Instructor Detail (T-132)
test.describe("admin instructor detail", () => {
  const svc = serviceClient();
  const tag = uniqueTag("aidt");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let instructor: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor", { fullName: `${tag} Instructor` });
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    const student = await createUserWithRole(svc, `${tag}-stu`, "learner");
    learnerIds.push(student.id);
    await svc.from("enrollments").insert({ user_id: student.id, course_id: course.courseId, version_id: course.versionId });
    await svc.from("course_ratings").insert({ course_id: course.courseId, user_id: student.id, rating: 4, body: `${tag} solid course` });
    await svc.from("courses").update({ rating_avg: 4, rating_count: 1 }).eq("id", course.courseId);
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("shows courses, rating distribution and an honest revenue-unavailable state (T-132)", async ({ page }) => {
    test.setTimeout(180_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto(`/admin/instructors?q=${tag}`);
      await page.goto("/admin/instructors");
      await page.getByRole("link", { name: `${tag} Instructor` }).click();
      await page.waitForURL(/\/admin\/instructors\/[0-9a-f-]{36}$/);

      await expect(page.getByRole("heading", { level: 1, name: `${tag} Instructor` })).toBeVisible();
      await expect(page.getByText(`${tag} Course`)).toBeVisible();
      await expect(page.getByText("1 learners", { exact: true })).toBeVisible();

      await expect(page.getByRole("heading", { name: "Rating distribution" })).toBeVisible();
      await expect(page.getByText("1 total ratings across all courses")).toBeVisible();

      await expect(page.getByRole("heading", { name: "Revenue", exact: true })).toBeVisible();
      await expect(page.getByText("No revenue data")).toBeVisible();

      await expect(page.getByText("This instructor has not saved payout details yet.")).toBeVisible();
    } finally {
      await done();
    }
  });
});
