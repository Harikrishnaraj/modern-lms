import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-219: Instructor Resource Library (T-111)
test.describe("instructor resource library", () => {
  const svc = serviceClient();
  const tag = uniqueTag("inres");
  const userIds: string[] = [];
  const courseIds: string[] = [];

  let teacher: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;

  test.beforeAll(async () => {
    teacher = await createUserWithRole(svc, `${tag}-tch`, "instructor", {
      fullName: `${tag} Teacher`,
    });
    userIds.push(teacher.id);

    course = await createCourse(svc, teacher.id, {
      slug: `${tag}-course`,
      title: `${tag} Practical Systems`,
      // Attaching changes the lesson, so the course must be an editable draft (published ones are locked).
      publish: false,
      sections: [{ title: "Getting started", lessons: [{ title: "Welcome" }] }],
    });
    courseIds.push(course.courseId);
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds: [], courseIds, userIds });
  });

  test("uploads a resource and attaches it to a lesson (T-111)", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    await page.goto("/instructor/resources");
    await expect(page.getByRole("heading", { level: 1, name: "Resources" })).toBeVisible();
    await expect(page.getByText("No resources yet")).toBeVisible();

    // 1. Upload a resource.
    await page
      .getByLabel("Upload a resource")
      .setInputFiles({ name: "sample.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e resource") });

    const resourceCard = page.locator("li").filter({ hasText: "sample.pdf" });
    await expect(resourceCard).toBeVisible({ timeout: 30_000 });
    await expect(resourceCard.getByText("Used in 0 lessons")).toBeVisible();

    // 2. Attach it to the seeded lesson.
    await resourceCard.getByLabel("Course").selectOption({ label: `${tag} Practical Systems` });
    await expect(resourceCard.getByLabel("Lesson")).toBeEnabled();
    await resourceCard.getByLabel("Lesson").selectOption({ label: "Getting started · Welcome" });
    await resourceCard.getByRole("button", { name: "Attach" }).click();
    await expect(resourceCard.getByText("Attached to the lesson.")).toBeVisible();

    // 3. Usage count updates after a reload.
    await page.reload();
    await expect(page.locator("li").filter({ hasText: "sample.pdf" }).getByText("Used in 1 lesson")).toBeVisible();

    // 4. Deleting an in-use resource is refused (after the "cannot be undone" confirm, which
    //    Playwright would otherwise dismiss).
    page.once("dialog", (d) => void d.accept());
    await page.locator("li").filter({ hasText: "sample.pdf" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(/attached to a lesson/i)).toBeVisible();
  });
});
