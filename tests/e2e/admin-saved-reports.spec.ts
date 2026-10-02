import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-412: Platform analytics — saved reports and scheduled export (T-140)
test.describe("saved reports", () => {
  const svc = serviceClient();
  const tag = uniqueTag("repe2e");

  test.afterAll(async () => {
    await svc.from("saved_reports").delete().like("name", `${tag}%`);
    await cleanup(svc, { learnerIds: [], courseIds: [], userIds: [] });
  });

  test("creates a saved report, runs it, and deletes it (T-140)", async ({ page, context }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/analytics");
      await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Saved reports" })).toBeVisible();

      await page.getByLabel("Report name").fill(`${tag} Weekly Digest`);
      await page.getByLabel("Schedule").selectOption("weekly");
      await page.getByRole("button", { name: "Save report" }).click();
      await expect(page.getByText(`${tag} Weekly Digest`)).toBeVisible();
      await expect(page.getByText(/Auto-runs weekly/)).toBeVisible();

      const [download] = await Promise.all([
        context.waitForEvent("page"),
        page.getByRole("button", { name: "Run now" }).click(),
      ]);
      await download.close();

      await page.getByRole("button", { name: `Delete ${tag} Weekly Digest` }).click();
      await expect(page.getByText(`${tag} Weekly Digest`)).toHaveCount(0);
    } finally {
      await done();
    }
  });
});
