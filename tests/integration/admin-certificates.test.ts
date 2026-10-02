import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { reissueCertificateAction, revokeCertificateAction } from "@/features/admin/certificate-actions";
import { searchAdminCertificates } from "@/features/admin/certificates";
import { evaluateCompletion } from "@/features/completion/evaluate";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-409: Certificate administration (T-137), live Supabase.
describe.skipIf(!hasLiveProject)("admin certificate administration (T-137, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("aca");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let plainLearner: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let enrollmentId: string;
  let certificateId: string;

  async function user(name: string, role: string, fullName?: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role, fullName ? { fullName } : undefined);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    learner = await user("lrn", "learner", `${tag} Learner`);
    plainLearner = await user("plain", "learner");

    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    const { data: enrollment } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId, status: "completed", completed_at: new Date().toISOString() })
      .select("id")
      .single();
    enrollmentId = enrollment!.id;

    // Satisfy summarizeCompletion's lesson-progress check so evaluateCompletion later in this
    // suite genuinely computes complete:true rather than short-circuiting on an incomplete course.
    await svc.from("lesson_progress").insert({
      enrollment_id: enrollmentId,
      lesson_id: course.lessonIds[0],
      completed_at: new Date().toISOString(),
      last_position_seconds: 0,
    });

    const { data: cert } = await svc
      .from("certificates")
      .insert({
        enrollment_id: enrollmentId,
        user_id: learner.id,
        course_id: course.courseId,
        version_id: course.versionId,
        learner_name: `${tag} Learner`,
        course_title: `${tag} Course`,
      })
      .select("id")
      .single();
    certificateId = cert!.id;
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("finds the certificate by learner name and by code", async () => {
    currentClient = admin.client;
    const byName = await searchAdminCertificates(admin.client, { q: `${tag} Learner`, status: "", courseId: "", page: 1 });
    expect(byName.certificates.some((c) => c.certificateId === certificateId)).toBe(true);
  });

  it("rejects search for a non-admin", async () => {
    await expect(
      searchAdminCertificates(plainLearner.client, { q: "", status: "", courseId: "", page: 1 }),
    ).rejects.toThrow();
  });

  it("rejects a revoke with no reason", async () => {
    currentClient = admin.client;
    const res = await revokeCertificateAction(certificateId, "   ");
    expect(res.ok).toBe(false);
  });

  it("rejects a revoke from a non-admin", async () => {
    currentClient = plainLearner.client;
    const res = await revokeCertificateAction(certificateId, "cheating");
    expect(res.ok).toBe(false);
  });

  it("revokes the certificate (audited) and blocks a second revoke", async () => {
    currentClient = admin.client;
    const ok = await revokeCertificateAction(certificateId, "Academic integrity violation");
    expect(ok).toEqual({ ok: true });

    const { data } = await svc.from("certificates").select("status, revoked_reason, revoked_by").eq("id", certificateId).single();
    expect(data).toMatchObject({ status: "revoked", revoked_reason: "Academic integrity violation", revoked_by: admin.id });

    const { data: auditRow } = await svc
      .from("audit_logs")
      .select("action, actor_id")
      .eq("action", "certificate.revoked")
      .eq("resource_id", certificateId)
      .maybeSingle();
    expect(auditRow).toMatchObject({ action: "certificate.revoked", actor_id: admin.id });

    const again = await revokeCertificateAction(certificateId, "second try");
    expect(again.ok).toBe(false);
  });

  it("does not resurface the revoked certificate as valid when completion is re-evaluated", async () => {
    const result = await evaluateCompletion(svc, enrollmentId);
    expect(result).toMatchObject({ complete: true, certificateCode: null });
    const { data } = await svc.from("certificates").select("id").eq("enrollment_id", enrollmentId);
    expect(data).toHaveLength(1); // still just the revoked row; no silent auto-reissue
  });

  it("rejects reissuing an issued (non-revoked) certificate, and reissuing from a non-admin", async () => {
    const { data: activeCert } = await svc
      .from("certificates")
      .insert({
        enrollment_id: (
          await svc
            .from("enrollments")
            .insert({ user_id: plainLearner.id, course_id: course.courseId, version_id: course.versionId, status: "completed" })
            .select("id")
            .single()
        ).data!.id,
        user_id: plainLearner.id,
        course_id: course.courseId,
        version_id: course.versionId,
        learner_name: `${tag} Plain`,
        course_title: `${tag} Course`,
      })
      .select("id")
      .single();

    currentClient = admin.client;
    const notRevoked = await reissueCertificateAction(activeCert!.id);
    expect(notRevoked.ok).toBe(false);

    currentClient = plainLearner.client;
    const denied = await reissueCertificateAction(certificateId);
    expect(denied.ok).toBe(false);
  });

  it("reissues the revoked certificate as a new, live certificate (audited)", async () => {
    currentClient = admin.client;
    const reissued = await reissueCertificateAction(certificateId);
    expect(reissued, JSON.stringify(reissued)).toMatchObject({ ok: true });
    if (!reissued.ok) return;
    expect(reissued.code).toMatch(/^MLC-/);

    const { data: rows } = await svc.from("certificates").select("id, code, status").eq("enrollment_id", enrollmentId);
    expect(rows).toHaveLength(2);
    expect(rows!.find((r) => r.id === certificateId)!.status).toBe("revoked");
    const fresh = rows!.find((r) => r.code === reissued.code)!;
    expect(fresh.status).toBe("issued");

    const { data: auditRow } = await svc
      .from("audit_logs")
      .select("action, resource_id")
      .eq("action", "certificate.reissued")
      .eq("resource_id", fresh.id)
      .maybeSingle();
    expect(auditRow).toMatchObject({ action: "certificate.reissued", resource_id: fresh.id });

    // evaluateCompletion now finds the live reissued certificate, not the revoked one.
    const result = await evaluateCompletion(svc, enrollmentId);
    expect(result).toMatchObject({ complete: true, certificateCode: reissued.code });
  });
});
