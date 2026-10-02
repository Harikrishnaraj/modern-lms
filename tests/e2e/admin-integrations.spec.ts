import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-415: Integrations & API (T-142)
test.describe("integrations", () => {
  const svc = serviceClient();
  const tag = uniqueTag("intge2e");

  test.afterAll(async () => {
    await svc.from("api_keys").delete().like("name", `${tag}%`);
    await svc.from("webhook_endpoints").delete().like("url", `%${tag}%`);
    await cleanup(svc, { learnerIds: [], courseIds: [], userIds: [] });
  });

  test("creates an API key, calls the public API with it, and creates a webhook (T-142)", async ({ page, request, baseURL }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/integrations");
      await expect(page.getByRole("heading", { level: 1, name: "Integrations" })).toBeVisible();

      await page.getByLabel("Key name").fill(`${tag} Key`);
      await page.getByLabel("courses:read").check();
      await page.getByRole("button", { name: "Create key" }).click();
      await expect(page.getByText("copy it now")).toBeVisible();
      const key = (await page.locator("code").first().innerText()).trim();
      expect(key.startsWith("mlms_live_")).toBe(true);

      const apiRes = await request.get(`${baseURL}/api/v1/courses`, { headers: { authorization: `Bearer ${key}` } });
      expect(apiRes.status()).toBe(200);
      const body = await apiRes.json();
      expect(Array.isArray(body.data)).toBe(true);

      await page.reload();
      const keyRow = page.getByRole("listitem").filter({ hasText: `${tag} Key` });
      await expect(keyRow).toBeVisible();
      await keyRow.getByRole("button", { name: "Revoke" }).click();
      await expect(keyRow.getByText("Revoked")).toBeVisible();

      const afterRevoke = await request.get(`${baseURL}/api/v1/courses`, { headers: { authorization: `Bearer ${key}` } });
      expect(afterRevoke.status()).toBe(401);

      await page.getByLabel("Endpoint URL").fill(`https://example.com/${tag}`);
      await page.getByLabel("enrollment.created").check();
      await page.getByRole("button", { name: "Add webhook" }).click();
      await expect(page.getByText("copy the signing secret now")).toBeVisible();
      await expect(page.getByText(`https://example.com/${tag}`)).toBeVisible();
    } finally {
      await done();
    }
  });
});
