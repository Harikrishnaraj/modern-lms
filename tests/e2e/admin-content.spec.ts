import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-410: Admin content oversight (T-138)
test.describe("admin content oversight", () => {
  const svc = serviceClient();
  const tag = uniqueTag("acnte2e");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let resourceId: string;

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    const { data: resource } = await svc
      .from("resource_library_items")
      .insert({ owner_id: instructor.id, name: `${tag}-handout.pdf`, storage_path: `${tag}/handout.pdf`, mime_type: "application/pdf", size_bytes: 2048 })
      .select("id")
      .single();
    resourceId = resource!.id;
  });

  test.afterAll(async () => {
    if (resourceId) await svc.from("resource_library_items").delete().eq("id", resourceId);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("finds and deletes a resource-library item (T-138)", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/content");
      await expect(page.getByRole("heading", { level: 1, name: "Content" })).toBeVisible();

      await page.getByLabel("Search content").fill(`${tag}-handout`);
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(page.getByRole("cell", { name: `${tag}-handout.pdf`, exact: true })).toBeVisible();

      await page.getByRole("button", { name: `Delete ${tag}-handout.pdf` }).click();
      await page.getByRole("button", { name: "Confirm delete" }).click();
      await expect(page.getByText("No matching resources")).toBeVisible();
    } finally {
      await done();
    }
  });
});
