import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// T-114 / F-206 / ADR-030: the instructor Assignments page — assign to a live course, see it in
// the all-course table, and the enrolled learner sees it with the rich-text brief and file types.
test.describe("instructor assignments page", () => {
  const svc = serviceClient();
  const tag = uniqueTag("ahe");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let instructor: { id: string; email: string; password: string };
  let learner: { id: string; email: string; password: string };
  let c: Awaited<ReturnType<typeof createCourse>>;

  async function signIn(page: Page, u: { email: string; password: string }, landing: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(landing);
  }

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    userIds.push(instructor.id);
    learnerIds.push(learner.id);
    c = await createCourse(svc, instructor.id, { slug: `${tag}-c`, title: `${tag} Data Science`, publish: true });
    courseIds.push(c.courseId);
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: c.courseId, version_id: c.versionId });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("assigns work to a live course without a due date; the table and the learner show it", async ({ page, browser, isMobile }) => {
    test.setTimeout(240_000);
    await signIn(page, instructor, "/instructor");
    // On phones the sidebar lives behind the menu button.
    if (isMobile) await page.getByRole("button", { name: "Open navigation" }).click();
    const nav = isMobile ? page.getByRole("dialog", { name: "Navigation" }) : page.getByRole("complementary");
    await nav.getByRole("link", { name: "Assignments" }).click();
    await page.waitForURL("/instructor/assignments");
    await expect(page.getByRole("heading", { name: "Assign New Assignment" })).toBeVisible();
    await expect(page.getByText("No assignments yet")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Validation: nothing filled in.
    await page.getByRole("button", { name: "Assign Assignment" }).click();
    await expect(page.getByText("Choose a course.")).toBeVisible();
    await expect(page.getByText("Describe what learners should hand in.")).toBeVisible();

    await page.getByLabel("Course *").selectOption({ label: `${tag} Data Science` });
    await expect(page.getByText(/This course is live/)).toBeVisible();
    await expect(page.getByText("Choose a course.")).toHaveCount(0);
    await page.getByLabel("Assignment Title *").fill(`${tag} Research Paper`);
    const editor = page.getByRole("textbox", { name: "Description" });
    await editor.click();
    await page.getByRole("button", { name: "Bold" }).click();
    await page.keyboard.type("Write 2,000 words");
    await page.getByLabel("Points").fill("100");
    await expect(page.getByText("PDF, DOC, DOCX", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Assign Assignment" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Enrolled learners can see it now." })).toBeVisible();

    const table = page.getByRole("table");
    const row = table.getByRole("row", { name: new RegExp(`${tag} Research Paper`) });
    await expect(row).toContainText("No deadline");
    await expect(row).toContainText("Active");
    await expect(row).toContainText("0 / 1");
    await page.getByLabel("Search assignments").fill("no-such-thing");
    await expect(page.getByText(/No assignments match/)).toBeVisible();
    await page.getByLabel("Search assignments").fill("research");
    await expect(row).toBeVisible();
    // Live assignments are locked for editing (ADR-011/030).
    await expect(row.getByRole("button", { name: /is locked while the course is live/ })).toBeDisabled();

    const lctx = await browser.newContext();
    const lp = await lctx.newPage();
    await signIn(lp, learner, "/learner");
    await lp.goto("/learner/assignments");
    await lp.getByRole("link", { name: `${tag} Research Paper` }).click();
    await lp.waitForURL(/\/learner\/assignments\/[0-9a-f-]{36}$/);
    await expect(lp.locator("strong", { hasText: "Write 2,000 words" })).toBeVisible();
    await expect(lp.getByText(/PDF, DOC or DOCX, up to \d+ MB/)).toBeVisible();
    await lctx.close();

    await row.getByRole("link", { name: /View submissions/ }).click();
    await page.waitForURL(/\/instructor\/grading\?assignment=/);
    await expect(page.getByText(`Showing submissions for`)).toBeVisible();
  });
});
