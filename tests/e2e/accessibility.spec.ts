import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAsRole } from "./support/role-user";

// T-244 (F-944, TEST_PLAN §19): automated WCAG 2.2 AA scan across a representative screen from
// every portal plus the public site. This is the repeatable half of the audit; the checklist items
// axe cannot see (keyboard-only navigation, dialog focus trap, Escape closes overlays, reduced
// motion) were reviewed by hand against the shared primitives every screen is built from --
// PortalShell's nav drawer (a native <dialog>, so focus trap/Escape/inert background are free),
// globals.css's blanket :focus-visible outline and prefers-reduced-motion rule, and StatusBadge's
// always-paired label+color -- see docs/MEMORY.md for the reasoning.

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
}

test.describe("accessibility (public pages)", () => {
  for (const path of ["/login", "/signup", "/forgot-password", "/courses"]) {
    test(`${path} has no automatically detectable WCAG 2.2 AA violations`, async ({ page }) => {
      await page.goto(path);
      const results = await scan(page);
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }
});

test.describe("accessibility (portal pages)", () => {
  for (const role of ["learner", "instructor", "admin"] as const) {
    test(`${role} home has no automatically detectable WCAG 2.2 AA violations`, async ({ page }) => {
      test.setTimeout(180_000);
      const done = await loginAsRole(page, role);
      try {
        await page.goto(`/${role}`);
        const results = await scan(page);
        expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
      } finally {
        await done();
      }
    });
  }
});
