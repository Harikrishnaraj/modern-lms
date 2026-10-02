import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

// Question rows render as <p>; the question picker repeats the same text in an <option>.
const questionRow = (page: Page, text: string) =>
  page.locator("p").filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// TEST_PLAN section 10 (F-200...F-210): a new instructor takes a course from nothing to submitted,
// entirely through the UI.
test.describe("instructor journey", () => {
  const svc = serviceClient();
  const tag = uniqueTag("ij");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let instructor: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
  });

  test.afterAll(async () => {
    const { data } = await svc.from("courses").select("id").eq("instructor_id", instructor.id);
    courseIds.push(...(data ?? []).map((c) => c.id as string));
    await cleanup(svc, { courseIds, userIds });
  });

  test("create, build, price, preview, check readiness and submit", async ({ page }) => {
    test.setTimeout(300_000);
    const title = `${tag} Journey Course`;

    // Login, dashboard, create.
    await page.goto("/login");
    await page.getByLabel("Email").fill(instructor.email);
    await page.getByLabel("Password").fill(instructor.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
    await page.goto("/instructor/courses/new");
    await page.waitForLoadState("networkidle");

    // Basics.
    await page.getByLabel("Course title").fill(title);
    await page.getByLabel("Description").fill("A journey course with a description that is comfortably longer than fifty characters.");
    await page.getByLabel("What learners will achieve").fill("Finish the journey\nSubmit a course");
    await page.getByLabel("Category").selectOption({ index: 1 });
    await page.getByLabel("Upload thumbnail").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Create draft and continue" }).click();
    await expect(page).toHaveURL(/\/instructor\/courses\/[0-9a-f-]{36}\/basics/);
    const courseId = page.url().match(/courses\/([0-9a-f-]{36})\//)![1];

    // Readiness is red at this point: nothing to teach yet.
    await page.goto(`/instructor/courses/${courseId}/readiness`);
    await expect(page.getByRole("status").filter({ hasText: /items? needs? your attention/ })).toBeVisible();
    await page.goto(`/instructor/courses/${courseId}/submit`);
    await expect(page.getByText(/not ready to submit yet/)).toBeVisible();

    // Curriculum: one section, a text lesson and a quiz lesson.
    await page.goto(`/instructor/courses/${courseId}/curriculum`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("New section title").fill("Getting started");
    await page.getByRole("button", { name: "Add section" }).click();
    const section = page.getByRole("region", { name: "Getting started" });
    await expect(section).toBeVisible();
    await section.getByLabel("New lesson title").fill("Welcome");
    await section.getByLabel("Type").selectOption({ label: "Text lesson" });
    await section.getByRole("button", { name: /Add lesson/ }).click();
    await expect(section.getByText("Welcome", { exact: true })).toBeVisible();
    await section.getByLabel("New lesson title").fill("Final quiz");
    await section.getByLabel("Type").selectOption({ label: "Quiz" });
    await section.getByRole("button", { name: /Add lesson/ }).click();
    await expect(section.getByText("Final quiz", { exact: true })).toBeVisible();

    // Lesson content.
    await section.getByRole("link", { name: "Edit content of lesson Welcome" }).click();
    await page.waitForLoadState("networkidle");
    const editor = page.getByRole("textbox", { name: "Lesson content" });
    await editor.click();
    await editor.pressSequentially("Welcome to the journey");
    await page.getByRole("button", { name: "Save lesson" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

    // Assessment on the quiz lesson.
    await page.goto(`/instructor/courses/${courseId}/curriculum`);
    await page.getByRole("link", { name: "Edit content of lesson Final quiz" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Create assessment" }).click();
    await expect(page).toHaveURL(/\/assessments\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Add question" }).first().click();
    await page.getByLabel("Question", { exact: true }).fill("Is this a journey?");
    await page.getByLabel("Option 1 text").fill("Yes");
    await page.getByLabel("Option 2 text").fill("No");
    await page.getByLabel("Option 1 is correct").check();
    await page.getByRole("button", { name: "Add question" }).last().click();
    await expect(questionRow(page, "1. Is this a journey?")).toBeVisible();

    // Pricing: paid, then preview.
    await page.goto(`/instructor/courses/${courseId}/pricing`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Paid").check();
    await page.getByPlaceholder("49.99").fill("19.99");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

    await page.getByRole("link", { name: /Next step: Preview/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Welcome" })).toBeVisible();
    await expect(page.getByText("Welcome to the journey")).toBeVisible();

    // Readiness is green, then submit.
    await page.goto(`/instructor/courses/${courseId}/readiness`);
    await expect(page.getByText("Your course is ready to submit for review.")).toBeVisible();
    await page.getByRole("link", { name: /Next step: Submit/ }).click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/Notes for the reviewer/).fill("Ready for a look.");
    await page.getByRole("button", { name: "Submit for review" }).click();
    // Server action + router.refresh() re-renders a query-heavy page; allow for a slow database.
    await expect(page.getByText("Submitted. A reviewer will pick this up soon.")).toBeVisible({ timeout: 30_000 });

    // The overview and My Courses reflect the new state; the course is locked.
    await page.goto(`/instructor/courses/${courseId}`);
    await expect(page.getByText(/is submitted, so it is read-only/)).toBeVisible();
    await page.goto("/instructor/courses?status=review");
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible();
  });
});
