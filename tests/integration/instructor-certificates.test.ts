import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";
import { getCertificateTemplate, getInstructorCertificates } from "@/features/instructor/certificates";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-218: Instructor certificates (T-110) — issued list + template settings, live Supabase.
describe.skipIf(!hasLiveProject)("instructor certificates (T-110, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("incert");

  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let teacher1: { id: string; email: string; password: string };
  let teacher2: { id: string; email: string; password: string };
  let student: { id: string; email: string; password: string };

  let courseA: Awaited<ReturnType<typeof createCourse>>;
  let certificateId: string;

  let teacher1Client: SupabaseClient;
  let teacher2Client: SupabaseClient;
  let anonClient: SupabaseClient;

  beforeAll(async () => {
    teacher1 = await createUserWithRole(svc, `${tag}-tch1`, "instructor", {
      fullName: `${tag} Teacher One`,
    });
    teacher2 = await createUserWithRole(svc, `${tag}-tch2`, "instructor", {
      fullName: `${tag} Teacher Two`,
    });
    student = await createUserWithRole(svc, `${tag}-s1`, "learner", {
      fullName: `${tag} Alice`,
    });
    userIds.push(teacher1.id, teacher2.id);
    learnerIds.push(student.id);

    courseA = await createCourse(svc, teacher1.id, {
      slug: `${tag}-course-a`,
      title: `${tag} Cloud Foundations`,
      publish: true,
    });
    courseIds.push(courseA.courseId);

    const { data: enr } = await svc
      .from("enrollments")
      .insert({ user_id: student.id, course_id: courseA.courseId, version_id: courseA.versionId })
      .select("id")
      .single();

    const { data: cert, error } = await svc
      .from("certificates")
      .insert({
        enrollment_id: enr!.id,
        user_id: student.id,
        course_id: courseA.courseId,
        version_id: courseA.versionId,
        learner_name: `${tag} Alice`,
        course_title: `${tag} Cloud Foundations`,
        instructor_name: `${tag} Teacher One`,
      })
      .select("id")
      .single();
    if (error) throw error;
    certificateId = cert!.id;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    teacher1Client = createClient(url, anonKey, { auth: { persistSession: false } });
    await teacher1Client.auth.signInWithPassword({ email: teacher1.email, password: teacher1.password });

    teacher2Client = createClient(url, anonKey, { auth: { persistSession: false } });
    await teacher2Client.auth.signInWithPassword({ email: teacher2.email, password: teacher2.password });

    anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  it("lists certificates scoped to the authenticated instructor's own courses", async () => {
    const mine = await getInstructorCertificates(teacher1Client);
    expect(mine.map((c) => c.id)).toContain(certificateId);

    const notMine = await getInstructorCertificates(teacher2Client);
    expect(notMine.map((c) => c.id)).not.toContain(certificateId);
  });

  it("filters the issued list by course", async () => {
    const filtered = await getInstructorCertificates(teacher1Client, courseA.courseId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(certificateId);
  });

  it("rejects unauthenticated access to the issued list", async () => {
    const { error } = await anonClient.rpc("instructor_certificates");
    expect(error).not.toBeNull();
  });

  it("lets the course owner save a certificate template and reads it back", async () => {
    const { error } = await teacher1Client.rpc("upsert_certificate_template", {
      p_course_id: courseA.courseId,
      p_signature_title: "Lead Instructor",
      p_closing_message: "Well done!",
    });
    expect(error).toBeNull();

    const template = await getCertificateTemplate(teacher1Client, courseA.courseId);
    expect(template).toMatchObject({
      courseId: courseA.courseId,
      signatureTitle: "Lead Instructor",
      closingMessage: "Well done!",
    });
  });

  it("prevents another instructor from editing a course's template they do not own", async () => {
    const { error } = await teacher2Client.rpc("upsert_certificate_template", {
      p_course_id: courseA.courseId,
      p_signature_title: "Hijacked",
      p_closing_message: "Nope",
    });
    expect(error).not.toBeNull();
    expect(error?.message).toContain("not allowed");
  });

  it("rejects a signature title or closing message over the length limit", async () => {
    const longTitle = "x".repeat(201);
    const { error: titleErr } = await teacher1Client.rpc("upsert_certificate_template", {
      p_course_id: courseA.courseId,
      p_signature_title: longTitle,
      p_closing_message: null,
    });
    expect(titleErr).not.toBeNull();
    expect(titleErr?.message).toContain("200");

    const longMessage = "x".repeat(501);
    const { error: msgErr } = await teacher1Client.rpc("upsert_certificate_template", {
      p_course_id: courseA.courseId,
      p_signature_title: null,
      p_closing_message: longMessage,
    });
    expect(msgErr).not.toBeNull();
    expect(msgErr?.message).toContain("500");
  });

  it("returns no template for a course that has not set one", async () => {
    const bare = await createCourse(svc, teacher1.id, {
      slug: `${tag}-course-bare`,
      title: `${tag} Bare Course`,
    });
    courseIds.push(bare.courseId);
    const template = await getCertificateTemplate(teacher1Client, bare.courseId);
    expect(template).toBeNull();
  });
});
