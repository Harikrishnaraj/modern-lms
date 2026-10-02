import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { AVATAR_BUCKET, supabaseStorage } from "@/services/storage";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

// F-116: profile, avatar and password from the learner settings page.
test.describe("learner settings", () => {
  // The second test signs in with the password the first test sets, so they run in order.
  test.describe.configure({ mode: "serial" });
  const svc = serviceClient();
  const tag = uniqueTag("set");
  const learnerIds: string[] = [];
  let learner: { id: string; email: string; password: string };

  async function signIn(page: Page, password: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(learner.email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
  }

  test.beforeAll(async () => {
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    learnerIds.push(learner.id);
  });

  test.afterAll(async () => {
    const { data } = await svc.storage.from(AVATAR_BUCKET).list(learner.id);
    if (data?.length) await supabaseStorage.remove(AVATAR_BUCKET, data.map((o) => `${learner.id}/${o.name}`)).catch(() => undefined);
    await cleanup(svc, { learnerIds, courseIds: [], userIds: [] });
  });

  test("edits the name and picture, rejects a bad file, then changes the password", async ({ page, isMobile }) => {
    test.setTimeout(180_000);
    await signIn(page, learner.password);
    await page.waitForURL("/learner");
    // On phones the sidebar lives behind the menu button.
    if (isMobile) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Settings" }).click();
    } else {
      await page.getByRole("navigation", { name: "Learner navigation" }).getByRole("link", { name: "Settings" }).click();
    }
    await expect(page).toHaveURL(/\/learner\/settings$/);
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Profile.
    const profile = page.getByRole("form", { name: "Profile" });
    await expect(profile.getByLabel("Email")).toHaveValue(learner.email);
    await expect(profile.getByLabel("Email")).toBeDisabled();
    await profile.getByLabel("Full name").fill("Grace   Hopper");
    await profile.getByLabel("Upload a new picture").setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") });
    await profile.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "must be a PNG, JPEG or WebP image" })).toBeVisible();

    await profile.getByLabel("Upload a new picture").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
    await profile.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await expect(page.getByAltText("Your current profile picture")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("form", { name: "Profile" }).getByLabel("Full name")).toHaveValue("Grace Hopper");
    await expect(page.getByAltText("Your current profile picture")).toBeVisible();

    // Remove the picture.
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Remove my picture").check();
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByAltText("Your current profile picture")).toHaveCount(0);

    // Password: mismatch, wrong current, then success.
    const pw = page.getByRole("form", { name: "Change password" });
    await pw.getByLabel("Current password").fill(learner.password);
    await pw.getByLabel("New password", { exact: true }).fill("a-brand-new-pass");
    await pw.getByLabel("Confirm new password").fill("something-else-1");
    await pw.getByRole("button", { name: "Change password" }).click();
    await expect(pw.getByText("The passwords do not match.")).toBeVisible();

    await pw.getByLabel("Current password").fill("not-my-password");
    await pw.getByLabel("Confirm new password").fill("a-brand-new-pass");
    await pw.getByRole("button", { name: "Change password" }).click();
    await expect(pw.getByText("That is not your current password.")).toBeVisible();

    await pw.getByLabel("Current password").fill(learner.password);
    await pw.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your password was changed." })).toBeVisible();

    // The new password signs in; the old one does not.
    await page.context().clearCookies();
    await signIn(page, learner.password);
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByLabel("Password").fill("a-brand-new-pass");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
  });

  test("the notification preferences link goes to the preferences", async ({ page }) => {
    await signIn(page, "a-brand-new-pass");
    await page.waitForURL("/learner");
    await page.goto("/learner/settings");
    await page.getByRole("link", { name: "your notification preferences" }).click();
    await expect(page).toHaveURL(/\/learner\/notifications/);
    await expect(page.getByRole("heading", { name: "Notification preferences" })).toBeVisible();
  });
});
