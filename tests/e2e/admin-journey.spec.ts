import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssessment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// TEST_PLAN section 13 (F-400...F-414): the admin review loop end to end with the instructor,
// then user management with its audit record.
test.describe("admin journey", () => {
  const svc = serviceClient();
  const tag = uniqueTag("aj");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  test.afterAll(async () => {
    const { data } = await svc.from("audit_logs").select("resource_id").eq("action", "user.created").like("metadata->>email", `${tag}%`);
    await cleanup(svc, { learnerIds, courseIds, userIds: [...userIds, ...(data ?? []).map((r) => r.resource_id as string)] });
  });

  test("pending course: review, request changes, resubmit, approve, publish, audit trail", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const { data: cat } = await svc.from("categories").select("id").limit(1).single();
    const c = await createCourse(svc, instructor.id, {
      slug: `${tag}-c`,
      title: `${tag} Pending Course`,
      publish: false,
      categoryId: cat!.id as string,
      description: "A complete description that is comfortably longer than the fifty character minimum.",
      outcomes: ["Learn things"],
      sections: [{ title: "Basics", lessons: [{ title: "Alpha lesson", content: "<p>Alpha</p>" }] }],
    });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ thumbnail_url: "https://example.com/t.png" }).eq("id", c.versionId);
    await createAssessment(svc, c.versionId, { title: "Quiz", questions: [{ type: "true_false", prompt: "True?", options: ["True", "False"], correct: [0] }] });

    // The instructor submits through the UI.
    const ictx = await browser.newContext();
    const ip = await ictx.newPage();
    await ip.goto("/login");
    await ip.getByLabel("Email").fill(instructor.email);
    await ip.getByLabel("Password").fill(instructor.password);
    await ip.getByRole("button", { name: "Log in" }).click();
    await ip.waitForURL("/instructor");
    await ip.goto(`/instructor/courses/${c.courseId}/submit`);
    await ip.waitForLoadState("networkidle");
    await ip.getByRole("button", { name: "Submit for review" }).click();
    // Server action + router.refresh() re-renders a query-heavy page; allow for a busy shared project.
    await expect(ip.getByText("Submitted. A reviewer will pick this up soon.")).toBeVisible({ timeout: 30_000 });

    const done = await loginAsRole(page, "admin");
    try {
      // Pending course shows in the pending tab; open the review. (The overview lists only the oldest
      // few pending courses, and the shared project may hold others, so search the pending tab.)
      await page.goto(`/admin/courses?tab=pending&q=${tag}`);
      await page.getByRole("link", { name: `${tag} Pending Course` }).first().click();
      await expect(page).toHaveURL(new RegExp(`/admin/courses/${c.courseId}$`));
      await expect(page.getByRole("list", { name: "Automatic checks" }).getByText("Thumbnail image - passes")).toBeVisible();

      // Inspect, note a section, start the review and ask for changes.
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "Add note on section Basics" }).click();
      await page.getByLabel("Note on section Basics").fill("Rename to Getting started");
      await page.getByRole("button", { name: "Save note" }).click();
      await expect(page.getByRole("list", { name: "Notes on section Basics" })).toBeVisible();
      const decisions = page.getByRole("group", { name: "Decisions" });
      await decisions.getByRole("button", { name: "Start review" }).click();
      await page.getByRole("button", { name: "Confirm start review" }).click();
      await decisions.getByRole("button", { name: "Request changes" }).click();
      await page.getByLabel(/Note to the instructor/).fill("Please act on the section note");
      await page.getByRole("button", { name: "Confirm request changes" }).click();
      await expect(page.getByText("Changes requested").first()).toBeVisible();

      // The instructor sees the feedback (including the section note) and resubmits.
      await ip.goto(`/instructor/courses/${c.courseId}`);
      await expect(ip.getByRole("heading", { name: "The reviewer asked for changes" })).toBeVisible();
      await expect(ip.getByRole("list", { name: "Reviewer notes" }).getByText("Rename to Getting started")).toBeVisible();
      await ip.goto(`/instructor/courses/${c.courseId}/submit`);
      await ip.waitForLoadState("networkidle");
      await ip.getByRole("button", { name: "Resubmit for review" }).click();
      await expect(ip.getByText("Submitted. A reviewer will pick this up soon.")).toBeVisible();

      // The admin approves and publishes; status is verified on the list.
      await page.goto(`/admin/courses/${c.courseId}`);
      await page.waitForLoadState("networkidle");
      await decisions.getByRole("button", { name: "Start review" }).click();
      await page.getByRole("button", { name: "Confirm start review" }).click();
      await decisions.getByRole("button", { name: "Approve" }).click();
      await page.getByRole("button", { name: "Confirm approve" }).click();
      await decisions.getByRole("button", { name: "Publish" }).click();
      await page.getByRole("button", { name: "Confirm publish" }).click();
      await expect(decisions.getByRole("button", { name: "Archive" })).toBeVisible();
      await page.goto(`/admin/courses?tab=published&q=${tag}`);
      await expect(page.getByRole("table").getByRole("link", { name: `${tag} Pending Course` })).toBeVisible();

      // Live for everyone.
      const live = await page.request.get(`/courses/${tag}-c`);
      expect(live.status()).toBe(200);

      // Audit trail: one event per decision, filterable in the screen.
      await page.goto(`/admin/audit?resourceId=${c.courseId}`);
      const table = page.getByRole("table");
      for (const label of ["Course submitted", "Course review started", "Course changes requested", "Course approved", "Course published"]) {
        await expect(table.getByText(label, { exact: true }).first()).toBeVisible();
      }
    } finally {
      await ictx.close();
      await done();
    }
  });

  test("user management leaves an audit record for every change", async ({ page }) => {
    test.setTimeout(150_000);
    const target = await createUserWithRole(svc, `${tag}-usr`, "learner");
    learnerIds.push(target.id);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto(`/admin/users?q=${tag}-usr&role=learner`);
      const row = page.getByRole("row").filter({ hasText: target.email });
      await expect(row).toBeVisible();
      await page.waitForLoadState("networkidle");
      await row.getByRole("button", { name: `Roles for ${target.email}` }).click();
      await page.getByRole("group", { name: `Roles for ${target.email}` }).getByLabel("Instructor").check();
      await page.getByRole("button", { name: "Save roles" }).click();
      await expect(row.getByText("Instructor, Learner")).toBeVisible();
      await row.getByRole("button", { name: `Suspend ${target.email}` }).click();
      await row.getByRole("button", { name: `Confirm suspend ${target.email}` }).click();
      await expect(row.getByText("Suspended", { exact: true })).toBeVisible({ timeout: 30_000 });

      await page.getByRole("button", { name: "Add user" }).click();
      const form = page.getByRole("form", { name: "Add user" });
      await form.getByLabel("Email").fill(`${tag}-added@example.com`);
      await form.getByLabel("Temporary password").fill("a-long-enough-pass");
      await form.getByRole("button", { name: "Create account" }).click();
      await expect(page.getByText(`Account created for ${tag}-added@example.com.`)).toBeVisible();

      await page.goto(`/admin/audit?resourceId=${target.id}`);
      const table = page.getByRole("table");
      await expect(table.getByText("User role changed")).toBeVisible();
      await expect(table.getByText("User suspended")).toBeVisible();
      await page.goto("/admin/audit?action=user.created");
      await expect(page.getByRole("table").getByText("User created").first()).toBeVisible();
    } finally {
      await done();
    }
  });
});
