import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-404: Roles & Permissions matrix editor (T-133)
test.describe("roles & permissions matrix", () => {
  const svc = serviceClient();
  const tag = uniqueTag("rpe");
  const testPermissionId = `${tag}.test_permission`;

  test.beforeAll(async () => {
    const { error } = await svc.from("permissions").insert({ id: testPermissionId, description: `${tag} test permission` });
    if (error) throw error;
  });

  test.afterAll(async () => {
    await svc.from("permissions").delete().eq("id", testPermissionId);
  });

  test("Super Admin can toggle a permission for a role, and it persists", async ({ page }) => {
    test.setTimeout(180_000);
    const done = await loginAsRole(page, "super_admin");
    try {
      await page.goto("/admin/roles");
      await expect(page.getByRole("heading", { level: 1, name: "Roles & Permissions" })).toBeVisible();

      const checkbox = page.getByLabel(`Content reviewer: ${testPermissionId}`);
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
      await expect(checkbox).toBeChecked();

      await page.reload();
      await expect(page.getByLabel(`Content reviewer: ${testPermissionId}`)).toBeChecked();

      // Clean up the toggle so re-runs start from the same state.
      await page.getByLabel(`Content reviewer: ${testPermissionId}`).uncheck();
      await expect(page.getByLabel(`Content reviewer: ${testPermissionId}`)).not.toBeChecked();
    } finally {
      await done();
    }
  });

  test("a plain admin cannot access the permission matrix", async ({ page }) => {
    test.setTimeout(180_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/roles");
      await expect(page.getByText("You cannot edit the permission matrix")).toBeVisible();
    } finally {
      await done();
    }
  });
});
