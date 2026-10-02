import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-204: rich text, video, attachments, preview flag - and what the learner then sees.
test.describe("lesson editor", () => {
  const svc = serviceClient();
  const tag = uniqueTag("lx");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const objectPaths: { bucket: string; path: string }[] = [];
  let instructor: { id: string; email: string; password: string };
  let learner: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;

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
    course = await createCourse(svc, instructor.id, {
      slug: `${tag}-c`,
      title: `${tag} Lesson Course`,
      publish: false,
      sections: [{ title: "Sec", lessons: [{ title: "Text lesson", type: "text" }, { title: "Video lesson", type: "video" }] }],
    });
    courseIds.push(course.courseId);
  });

  test.afterAll(async () => {
    for (const o of objectPaths) await svc.storage.from(o.bucket).remove([o.path]);
    const { data } = await svc.from("lesson_assets").select("storage_path").in("lesson_id", course.lessonIds);
    for (const a of data ?? []) await svc.storage.from("lesson-assets").remove([a.storage_path as string]);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("edits rich text, duration, preview and attachments, then a learner sees it", async ({ page, browser }) => {
    test.setTimeout(180_000);
    await signIn(page, instructor, "/instructor");
    await page.goto(`/instructor/courses/${course.courseId}/curriculum`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Edit content of lesson Text lesson" }).click();
    await expect(page).toHaveURL(new RegExp(`/lessons/${course.lessonIds[0]}$`));
    await page.waitForLoadState("networkidle");

    // Rich text: type, make part of it bold, add a bullet list.
    const editor = page.getByRole("textbox", { name: "Lesson content" });
    await editor.click();
    await page.keyboard.press("Control+A"); // replace the default content
    await page.keyboard.type("Welcome to the lesson");
    await page.keyboard.press("Control+A");
    await page.getByRole("button", { name: "Bold" }).click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Bulleted list" }).click();
    await page.keyboard.type("first point");
    await page.getByLabel("Duration (minutes)").fill("9");
    await page.getByLabel(/Free preview/).check();
    await page.getByRole("button", { name: "Save lesson" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

    // Persisted and sanitized in the database.
    const { data } = await svc.from("lessons").select("content, duration_minutes, is_preview").eq("id", course.lessonIds[0]).single();
    expect(data).toMatchObject({ duration_minutes: 9, is_preview: true });
    expect(data!.content).toContain("<strong>Welcome to the lesson</strong>");
    expect(data!.content).toMatch(/<li>(<strong>)?first point(<\/strong>)?<\/li>/);

    // Attachment upload (direct to storage) and listing.
    await page.getByLabel("Add attachment").setInputFiles({ name: "handout.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") });
    await expect(page.getByRole("status").filter({ hasText: "Attachment added." })).toBeVisible();
    await expect(page.getByText("handout.pdf")).toBeVisible();

    // A disallowed file type is refused before any upload happens.
    await page.getByLabel("Add attachment").setInputFiles({ name: "run.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
    await expect(page.getByRole("alert").filter({ hasText: "That file type is not allowed" })).toBeVisible();

    // Reload keeps everything.
    await page.reload();
    await expect(page.getByLabel("Duration (minutes)")).toHaveValue("9");
    await expect(page.getByLabel(/Free preview/)).toBeChecked();
    await expect(page.getByRole("textbox", { name: "Lesson content" })).toContainText("Welcome to the lesson");
    await expect(page.getByText("handout.pdf")).toBeVisible();

    // Publish the fixture course and enroll the learner (publishing is a later task's UI).
    await svc.from("course_versions").update({ status: "published" }).eq("id", course.versionId);
    await svc.from("courses").update({ published_version_id: course.versionId }).eq("id", course.courseId);
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId });

    const ctx = await browser.newContext();
    const lp = await ctx.newPage();
    await signIn(lp, learner, "/learner");
    await lp.goto(`/learner/courses/${tag}-c/learn/${course.lessonIds[0]}`);
    await expect(lp.getByText("Welcome to the lesson")).toBeVisible();
    await expect(lp.getByText("first point")).toBeVisible();
    await expect(lp.getByRole("heading", { name: "Downloads" })).toBeVisible();
    const link = lp.getByRole("link", { name: /handout\.pdf/ });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toContain("token=");
    const res = await lp.request.get(href!);
    expect(res.status()).toBe(200);
    await ctx.close();
  });

  test("a video lesson takes a link or an upload; bad links are rejected", async ({ page }) => {
    test.setTimeout(120_000);
    // Its own draft course: the first test publishes the shared one, which locks its editor, and
    // tests in this file may share a worker in any order.
    const vc = await createCourse(svc, instructor.id, {
      slug: `${tag}-vid-${courseIds.length}`,
      title: `${tag} Video Course`,
      publish: false,
      sections: [{ title: "Sec", lessons: [{ title: "Text lesson", type: "text" }, { title: "Video lesson", type: "video" }] }],
    });
    courseIds.push(vc.courseId);
    await signIn(page, instructor, "/instructor");
    await page.goto(`/instructor/courses/${vc.courseId}/lessons/${vc.lessonIds[1]}`);
    await page.waitForLoadState("networkidle");

    await page.getByLabel("Video link").fill("http://insecure.example.com/v.mp4");
    await page.getByRole("button", { name: "Save lesson" }).click();
    await expect(page.getByText("Video links must start with https://").first()).toBeVisible();

    await page.getByLabel("Video link").fill("https://cdn.example.com/v.mp4");
    await page.getByRole("button", { name: "Save lesson" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

    await page.getByLabel("Upload video").setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.from("\0\0\0\u0018ftypmp42") });
    await expect(page.getByText("An uploaded video is attached.")).toBeVisible();
    await page.getByRole("button", { name: "Save lesson" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    const { data } = await svc.from("lessons").select("video_url").eq("id", vc.lessonIds[1]).single();
    expect(data!.video_url).toMatch(new RegExp(`^storage://course-videos/${vc.courseId}/${vc.lessonIds[1]}/`));
    objectPaths.push({ bucket: "course-videos", path: (data!.video_url as string).replace("storage://course-videos/", "") });

    // Text lessons have no video section.
    await page.goto(`/instructor/courses/${vc.courseId}/lessons/${vc.lessonIds[0]}`);
    await expect(page.getByLabel("Video link")).toHaveCount(0);
  });

  test("another instructor gets a 404; a locked course is read-only", async ({ page }) => {
    const other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(other.id);
    await signIn(page, other, "/instructor");
    const res = await page.goto(`/instructor/courses/${course.courseId}/lessons/${course.lessonIds[0]}`);
    expect(res?.status()).toBe(404);

    const locked = await createCourse(svc, instructor.id, {
      slug: `${tag}-lock`,
      title: `${tag} Locked`,
      publish: false,
      sections: [{ title: "S", lessons: [{ title: "Fixed lesson" }] }],
    });
    courseIds.push(locked.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", locked.versionId);
    await page.context().clearCookies();
    await signIn(page, instructor, "/instructor");
    await page.goto(`/instructor/courses/${locked.courseId}/lessons/${locked.lessonIds[0]}`);
    await expect(page.getByText("This course is locked while it is in review or published")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save lesson" })).toBeDisabled();
    await expect(page.getByLabel("Lesson title", { exact: true })).toBeDisabled();
  });
});
