import { expect, test, type Page } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-212 / ADR-011: change a live course through a new draft version that a reviewer publishes.
test.describe("course versioning", () => {
  // Each test continues from the previous one (created data, state), so they must run in order
  // in one worker; with fullyParallel they could land in different workers and fail.
  test.describe.configure({ mode: "serial" });
  const svc = serviceClient();
  const tag = uniqueTag("cve");
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
    c = await createCourse(svc, instructor.id, {
      slug: `${tag}-c`, title: `${tag} Original Title`, publish: true,
      sections: [{ title: "Basics", lessons: [{ title: "Alpha lesson", content: "<p>Alpha v1 text</p>" }] }],
    });
    courseIds.push(c.courseId);
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: c.courseId, version_id: c.versionId });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("start a new version, edit it, and the live page keeps the old title until it is published", async ({ page }) => {
    test.setTimeout(240_000);
    await signIn(page, instructor, "/instructor");
    await page.goto(`/instructor/courses/${c.courseId}`);
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toBeVisible();

    // A live course is read-only until a new version is started.
    await page.goto(`/instructor/courses/${c.courseId}/basics`);
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await page.goto(`/instructor/courses/${c.courseId}`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Start version 2 to make changes" }).click();
    await page.waitForURL(/\/basics$/);
    await expect(page.getByLabel("Course title")).toHaveValue(`${tag} Original Title`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Course title").fill(`${tag} Updated Title`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved. Your changes are stored as a draft.")).toBeVisible();

    // The overview shows the draft, and the version history lists both versions.
    await page.goto(`/instructor/courses/${c.courseId}`);
    await expect(page.getByRole("heading", { level: 1, name: `${tag} Updated Title` })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Version 1 is live" })).toHaveCount(0);
    const history = page.getByRole("heading", { name: "Version history" }).locator("xpath=..");
    await expect(history.getByText(/Version 2/)).toBeVisible();
    await expect(history.getByText(/Version 1/)).toBeVisible();

    // The public page still shows the live title; the copied lesson is in the draft.
    const live = await page.request.get(`/courses/${tag}-c`);
    expect(await live.text()).toContain(`${tag} Original Title`);
    await page.goto(`/instructor/courses/${c.courseId}/preview`);
    await expect(page.getByText("Alpha v1 text")).toBeVisible();
  });

  test("after a reviewer publishes it, new visitors see the update and the enrolled learner keeps the original", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const admin = await loginAsRole(page, "admin");
    try {
      await svc.from("course_versions").update({ status: "approved" }).eq("course_id", c.courseId).eq("version_number", 2);
      await page.goto(`/admin/courses/${c.courseId}`);
      await page.waitForLoadState("networkidle");
      const decisions = page.getByRole("group", { name: "Decisions" });
      await decisions.getByRole("button", { name: "Publish" }).click();
      await page.getByRole("button", { name: "Confirm publish" }).click();
      await expect(decisions.getByRole("button", { name: "Archive" })).toBeVisible();
    } finally {
      await admin();
    }

    const anon = await browser.newContext();
    const ap = await anon.newPage();
    await ap.goto(`/courses/${tag}-c`);
    await expect(ap.getByRole("heading", { level: 1, name: `${tag} Updated Title` })).toBeVisible();
    await anon.close();

    // The enrolled learner is still on version 1 (content and progress intact).
    const lctx = await browser.newContext();
    const lp = await lctx.newPage();
    await signIn(lp, learner, "/learner");
    await lp.goto(`/learner/courses/${tag}-c/learn/${c.lessonIds[0]}`);
    await expect(lp.getByText("Alpha v1 text")).toBeVisible();
    await lctx.close();
  });
});
