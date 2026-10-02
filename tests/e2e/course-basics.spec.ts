import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// F-202 step 1: create a draft, resume it, edit it, and respect ownership.
test.describe("course basics (create + edit)", () => {
  const svc = serviceClient();
  const tag = uniqueTag("cbe");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let instructor: { id: string; email: string; password: string };
  let other: { id: string; email: string; password: string };

  async function signIn(page: import("@playwright/test").Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
  }

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(instructor.id, other.id);
  });

  test.afterAll(async () => {
    const { data } = await svc.from("courses").select("id").eq("instructor_id", instructor.id);
    courseIds.push(...(data ?? []).map((c) => c.id as string));
    await cleanup(svc, { courseIds, userIds });
  });

  test("creates a draft with a thumbnail, lands on the resumable basics page, edits and persists", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, instructor);
    await page.goto("/instructor/courses/new");
    await expect(page.getByRole("heading", { level: 1, name: "Create a course" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Course setup steps" })).toBeVisible();

    // Validation: too-short title.
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Course title").fill("ab");
    await page.getByRole("button", { name: "Create draft and continue" }).click();
    await expect(page.getByText("Give the course a title of at least 3 characters.")).toBeVisible();

    // A non-image renamed to .png is rejected by content.
    await page.getByLabel("Course title").fill(`${tag} My First Course`);
    await page.getByLabel("Upload thumbnail").setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") });
    await page.getByRole("button", { name: "Create draft and continue" }).click();
    await expect(page.getByText("The thumbnail must be a PNG, JPEG or WebP image.")).toBeVisible();

    // Valid create.
    await page.getByLabel("Subtitle").fill("A short pitch");
    await page.getByLabel("Level").selectOption("intermediate");
    await page.getByLabel("Language").selectOption("es");
    await page.getByLabel("Upload thumbnail").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: "Create draft and continue" }).click();

    await expect(page).toHaveURL(/\/instructor\/courses\/[0-9a-f-]{36}\/basics/);
    const courseId = page.url().match(/courses\/([0-9a-f-]{36})\//)![1];
    await expect(page.getByRole("heading", { level: 1, name: `${tag} My First Course` })).toBeVisible();
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Subtitle")).toHaveValue("A short pitch");
    await expect(page.getByLabel("Level")).toHaveValue("intermediate");
    await expect(page.getByLabel("Language")).toHaveValue("es");
    await expect(page.getByAltText("Current course thumbnail")).toBeVisible();

    // It is listed under Drafts (resumable from My Courses).
    await page.goto("/instructor/courses?status=draft");
    // My Courses opens the course overview (F-201); Basics is one step from there.
    await page.getByRole("link", { name: `${tag} My First Course` }).first().click();
    await expect(page).toHaveURL(new RegExp(`/instructor/courses/${courseId}$`));
    await page.goto(`/instructor/courses/${courseId}/basics`);

    // Edit and save; persists after a reload.
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Course title").fill(`${tag} Renamed Course`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved. Your changes are stored as a draft.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Course title")).toHaveValue(`${tag} Renamed Course`);

    // Remove the thumbnail.
    await page.getByLabel("Remove thumbnail").check();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved. Your changes are stored as a draft.")).toBeVisible();
    await page.reload();
    await expect(page.getByAltText("Current course thumbnail")).toHaveCount(0);
  });

  test("another instructor gets a 404 for someone else's course", async ({ page }) => {
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-priv`, title: `${tag} Private`, publish: false });
    courseIds.push(c.courseId);
    await signIn(page, other);
    const res = await page.goto(`/instructor/courses/${c.courseId}/basics`);
    expect(res?.status()).toBe(404);
    await expect(page.getByText(`${tag} Private`)).toHaveCount(0);
  });

  test("a locked course shows a notice and a disabled form", async ({ page }) => {
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-lock`, title: `${tag} Locked`, publish: false });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ status: "in_review" }).eq("id", c.versionId);
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${c.courseId}/basics`);
    await expect(page.getByText("This course is locked while it is in review or published")).toBeVisible();
    await expect(page.getByLabel("Course title")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  test("the catalog shows an uploaded thumbnail on published courses", async ({ page }) => {
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-thumb`, title: `${tag} Thumb Course` });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ thumbnail_url: "https://example.com/t.png" }).eq("id", c.versionId);
    await page.goto(`/courses?q=${tag}+Thumb`);
    await expect(page.locator(`img[src="https://example.com/t.png"]`)).toHaveCount(1);
  });
});
