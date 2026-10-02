import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { completeLesson, submitScormCommit } from "@/features/player/progress";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-410: SCORM registration/commit and lesson-content access (T-138), live Supabase.
describe.skipIf(!hasLiveProject)("scorm player (T-138, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("scp");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let learner: { id: string; client: SupabaseClient };
  let outsider: { id: string; client: SupabaseClient };
  let instructor: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let lessonId: string;
  let enrollmentId: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    learner = await user("lrn", "learner");
    outsider = await user("out", "learner");
    instructor = await user("ins", "instructor");
    course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    // Add one SCORM lesson alongside the fixture's default (text) lesson, so completing only the
    // SCORM lesson still leaves the course incomplete (isolates what tryEvaluateCompletion reports).
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

    const { data: enrollment } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId, status: "active" })
      .select("id")
      .single();
    enrollmentId = enrollment!.id;
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("rejects a commit from someone not enrolled in the course", async () => {
    currentClient = outsider.client;
    const res = await submitScormCommit(course.slug, lessonId, { "cmi.core.lesson_status": "incomplete" });
    expect("error" in res).toBe(true);
  });

  it("refuses a manual 'Mark complete' on a SCORM lesson: only the package's result completes it", async () => {
    currentClient = learner.client;
    expect(await completeLesson(course.slug, lessonId)).toEqual({ error: "This lesson completes when you finish the course content." });
    const { data } = await svc.from("lesson_progress").select("completed_at").eq("lesson_id", lessonId).eq("enrollment_id", enrollmentId).maybeSingle();
    expect(data?.completed_at ?? null).toBeNull();
  });

  it("refuses to replace the package of a published (non-editable) version, even for the owner", async () => {
    const { error } = await instructor.client.rpc("save_scorm_package", {
      p_lesson_id: lessonId,
      p_version: "1.2",
      p_title: "swap",
      p_launch_path: "index.html",
      p_storage_prefix: "x",
      p_file_paths: ["index.html"],
      p_file_count: 1,
      p_total_bytes: 1,
    });
    expect(error?.code).toBe("42501");
  });

  it("saves an in-progress commit without completing the lesson", async () => {
    currentClient = learner.client;
    const res = await submitScormCommit(course.slug, lessonId, {
      "cmi.core.lesson_status": "incomplete",
      "cmi.suspend_data": "page=1",
      "cmi.core.score.raw": "40",
    });
    expect(res).toMatchObject({ saved: true, courseCompleted: false });

    const { data } = await svc
      .from("scorm_registrations")
      .select("lesson_status, suspend_data, score_raw")
      .eq("lesson_id", lessonId)
      .eq("enrollment_id", enrollmentId)
      .single();
    expect(data).toMatchObject({ lesson_status: "incomplete", suspend_data: "page=1", score_raw: 40 });

    const { data: progress } = await svc
      .from("lesson_progress")
      .select("completed_at")
      .eq("lesson_id", lessonId)
      .eq("enrollment_id", enrollmentId)
      .maybeSingle();
    expect(progress?.completed_at ?? null).toBeNull();
  });

  it("marks the lesson complete once the commit reports passed, and resumes from the saved CMI on the next commit", async () => {
    currentClient = learner.client;
    const res = await submitScormCommit(course.slug, lessonId, {
      "cmi.core.lesson_status": "passed",
      "cmi.core.score.raw": "95",
    });
    expect(res).toMatchObject({ saved: true });

    const { data: progress } = await svc
      .from("lesson_progress")
      .select("completed_at")
      .eq("lesson_id", lessonId)
      .eq("enrollment_id", enrollmentId)
      .single();
    expect(progress!.completed_at).not.toBeNull();

    const { data: registration } = await svc
      .from("scorm_registrations")
      .select("lesson_status, score_raw")
      .eq("lesson_id", lessonId)
      .eq("enrollment_id", enrollmentId)
      .single();
    expect(registration).toMatchObject({ lesson_status: "passed", score_raw: 95 });
  });

  it("does not re-run completion evaluation on a later commit once already completed", async () => {
    currentClient = learner.client;
    const before = await svc
      .from("lesson_progress")
      .select("completed_at")
      .eq("lesson_id", lessonId)
      .eq("enrollment_id", enrollmentId)
      .single();

    const res = await submitScormCommit(course.slug, lessonId, { "cmi.core.lesson_status": "passed", "cmi.core.score.raw": "100" });
    expect(res).toMatchObject({ saved: true, courseCompleted: false });

    const after = await svc
      .from("lesson_progress")
      .select("completed_at")
      .eq("lesson_id", lessonId)
      .eq("enrollment_id", enrollmentId)
      .single();
    expect(after.data!.completed_at).toBe(before.data!.completed_at);

    const { data: registration } = await svc
      .from("scorm_registrations")
      .select("score_raw")
      .eq("lesson_id", lessonId)
      .eq("enrollment_id", enrollmentId)
      .single();
    expect(registration!.score_raw).toBe(100);
  });

  it("can_access_lesson_content allows the enrolled learner, the owning instructor and no one else", async () => {
    async function canAccess(client: SupabaseClient) {
      const { data } = await client.rpc("can_access_lesson_content", { p_lesson_id: lessonId });
      return data as boolean;
    }
    expect(await canAccess(learner.client)).toBe(true);
    expect(await canAccess(instructor.client)).toBe(true);
    expect(await canAccess(outsider.client)).toBe(false);
  });
});
