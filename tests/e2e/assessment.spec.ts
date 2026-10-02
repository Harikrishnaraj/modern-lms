import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import {
  cleanup,
  createAssessment,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

loadEnvLocal();

// F-107 / TEST_PLAN section 7. Default storageState = the shared e2e learner.
test.describe("assessment player", () => {
  const svc = serviceClient();
  const tag = uniqueTag("aq");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let course: Awaited<ReturnType<typeof createCourse>>;
  let assessmentId: string;

  test.beforeAll(async () => {
    const learnerId = JSON.parse(readFileSync("tests/e2e/.auth/user.meta.json", "utf8")).userId;
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, {
      slug: `${tag}-c`,
      title: `${tag} Course`,
      sections: [{ title: "S", lessons: [{ title: "Final quiz", type: "quiz", content: "<p>Quiz time</p>" }] }],
    });
    courseIds.push(course.courseId);
    const a = await createAssessment(svc, course.versionId, {
      title: `${tag} Quiz`,
      passMark: 100,
      maxAttempts: 2,
      timeLimitMinutes: 30,
      lessonId: course.lessonIds[0],
      questions: [
        {
          type: "mcq",
          prompt: "Which is right?",
          options: ["Wrong", "Right"],
          correct: [1],
          explanation: "Because it is right.",
        },
        { type: "short_answer", prompt: "Capital of France?", acceptedAnswers: ["Paris"] },
      ],
    });
    assessmentId = a.assessmentId;
    await svc
      .from("enrollments")
      .insert({ user_id: learnerId, course_id: course.courseId, version_id: course.versionId });
  });

  test.afterAll(() => cleanup(svc, { courseIds, userIds }));

  test("take, autosave, fail, retry and pass with the key revealed only at the end", async ({ page }) => {
    // Two full attempts with autosave waits and server-action refreshes: well over the 30s default.
    test.setTimeout(120_000);
    // Entry from the quiz lesson.
    await page.goto(`/learner/courses/${tag}-c`);
    await page.getByRole("link", { name: `Open assessment: ${tag} Quiz` }).click();
    await expect(page).toHaveURL(`/learner/courses/${tag}-c/assessments/${assessmentId}`);
    await expect(page.getByRole("heading", { level: 1, name: `${tag} Quiz` })).toBeVisible();
    await expect(page.getByText("2 questions")).toBeVisible();
    await expect(page.getByText("30 min time limit")).toBeVisible();
    await expect(page.getByText("0 of 2 attempts used")).toBeVisible();

    // Start: the timer runs and questions load.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Start assessment" }).click();
    await expect(page.getByRole("timer", { name: "Time remaining" })).toBeVisible();
    await expect(page.getByText("Which is right?")).toBeVisible();

    // Answers autosave and survive a reload.
    await page.getByLabel("Wrong").check();
    await page.getByLabel(/Capital of France/).fill("Lyon");
    await expect(page.getByText("All answers saved")).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByLabel("Wrong")).toBeChecked();
    await expect(page.getByLabel(/Capital of France/)).toHaveValue("Lyon");

    // Submission needs confirmation; "Keep working" backs out.
    await page.getByRole("button", { name: "Submit answers" }).click();
    await expect(page.getByRole("alertdialog", { name: "Confirm submission" })).toBeVisible();
    await page.getByRole("button", { name: "Keep working" }).click();
    await expect(page.getByRole("button", { name: "Submit answers" })).toBeVisible();
    await page.getByRole("button", { name: "Submit answers" }).click();
    await page.getByRole("button", { name: "Yes, submit" }).click();

    // Failed attempt: no key shown yet, retry offered.
    await expect(page.getByRole("heading", { name: "Attempt 1 result" })).toBeVisible();
    await expect(page.getByText("Not passed")).toBeVisible();
    await expect(page.getByText("0%", { exact: true })).toBeVisible();
    await expect(page.getByText("Correct answers are shown once you pass")).toBeVisible();
    await expect(page.getByText("Because it is right.")).toHaveCount(0);
    await expect(page.getByText("Correct answer:")).toHaveCount(0);
    await expect(page.getByText("1 of 2 attempts used")).toBeVisible();

    // Retry and pass.
    await page.getByRole("button", { name: "Retry assessment" }).click();
    await page.getByLabel("Right", { exact: true }).check();
    await page.getByLabel(/Capital of France/).fill("  paris ");
    await expect(page.getByText("All answers saved")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Submit answers" }).click();
    await page.getByRole("button", { name: "Yes, submit" }).click();

    await expect(page.getByRole("heading", { name: "Attempt 2 result" })).toBeVisible();
    await expect(page.getByText("Passed", { exact: true })).toBeVisible();
    await expect(page.getByText("100%", { exact: true })).toBeVisible();
    await expect(page.getByText("Because it is right.")).toBeVisible();
    await expect(page.getByText("Correct answer:").first()).toBeVisible();
    await expect(page.getByText("2 of 2 attempts used")).toBeVisible();
    await expect(page.getByText("You have used all your attempts")).toBeVisible();
  });

  test("the network responses never contain the answer key", async ({ browser }) => {
    // A learner of their own who has not started: the shared learner may already have used every
    // attempt in the test above (they run in parallel), and then the key is shown by design.
    const fresh = await createUserWithRole(svc, `${tag}-new`, "learner");
    userIds.push(fresh.id);
    await svc.from("enrollments").insert({ user_id: fresh.id, course_id: course.courseId, version_id: course.versionId });
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(fresh.email);
      await page.getByLabel("Password").fill(fresh.password);
      await page.getByRole("button", { name: "Log in" }).click();
      await page.waitForURL("/learner");
      // An un-started, un-finished flow: inspect the HTML payload.
      const html = await (await page.request.get(`/learner/courses/${tag}-c/assessments/${assessmentId}`)).text();
      expect(html).toContain(`${tag} Quiz`);
      for (const secret of ["Because it is right.", "correct_option_ids", "accepted_answers", "is_correct"]) {
        expect(html).not.toContain(secret);
      }
    } finally {
      await context.close();
    }
  });

  test("a learner who is not enrolled cannot open the assessment", async ({ browser }) => {
    const other = await createUserWithRole(svc, `${tag}-out`, "learner");
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(other.email);
      await page.getByLabel("Password").fill(other.password);
      await page.getByRole("button", { name: "Log in" }).click();
      await page.waitForURL("/learner");
      await page.goto(`/learner/courses/${tag}-c/assessments/${assessmentId}`);
      await expect(page.getByText(/not found|404|could not be found/i).first()).toBeVisible();
      await expect(page.getByText("Which is right?")).toHaveCount(0);
    } finally {
      await context.close();
      await svc.auth.admin.deleteUser(other.id);
    }
  });
});
