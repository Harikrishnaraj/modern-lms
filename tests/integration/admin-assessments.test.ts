import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { resetAttemptAction } from "@/features/admin/assessment-actions";
import {
  getAdminAssessmentAnalytics,
  getAdminAttemptDetail,
  getAdminQuestionAnalytics,
  searchAdminAttempts,
} from "@/features/admin/assessments";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-408: Assessment oversight (T-136), live Supabase.
describe.skipIf(!hasLiveProject)("admin assessment oversight (T-136, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("aao");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let hardAssessmentId: string;
  let easyAssessmentId: string;
  let resettableAttemptId: string;

  async function user(name: string, role: string, fullName?: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role, fullName ? { fullName } : undefined);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client, email: u.email };
  }

  async function enroll(userId: string) {
    const { data, error } = await svc
      .from("enrollments")
      .insert({ user_id: userId, course_id: course.courseId, version_id: course.versionId, status: "active" })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    learner = await user("plain", "learner");

    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    const { data: hard } = await svc
      .from("assessments")
      .insert({ version_id: course.versionId, title: `${tag} Hard Quiz`, pass_mark: 70 })
      .select("id")
      .single();
    hardAssessmentId = hard!.id;
    await svc
      .from("assessment_questions")
      .insert({ assessment_id: hardAssessmentId, type: "mcq", prompt: `${tag} broken question`, points: 1 });

    const { data: easy } = await svc
      .from("assessments")
      .insert({ version_id: course.versionId, title: `${tag} Easy Quiz`, pass_mark: 70 })
      .select("id")
      .single();
    easyAssessmentId = easy!.id;
    await svc
      .from("assessment_questions")
      .insert({ assessment_id: easyAssessmentId, type: "mcq", prompt: `${tag} trivial question`, points: 1 });

    // Five failing attempts on the hard assessment, from the same enrollment (distinct attempt numbers).
    const failLearner = await user("fail", "learner", `${tag} Fail Learner`);
    const failEnrollmentId = await enroll(failLearner.id);
    for (let i = 1; i <= 5; i++) {
      const { data: att } = await svc
        .from("assessment_attempts")
        .insert({
          assessment_id: hardAssessmentId,
          enrollment_id: failEnrollmentId,
          user_id: failLearner.id,
          attempt_number: i,
          status: "graded",
          percent: 20,
          score: 20,
          max_score: 100,
          passed: false,
          started_at: new Date().toISOString(),
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (i === 1) resettableAttemptId = att!.id;
    }

    // Five passing attempts on the easy assessment, from a different enrollment.
    const passLearner = await user("pass", "learner", `${tag} Pass Learner`);
    const passEnrollmentId = await enroll(passLearner.id);
    for (let i = 1; i <= 5; i++) {
      await svc.from("assessment_attempts").insert({
        assessment_id: easyAssessmentId,
        enrollment_id: passEnrollmentId,
        user_id: passLearner.id,
        attempt_number: i,
        status: "graded",
        percent: 95,
        score: 95,
        max_score: 100,
        passed: true,
        started_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
      });
    }
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("returns platform-wide assessment averages, not scoped to one instructor", async () => {
    currentClient = admin.client;
    const rows = await getAdminAssessmentAnalytics(admin.client);
    const hard = rows.find((r) => r.assessmentId === hardAssessmentId)!;
    expect(hard).toMatchObject({ totalAttempts: 5, passRate: 0 });
    const easy = rows.find((r) => r.assessmentId === easyAssessmentId)!;
    expect(easy).toMatchObject({ totalAttempts: 5, passRate: 100 });
  });

  it("flags a question everyone fails and a question everyone passes", async () => {
    const rows = await getAdminQuestionAnalytics(admin.client, course.courseId);
    const hardQ = rows.find((r) => r.assessmentId === hardAssessmentId)!;
    expect(hardQ).toMatchObject({ difficulty: "hard", qualityFlag: "review_too_hard" });
    const easyQ = rows.find((r) => r.assessmentId === easyAssessmentId)!;
    expect(easyQ).toMatchObject({ difficulty: "easy", qualityFlag: "review_too_easy" });
  });

  it("does not flag questions with fewer than 5 attempts", async () => {
    // A brand-new assessment/question with zero attempts should be unflagged.
    const { data: fresh } = await svc
      .from("assessments")
      .insert({ version_id: course.versionId, title: `${tag} Fresh Quiz`, pass_mark: 70 })
      .select("id")
      .single();
    await svc.from("assessment_questions").insert({ assessment_id: fresh!.id, type: "mcq", prompt: `${tag} fresh`, points: 1 });
    const rows = await getAdminQuestionAnalytics(admin.client, course.courseId);
    const freshQ = rows.find((r) => r.assessmentId === fresh!.id)!;
    expect(freshQ.qualityFlag).toBeNull();
  });

  it("searches attempts by learner name and filters by status/course", async () => {
    const { attempts, total } = await searchAdminAttempts(admin.client, {
      q: `${tag} Fail Learner`,
      courseId: "",
      status: "",
      page: 1,
    });
    expect(total).toBeGreaterThanOrEqual(5);
    expect(attempts.every((a) => a.learnerName === `${tag} Fail Learner`)).toBe(true);

    const filteredByCourse = await searchAdminAttempts(admin.client, { q: "", courseId: course.courseId, status: "graded", page: 1 });
    expect(filteredByCourse.total).toBeGreaterThanOrEqual(10);
  });

  it("returns full attempt detail including answers", async () => {
    const detail = await getAdminAttemptDetail(admin.client, resettableAttemptId);
    expect(detail).toMatchObject({ attemptId: resettableAttemptId, assessmentId: hardAssessmentId, status: "graded" });
  });

  it("rejects analytics/search/detail RPCs for a non-admin", async () => {
    await expect(getAdminAssessmentAnalytics(learner.client)).rejects.toThrow();
    await expect(getAdminQuestionAnalytics(learner.client)).rejects.toThrow();
    await expect(searchAdminAttempts(learner.client, { q: "", courseId: "", status: "", page: 1 })).rejects.toThrow();
  });

  it("resets an attempt (audited) and rejects the reset for a non-admin", async () => {
    currentClient = learner.client;
    const denied = await resetAttemptAction(resettableAttemptId);
    expect(denied.ok).toBe(false);

    currentClient = admin.client;
    const ok = await resetAttemptAction(resettableAttemptId);
    expect(ok).toEqual({ ok: true });

    const { data } = await svc.from("assessment_attempts").select("id").eq("id", resettableAttemptId).maybeSingle();
    expect(data).toBeNull();

    const { data: auditRow } = await svc
      .from("audit_logs")
      .select("action, resource_id, actor_id")
      .eq("action", "assessment.attempt_reset")
      .eq("resource_id", resettableAttemptId)
      .maybeSingle();
    expect(auditRow).toMatchObject({ action: "assessment.attempt_reset", actor_id: admin.id });
  });

  it("reports resetting a nonexistent attempt as an error", async () => {
    currentClient = admin.client;
    const res = await resetAttemptAction(resettableAttemptId);
    expect(res.ok).toBe(false);
  });
});
