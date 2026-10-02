import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-501: Org Admin scoped portal access, own org only (T-162)
test.describe("org admin scoped portal", () => {
  const svc = serviceClient();
  const tag = uniqueTag("oape");
  const orgIds: string[] = [];
  const learnerIds: string[] = [];

  test.afterAll(async () => {
    if (orgIds.length) await svc.from("organizations").delete().in("id", orgIds);
    await cleanup(svc, { learnerIds, courseIds: [], userIds: [] });
  });

  test("lands an org admin on their own org, blocks the admin console, and isolates other orgs (T-162)", async ({ page }) => {
    test.setTimeout(180_000);
    const { data: orgA } = await svc.from("organizations").insert({ name: `${tag} Org A`, slug: `${tag}-org-a` }).select("id").single();
    const { data: orgB } = await svc.from("organizations").insert({ name: `${tag} Org B`, slug: `${tag}-org-b` }).select("id").single();
    orgIds.push(orgA!.id, orgB!.id);

    const learner = await createUserWithRole(svc, `${tag}-lrn`, "learner", { fullName: `${tag} Learner` });
    learnerIds.push(learner.id);

    const done = await loginAsRole(page, "org_admin");
    try {
      await svc.from("organization_members").insert({ organization_id: orgA!.id, user_id: done.userId, org_role: "org_admin" });

      // Logging in again lands them on their scoped portal, not the admin console.
      await done.login();
      await expect(page).toHaveURL(/\/org_admin$/);
      await expect(page.getByRole("heading", { level: 1, name: `${tag} Org A` })).toBeVisible();

      // The admin console is fully off limits, not just the organizations screen.
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/permission-denied$/);
      await page.goto("/admin/users");
      await expect(page).toHaveURL(/\/permission-denied$/);

      // Back on their own scoped portal: can add a member to their own org.
      await page.goto("/org_admin");
      await page.getByPlaceholder("Search by name or email…").fill(`${tag} Learner`);
      await page.getByRole("button", { name: `${tag} Learner` }).click();
      await page.getByRole("button", { name: "Add member" }).click();
      await expect(page.getByText("Members (1)")).toBeVisible();

      // Org B is invisible: direct navigation to the admin detail URL for it 404s/denies rather
      // than leaking its name (org admin holds no organizations.manage permission at all).
      await page.goto(`/admin/organizations/${orgB!.id}`);
      await expect(page).toHaveURL(/\/permission-denied$/);
    } finally {
      await done();
    }
  });
});
