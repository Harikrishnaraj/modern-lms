import { expect, test } from "@playwright/test";

// F-940: security headers present on every response (T-240), including routes proxy.ts's
// matcher never touches (its matcher is portal-access-check only, not the header source).
test.describe("security headers", () => {
  for (const path of ["/login", "/courses", "/signup"]) {
    test(`sets CSP and hardening headers on ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response).not.toBeNull();
      const headers = response!.headers();
      expect(headers["content-security-policy"]).toContain("default-src 'self'");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    });
  }
});
