import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { recordAudit } from "@/services/audit";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-417: admin profile — personal info, security, notification preferences, my recent actions.
test.describe("admin profile", () => {
  test("opens from the header icon, and shows the admin's own recent actions", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await recordAudit({ actorId: done.userId, action: "course.published", resourceType: "course", resourceId: "abc123" });

      await page.getByRole("link", { name: "My profile" }).click();
      await expect(page).toHaveURL(/\/admin\/profile$/);
      await expect(page.getByRole("heading", { level: 1, name: "Profile" })).toBeVisible();

      const profile = page.getByRole("form", { name: "Profile" });
      await expect(profile.getByLabel("Email")).toHaveValue(done.email);

      await expect(page.getByRole("heading", { name: "My recent actions" })).toBeVisible();
      await expect(page.getByText("course.published")).toBeVisible();
      await expect(page.getByText(/course #abc123/)).toBeVisible();

      await expect(page.getByRole("heading", { name: "Notification preferences" })).toBeVisible();
      const toggle = page.getByRole("checkbox", { name: "In-app notifications for Courses", exact: true });
      await expect(toggle).toBeChecked();
      await toggle.uncheck();
      // The checkbox is disabled while the preference saves; reload only once the save is done.
      await expect(toggle).toBeEnabled();
      await page.reload();
      await expect(page.getByRole("checkbox", { name: "In-app notifications for Courses", exact: true })).not.toBeChecked();
    } finally {
      await done();
    }
  });
});
