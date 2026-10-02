import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssessment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

// Question rows render as <p>; the question picker repeats the same text in an <option>.
const questionRow = (page: Page, text: string) =>
  page.locator("p").filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-205: build an assessment in the UI, then a learner takes it in the player.
test.describe("assessment builder", () => {
  // Each test continues from the previous one (created data, state), so they must run in order
  // in one worker; with fullyParallel they could land in different workers and fail.
  test.describe.configure({ mode: "serial" });
  const svc = serviceClient();
  const tag = uniqueTag("ab");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
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
      title: `${tag} Quiz Course`,
      publish: false,
      sections: [{ title: "Sec", lessons: [{ title: "Final quiz", type: "quiz" }] }],
    });
    courseIds.push(course.courseId);
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("creates from the quiz lesson, adds questions of several types, edits, reorders and deletes", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, instructor, "/instructor");
    await page.goto(`/instructor/courses/${course.courseId}/lessons/${course.lessonIds[0]}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("This quiz lesson has no assessment yet.")).toBeVisible();
    await page.getByRole("button", { name: "Create assessment" }).click();
    await expect(page).toHaveURL(new RegExp(`/assessments/[0-9a-f-]{36}$`));
    const assessmentUrl = page.url();
    await expect(page.getByRole("heading", { level: 1, name: "Final quiz" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Settings: pass mark, attempts, time limit.
    await page.getByLabel("Pass mark (%)").fill("60");
    await page.getByLabel("Unlimited attempts").uncheck();
    await page.getByLabel("Attempts allowed").fill("2");
    await page.getByLabel("Enforce a time limit").check();
    await page.getByLabel("Time limit (minutes)").fill("20");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();

    // Invalid settings are reported per field.
    await page.getByLabel("Pass mark (%)").fill("150");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("The pass mark is a whole percentage from 0 to 100.")).toBeVisible();
    await page.getByLabel("Pass mark (%)").fill("60");

    // Validation before saving a question: only one option.
    await page.getByRole("button", { name: "Add question" }).first().click();
    await page.getByLabel("Question", { exact: true }).fill("Which is right?");
    await page.getByRole("button", { name: "Add question" }).last().click();
    await expect(page.getByText("Every option needs text (up to 1000 characters).")).toBeVisible();

    // Multiple choice.
    await page.getByLabel("Option 1 text").fill("Right");
    await page.getByLabel("Option 2 text").fill("Wrong");
    await page.getByLabel("Option 1 is correct").check();
    await page.getByLabel("Explanation").fill("Because it is right.");
    await page.getByRole("button", { name: "Add question" }).last().click();
    await expect(questionRow(page, "1. Which is right?")).toBeVisible();

    // Short answer.
    await page.getByRole("button", { name: "Add question" }).first().click();
    await page.getByLabel("Question type").selectOption("short_answer");
    await page.getByLabel("Question", { exact: true }).fill("Say hello");
    await page.getByLabel(/Accepted answers/).fill("hello\nhi there");
    await page.getByRole("button", { name: "Add question" }).last().click();
    await expect(questionRow(page, "2. Say hello")).toBeVisible();

    // Essay (no key), with more points.
    await page.getByRole("button", { name: "Add question" }).first().click();
    await page.getByLabel("Question type").selectOption("essay");
    await page.getByLabel("Question", { exact: true }).fill("Discuss testing");
    await page.getByLabel("Points").fill("10");
    await expect(page.getByText("graded by hand after the learner submits")).toBeVisible();
    await page.getByRole("button", { name: "Add question" }).last().click();
    await expect(questionRow(page, "3. Discuss testing")).toBeVisible();
    await expect(page.getByText("3 questions · 12 points · 1 graded by hand")).toBeVisible();

    // Correct option is marked for the author.
    const first = page.getByRole("listitem").filter({ hasText: "1. Which is right?" });
    await expect(first.getByText("Correct: Right")).toBeAttached();

    // Reorder with the buttons, then edit a question.
    await page.getByRole("button", { name: "Move question 3 up" }).click();
    await expect(questionRow(page, "2. Discuss testing")).toBeVisible();
    await page.getByRole("button", { name: "Edit question 1" }).click();
    // In edit mode the label's accessible name includes the current value, so target the form.
    await page.getByRole("form", { name: "Edit question" }).locator("textarea").first().fill("Which is really right?");
    await page.getByRole("button", { name: "Save question" }).click();
    await expect(questionRow(page, "1. Which is really right?")).toBeVisible();

    // Delete needs confirmation.
    await page.getByRole("button", { name: "Delete question 2" }).click();
    await page.getByRole("button", { name: "Keep" }).click();
    await expect(questionRow(page, "2. Discuss testing")).toBeVisible();
    await page.getByRole("button", { name: "Delete question 2" }).click();
    await page.getByRole("button", { name: "Delete question", exact: true }).click();
    await expect(page.getByText("Discuss testing")).toHaveCount(0);

    // The lesson editor now points at the assessment; the list page shows it.
    await page.goto(`/instructor/courses/${course.courseId}/lessons/${course.lessonIds[0]}`);
    await expect(page.getByRole("link", { name: "Edit assessment" })).toHaveAttribute("href", new URL(assessmentUrl).pathname);
    await page.goto(`/instructor/courses/${course.courseId}/assessments`);
    await expect(page.getByRole("link", { name: "Final quiz" })).toBeVisible();
    await expect(page.getByText("2 questions")).toBeVisible();
  });

  test("a learner then takes and passes the authored assessment", async ({ page }) => {
    test.setTimeout(180_000);
    // Publish + enroll (publishing UI is a later task).
    await svc.from("course_versions").update({ status: "published" }).eq("id", course.versionId);
    await svc.from("courses").update({ published_version_id: course.versionId }).eq("id", course.courseId);
    // Independent of the builder test above (tests run in separate workers): author via fixtures.
    const authored = await createAssessment(svc, course.versionId, {
      title: "Authored quiz",
      passMark: 60,
      maxAttempts: 2,
      timeLimitMinutes: 20,
      questions: [
        { type: "mcq", prompt: "Which is right?", options: ["Right", "Wrong"], correct: [0], explanation: "Because it is right." },
        { type: "short_answer", prompt: "Say hello", acceptedAnswers: ["hello", "hi there"] },
      ],
    });
    const a = { id: authored.assessmentId };
    await svc.from("enrollments").upsert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId, status: "active" }, { onConflict: "user_id,course_id" });

    await signIn(page, learner, "/learner");
    await page.goto(`/learner/courses/${tag}-c/assessments/${a.id}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("20 min time limit")).toBeVisible();
    await expect(page.getByText("Pass mark 60%")).toBeVisible();
    await page.getByRole("button", { name: "Start assessment" }).click();
    await page.getByLabel("Right", { exact: true }).check();
    await page.getByLabel("Say hello").fill("HI THERE");
    await expect(page.getByText("All answers saved")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Submit answers" }).click();
    await page.getByRole("button", { name: "Yes, submit" }).click();
    await expect(page.getByRole("heading", { name: "Attempt 1 result" })).toBeVisible();
    await expect(page.getByText("Passed", { exact: true })).toBeVisible();
    await expect(page.getByText("Because it is right.")).toBeVisible();
  });

  test("another instructor gets a 404 and a locked course is read-only", async ({ page }) => {
    const other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(other.id);
    await signIn(page, other, "/instructor");
    const res = await page.goto(`/instructor/courses/${course.courseId}/assessments`);
    expect(res?.status()).toBe(404);

    const locked = await createCourse(svc, instructor.id, { slug: `${tag}-lock`, title: `${tag} Locked`, publish: false, sections: [{ title: "S", lessons: [{ title: "Q", type: "quiz" }] }] });
    courseIds.push(locked.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", locked.versionId);
    await page.context().clearCookies();
    await signIn(page, instructor, "/instructor");
    await page.goto(`/instructor/courses/${locked.courseId}/assessments`);
    await expect(page.getByText("This course is locked while it is in review or published")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create assessment" })).toBeDisabled();
  });
});
