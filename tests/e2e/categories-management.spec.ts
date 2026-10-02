import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-405: Categories management (T-134)
test.describe("categories management", () => {
  const svc = serviceClient();
  const tag = uniqueTag("catm");

  test.afterAll(async () => {
    await svc.from("categories").delete().like("slug", `${tag}-%`);
  });

  test("an admin creates, renames and deletes a category (T-134)", async ({ page }) => {
    test.setTimeout(180_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/courses/categories");
      await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible();

      // 1. Create.
      await page.getByLabel("Name", { exact: true }).fill(`${tag} New Category`);
      await page.getByLabel("Slug", { exact: true }).fill(`${tag}-new`);
      await page.getByRole("button", { name: "Add category" }).click();
      await expect(page.getByLabel(`Name for ${tag} New Category`)).toBeVisible();

      // 2. Rename.
      const nameInput = page.getByLabel(`Name for ${tag} New Category`);
      await nameInput.fill(`${tag} Renamed Category`);
      await page.getByLabel(`Slug for ${tag} New Category`).fill(`${tag}-renamed`);
      // The new name is only an input value so far (hasText ignores those): find the row by its input.
      await page.getByRole("listitem").filter({ has: nameInput }).getByRole("button", { name: "Save" }).click();
      await expect(page.getByLabel(`Name for ${tag} Renamed Category`)).toBeVisible();

      // 3. Delete (unused, so the delete button is enabled).
      // Anchor on the name input: the delete button's label text goes away once it asks to confirm.
      const row = page.getByRole("listitem").filter({ has: page.getByLabel(`Name for ${tag} Renamed Category`) });
      await row.getByRole("button", { name: `Delete ${tag} Renamed Category` }).click();
      await row.getByRole("button", { name: "Confirm delete" }).click();
      await expect(page.getByLabel(`Name for ${tag} Renamed Category`)).toHaveCount(0);
    } finally {
      await done();
    }
  });
});
