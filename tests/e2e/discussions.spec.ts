import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-113: discussions in the learner UI: thread, reply, upvote, answered state, report, sanitized content.
test.describe("learner discussions", () => {
  // Each test continues from the previous one (created data, state), so they must run in order
  // in one worker; with fullyParallel they could land in different workers and fail.
  test.describe.configure({ mode: "serial" });
  const svc = serviceClient();
  const tag = uniqueTag("dse");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let asker: { id: string; email: string; password: string };
  let helper: { id: string; email: string; password: string };
  let outsider: { id: string; email: string; password: string };

  async function signIn(page: Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
  }

  test.beforeAll(async () => {
    const ins = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    asker = await createUserWithRole(svc, `${tag}-ask`, "learner");
    helper = await createUserWithRole(svc, `${tag}-hlp`, "learner");
    outsider = await createUserWithRole(svc, `${tag}-out`, "learner");
    userIds.push(ins.id);
    learnerIds.push(asker.id, helper.id, outsider.id);
    await svc.from("profiles").update({ full_name: "Ada Asker" }).eq("id", asker.id);
    await svc.from("profiles").update({ full_name: "Hal Helper" }).eq("id", helper.id);
    const c = await createCourse(svc, ins.id, { slug: `${tag}-c`, title: `${tag} Course`, publish: true });
    courseIds.push(c.courseId);
    await svc.from("enrollments").insert([
      { user_id: asker.id, course_id: c.courseId, version_id: c.versionId },
      { user_id: helper.id, course_id: c.courseId, version_id: c.versionId },
    ]);
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("ask, reply, upvote, mark answered, report, and content is shown as plain text", async ({ page, browser }) => {
    test.setTimeout(240_000);
    await signIn(page, asker);
    await page.goto("/learner/discussions");
    await expect(page.getByRole("heading", { level: 1, name: "Discussions" })).toBeVisible();
    await expect(page.getByText("No discussions yet")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Validation, then a real thread with markup that must not run.
    await page.getByRole("button", { name: "Start a discussion" }).click();
    const form = page.getByRole("form", { name: "Start a discussion" });
    await form.getByLabel("Title").fill("ab");
    await form.getByRole("button", { name: "Post discussion" }).click();
    await expect(form.getByText("Give the discussion a title of at least 3 characters.")).toBeVisible();
    await expect(form.getByText("Write your question or topic.")).toBeVisible();
    await form.getByLabel("Title").fill("How do I start?");
    await form.getByLabel("Your question or topic").fill("<img src=x onerror=alert(1)> Where do I begin?");
    await form.getByRole("button", { name: "Post discussion" }).click();
    await page.waitForURL(/\/learner\/discussions\/[0-9a-f-]{36}$/);
    const threadUrl = page.url();
    await expect(page.getByRole("heading", { level: 1, name: "How do I start?" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Original post" })).toContainText("<img src=x onerror=alert(1)> Where do I begin?");
    await expect(page.locator("article img")).toHaveCount(0);

    // A classmate replies.
    const hctx = await browser.newContext();
    const hp = await hctx.newPage();
    await signIn(hp, helper);
    await hp.goto(threadUrl);
    await hp.waitForLoadState("networkidle");
    await hp.getByLabel("Your reply").fill("Start with the first lesson.");
    await hp.getByRole("button", { name: "Post reply" }).click();
    const replies = hp.getByRole("list", { name: "Replies" });
    await expect(replies.getByText("Start with the first lesson.")).toBeVisible();
    await expect(replies.getByText("Hal Helper")).toBeVisible();

    // The helper upvotes the question, but cannot upvote their own reply.
    await hp.getByRole("article", { name: "Original post" }).getByRole("button", { name: /upvotes/ }).click();
    await expect(hp.getByRole("article", { name: "Original post" }).getByRole("button", { name: /you upvoted this/ })).toBeVisible();
    await expect(replies.getByRole("button", { name: /upvotes/ })).toBeDisabled();

    // The asker upvotes the reply and marks it as the answer.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.getByRole("list", { name: "Replies" }).getByRole("button", { name: /upvotes/ }).click();
    await expect(page.getByRole("list", { name: "Replies" }).getByRole("button", { name: /you upvoted this/ })).toBeVisible();
    await page.getByRole("button", { name: "Mark as answer" }).click();
    await expect(page.getByText("Answered", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("list", { name: "Replies" }).getByText("Answer", { exact: true })).toBeVisible();

    // Filters on the list.
    await page.goto("/learner/discussions?filter=unanswered");
    await expect(page.getByText("No discussions match")).toBeVisible();
    await page.goto("/learner/discussions?filter=mine");
    const item = page.getByRole("list", { name: "Discussions" }).getByRole("listitem").filter({ hasText: "How do I start?" });
    await expect(item.getByText("Answered")).toBeVisible();
    await expect(item.getByText("1 reply")).toBeVisible();

    // The helper reports the asker's thread once.
    await hp.goto(threadUrl);
    await hp.waitForLoadState("networkidle");
    await hp.getByRole("button", { name: /Report this discussion/ }).click();
    await hp.getByLabel("Reason for the report").fill("Looks like spam");
    await hp.getByRole("button", { name: "Send report" }).click();
    await expect(hp.getByText("Reported", { exact: true })).toBeVisible();
    await hctx.close();
  });

  test("outsiders cannot read the thread or start one, and can see none of it", async ({ page }) => {
    await signIn(page, outsider);
    await page.goto("/learner/discussions");
    await expect(page.getByText("No discussions yet")).toBeVisible();
    await expect(page.getByText("Enroll in a course to start a discussion.")).toBeVisible();
    const { data } = await svc.from("discussions").select("id").limit(1).eq("author_id", asker.id).single();
    const res = await page.goto(`/learner/discussions/${data!.id}`);
    expect(res?.status()).toBe(404);
  });

  test("the author can delete their thread", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, asker);
    await page.goto("/learner/discussions");
    await page.getByRole("link", { name: "How do I start?" }).click();
    await page.waitForURL(/\/learner\/discussions\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Delete this discussion/ }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await page.waitForURL("/learner/discussions", { timeout: 30_000 });
    await expect(page.getByText("No discussions yet")).toBeVisible();
  });
});
