import { readFileSync } from "node:fs";
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

// F-109 / F-110 / TEST_PLAN section 9. Default storageState = the shared e2e learner.
test.describe("certificates", () => {
  const svc = serviceClient();
  const tag = uniqueTag("cf");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let learnerId: string;
  let learnerEmail: string;
  let goodCode: string;
  let revokedCode: string;
  let goodCertId: string;
  let instructorId: string;
  const enrollmentIds: string[] = [];

  async function issue(courseSlug: string, title: string) {
    const c = await createCourse(svc, instructorId, { slug: courseSlug, title });
    courseIds.push(c.courseId);
    const { data: enr } = await svc
      .from("enrollments")
      .insert({
        user_id: learnerId,
        course_id: c.courseId,
        version_id: c.versionId,
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    enrollmentIds.push(enr!.id);
    const { data: cert } = await svc
      .from("certificates")
      .insert({
        enrollment_id: enr!.id,
        user_id: learnerId,
        course_id: c.courseId,
        version_id: c.versionId,
        learner_name: "Ada E2E Learner",
        course_title: title,
        instructor_name: "Grace Teacher",
      })
      .select("id, code")
      .single();
    return cert!;
  }

  test.beforeAll(async () => {
    const meta = JSON.parse(readFileSync("tests/e2e/.auth/user.meta.json", "utf8"));
    learnerId = meta.userId;
    learnerEmail = meta.email;
    // fullyParallel can run this beforeAll/afterAll pair more than once in one worker; always use
    // the instructor created in *this* round (userIds[0] may already be deleted by an earlier afterAll).
    const instructor = await createUserWithRole(svc, `${tag}-inst-${userIds.length}`, "instructor");
    instructorId = instructor.id;
    userIds.push(instructor.id);
    const good = await issue(`${tag}-good`, `${tag} Valid Course`);
    goodCode = good.code;
    goodCertId = good.id;
    const revoked = await issue(`${tag}-rev`, `${tag} Revoked Course`);
    revokedCode = revoked.code;
    await svc
      .from("certificates")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_reason: "test" })
      .eq("id", revoked.id);
  });

  test.afterAll(() => cleanup(svc, { courseIds, userIds }));

  test("the learner sees earned certificates with status and a verification link", async ({ page }) => {
    await page.goto("/learner/certificates");
    await expect(page.getByRole("heading", { level: 1, name: "Certificates" })).toBeVisible();
    const card = page.getByRole("listitem").filter({ hasText: `${tag} Valid Course` });
    await expect(card).toContainText(goodCode);
    await expect(card.getByText("Valid", { exact: true })).toBeVisible();
    const revoked = page.getByRole("listitem").filter({ hasText: `${tag} Revoked Course` });
    await expect(revoked.getByText("Revoked", { exact: true })).toBeVisible();

    await card.getByRole("link", { name: "View certificate" }).click();
    await expect(page).toHaveURL(`/certificates/verify/${goodCode}`);
    await expect(page.getByRole("heading", { name: "This certificate is valid" })).toBeVisible();
  });

  test("the public verify page works signed out and shows only printed details", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    const res = await page.goto(`/certificates/verify/${goodCode.toLowerCase()}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "This certificate is valid" })).toBeVisible();
    await expect(page.getByText("Ada E2E Learner")).toBeVisible();
    await expect(page.getByText(`${tag} Valid Course`)).toBeVisible();
    await expect(page.getByText("Grace Teacher")).toBeVisible();
    await expect(page.getByText(goodCode)).toBeVisible();

    // No private data anywhere in the delivered HTML.
    const html = await page.content();
    for (const secret of [learnerEmail, learnerId, goodCertId, "revoked_reason"]) {
      expect(html, secret).not.toContain(secret);
    }
    await context.close();
  });

  test("a revoked certificate says so", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto(`/certificates/verify/${revokedCode}`);
    await expect(page.getByRole("heading", { name: "This certificate has been revoked" })).toBeVisible();
    await expect(page.getByText(/should no longer be relied on/)).toBeVisible();
    await context.close();
  });

  test("unknown and malformed IDs are a 404", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    for (const id of ["MLC-0000-0000-0000-0000", "not-a-code", "MLC-9F2A-1C4B-77D0"]) {
      const res = await page.goto(`/certificates/verify/${id}`);
      expect(res?.status(), id).toBe(404);
    }
    await context.close();
  });

  test("the lookup form takes a typed ID and rejects a bad one", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/certificates/verify");
    await page.getByLabel("Certificate ID").fill("garbage");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("That is not a valid certificate ID.")).toBeVisible();

    await page.getByLabel("Certificate ID").fill(`  ${goodCode.toLowerCase()} `);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(`/certificates/verify/${goodCode}`);
    await context.close();
  });

  test("another learner does not see these certificates", async ({ browser }) => {
    const other = await createUserWithRole(svc, `${tag}-out`, "learner");
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await page.goto("/login");
      await page.getByLabel("Email").fill(other.email);
      await page.getByLabel("Password").fill(other.password);
      await page.getByRole("button", { name: "Log in" }).click();
      await page.waitForURL("/learner");
      await page.goto("/learner/certificates");
      await expect(page.getByText("No certificates yet")).toBeVisible();
      await expect(page.getByText(goodCode)).toHaveCount(0);
    } finally {
      await context.close();
      await svc.auth.admin.deleteUser(other.id);
    }
  });
});
