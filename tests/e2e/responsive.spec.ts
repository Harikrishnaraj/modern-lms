import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";

// T-245 (F-945, TEST_PLAN §18): responsive at 375/768/1024/1440 across the public site and every
// portal. Data tables use a horizontal-scroll pattern (overflow-x-auto + min-w on the table itself)
// rather than a card transform at 375px -- a deliberate, site-wide, already-consistent choice (see
// docs/MEMORY.md) checked here by asserting it never pushes the page itself into horizontal scroll.
const WIDTHS = [375, 768, 1024, 1440] as const;

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const { overflow, culprits } = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    // The outermost elements that stick out past the viewport, so a failure names what to fix.
    const culprits = [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().right > vw + 1 && !(e.parentElement && e.parentElement.getBoundingClientRect().right > vw + 1))
      .slice(0, 5)
      .map((e) => `<${e.tagName.toLowerCase()} class="${(e.getAttribute("class") ?? "").slice(0, 60)}"> ${(e.textContent ?? "").trim().slice(0, 40)}`);
    return { overflow: document.documentElement.scrollWidth - vw, culprits };
  });
  expect(overflow, `page wider than the viewport; outermost overflowing elements:\n${culprits.join("\n")}`).toBeLessThanOrEqual(0);
}

test.describe("responsive (public pages)", () => {
  for (const width of WIDTHS) {
    for (const path of ["/", "/login", "/signup", "/courses"]) {
      test(`${path} has no horizontal overflow at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await assertNoHorizontalOverflow(page);
      });
    }
  }
});

test.describe("responsive (portal shell)", () => {
  for (const role of ["learner", "instructor", "admin"] as const) {
    test(`${role} home adapts sidebar/drawer/bottom-bar correctly at every width`, async ({ page }) => {
      test.setTimeout(180_000);
      const done = await loginAsRole(page, role);
      try {
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`/${role}`);
          await assertNoHorizontalOverflow(page);

          const sidebarVisible = await page.locator("aside").first().isVisible();
          const hamburgerVisible = await page.getByRole("button", { name: "Open navigation" }).isVisible();
          if (width >= 1024) {
            expect(sidebarVisible).toBe(true);
            expect(hamburgerVisible).toBe(false);
          } else {
            expect(sidebarVisible).toBe(false);
            expect(hamburgerVisible).toBe(true);
          }

          if (role === "learner") {
            const bottomBarVisible = await page.getByRole("navigation", { name: "Primary" }).isVisible();
            expect(bottomBarVisible).toBe(width < 768);
          }
        }
      } finally {
        await done();
      }
    });
  }
});
