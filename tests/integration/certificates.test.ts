import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluateCompletion } from "@/features/completion/evaluate";
import {
  cleanup,
  createAssessment,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { completeLesson } from "@/features/player/progress";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-109 / TEST_PLAN section 9 (issuing side) against the live project.
describe.skipIf(!hasLiveProject)("completion + certificates (T-040, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("ce");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let learner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let owner: { id: string; client: SupabaseClient };

  async function user(name: string, role: string, fullName?: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role, { fullName });
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  async function enroll(course: { courseId: string; versionId: string }, userId = learner.id) {
    const { data } = await svc
      .from("enrollments")
      .insert({ user_id: userId, course_id: course.courseId, version_id: course.versionId })
      .select("id")
      .single();
    return data!.id as string;
  }
  const complete = (enrollmentId: string, lessonIds: string[]) =>
    svc.from("lesson_progress").insert(
      lessonIds.map((lesson_id) => ({
        enrollment_id: enrollmentId,
        lesson_id,
        completed_at: new Date().toISOString(),
      })),
    );

  beforeAll(async () => {
    owner = await user("own", "instructor", "Ada Teacher");
    learner = await user("l", "learner", "Grace Hopper");
    other = await user("o", "learner");
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("does not issue anything while the course is incomplete", async () => {
    const c = await createCourse(svc, owner.id, {
      slug: `${tag}-a`,
      title: `${tag} A`,
      sections: [{ title: "S", lessons: [{ title: "L1" }, { title: "L2" }] }],
    });
    courseIds.push(c.courseId);
    const enr = await enroll(c);
    await complete(enr, [c.lessonIds[0]]);
    expect(await evaluateCompletion(svc, enr)).toEqual({ complete: false, certificateCode: null });
    const { count } = await svc.from("certificates").select("id", { count: "exact", head: true }).eq("enrollment_id", enr);
    expect(count).toBe(0);
    const { data: e } = await svc.from("enrollments").select("status").eq("id", enr).single();
    expect(e!.status).toBe("active");
  });

  it("completes the enrollment and issues one certificate with a unique ID and snapshots", async () => {
    const c = await createCourse(svc, owner.id, {
      slug: `${tag}-b`,
      title: `${tag} B Course`,
      sections: [{ title: "S", lessons: [{ title: "L1" }, { title: "L2" }] }],
    });
    courseIds.push(c.courseId);
    const enr = await enroll(c);
    await complete(enr, c.lessonIds);

    const first = await evaluateCompletion(svc, enr);
    expect(first.complete).toBe(true);
    expect(first.certificateCode).toMatch(/^MLC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);

    // Idempotent: evaluating again returns the same certificate, no duplicate.
    const second = await evaluateCompletion(svc, enr);
    expect(second.certificateCode).toBe(first.certificateCode);
    const { data: certs } = await svc.from("certificates").select("*").eq("enrollment_id", enr);
    expect(certs).toHaveLength(1);
    expect(certs![0]).toMatchObject({
      learner_name: "Grace Hopper",
      course_title: `${tag} B Course`,
      instructor_name: "Ada Teacher",
      status: "issued",
    });
    const { data: e } = await svc.from("enrollments").select("status, completed_at").eq("id", enr).single();
    expect(e!.status).toBe("completed");
    expect(e!.completed_at).toBeTruthy();

    // Audit trail written by the trigger.
    const { data: events } = await svc.from("certificate_events").select("event").eq("certificate_id", certs![0].id);
    expect(events!.map((x) => x.event)).toEqual(["issued"]);
  });

  it("gives different learners different, unique certificate IDs", async () => {
    const c = await createCourse(svc, owner.id, { slug: `${tag}-c`, title: `${tag} C` });
    courseIds.push(c.courseId);
    const e1 = await enroll(c);
    const e2 = await enroll(c, other.id);
    await complete(e1, c.lessonIds);
    await complete(e2, c.lessonIds);
    const a = await evaluateCompletion(svc, e1);
    const b = await evaluateCompletion(svc, e2);
    expect(a.certificateCode).not.toBe(b.certificateCode);
  });

  it("snapshots the course's certificate template (T-110) onto newly issued certificates", async () => {
    const c = await createCourse(svc, owner.id, { slug: `${tag}-tmpl`, title: `${tag} Templated` });
    courseIds.push(c.courseId);

    const { error: tmplErr } = await owner.client.rpc("upsert_certificate_template", {
      p_course_id: c.courseId,
      p_signature_title: "Lead Instructor",
      p_closing_message: "Keep building.",
    });
    expect(tmplErr).toBeNull();

    const enr = await enroll(c);
    await complete(enr, c.lessonIds);
    const result = await evaluateCompletion(svc, enr);
    expect(result.complete).toBe(true);

    const { data: cert } = await svc
      .from("certificates")
      .select("signature_title, closing_message")
      .eq("enrollment_id", enr)
      .single();
    expect(cert).toMatchObject({ signature_title: "Lead Instructor", closing_message: "Keep building." });

    // Editing the template afterwards never rewrites the already-issued certificate.
    await owner.client.rpc("upsert_certificate_template", {
      p_course_id: c.courseId,
      p_signature_title: "Changed",
      p_closing_message: "Changed message.",
    });
    const { data: certAfter } = await svc
      .from("certificates")
      .select("signature_title, closing_message")
      .eq("enrollment_id", enr)
      .single();
    expect(certAfter).toMatchObject({ signature_title: "Lead Instructor", closing_message: "Keep building." });
  });

  it("needs every assessment passed before completing", async () => {
    const c = await createCourse(svc, owner.id, {
      slug: `${tag}-d`,
      title: `${tag} D`,
      sections: [{ title: "S", lessons: [{ title: "L1" }, { title: "Quiz", type: "quiz" }] }],
    });
    courseIds.push(c.courseId);
    const a = await createAssessment(svc, c.versionId, {
      title: "Final",
      lessonId: c.lessonIds[1],
      questions: [{ type: "mcq", prompt: "Q", options: ["x", "y"], correct: [0] }],
    });
    const enr = await enroll(c);
    await complete(enr, [c.lessonIds[0]]); // the quiz lesson is not marked complete manually

    expect((await evaluateCompletion(svc, enr)).complete).toBe(false);

    await svc.from("assessment_attempts").insert({
      assessment_id: a.assessmentId,
      enrollment_id: enr,
      user_id: learner.id,
      attempt_number: 1,
      status: "graded",
      passed: false,
    });
    expect((await evaluateCompletion(svc, enr)).complete).toBe(false);

    await svc.from("assessment_attempts").insert({
      assessment_id: a.assessmentId,
      enrollment_id: enr,
      user_id: learner.id,
      attempt_number: 2,
      status: "graded",
      passed: true,
    });
    const done = await evaluateCompletion(svc, enr);
    expect(done.complete).toBe(true);
    expect(done.certificateCode).toBeTruthy();
  });

  it("completes but issues no certificate when the course has certificates turned off", async () => {
    const c = await createCourse(svc, owner.id, { slug: `${tag}-e`, title: `${tag} E` });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ certificate_enabled: false }).eq("id", c.versionId);
    const enr = await enroll(c);
    await complete(enr, c.lessonIds);
    expect(await evaluateCompletion(svc, enr)).toEqual({ complete: true, certificateCode: null });
  });

  it("issues the certificate when the learner completes the last lesson through the action", async () => {
    const c = await createCourse(svc, owner.id, {
      slug: `${tag}-f`,
      title: `${tag} F`,
      sections: [{ title: "S", lessons: [{ title: "Only" }] }],
    });
    courseIds.push(c.courseId);
    const enr = await enroll(c);
    currentClient = learner.client;
    const r = await completeLesson(`${tag}-f`, c.lessonIds[0]);
    expect(r).toMatchObject({ completed: true, courseCompleted: true });
    const { data } = await svc.from("certificates").select("code").eq("enrollment_id", enr).single();
    expect((r as { certificateCode: string }).certificateCode).toBe(data!.code);
  });

  describe("immutability, access and verification", () => {
    let code: string;
    let certId: string;
    beforeAll(async () => {
      const { data } = await svc.from("certificates").select("id, code").eq("learner_name", "Grace Hopper").limit(1).single();
      code = data!.code;
      certId = data!.id;
    });

    it("cannot change identity fields, even with the service role", async () => {
      for (const patch of [
        { code: "MLC-0000-0000-0000-0000" },
        { learner_name: "Someone Else" },
        { course_title: "Other" },
        { issued_at: "2001-01-01T00:00:00Z" },
        { user_id: other.id },
      ]) {
        const { error } = await svc.from("certificates").update(patch).eq("id", certId);
        expect(error, JSON.stringify(patch)).not.toBeNull();
      }
    });

    it("cannot be written or deleted by clients", async () => {
      const ins = await learner.client.from("certificates").insert({
        enrollment_id: certId,
        user_id: learner.id,
        course_id: certId,
        version_id: certId,
        learner_name: "x",
        course_title: "x",
      });
      expect(ins.error).not.toBeNull();
      const upd = await learner.client.from("certificates").update({ status: "revoked" }).eq("id", certId).select("id");
      expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
      const del = await learner.client.from("certificates").delete().eq("id", certId).select("id");
      expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
      const { data } = await svc.from("certificates").select("status").eq("id", certId).single();
      expect(data!.status).toBe("issued");
    });

    it("is visible to its learner and instructor but not to other learners", async () => {
      expect((await learner.client.from("certificates").select("code").eq("id", certId)).data).toHaveLength(1);
      expect((await owner.client.from("certificates").select("code").eq("id", certId)).data).toHaveLength(1);
      expect((await other.client.from("certificates").select("code").eq("id", certId)).data).toEqual([]);
    });

    it("verifies publicly with only the printed fields", async () => {
      const { data, error } = await anon().rpc("verify_certificate", { p_code: code.toLowerCase() });
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(Object.keys(data![0]).sort()).toEqual([
        "closing_message",
        "code",
        "course_title",
        "instructor_name",
        "issued_at",
        "learner_name",
        "revoked_at",
        "signature_title",
        "status",
      ]);
      expect(data![0]).toMatchObject({ code, status: "issued", learner_name: "Grace Hopper" });
      expect((await anon().rpc("verify_certificate", { p_code: "MLC-NOPE-NOPE-NOPE-NOPE" })).data).toEqual([]);
      // Direct table access stays closed to anonymous callers.
      const direct = await anon().from("certificates").select("id");
      expect(direct.error !== null || (direct.data ?? []).length === 0).toBe(true);
    });

    it("shows revoked status, audits the revocation, and cannot be reinstated", async () => {
      const { error } = await svc
        .from("certificates")
        .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_reason: "test", revoked_by: owner.id })
        .eq("id", certId);
      expect(error).toBeNull();

      const { data } = await anon().rpc("verify_certificate", { p_code: code });
      expect(data![0]).toMatchObject({ status: "revoked" });
      expect(data![0].revoked_at).toBeTruthy();

      const { data: events } = await svc.from("certificate_events").select("event, actor_id, details").eq("certificate_id", certId).order("id");
      expect(events!.map((e) => e.event)).toEqual(["issued", "revoked"]);
      expect(events![1]).toMatchObject({ actor_id: owner.id, details: { reason: "test" } });

      const back = await svc.from("certificates").update({ status: "issued" }).eq("id", certId);
      expect(back.error).not.toBeNull();
    });
  });
});
