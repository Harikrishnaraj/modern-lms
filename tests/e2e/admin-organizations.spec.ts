import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-500: Admin Organizations screen (T-161)
test.describe("admin organizations", () => {
  const svc = serviceClient();
  const tag = uniqueTag("aorge");
  const learnerIds: string[] = [];

  let learner: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner", { fullName: `${tag} Learner` });
    learnerIds.push(learner.id);
  });

  test.afterAll(async () => {
    await svc.from("organizations").delete().like("slug", `${tag}-%`);
    await cleanup(svc, { learnerIds, courseIds: [], userIds: [] });
  });

  test("creates an organization, adds a member, changes their role, then removes them (T-161)", async ({ page }) => {
    test.setTimeout(180_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/organizations");
      await expect(page.getByRole("heading", { level: 1, name: "Organizations" })).toBeVisible();

      // 1. Create.
      await page.getByLabel("Name", { exact: true }).fill(`${tag} Org`);
      await page.getByLabel("Slug", { exact: true }).fill(`${tag}-org`);
      await page.getByRole("button", { name: "Create organization" }).click();
      await page.waitForURL(/\/admin\/organizations\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { level: 1, name: `${tag} Org` })).toBeVisible();

      // 2. Rename.
      const nameInput = page.getByLabel("Name", { exact: true });
      await nameInput.fill(`${tag} Org Renamed`);
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Saved.")).toBeVisible();

      // 3. Add a member by search, then promote to Org Admin.
      await page.getByPlaceholder("Search by name or email…").fill(`${tag} Learner`);
      await page.getByRole("button", { name: `${tag} Learner` }).click();
      await page.getByRole("button", { name: "Add member" }).click();
      await expect(page.getByText("Members (1)")).toBeVisible();
      await page.getByLabel(`Role for ${tag} Learner`).selectOption("org_admin");
      await expect(page.getByLabel(`Role for ${tag} Learner`)).toHaveValue("org_admin");

      // 4. Remove.
      await page.getByRole("button", { name: `Remove ${tag} Learner from the organization` }).click();
      await expect(page.getByText("Members (0)")).toBeVisible();
    } finally {
      await done();
    }
  });
});
