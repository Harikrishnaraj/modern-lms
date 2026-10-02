import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createAssessment, createAssignment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { startNewVersion } from "@/features/course-authoring/version-actions";
import { deleteAsset } from "@/features/course-authoring/lesson-actions";
import { getAssessmentForAuthoring } from "@/features/course-authoring/assessments";
import { transitionCourse } from "@/features/courses/transition";
import { getCourseDetail } from "@/features/catalog/course-detail";
import { getLessonContent } from "@/features/player/data";
import { ASSET_BUCKET, supabaseStorage } from "@/services/storage";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-212 / ADR-011: editing a live course starts a copied draft; learners keep the version they enrolled in.
describe.skipIf(!hasLiveProject)("course versioning (T-102, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("cv");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const objects: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  type U = { id: string; client: SupabaseClient };
  let owner: U, other: U, learner: U, reviewer: U;
  let c: Awaited<ReturnType<typeof createCourse>>;
  let prereq: Awaited<ReturnType<typeof createCourse>>;
  let assetPath: string;

  async function user(name: string, role: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }
  const as = (u: U) => {
    currentClient = u.client;
  };
  const versions = async () =>
    (await svc.from("course_versions").select("id, version_number, status, title").eq("course_id", c.courseId).order("version_number")).data!;

  beforeAll(async () => {
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner");
    reviewer = await user("rev", "content_reviewer");
    prereq = await createCourse(svc, owner.id, { slug: `${tag}-pre`, title: `${tag} Prereq`, publish: true });
    c = await createCourse(svc, owner.id, {
      slug: `${tag}-c`, title: `${tag} Live Course`, publish: true, priceCents: 1500,
      sections: [
        { title: "Intro", lessons: [{ title: "Welcome", type: "text", content: "<p>Welcome v1</p>", minutes: 5 }, { title: "Quiz time", type: "quiz", minutes: 3 }] },
        { title: "Deep dive", lessons: [{ title: "Advanced", type: "text", content: "<p>Advanced v1</p>", minutes: 10 }] },
      ],
    });
    courseIds.push(c.courseId, prereq.courseId);
    await svc.from("course_versions").update({ thumbnail_url: "https://example.com/thumb.png", outcomes: ["Learn it"] }).eq("id", c.versionId);
    await svc.from("course_prerequisites").insert({ version_id: c.versionId, prerequisite_course_id: prereq.courseId });
    assetPath = `${c.courseId}/${c.lessonIds[0]}/${tag}.txt`;
    await svc.storage.from(ASSET_BUCKET).upload(assetPath, Buffer.from("shared file"), { contentType: "text/plain" });
    objects.push(assetPath);
    await svc.from("lesson_assets").insert({ lesson_id: c.lessonIds[0], name: "notes.txt", storage_path: assetPath, mime_type: "text/plain", size_bytes: 11 });
    const quiz = await createAssessment(svc, c.versionId, {
      title: "Final quiz", lessonId: c.lessonIds[1], passMark: 60,
      questions: [
        { type: "mcq", prompt: "Pick the right one", options: ["Wrong", "Right", "Also wrong"], correct: [1], explanation: "Because right." },
        { type: "short_answer", prompt: "Capital?", acceptedAnswers: ["Paris"] },
      ],
    });
    void quiz;
    const asg = await createAssignment(svc, c.versionId, { title: "Essay", dueAt: "2031-03-18T10:00:00Z", maxPoints: 100 });
    await svc.from("assignment_rubric_criteria").insert([
      { assignment_id: asg.assignmentId, position: 0, title: "Content", description: "", max_points: 60 },
      { assignment_id: asg.assignmentId, position: 1, title: "Style", description: "", max_points: 40 },
    ]);
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: c.courseId, version_id: c.versionId });
  }, 200_000);

  afterAll(async () => {
    if (objects.length) await supabaseStorage.remove(ASSET_BUCKET, objects).catch(() => undefined);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("refuses everyone but the owner, and courses that are not live or archived", async () => {
    as(other);
    expect(await startNewVersion(c.courseId)).toEqual({ ok: false, error: "This course is not available." });
    as(learner);
    expect(await startNewVersion(c.courseId)).toEqual({ ok: false, error: "This course is not available." });
    const direct = await other.client.rpc("create_draft_version", { p_course_id: c.courseId });
    expect(direct.error).not.toBeNull();
    const draft = await createCourse(svc, owner.id, { slug: `${tag}-dr`, title: `${tag} Draft`, publish: false });
    courseIds.push(draft.courseId);
    as(owner);
    expect(await startNewVersion(draft.courseId)).toEqual({ ok: false, error: "This course is already being edited." });
    expect((await versions()).length).toBe(1);
  });

  it("copies the whole live version into a new draft, leaving the live one untouched", async () => {
    as(owner);
    expect(await startNewVersion(c.courseId)).toEqual({ ok: true, versionNumber: 2 });
    const vs = await versions();
    expect(vs.map((v) => [v.version_number, v.status])).toEqual([[1, "published"], [2, "draft"]]);
    const v2 = vs[1].id as string;

    const { data: sections } = await svc.from("course_sections").select("id, title, position, lessons(id, title, type, content, duration_minutes)").eq("version_id", v2).order("position");
    expect(sections!.map((s) => [s.title, (s.lessons as { title: string }[]).map((l) => l.title).sort()])).toEqual([["Intro", ["Quiz time", "Welcome"]], ["Deep dive", ["Advanced"]]]);
    const welcome = (sections![0].lessons as { id: string; title: string; content: string }[]).find((l) => l.title === "Welcome")!;
    expect(welcome.content).toBe("<p>Welcome v1</p>");
    expect(welcome.id).not.toBe(c.lessonIds[0]);

    const { data: v2row } = await svc.from("course_versions").select("price_cents, thumbnail_url, outcomes, duration_minutes, title").eq("id", v2).single();
    expect(v2row).toMatchObject({ price_cents: 1500, thumbnail_url: "https://example.com/thumb.png", outcomes: ["Learn it"], title: `${tag} Live Course` });
    expect(v2row!.duration_minutes).toBe(18);
    expect((await svc.from("course_prerequisites").select("prerequisite_course_id").eq("version_id", v2)).data).toEqual([{ prerequisite_course_id: prereq.courseId }]);
    expect((await svc.from("lesson_assets").select("name, storage_path").eq("lesson_id", welcome.id)).data).toEqual([{ name: "notes.txt", storage_path: assetPath }]);

    // The live course still serves version 1.
    expect((await getCourseDetail(anon(), `${tag}-c`))!.title).toBe(`${tag} Live Course`);
    expect((await svc.from("courses").select("published_version_id").eq("id", c.courseId).single()).data!.published_version_id).toBe(c.versionId);
    const audit = (await svc.from("audit_logs").select("action, metadata").eq("resource_id", c.courseId).eq("action", "course.version_created")).data!;
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toMatchObject({ versionNumber: 2, copiedFrom: 1 });

    // Only one draft at a time.
    expect(await startNewVersion(c.courseId)).toEqual({ ok: false, error: "This course is already being edited." });
  });

  it("copies assessments with a REMAPPED answer key, attached to the copied quiz lesson", async () => {
    const v2 = (await versions())[1].id as string;
    const a2 = (await svc.from("assessments").select("id, lesson_id, title, pass_mark").eq("version_id", v2).single()).data!;
    expect(a2).toMatchObject({ title: "Final quiz", pass_mark: 60 });
    const quizLesson = (await svc.from("lessons").select("id, title").eq("id", a2.lesson_id as string).single()).data!;
    expect(quizLesson.title).toBe("Quiz time");
    expect(quizLesson.id).not.toBe(c.lessonIds[1]);

    as(owner);
    const authoring = (await getAssessmentForAuthoring(owner.client, v2, a2.id as string))!;
    expect(authoring.questions.map((q) => q.prompt)).toEqual(["Pick the right one", "Capital?"]);
    const mcq = authoring.questions[0];
    expect(mcq.options.map((o) => [o.label, o.correct])).toEqual([["Wrong", false], ["Right", true], ["Also wrong", false]]);
    expect(mcq.explanation).toBe("Because right.");
    expect(authoring.questions[1].acceptedAnswers).toEqual(["Paris"]);
    // The copied key points at the COPIED options, not the originals.
    const originalOptionIds = ((await svc.from("assessment_options").select("id").in("question_id", (await svc.from("assessment_questions").select("id").eq("prompt", "Pick the right one").neq("assessment_id", a2.id as string).eq("assessment_id", (await svc.from("assessments").select("id").eq("version_id", c.versionId).single()).data!.id as string)).data!.map((q) => q.id as string))).data ?? []).map((o) => o.id as string);
    expect(mcq.options.some((o) => originalOptionIds.includes(o.id))).toBe(false);
  });

  it("copies assignments with their rubric and the remapped lesson link", async () => {
    const v2 = (await versions())[1].id as string;
    const a = (await svc.from("assignments").select("id, title, due_at, max_points, lesson_id").eq("version_id", v2).single()).data!;
    expect(a).toMatchObject({ title: "Essay", max_points: 100, lesson_id: null });
    expect(new Date(a.due_at as string).toISOString()).toBe("2031-03-18T10:00:00.000Z");
    const rubric = (await svc.from("assignment_rubric_criteria").select("title, max_points, position").eq("assignment_id", a.id as string).order("position")).data;
    expect(rubric).toEqual([{ title: "Content", max_points: 60, position: 0 }, { title: "Style", max_points: 40, position: 1 }]);
  });

  it("the new version is independent: editing it does not change the live one", async () => {
    const v2 = (await versions())[1].id as string;
    await svc.from("course_versions").update({ title: `${tag} Renamed v2` }).eq("id", v2);
    const sec2 = (await svc.from("course_sections").select("id").eq("version_id", v2).eq("title", "Intro").single()).data!.id as string;
    await svc.from("lessons").update({ content: "<p>Welcome v2</p>" }).eq("section_id", sec2).eq("title", "Welcome");
    expect((await versions())[0].title).toBe(`${tag} Live Course`);
    expect((await getLessonContent(learner.client, c.lessonIds[0]))!.content).toBe("<p>Welcome v1</p>");
    expect((await getCourseDetail(anon(), `${tag}-c`))!.title).toBe(`${tag} Live Course`);
  });

  it("a shared attachment survives deleting it from one version", async () => {
    const v2 = (await versions())[1].id as string;
    as(owner);
    const sec2 = (await svc.from("course_sections").select("id").eq("version_id", v2).eq("title", "Intro").single()).data!.id as string;
    const l2 = (await svc.from("lessons").select("id").eq("section_id", sec2).eq("title", "Welcome").single()).data!.id as string;
    const asset2 = (await svc.from("lesson_assets").select("id").eq("lesson_id", l2).single()).data!.id as string;
    expect(await deleteAsset(c.courseId, l2, asset2)).toEqual({ ok: true });
    expect(await supabaseStorage.exists(ASSET_BUCKET, assetPath)).toBe(true);
    expect((await svc.from("lesson_assets").select("id").eq("lesson_id", c.lessonIds[0])).data).toHaveLength(1);
  });

  it("publishing the new version archives the old one, but enrolled learners keep the version they enrolled in", async () => {
    const vs = await versions();
    const v2 = vs[1].id as string;
    await svc.from("course_versions").update({ status: "approved" }).eq("id", v2);
    expect(await transitionCourse(reviewer.client, c.courseId, "publish", "")).toEqual({ ok: true, to: "published" });
    expect((await versions()).map((v) => [v.version_number, v.status])).toEqual([[1, "archived"], [2, "published"]]);
    // New visitors see version 2 ...
    expect((await getCourseDetail(anon(), `${tag}-c`))!.title).toBe(`${tag} Renamed v2`);
    // ... while the enrolled learner still reads version 1's lesson and is pinned to it.
    expect((await getLessonContent(learner.client, c.lessonIds[0]))!.content).toBe("<p>Welcome v1</p>");
    expect((await svc.from("enrollments").select("version_id").eq("user_id", learner.id).eq("course_id", c.courseId).single()).data!.version_id).toBe(c.versionId);
  });

  it("a live course with a newer draft on top can still be archived (the LIVE version is archived)", async () => {
    as(owner);
    expect(await startNewVersion(c.courseId)).toEqual({ ok: true, versionNumber: 3 });
    expect(await transitionCourse(reviewer.client, c.courseId, "archive", "")).toEqual({ ok: true, to: "archived" });
    expect((await versions()).map((v) => [v.version_number, v.status])).toEqual([[1, "archived"], [2, "archived"], [3, "draft"]]);
    expect((await svc.from("courses").select("published_version_id").eq("id", c.courseId).single()).data!.published_version_id).toBeNull();
    expect(await getCourseDetail(anon(), `${tag}-c`)).toBeNull();
    // An archived course can be reworked the same way when the newest is archived.
    await svc.from("course_versions").update({ status: "archived" }).eq("course_id", c.courseId).eq("version_number", 3);
    expect(await startNewVersion(c.courseId)).toEqual({ ok: true, versionNumber: 4 });
  });

  it("copies a SCORM lesson's package into the new draft, sharing (not duplicating) storage, and survives deleting the old version's copy", async () => {
    const scormOwner = await user("sco", "instructor");
    const admin = await user("adm", "admin");
    const scormCourse = await createCourse(svc, scormOwner.id, { slug: `${tag}-scorm`, title: `${tag} SCORM Course`, publish: true });
    courseIds.push(scormCourse.courseId);

    const { data: section } = await svc.from("course_sections").insert({ version_id: scormCourse.versionId, title: "S" }).select("id").single();
    const { data: lesson } = await svc.from("lessons").insert({ section_id: section!.id, title: "SCORM lesson", type: "scorm" }).select("id").single();
    const { data: pkg } = await svc
      .from("scorm_packages")
      .insert({
        lesson_id: lesson!.id,
        version: "1.2",
        title: "Package",
        launch_path: "index.html",
        storage_prefix: `${tag}/scorm/${lesson!.id}`,
        file_paths: ["index.html", "driver.js"],
        file_count: 2,
        total_bytes: 100,
      })
      .select("id, storage_prefix, file_paths")
      .single();

    as(scormOwner);
    expect(await startNewVersion(scormCourse.courseId)).toEqual({ ok: true, versionNumber: 2 });
    const v2 = (await svc.from("course_versions").select("id").eq("course_id", scormCourse.courseId).eq("version_number", 2).single()).data!.id as string;
    // The course has two sections in v2 (the fixture's default "Intro" section plus this test's own "S"
    // section), so the SCORM lesson's copy must be found by its distinguishing title, not just version_id.
    const v2Section = (await svc.from("course_sections").select("id").eq("version_id", v2).eq("title", "S").single()).data!;
    const v2Lesson = (await svc.from("lessons").select("id").eq("section_id", v2Section.id as string).single()).data!;
    const v2Pkg = (await svc.from("scorm_packages").select("*").eq("lesson_id", v2Lesson.id as string).single()).data!;
    expect(v2Pkg).toMatchObject({
      storage_prefix: pkg!.storage_prefix,
      file_paths: pkg!.file_paths,
      launch_path: "index.html",
      version: "1.2",
    });
    expect(v2Pkg.id).not.toBe(pkg!.id);

    // Deleting the OLD version's package row must not report the shared storage as safe to remove,
    // since the NEW version's package still points at the same storage_prefix.
    const del = await admin.client.rpc("admin_delete_scorm_package", { p_package_id: pkg!.id });
    expect(del.error).toBeNull();
    expect(del.data[0]).toEqual({ storage_prefix: pkg!.storage_prefix, file_paths: [] });
    expect((await svc.from("scorm_packages").select("id").eq("id", v2Pkg.id as string).maybeSingle()).data).not.toBeNull();

    // Now delete the last remaining copy: storage really is safe to remove this time.
    const del2 = await admin.client.rpc("admin_delete_scorm_package", { p_package_id: v2Pkg.id as string });
    expect(del2.data[0]).toEqual({ storage_prefix: pkg!.storage_prefix, file_paths: pkg!.file_paths });
  });
});
