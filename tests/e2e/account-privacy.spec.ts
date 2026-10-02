import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-943 (T-243, SECURITY.md §21): data export, and the account deletion request/cancel workflow.
test.describe("account privacy", () => {
  const svc = serviceClient();
  const tag = uniqueTag("priv");
  const userIds: string[] = [];

  let learner: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    learner = await createUserWithRole(svc, `${tag}-l`, "learner", { fullName: `${tag} Learner` });
    userIds.push(learner.id);
  });

  test.afterAll(async () => {
    await cleanup(svc, { userIds });
  });

  test("downloads a data export, requests account deletion, then cancels it", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(learner.email);
    await page.getByLabel("Password").fill(learner.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");

    await page.goto("/learner/settings");
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download my data" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^my-data-.*\.json$/);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByText(/scheduled for deletion on/)).toBeVisible();

    await page.getByRole("button", { name: "Cancel deletion request" }).click();
    await expect(page.getByRole("button", { name: "Delete my account" })).toBeVisible();

    const { data } = await svc.from("profiles").select("deletion_requested_at").eq("id", learner.id).maybeSingle();
    expect(data?.deletion_requested_at).toBeNull();
  });
});
