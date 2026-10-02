import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";

// The e2e test user (see auth.setup.ts) only has the default "learner" role,
// so "/" role-aware-redirects it there (T-018).
test("signed-in visit to / redirects to the user's portal", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/learner$/);
});

test("signed-out landing links to signup and login", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
});

for (const [portal, target, heading] of [
  ["learner", "Certificates", "Certificates"],
  ["instructor", "Create Course", "Create a course"],
  ["admin", "Audit Logs", "Audit log"],
] as const) {
  test(`${portal} shell navigates to ${target}`, async ({ page, isMobile }) => {
    // Instructor/admin shells need a user holding that role (T-019 guards).
    const cleanup = portal === "learner" ? null : await loginAsRole(page, portal);
    try {
      await page.goto(`/${portal}`);
      if (isMobile) {
        await page.getByRole("button", { name: "Open navigation" }).click();
        await page
          .getByRole("dialog", { name: "Navigation" })
          .getByRole("link", { name: target })
          .click();
      } else {
        await page.getByRole("complementary").getByRole("link", { name: target }).click();
      }
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/${portal}/`));
    } finally {
      await cleanup?.();
    }
  });
}

test("unknown portal route is a 404", async ({ page }) => {
  const res = await page.goto("/learner/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("learner bottom bar is visible on mobile only", async ({ page, isMobile }) => {
  await page.goto("/learner");
  const bar = page.getByRole("navigation", { name: "Primary" });
  if (isMobile) await expect(bar).toBeVisible();
  else await expect(bar).toBeHidden();
});
