import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("course detail page (F-102)", () => {
  const svc = serviceClient();
  const tag = uniqueTag("dt");
  const courseIds: string[] = [];
  const userIds: string[] = [];

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor", {
      fullName: "Detail Teacher",
    });
    userIds.push(instructor.id);
    const pub = await createCourse(svc, instructor.id, {
      slug: `${tag}-pub`,
      title: `${tag} Mastery`,
      subtitle: "Everything you need",
      description: "Para one.\n\nPara two.",
      priceCents: 2500,
      ratingAvg: 4.6,
      ratingCount: 21,
      outcomes: ["Build things", "Ship things"],
      requirements: ["A laptop"],
      sections: [
        {
          title: "Basics",
          lessons: [
            { title: "Intro video", type: "video", minutes: 6, preview: true },
            { title: "Hidden lesson", type: "text", minutes: 4, content: "TOP-SECRET" },
          ],
        },
      ],
    });
    const draft = await createCourse(svc, instructor.id, {
      slug: `${tag}-draft`,
      title: `${tag} Draft`,
      publish: false,
    });
    courseIds.push(pub.courseId, draft.courseId);
  });

  test.afterAll(() => cleanup(svc, { courseIds, userIds }));

  test("shows outcomes, curriculum preview, instructor, rating and price", async ({ page }) => {
    await page.goto(`/courses/${tag}-pub`);
    await expect(page.getByRole("heading", { level: 1, name: `${tag} Mastery` })).toBeVisible();
    await expect(page.getByText("Everything you need")).toBeVisible();
    await expect(page.getByText("Taught by Detail Teacher")).toBeVisible();
    // The header summary (the reviews section further down repeats the average).
    await expect(page.getByText("4.6", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("(21 ratings)")).toBeVisible();

    await expect(page.getByRole("heading", { name: "What you will learn" })).toBeVisible();
    await expect(page.getByText("Build things")).toBeVisible();
    await expect(page.getByText("Para two.")).toBeVisible();
    await expect(page.getByText("A laptop")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Curriculum" })).toBeVisible();
    await expect(page.getByText("Intro video")).toBeVisible();
    await expect(page.getByText("Preview", { exact: true })).toBeVisible();
    await expect(page.getByText("Hidden lesson")).toBeVisible(); // title only
    await expect(page.getByText("TOP-SECRET")).toHaveCount(0);

    await expect(page.getByRole("complementary", { name: "Course summary" })).toContainText(
      "$25.00",
    );
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
  });

  test("has SEO metadata and structured data", async ({ page }) => {
    await page.goto(`/courses/${tag}-pub`);
    await expect(page).toHaveTitle(new RegExp(`${tag} Mastery`));
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Everything you need",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/courses/${tag}-pub$`),
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      `${tag} Mastery`,
    );
    const ld = JSON.parse(
      (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
    );
    expect(ld).toMatchObject({ "@type": "Course", name: `${tag} Mastery` });
    expect(ld.aggregateRating.ratingCount).toBe(21);
  });

  test("returns 404 for an unpublished or unknown course", async ({ page }) => {
    for (const slug of [`${tag}-draft`, `${tag}-missing`, "Not%20A%20Slug"]) {
      const res = await page.goto(`/courses/${slug}`);
      expect(res?.status(), slug).toBe(404);
    }
  });

  test("links from the catalog card to the detail page", async ({ page }) => {
    await page.goto(`/courses?q=${tag}`);
    await page.getByRole("link", { name: `${tag} Mastery` }).click();
    await expect(page).toHaveURL(`/courses/${tag}-pub`);
    await expect(page.getByRole("heading", { level: 1, name: `${tag} Mastery` })).toBeVisible();
  });

  test("has no horizontal scroll at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/courses/${tag}-pub`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
});
