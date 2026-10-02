import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssignment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-206 / TEST_PLAN section 8: build an assignment with a rubric, learners submit, instructor grades.
test.describe("assignment builder and grading", () => {
  const svc = serviceClient();
  const tag = uniqueTag("abe");
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
    await svc.from("profiles").update({ full_name: "Lena Learner" }).eq("id", learner.id);
    c = await createCourse(svc, instructor.id, { slug: `${tag}-c`, title: `${tag} Course`, publish: false });
    courseIds.push(c.courseId);
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: c.courseId, version_id: c.versionId });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("builds an assignment with a rubric, then grades a submission and the learner sees the result", async ({ page, browser }) => {
    test.setTimeout(240_000);
    await signIn(page, instructor, "/instructor");
    await page.goto(`/instructor/courses/${c.courseId}/assignments`);
    await expect(page.getByText("No assignments yet")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("New assignment title").fill(`${tag} Case study`);
    await page.getByRole("button", { name: "Create assignment" }).click();
    await page.waitForURL(/\/assignments\/[0-9a-f-]{36}$/);
    const assignmentUrl = page.url();
    await page.waitForLoadState("networkidle");

    const form = page.getByRole("form", { name: "Assignment settings" });
    await form.getByLabel("Instructions").fill("Analyse the case and recommend a course of action.");
    await form.getByLabel("Deadline (UTC)").fill("2031-06-01T12:00");
    await form.getByLabel("Points").fill("100");
    await form.getByLabel("Accept late submissions (they are flagged as late)").check();

    // The rubric must add up to the assignment points.
    await form.getByRole("button", { name: "Add criterion" }).click();
    await form.getByLabel("Criterion 1 title").fill("Analysis");
    await form.getByLabel("Criterion 1 points").fill("70");
    await form.getByRole("button", { name: "Add criterion" }).click();
    await form.getByLabel("Criterion 2 title").fill("Recommendation");
    await form.getByLabel("Criterion 2 points").fill("20");
    await form.getByRole("button", { name: "Save assignment" }).click();
    await expect(page.getByText("The rubric adds up to 90 points but the assignment is worth 100.")).toBeVisible();
    await form.getByLabel("Criterion 2 points").fill("30");
    await form.getByRole("button", { name: "Save assignment" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Criterion 2 title")).toHaveValue("Recommendation");
    await expect(page.getByLabel("Deadline (UTC)")).toHaveValue("2031-06-01T12:00");

    // The learner hands in work (through the learner UI).
    const lctx = await browser.newContext();
    const lp = await lctx.newPage();
    await signIn(lp, learner, "/learner");
    await lp.goto("/learner/assignments");
    await lp.getByRole("link", { name: `${tag} Case study` }).click();
    await lp.waitForURL(/\/learner\/assignments\/[0-9a-f-]{36}$/);
    await lp.waitForLoadState("networkidle");
    await lp.getByLabel("Your answer").fill("My analysis and recommendation.");
    await lp.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(lp.getByRole("region", { name: "Your submission" })).toBeVisible();

    // The instructor sees it in the queue and grades with the rubric.
    await page.goto("/instructor/grading");
    await expect(page.getByText("1 submission waiting for a grade.")).toBeVisible();
    await page.getByRole("list", { name: "Submissions" }).getByRole("link", { name: `${tag} Case study` }).click();
    await page.waitForURL(/\/instructor\/grading\/[0-9a-f-]{36}$/);
    await expect(page.getByText("My analysis and recommendation.")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const grade = page.getByRole("form", { name: "Grade this submission" });
    await grade.getByLabel("Score for Analysis (out of 70)").fill("60");
    await grade.getByLabel("Score for Recommendation (out of 30)").fill("31");
    await grade.getByRole("button", { name: "Save grade" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /Score "Recommendation" from 0 to 30/ })).toBeVisible();
    await grade.getByLabel("Score for Recommendation (out of 30)").fill("25");
    await expect(grade.getByText("Total: 85 / 100")).toBeVisible();
    await grade.getByLabel("Feedback for the learner").fill("Strong analysis, thinner recommendation.");
    await grade.getByRole("button", { name: "Save grade" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Grade saved and the learner was notified." })).toBeVisible();

    await page.goto("/instructor/grading?filter=graded");
    await expect(page.getByText("Graded 85/100")).toBeVisible();
    await page.goto("/instructor/grading");
    await expect(page.getByText("Nothing to grade")).toBeVisible();

    // The learner sees the grade, the feedback and a notification; the work is locked.
    await lp.goto("/learner");
    await expect(lp.getByRole("link", { name: /Notifications, [1-9]\d* unread/ })).toBeVisible();
    await lp.goto("/learner/assignments");
    await lp.getByRole("link", { name: `${tag} Case study` }).click();
    await expect(lp.getByRole("heading", { name: "Grade and feedback" })).toBeVisible();
    await expect(lp.getByText("85 / 100")).toBeVisible();
    await expect(lp.getByText("Strong analysis, thinner recommendation.")).toBeVisible();
    await expect(lp.getByRole("form", { name: "Submit your work" })).toHaveCount(0);
    await lctx.close();

    // Once submissions exist the assignment cannot be deleted.
    await page.goto(assignmentUrl);
    await expect(page.getByText("1 submission so far, so it cannot be deleted.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete assignment" })).toHaveCount(0);
  });

  test("another instructor cannot open the builder or the grading page", async ({ page }) => {
    const other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(other.id);
    await signIn(page, other, "/instructor");
    const res = await page.goto(`/instructor/courses/${c.courseId}/assignments`);
    expect(res?.status()).toBe(404);
    await page.goto("/instructor/grading");
    await expect(page.getByText("Nothing to grade")).toBeVisible();
    // A submission on the first instructor's course, made here so the test never depends on the
    // other test (or leftover data) having created one.
    const { assignmentId } = await createAssignment(svc, c.versionId, { title: `${tag} Private Work` });
    const { data, error } = await svc
      .from("assignment_submissions")
      .insert({ assignment_id: assignmentId, user_id: learner.id, text_answer: "Mine" })
      .select("id")
      .single();
    if (error) throw error;
    const r2 = await page.goto(`/instructor/grading/${data.id}`);
    expect(r2?.status()).toBe(404);
  });
});
