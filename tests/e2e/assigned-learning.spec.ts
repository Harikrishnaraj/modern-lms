import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-502: Assigned learning -- due dates and overdue tracking (T-163)
test.describe("assigned learning", () => {
  const svc = serviceClient();
  const tag = uniqueTag("asle");
  const orgIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let learner: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Assigned Course`, publish: true });
    courseIds.push(course.courseId);

    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner", { fullName: `${tag} Learner` });
    learnerIds.push(learner.id);

    const { data: org } = await svc.from("organizations").insert({ name: `${tag} Org`, slug: `${tag}-org` }).select("id").single();
    orgIds.push(org!.id);
    await svc.from("organization_members").insert({ organization_id: org!.id, user_id: learner.id, org_role: "member" });
  });

  test.afterAll(async () => {
    if (orgIds.length) await svc.from("organizations").delete().in("id", orgIds);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("an org admin assigns a course to the whole organization, and the member sees it (T-163)", async ({ page }) => {
    test.setTimeout(180_000);
    const { data: org } = await svc.from("organizations").select("id").eq("slug", `${tag}-org`).single();
    const done = await loginAsRole(page, "org_admin");
    try {
      await svc.from("organization_members").insert({ organization_id: org!.id, user_id: done.userId, org_role: "org_admin" });
      await done.login();
      await expect(page).toHaveURL(/\/org_admin$/);

      await page.getByLabel("Content").selectOption("course");
      await page.getByPlaceholder("Search published courses…").fill(`${tag} Assigned Course`);
      await page.getByRole("button", { name: `${tag} Assigned Course` }).click();
      await page.getByLabel("Assign to").selectOption("organization");
      await page.getByRole("button", { name: "Assign" }).click();
      await expect(page.getByText(`${tag} Assigned Course`).first()).toBeVisible();
      await expect(page.getByText("0/2 complete")).toBeVisible();

      await page.context().clearCookies();
      await page.goto("/login");
      await page.getByLabel("Email").fill(learner.email);
      await page.getByLabel("Password").fill(learner.password);
      await page.getByRole("button", { name: "Log in" }).click();
      await page.waitForURL("/learner");
      await page.goto("/learner/my-learning");
      await expect(page.getByRole("heading", { name: "Assigned to you" })).toBeVisible();
      await expect(page.getByRole("link", { name: `${tag} Assigned Course` })).toBeVisible();
    } finally {
      await done();
    }
  });
});
