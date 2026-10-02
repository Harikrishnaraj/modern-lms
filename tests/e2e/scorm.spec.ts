import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import JSZip from "jszip";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const MANIFEST = `<?xml version="1.0"?>
<manifest identifier="com.e2e.course" version="1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG1">
    <organization identifier="ORG1">
      <title>E2E SCORM Course</title>
      <item identifier="ITEM1" identifierref="RES1"><title>Lesson 1</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES1" type="webcontent" href="index.html" adlcp:scormtype="sco" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
      <file href="index.html" />
    </resource>
  </resources>
</manifest>`;

// Shaped like an authoring-tool export (e.g. Storyline): the launch file only routes to the real
// player page, which loads a separate driver script that finds the API the ADL way (parent
// frames first). The status text is assembled at runtime, so raw source shown as text can never
// satisfy the assertion.
const ROUTER_HTML = `<!doctype html><html><head><title>Router</title></head><body>
<script>window.location.replace("player/player.html");</script></body></html>`;
const PLAYER_HTML = `<!doctype html><html><head><title>SCO</title><script src="driver.js"></script></head>
<body><p id="state">loading</p>
<button id="finish" onclick="finish()">Finish lesson</button></body></html>`;
const DRIVER_JS = `
function findAPI(win) {
  for (var i = 0; i < 10 && win; i++) {
    try { if (win.parent && win.parent !== win && win.parent.API) return win.parent.API; } catch (e) {}
    if (win.parent === win) break;
    win = win.parent;
  }
  return null;
}
var api = findAPI(window);
window.addEventListener("load", function () {
  var el = document.getElementById("state");
  if (!api) { el.textContent = "NO " + "API"; return; }
  api.LMSInitialize("");
  var resumed = api.LMSGetValue("cmi.core.entry") === "resume";
  api.LMSSetValue("cmi.core.lesson_status", "incomplete");
  api.LMSSetValue("cmi.suspend_data", "step=1");
  api.LMSCommit("");
  el.textContent = "SCORM " + "READY " + (resumed ? "resumed" : "fresh") + " for " + api.LMSGetValue("cmi.core.student_name");
});
function finish() {
  api.LMSSetValue("cmi.core.lesson_status", "passed");
  api.LMSSetValue("cmi.core.score.raw", "88");
  api.LMSCommit("");
  document.getElementById("state").textContent = "SCORM " + "E2E " + "DONE";
}`;

async function buildScormZip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("imsmanifest.xml", MANIFEST);
  zip.file("index.html", ROUTER_HTML);
  zip.file("player/player.html", PLAYER_HTML);
  zip.file("player/driver.js", DRIVER_JS);
  return zip.generateAsync({ type: "nodebuffer" });
}

async function logIn(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** The package's own document: inside the host frame when a content origin is configured. */
function packageFrame(page: Page): FrameLocator {
  const player = page.frameLocator('iframe[title="SCORM content"]');
  return process.env.NEXT_PUBLIC_SCORM_CONTENT_ORIGIN ? player.frameLocator("#sco") : player;
}

// F-410: Content, media & SCORM (T-138)
test.describe("SCORM package upload and launch", () => {
  const svc = serviceClient();
  const tag = uniqueTag("scorme2e");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let instructor: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let lessonId: string;

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    // Uploaded as a draft (packages can only be changed on an editable version), published below.
    course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: false });
    courseIds.push(course.courseId);
    const { data: section } = await svc
      .from("course_sections")
      .insert({ version_id: course.versionId, title: `${tag} Section 2` })
      .select("id")
      .single();
    const { data: lesson } = await svc
      .from("lessons")
      .insert({ section_id: section!.id, title: `${tag} SCORM Lesson`, type: "scorm" })
      .select("id")
      .single();
    lessonId = lesson!.id;
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("instructor uploads a SCORM package; a learner runs it, resumes and completes it (T-138)", async ({ page }) => {
    test.setTimeout(240_000);

    // 1. Instructor uploads the package via the lesson editor.
    await logIn(page, instructor.email, instructor.password);
    await page.goto(`/instructor/courses/${course.courseId}/lessons/${lessonId}`);
    await page.getByLabel("Upload SCORM package").setInputFiles({ name: "package.zip", mimeType: "application/zip", buffer: await buildScormZip() });
    await expect(page.getByText("Package uploaded.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/SCORM 1\.2 package/)).toBeVisible();

    // Publish and enroll a learner.
    await svc.from("course_versions").update({ status: "published", published_at: new Date().toISOString() }).eq("id", course.versionId);
    await svc.from("courses").update({ published_version_id: course.versionId }).eq("id", course.courseId);
    const learner = await createUserWithRole(svc, `${tag}-lrn`, "learner", { fullName: `${tag} Learner` });
    learnerIds.push(learner.id);
    const { data: enrollment } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId, status: "active" })
      .select("id")
      .single();

    // 2. The learner launches it: the router, the sub-page and its script all load, and the
    //    driver finds the API. No manual "Mark complete" for SCORM.
    await logIn(page, learner.email, learner.password);
    const lessonUrl = `/learner/courses/${course.slug}/learn/${lessonId}`;
    await page.goto(lessonUrl);
    await expect(packageFrame(page).locator("#state")).toHaveText(`SCORM READY fresh for ${tag} Learner`, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: /mark complete/i })).toHaveCount(0);
    await expect
      .poll(async () => (await svc.from("scorm_registrations").select("suspend_data").eq("enrollment_id", enrollment!.id).maybeSingle()).data?.suspend_data ?? null, { timeout: 30_000 })
      .toBe("step=1");

    // 3. A fresh visit resumes from the saved state.
    await page.goto(lessonUrl);
    await expect(packageFrame(page).locator("#state")).toContainText("SCORM READY resumed", { timeout: 30_000 });

    // 4. Finishing reports passed; the lesson completes without the course reloading.
    await packageFrame(page).getByRole("button", { name: "Finish lesson" }).click();
    await expect(packageFrame(page).locator("#state")).toHaveText("SCORM E2E DONE");
    await expect
      .poll(async () => (await svc.from("lesson_progress").select("completed_at").eq("lesson_id", lessonId).eq("enrollment_id", enrollment!.id).maybeSingle()).data?.completed_at ?? null, { timeout: 30_000 })
      .not.toBeNull();
    await page.waitForTimeout(3000);
    await expect(packageFrame(page).locator("#state")).toHaveText("SCORM E2E DONE");
    const { data: reg } = await svc.from("scorm_registrations").select("lesson_status, score_raw").eq("enrollment_id", enrollment!.id).single();
    expect(reg).toMatchObject({ lesson_status: "passed", score_raw: 88 });
  });

  test("the package files are not served without a valid token", async ({ request }) => {
    const base = process.env.NEXT_PUBLIC_SCORM_CONTENT_ORIGIN || "";
    for (const path of ["index.html", "not-a-token/index.html", "00000000-0000-4000-8000-000000000000.9999999999.AAAA/index.html"]) {
      const res = await request.get(`${base}/api/scorm/${lessonId}/${path}`);
      expect(res.status(), path).toBe(404);
    }
  });
});
