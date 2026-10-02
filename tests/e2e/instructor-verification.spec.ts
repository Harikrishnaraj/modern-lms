import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-403: Instructor verification queue (T-131)
test.describe("instructor verification", () => {
  const svc = serviceClient();
  const tag = uniqueTag("ivq");
  const learnerIds: string[] = [];

  let applicant: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    applicant = await createUserWithRole(svc, `${tag}-app`, "learner", { fullName: `${tag} Applicant` });
    learnerIds.push(applicant.id);
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds: [], userIds: [] });
  });

  test("a learner applies to teach and an admin approves, granting the instructor role", async ({ page }) => {
    test.setTimeout(180_000);

    // 1. Learner applies.
    await page.goto("/login");
    await page.getByLabel("Email").fill(applicant.email);
    await page.getByLabel("Password").fill(applicant.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");

    await page.goto("/learner/settings");
    await expect(page.getByRole("heading", { name: "Teach on Modern LMS" })).toBeVisible();
    await page
      .getByLabel("Why would you like to teach on Modern LMS?")
      .fill("I have five years of professional experience I would like to share with learners.");
    await page.getByRole("button", { name: "Apply to teach" }).click();
    await expect(page.getByText("Pending review")).toBeVisible();

    // 2. Admin reviews and approves.
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/instructors");
      await expect(page.getByRole("heading", { level: 1, name: "Instructors" })).toBeVisible();
      // Scoped to the queue: once approved, the person also appears in "All instructors" below.
      const row = page.getByRole("list", { name: "Applications awaiting review" }).getByRole("listitem").filter({ hasText: `${tag} Applicant` });
      await expect(row).toBeVisible();
      await row.getByRole("button", { name: "Approve" }).click();
      await expect(row).toHaveCount(0);
    } finally {
      await done();
    }

    // 3. The applicant now has the instructor role and lands in the instructors list.
    const { data: roles } = await svc.from("user_roles").select("role_id").eq("user_id", applicant.id);
    expect((roles ?? []).map((r) => r.role_id)).toContain("instructor");
  });
});
