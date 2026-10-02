import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, serviceClient } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-416: Settings & Security (T-143)
test.describe("platform settings", () => {
  const svc = serviceClient();

  test.afterAll(async () => {
    // platform_settings is a single global row: always restore the defaults (MFA for both
    // back-office portals since T-162) so this spec never leaves other tests on an altered policy.
    await svc.from("platform_settings").update({ min_password_length: 8, mfa_required_portals: ["admin", "org_admin"], session_idle_timeout_minutes: null }).eq("id", true);
    await cleanup(svc, { learnerIds: [], courseIds: [], userIds: [] });
  });

  test("raises the minimum password length and it takes effect (T-143)", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/settings");
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

      await page.getByLabel("Minimum password length").fill("14");
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Saved.")).toBeVisible();

      await page.reload();
      await expect(page.getByLabel("Minimum password length")).toHaveValue("14");

      await expect(page.getByText("settings.changed").first()).toBeVisible();
    } finally {
      await done();
    }
  });
});
