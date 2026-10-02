import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-401 / TEST_PLAN section 13: search, role change, suspension, add and invite, all through the UI.
test.describe("admin user management", () => {
  const svc = serviceClient();
  const tag = uniqueTag("au");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let target: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    target = await createUserWithRole(svc, `${tag}-target`, "learner");
    learnerIds.push(target.id);
  });

  test.afterAll(async () => {
    const { data } = await svc.from("audit_logs").select("resource_id").eq("action", "user.created").like("metadata->>email", `${tag}%`);
    const created = (data ?? []).map((r) => r.resource_id as string);
    const { data: invited } = await svc.from("audit_logs").select("resource_id").eq("action", "user.invited").like("metadata->>email", `${tag}%`);
    await cleanup(svc, {
      learnerIds,
      courseIds: [],
      userIds: [...userIds, ...created, ...(invited ?? []).map((r) => r.resource_id as string)],
    });
  });

  test("finds a user, changes their role, suspends and reinstates them", async ({ page }) => {
    test.setTimeout(150_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto(`/admin/users?q=${tag}`);
      await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
      const row = page.getByRole("row").filter({ hasText: target.email });
      await expect(row).toBeVisible();
      await expect(row.getByText("Learner", { exact: true })).toBeVisible();
      await page.waitForLoadState("networkidle");

      // Role: add instructor.
      await row.getByRole("button", { name: `Roles for ${target.email}` }).click();
      await page.getByRole("group", { name: `Roles for ${target.email}` }).getByLabel("Instructor").check();
      await page.getByRole("button", { name: "Save roles" }).click();
      await expect(row.getByText("Instructor, Learner")).toBeVisible();

      // Admin roles are not offered to a plain admin.
      await row.getByRole("button", { name: `Roles for ${target.email}` }).click();
      await expect(page.getByRole("group", { name: `Roles for ${target.email}` }).getByLabel("Super admin")).toBeDisabled();

      // Suspend, and the account cannot sign in.
      await row.getByRole("button", { name: `Suspend ${target.email}` }).click();
      await row.getByRole("button", { name: `Confirm suspend ${target.email}` }).click();
      await expect(row.getByText("Suspended", { exact: true })).toBeVisible();

      const other = await page.context().browser()!.newContext();
      const p2 = await other.newPage();
      await p2.goto("/login");
      await p2.getByLabel("Email").fill(target.email);
      await p2.getByLabel("Password").fill(target.password);
      await p2.getByRole("button", { name: "Log in" }).click();
      await expect(p2.getByRole("alert")).toBeVisible();
      await other.close();

      // Filter shows them under suspended, then reinstate.
      await page.goto(`/admin/users?q=${tag}&status=suspended`);
      const row2 = page.getByRole("row").filter({ hasText: target.email });
      await expect(row2).toBeVisible();
      await page.waitForLoadState("networkidle");
      await row2.getByRole("button", { name: `Reinstate ${target.email}` }).click();
      await row2.getByRole("button", { name: `Confirm reinstate ${target.email}` }).click();
      await expect(page.getByRole("row").filter({ hasText: target.email })).toHaveCount(0);

      // Empty state for a search with no results.
      await page.goto("/admin/users?q=zzz-nobody-here");
      await expect(page.getByText("No users match")).toBeVisible();
    } finally {
      await done();
    }
  });

  test("adds a user with a role and creates an invitation link", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto(`/admin/users?q=${tag}`);
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "Add user" }).click();
      const form = page.getByRole("form", { name: "Add user" });
      await form.getByLabel("Email").fill(`${tag}-added@example.com`);
      await form.getByLabel("Full name").fill("Added Person");
      await form.getByLabel("Temporary password").fill("short");
      await form.getByLabel("Role").selectOption("instructor");
      await form.getByRole("button", { name: "Create account" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "at least 12 characters" })).toBeVisible();
      await form.getByLabel("Temporary password").fill("a-long-enough-pass");
      await form.getByRole("button", { name: "Create account" }).click();
      await expect(page.getByText(`Account created for ${tag}-added@example.com.`)).toBeVisible();
      await expect(page.getByRole("row").filter({ hasText: `${tag}-added@example.com` })).toBeVisible();

      await page.getByRole("button", { name: "Invite user" }).click();
      const invite = page.getByRole("form", { name: "Invite user" });
      await invite.getByLabel("Email").fill(`${tag}-invitee@example.com`);
      await invite.getByRole("button", { name: "Create invitation" }).click();
      await expect(page.getByText(`Invitation created for ${tag}-invitee@example.com`)).toBeVisible();
      // An absolute link to Supabase Auth's verify endpoint (https on the hosted project, http locally).
      await expect(page.locator("code")).toContainText("/auth/v1/verify?token=");
    } finally {
      await done();
    }
  });

  test("a support agent can search but sees no actions; an instructor is denied", async ({ page }) => {
    const done = await loginAsRole(page, "support_agent");
    try {
      await page.goto(`/admin/users?q=${tag}`);
      await expect(page.getByRole("row").filter({ hasText: target.email })).toBeVisible();
      await expect(page.getByRole("button", { name: "Add user" })).toHaveCount(0);
      await expect(page.getByRole("columnheader", { name: "Actions" })).toHaveCount(0);
    } finally {
      await done();
    }
    const other = await loginAsRole(page, "instructor");
    try {
      await page.goto("/admin/users");
      await expect(page).toHaveURL(/permission-denied/);
    } finally {
      await other();
    }
  });
});
