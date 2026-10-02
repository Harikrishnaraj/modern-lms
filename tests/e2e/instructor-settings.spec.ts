import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-220: Instructor Settings (T-112)
test.describe("instructor settings", () => {
  const svc = serviceClient();
  const tag = uniqueTag("insettings");
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
      title: `${tag} Practical Design`,
      publish: true,
    });
    courseIds.push(course.courseId);
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds: [], courseIds, userIds });
  });

  test("saves a public profile and payout details, and the profile shows on the published course (T-112)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    await page.goto("/instructor/settings");
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

    // 1. Public profile.
    await page.getByLabel("Headline").fill("Lead Instructor");
    await page.getByLabel("Bio").fill("I teach practical, hands-on design courses.");
    await page.getByRole("button", { name: "Save public profile" }).click();
    await expect(page.getByText("Public profile saved.")).toBeVisible();

    // 2. Payout details.
    await page.getByLabel("Payout method").selectOption("paypal");
    await page.getByLabel("Payout reference").fill("teacher@example.com");
    await page.getByRole("button", { name: "Save payout details" }).click();
    await expect(page.getByText("Payout details saved.")).toBeVisible();

    // 3. Reload: both sections persist.
    await page.reload();
    await expect(page.getByLabel("Headline")).toHaveValue("Lead Instructor");
    await expect(page.getByLabel("Bio")).toHaveValue("I teach practical, hands-on design courses.");
    await expect(page.getByLabel("Payout method")).toHaveValue("paypal");
    await expect(page.getByLabel("Payout reference")).toHaveValue("teacher@example.com");

    // 4. The public profile shows on the published course page.
    await page.goto(`/courses/${tag}-course`);
    await expect(page.getByRole("heading", { name: "About the instructor" })).toBeVisible();
    await expect(page.getByText("Lead Instructor")).toBeVisible();
    await expect(page.getByText("I teach practical, hands-on design courses.")).toBeVisible();
  });
});
