// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteAsset, registerAsset, requestUpload, saveLesson } from "@/features/course-authoring/lesson-actions";
import { getLessonForEditing } from "@/features/course-authoring/lessons";
import { getAssetLinks, resolveVideoSrc } from "@/features/player/media";
import { rateLimit } from "@/services/rate-limit";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-204: rich text sanitizing, video by URL/upload, attachments, preview flag, access control.
describe.skipIf(!hasLiveProject)("lesson editor actions (T-053, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("le");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const objects: { bucket: string; path: string }[] = [];
  let owner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let enrolled: { id: string; client: SupabaseClient };
  let outsider: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let videoLesson: string;
  let textLesson: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }
  const base = { title: "Lesson", content: "<p>x</p>", videoRef: null, durationMinutes: 5, isPreview: false };
  const pdf = () => new Blob(["%PDF-1.4 test"], { type: "application/pdf" });

  async function uploadAsset(name = "notes.pdf") {
    currentClient = owner.client;
    const t = await requestUpload(course.courseId, textLesson, "asset", { name, size: 13, type: "application/pdf" });
    if (!t.ok) throw new Error(t.error);
    objects.push({ bucket: t.bucket, path: t.path });
    const { error } = await anon().storage.from(t.bucket).uploadToSignedUrl(t.path, t.token, pdf(), { contentType: "application/pdf" });
    expect(error).toBeNull();
    return t;
  }

  beforeAll(async () => {
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
    enrolled = await user("enr", "learner");
    outsider = await user("out", "learner");
    course = await createCourse(svc, owner.id, {
      slug: `${tag}-c`,
      title: `${tag} course`,
      publish: false,
      sections: [{ title: "S", lessons: [{ title: "Video one", type: "video" }, { title: "Text one", type: "text" }] }],
    });
    [videoLesson, textLesson] = course.lessonIds;
    courseIds.push(course.courseId);
    await svc.from("enrollments").insert({ user_id: enrolled.id, course_id: course.courseId, version_id: course.versionId });
  }, 200_000);

  afterAll(async () => {
    for (const o of objects) await svc.storage.from(o.bucket).remove([o.path]);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 200_000);

  describe("saveLesson", () => {
    it("saves title, duration, preview flag and stores SANITIZED html", async () => {
      currentClient = owner.client;
      const dirty =
        '<h2>Title</h2><p onclick="steal()">Hello <strong>you</strong></p><script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">bad</a><iframe src="https://evil"></iframe>';
      const r = await saveLesson(course.courseId, textLesson, { ...base, title: "Renamed", content: dirty, durationMinutes: 12, isPreview: true });
      expect(r).toEqual({ ok: true });
      const { data } = await svc.from("lessons").select("title, content, duration_minutes, is_preview").eq("id", textLesson).single();
      expect(data).toMatchObject({ title: "Renamed", duration_minutes: 12, is_preview: true });
      expect(data!.content).toContain("<strong>you</strong>");
      expect(data!.content).not.toMatch(/script|onclick|onerror|javascript:|iframe|alert\(/i);
    });

    it("updates the version total duration through the trigger", async () => {
      const { data } = await svc.from("course_versions").select("duration_minutes").eq("id", course.versionId).single();
      expect(data!.duration_minutes).toBeGreaterThanOrEqual(12);
    });

    it("validates fields and returns per-field errors", async () => {
      currentClient = owner.client;
      const r = await saveLesson(course.courseId, textLesson, { ...base, title: "  ", durationMinutes: -1 });
      expect(r).toMatchObject({ ok: false, fieldErrors: { title: "Enter a title.", durationMinutes: expect.any(String) } });
      const long = await saveLesson(course.courseId, textLesson, { ...base, content: "x".repeat(200_001) });
      expect(long).toMatchObject({ ok: false, fieldErrors: { content: expect.any(String) } });
      const decimals = await saveLesson(course.courseId, textLesson, { ...base, durationMinutes: 1.5 });
      expect(decimals).toMatchObject({ ok: false });
    });

    it("accepts an https video link on video lessons only, and rejects unsafe ones", async () => {
      currentClient = owner.client;
      expect(await saveLesson(course.courseId, videoLesson, { ...base, videoRef: "https://cdn.example.com/v.mp4" })).toEqual({ ok: true });
      expect((await svc.from("lessons").select("video_url").eq("id", videoLesson).single()).data!.video_url).toBe("https://cdn.example.com/v.mp4");
      for (const bad of ["http://x.com/v.mp4", "javascript:alert(1)", "storage://course-videos/other-course/l/v.mp4"]) {
        expect(await saveLesson(course.courseId, videoLesson, { ...base, videoRef: bad }), bad).toMatchObject({ ok: false });
      }
      // A non-video lesson never keeps a video reference.
      await saveLesson(course.courseId, textLesson, { ...base, videoRef: "https://cdn.example.com/v.mp4" });
      expect((await svc.from("lessons").select("video_url").eq("id", textLesson).single()).data!.video_url).toBeNull();
    });

    it("cannot be used by another instructor, a learner, or with mismatched ids", async () => {
      for (const who of [other, enrolled]) {
        currentClient = who.client;
        expect(await saveLesson(course.courseId, textLesson, base)).toEqual({ ok: false, error: "This lesson is not available." });
      }
      currentClient = owner.client;
      const foreign = await createCourse(svc, other.id, { slug: `${tag}-f`, title: `${tag} foreign`, publish: false });
      courseIds.push(foreign.courseId);
      // Own course id with a lesson id from someone else's course.
      expect(await saveLesson(course.courseId, foreign.lessonIds[0], base)).toEqual({ ok: false, error: "This lesson is not available." });
      expect(await saveLesson(course.courseId, "not-a-uuid", base)).toEqual({ ok: false, error: "This lesson is not available." });
    });

    it("is locked while the version is in review", async () => {
      currentClient = owner.client;
      await svc.from("course_versions").update({ status: "in_review" }).eq("id", course.versionId);
      expect(await saveLesson(course.courseId, textLesson, { ...base, title: "Sneaky" })).toEqual({
        ok: false,
        error: "This course is locked while it is in review or published.",
      });
      await svc.from("course_versions").update({ status: "draft" }).eq("id", course.versionId);
    });
  });

  describe("uploads", () => {
    it("issues signed upload tickets only for valid requests", async () => {
      currentClient = owner.client;
      expect(await requestUpload(course.courseId, textLesson, "asset", { name: "evil.exe", size: 10, type: "application/x-msdownload" })).toMatchObject({ ok: false });
      expect(await requestUpload(course.courseId, textLesson, "asset", { name: "big.pdf", size: 11 * 1024 * 1024, type: "application/pdf" })).toMatchObject({ ok: false });
      expect(await requestUpload(course.courseId, textLesson, "video", { name: "v.mp4", size: 10, type: "video/mp4" })).toEqual({
        ok: false,
        error: "Only video lessons can have a video.",
      });
      const ok = await requestUpload(course.courseId, videoLesson, "video", { name: "v.mp4", size: 100, type: "video/mp4" });
      expect(ok).toMatchObject({ ok: true, bucket: "course-videos" });
      if (ok.ok) {
        expect(ok.path.startsWith(`${course.courseId}/${videoLesson}/`)).toBe(true);
        expect(ok.ref).toBe(`storage://course-videos/${ok.path}`);
      }
    });

    it("rejects requesting an upload ticket while rate-limited (T-241, SECURITY §18)", async () => {
      currentClient = owner.client;
      vi.mocked(rateLimit).mockResolvedValueOnce(false);
      expect(await requestUpload(course.courseId, textLesson, "asset", { name: "a.pdf", size: 10, type: "application/pdf" })).toEqual({
        ok: false,
        error: "Too many attempts. Please wait a while and try again.",
      });
    });

    it("refuses tickets to non-owners", async () => {
      currentClient = other.client;
      expect(await requestUpload(course.courseId, textLesson, "asset", { name: "a.pdf", size: 10, type: "application/pdf" })).toEqual({
        ok: false,
        error: "This lesson is not available.",
      });
    });

    it("uploads directly to storage, registers the attachment, and rejects a disallowed content type at the bucket", async () => {
      const t = await uploadAsset("Syllabus.pdf");
      currentClient = owner.client;
      expect(await registerAsset(course.courseId, textLesson, { path: t.path, name: "Syllabus.pdf", size: 13, type: "application/pdf" })).toEqual({ ok: true });
      const lesson = await getLessonForEditing(owner.client, course.versionId, textLesson);
      expect(lesson!.assets).toHaveLength(1);
      expect(lesson!.assets[0]).toMatchObject({ name: "Syllabus.pdf", mimeType: "application/pdf", sizeBytes: 13 });

      // Bucket-level enforcement even if a client lies about the request: html is refused.
      const t2 = await requestUpload(course.courseId, textLesson, "asset", { name: "ok.pdf", size: 10, type: "application/pdf" });
      if (!t2.ok) throw new Error("expected ticket");
      const { error } = await anon().storage.from(t2.bucket).uploadToSignedUrl(t2.path, t2.token, new Blob(["<html>"], { type: "text/html" }), { contentType: "text/html" });
      expect(error).not.toBeNull();
    });

    it("refuses to register an object that was never uploaded, or a path outside this lesson", async () => {
      currentClient = owner.client;
      const ghost = await requestUpload(course.courseId, textLesson, "asset", { name: "ghost.pdf", size: 10, type: "application/pdf" });
      if (!ghost.ok) throw new Error("expected ticket");
      expect(await registerAsset(course.courseId, textLesson, { path: ghost.path, name: "ghost.pdf", size: 10, type: "application/pdf" })).toEqual({
        ok: false,
        error: "The upload did not complete. Please try again.",
      });
      for (const path of [`${course.courseId}/another-lesson/x.pdf`, `${course.courseId}/${textLesson}/../x.pdf`, "other-course/x/x.pdf"]) {
        expect(await registerAsset(course.courseId, textLesson, { path, name: "x.pdf", size: 10, type: "application/pdf" }), path).toEqual({
          ok: false,
          error: "That upload does not belong to this lesson.",
        });
      }
    });

    it("caps attachments per lesson and deletes attachment rows and objects", async () => {
      currentClient = owner.client;
      let lesson = await getLessonForEditing(owner.client, course.versionId, textLesson);
      const first = lesson!.assets[0];
      expect(await deleteAsset(course.courseId, textLesson, first.id)).toEqual({ ok: true });
      expect(await svc.storage.from("lesson-assets").download(first.storagePath).then((r) => r.error !== null)).toBe(true);
      lesson = await getLessonForEditing(owner.client, course.versionId, textLesson);
      expect(lesson!.assets).toHaveLength(0);
      expect(await deleteAsset(course.courseId, textLesson, first.id)).toEqual({ ok: false, error: "This lesson is not available." });

      // Fill to the cap directly, then the next ticket is refused.
      for (let i = 0; i < 10; i++) {
        await svc.from("lesson_assets").insert({ lesson_id: textLesson, name: `f${i}.pdf`, storage_path: `${course.courseId}/${textLesson}/f${i}.pdf` });
      }
      expect(await requestUpload(course.courseId, textLesson, "asset", { name: "x.pdf", size: 10, type: "application/pdf" })).toEqual({
        ok: false,
        error: "A lesson can have at most 10 attachments.",
      });
      await svc.from("lesson_assets").delete().eq("lesson_id", textLesson);
    });
  });

  describe("learner access is entitlement-aware", () => {
    let assetPath: string;
    it("gives enrolled learners signed links to attachments and uploaded videos, and outsiders nothing", async () => {
      const t = await uploadAsset("Handout.pdf");
      assetPath = t.path;
      currentClient = owner.client;
      await registerAsset(course.courseId, textLesson, { path: t.path, name: "Handout.pdf", size: 13, type: "application/pdf" });

      const links = await getAssetLinks(enrolled.client, textLesson);
      expect(links).toHaveLength(1);
      expect(links[0].name).toBe("Handout.pdf");
      const res = await fetch(links[0].url);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("%PDF");

      expect(await getAssetLinks(outsider.client, textLesson)).toEqual([]);
      expect(await getAssetLinks(anon(), textLesson)).toEqual([]);
    });

    it("keeps private objects private without a signature", async () => {
      const bare = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lesson-assets/${assetPath}`;
      expect((await fetch(bare)).status).not.toBe(200);
      const authed = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/lesson-assets/${assetPath}`;
      expect((await fetch(authed, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! } })).status).not.toBe(200);
    });

    it("resolves external https links as-is, signs uploaded videos, and refuses unsafe references", async () => {
      expect(await resolveVideoSrc("https://cdn.example.com/v.mp4")).toBe("https://cdn.example.com/v.mp4");
      expect(await resolveVideoSrc("http://cdn.example.com/v.mp4")).toBeNull();
      expect(await resolveVideoSrc("javascript:alert(1)")).toBeNull();
      expect(await resolveVideoSrc(null)).toBeNull();

      currentClient = owner.client;
      const t = await requestUpload(course.courseId, videoLesson, "video", { name: "clip.mp4", size: 16, type: "video/mp4" });
      if (!t.ok) throw new Error("expected ticket");
      objects.push({ bucket: t.bucket, path: t.path });
      const up = await anon().storage.from(t.bucket).uploadToSignedUrl(t.path, t.token, new Blob(["\0\0\0\u0018ftypmp42"], { type: "video/mp4" }), { contentType: "video/mp4" });
      expect(up.error).toBeNull();
      expect(await saveLesson(course.courseId, videoLesson, { ...base, videoRef: t.ref })).toEqual({ ok: true });

      const signed = await resolveVideoSrc(t.ref);
      expect(signed).toContain("token=");
      expect((await fetch(signed!)).status).toBe(200);
    });

    it("removes a replaced uploaded video from storage when the reference changes", async () => {
      currentClient = owner.client;
      const lesson = await getLessonForEditing(owner.client, course.versionId, videoLesson);
      const path = lesson!.videoRef!.replace("storage://course-videos/", "");
      expect(await saveLesson(course.courseId, videoLesson, { ...base, videoRef: "https://cdn.example.com/other.mp4" })).toEqual({ ok: true });
      expect(await svc.storage.from("course-videos").download(path).then((r) => r.error !== null)).toBe(true);
    });
  });
});
