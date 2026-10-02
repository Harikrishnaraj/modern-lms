import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-218: Instructor Certificates (T-110)
test.describe("instructor certificates", () => {
  const svc = serviceClient();
  const tag = uniqueTag("incert");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let teacher: { id: string; email: string; password: string };
  let teacherEmpty: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let student: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    teacher = await createUserWithRole(svc, `${tag}-tch`, "instructor", {
      fullName: `${tag} Teacher`,
    });
    teacherEmpty = await createUserWithRole(svc, `${tag}-tchemp`, "instructor", {
      fullName: `${tag} Empty Teacher`,
    });
    userIds.push(teacher.id, teacherEmpty.id);

    student = await createUserWithRole(svc, `${tag}-s1`, "learner", {
      fullName: `${tag} Alice Learner`,
    });
    learnerIds.push(student.id);

    course = await createCourse(svc, teacher.id, {
      slug: `${tag}-course`,
      title: `${tag} Distributed Systems`,
      publish: true,
    });
    courseIds.push(course.courseId);

    const { data: enr } = await svc
      .from("enrollments")
      .insert({
        user_id: student.id,
        course_id: course.courseId,
        version_id: course.versionId,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    await svc.from("certificates").insert({
      enrollment_id: enr!.id,
      user_id: student.id,
      course_id: course.courseId,
      version_id: course.versionId,
      learner_name: `${tag} Alice Learner`,
      course_title: `${tag} Distributed Systems`,
      instructor_name: `${tag} Teacher`,
    });
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("empty state for teacher with no courses", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacherEmpty.email);
    await page.getByLabel("Password").fill(teacherEmpty.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    await page.goto("/instructor/certificates");
    await expect(page.getByRole("heading", { level: 1, name: "Certificates" })).toBeVisible();
    await expect(page.getByText("No courses yet")).toBeVisible();
  });

  test("shows the issued certificate list and lets the instructor save a template (T-110)", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    await page.goto("/instructor/certificates");
    await expect(page.getByRole("heading", { level: 1, name: "Certificates" })).toBeVisible();

    // 1. Issued list shows the seeded certificate.
    await expect(page.getByRole("heading", { name: "Issued certificates" })).toBeVisible();
    await expect(page.getByText(`${tag} Alice Learner`)).toBeVisible();
    // The course name also fills the course pickers' <option>s; the issued row shows it as text.
    await expect(page.getByRole("paragraph").filter({ hasText: `${tag} Distributed Systems` })).toBeVisible();
    await expect(page.getByText("Valid")).toBeVisible();

    // 2. Template settings: fill and save.
    await expect(page.getByRole("heading", { name: "Certificate template" })).toBeVisible();
    const signatureInput = page.getByLabel("Signature title");
    await signatureInput.fill("Lead Instructor");
    const closingInput = page.getByLabel("Closing message");
    await closingInput.fill("Keep building great things.");

    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText("Template saved.")).toBeVisible();

    // 3. Reload: the saved template persists.
    await page.reload();
    await expect(page.getByLabel("Signature title")).toHaveValue("Lead Instructor");
    await expect(page.getByLabel("Closing message")).toHaveValue("Keep building great things.");
  });
});
