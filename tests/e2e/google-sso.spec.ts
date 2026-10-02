import { expect, test } from "@playwright/test";

// T-165 (F-504): "Continue with Google" starts Supabase's Google OAuth flow and returns to this
// deployment's /auth/callback. The Google consent screen itself is outside the app and not driven here.
test.use({ storageState: { cookies: [], origins: [] } });

for (const [path, label] of [
  ["/login", "Continue with Google"],
  ["/signup", "Sign up with Google"],
] as const) {
  test(`${path}: the Google button starts Google OAuth`, async ({ page, baseURL }) => {
    await page.goto(path);
    const authorize = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize") && r.url().includes("provider=google"));
    // Stop at the Supabase hop: no need to load Google's consent screen.
    await page.route("**/auth/v1/authorize**", (route) => route.abort());
    await page.getByRole("button", { name: label }).click();
    const url = new URL((await authorize).url());
    expect(url.searchParams.get("provider")).toBe("google");
    const back = new URL(url.searchParams.get("redirect_to")!);
    expect(back.origin).toBe(new URL(baseURL!).origin);
    expect(back.pathname).toBe("/auth/callback");
    expect(back.searchParams.get("sso")).toBe("google");
  });
}

test("a failed Google sign-in returns to login with a clear message", async ({ page }) => {
  await page.goto("/auth/callback?sso=google&error=access_denied");
  await expect(page).toHaveURL(/\/login\?error=sso_failed/);
  await expect(page.getByRole("alert").filter({ hasText: "Google sign-in did not complete" })).toBeVisible();
});
