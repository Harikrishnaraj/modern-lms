import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssignment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-112: deadlines appear on the correct dates in the month, week and agenda views.
test.describe("learner calendar", () => {
  const svc = serviceClient();
  const tag = uniqueTag("cal");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let learner: { id: string; email: string; password: string };

  async function signIn(page: Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
  }

  test.beforeAll(async () => {
    const ins = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    userIds.push(ins.id);
    learnerIds.push(learner.id);
    const c = await createCourse(svc, ins.id, { slug: `${tag}-c`, title: `${tag} Course`, publish: true });
    courseIds.push(c.courseId);
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: c.courseId, version_id: c.versionId });
    await createAssignment(svc, c.versionId, { title: `${tag} Essay`, dueAt: "2031-03-18T10:00:00Z" });
    await createAssignment(svc, c.versionId, { title: `${tag} Project`, dueAt: "2031-04-05T15:00:00Z" });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("month view puts the deadline on the right day; navigation, week and agenda views work", async ({ page, isMobile }) => {
    test.setTimeout(120_000);
    await signIn(page, learner);
    await page.goto("/learner/calendar?view=month&date=2031-03-10");
    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "March 2031" })).toBeVisible();

    // 2031-03-18 is a Tuesday. Wide screens show a month grid; phones list the month's days instead.
    if (isMobile) {
      const days = page.getByRole("list", { name: "Agenda" });
      await expect(days.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Tuesday, March 18" }) }).getByRole("link", { name: new RegExp(`Due: ${tag} Essay`) })).toBeVisible();
      await expect(days.getByRole("heading", { name: "Wednesday, March 19" })).toHaveCount(0);
    } else {
      const grid = page.getByRole("table", { name: "Month of March 2031" });
      const cell = grid.getByRole("cell", { name: "Tuesday, March 18" });
      await expect(cell.getByRole("link", { name: new RegExp(`Due: ${tag} Essay`) })).toBeVisible();
      await expect(grid.getByRole("cell", { name: "Wednesday, March 19" }).getByRole("link")).toHaveCount(0);
      // The grid shows whole weeks, so early-April days (and their events) trail the month.
      await expect(grid.getByRole("cell", { name: "Saturday, April 5" }).getByRole("link", { name: new RegExp(`Due: ${tag} Project`) })).toBeVisible();
    }

    // Next month has the other deadline.
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Next period" }).click();
    await expect(page).toHaveURL(/date=2031-04-01/, { timeout: 30_000 });
    const april = isMobile
      ? page.getByRole("list", { name: "Agenda" }).getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Saturday, April 5" }) })
      : page.getByRole("table", { name: "Month of April 2031" }).getByRole("cell", { name: "Saturday, April 5" });
    await expect(april.getByRole("link", { name: new RegExp(`${tag} Project`) })).toBeVisible();
    await page.getByRole("link", { name: "Previous period" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "March 2031" })).toBeVisible();

    // Week view of that week.
    await page.goto("/learner/calendar?view=week&date=2031-03-18");
    await expect(page.getByRole("heading", { level: 2, name: "Mar 17 to Mar 23, 2031" })).toBeVisible();
    const week = page.getByRole("list", { name: "Week" });
    await expect(week.getByRole("listitem").filter({ hasText: "Tue 18" }).getByRole("link", { name: new RegExp(`${tag} Essay`) })).toBeVisible();

    // Agenda lists the day with its time in UTC and links through to the assignment.
    await page.goto("/learner/calendar?view=agenda&date=2031-03-15");
    const agenda = page.getByRole("list", { name: "Agenda" });
    await expect(agenda.getByRole("heading", { name: /Tuesday, March 18/ })).toBeVisible();
    await expect(agenda.getByText("10:00 AM UTC")).toBeVisible();
    await agenda.getByRole("link", { name: new RegExp(`${tag} Essay`) }).click();
    await expect(page).toHaveURL(/\/learner\/assignments\//, { timeout: 45_000 });
    await expect(page.getByRole("heading", { level: 1, name: `${tag} Essay` })).toBeVisible();
  });

  test("an empty period shows the empty state, and bad query values fall back safely", async ({ page }) => {
    await signIn(page, learner);
    await page.goto("/learner/calendar?view=agenda&date=2040-01-01");
    await expect(page.getByText("Nothing scheduled")).toBeVisible();
    await page.goto("/learner/calendar?view=bogus&date=not-a-date");
    await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Calendar view" }).getByRole("link", { name: "month" })).toHaveAttribute("aria-current", "true");
  });

  test("another learner sees none of these events", async ({ page }) => {
    const stranger = await createUserWithRole(svc, `${tag}-str`, "learner");
    learnerIds.push(stranger.id);
    await signIn(page, stranger);
    await page.goto("/learner/calendar?view=agenda&date=2031-03-15");
    await expect(page.getByText("Nothing scheduled")).toBeVisible();
    await expect(page.getByText(`${tag} Essay`)).toHaveCount(0);
  });
});
