import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { applyToTeachAction } from "@/features/instructor/application-actions";
import { getMyInstructorApplication } from "@/features/instructor/application";
import { reviewApplicationAction } from "@/features/admin/instructor-actions";
import { getAdminInstructors, getInstructorApplications } from "@/features/admin/instructors";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-403: Instructor management & verification (T-131), live Supabase.
describe.skipIf(!hasLiveProject)("instructor verification (T-131, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("iv");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let applicant: { id: string; client: SupabaseClient };
  let rejectee: { id: string; client: SupabaseClient };
  let existingInstructor: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;

  async function user(name: string, role: string, fullName: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role, { fullName });
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin", `${tag} Admin`);
    applicant = await user("app", "learner", `${tag} Applicant`);
    rejectee = await user("rej", "learner", `${tag} Rejectee`);
    existingInstructor = await user("ins", "instructor", `${tag} Existing Instructor`);
    course = await createCourse(svc, existingInstructor.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      publish: true,
    });
    courseIds.push(course.courseId);
    const student = await createUserWithRole(svc, `${tag}-stu`, "learner");
    learnerIds.push(student.id);
    await svc.from("enrollments").insert({ user_id: student.id, course_id: course.courseId, version_id: course.versionId });
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("lets a learner apply to teach, and blocks a second application while pending", async () => {
    currentClient = applicant.client;
    const res = await applyToTeachAction({ message: "I have taught professionally for six years." });
    expect(res).toEqual({ ok: true });

    const mine = await getMyInstructorApplication(applicant.client, applicant.id);
    expect(mine).toMatchObject({ status: "pending", message: "I have taught professionally for six years." });

    const again = await applyToTeachAction({ message: "Trying again while pending." });
    expect(again.ok).toBe(false);
  });

  it("rejects a message that is too short", async () => {
    currentClient = rejectee.client;
    const res = await applyToTeachAction({ message: "short" });
    expect(res.ok).toBe(false);
  });

  it("blocks an existing instructor from applying", async () => {
    const { error } = await existingInstructor.client
      .from("instructor_applications")
      .insert({ user_id: existingInstructor.id, message: "I already teach but want to apply again anyway." });
    expect(error).not.toBeNull();
  });

  it("shows the pending application in the admin verification queue", async () => {
    const queue = await getInstructorApplications(admin.client, "pending");
    expect(queue.find((a) => a.userId === applicant.id)).toMatchObject({
      applicantName: `${tag} Applicant`,
      status: "pending",
    });
  });

  it("rejects queue access and reviews from a non-admin", async () => {
    await expect(getInstructorApplications(applicant.client, "pending")).rejects.toThrow();
    currentClient = applicant.client;
    const res = await reviewApplicationAction("00000000-0000-0000-0000-000000000000", "approved", "");
    expect(res.ok).toBe(false);
  });

  it("approves an application, grants the instructor role, and cannot be reviewed twice", async () => {
    const mine = await getMyInstructorApplication(admin.client, applicant.id);
    currentClient = admin.client;
    const res = await reviewApplicationAction(mine!.id, "approved", "Welcome aboard");
    expect(res).toEqual({ ok: true });

    const { data: roles } = await svc.from("user_roles").select("role_id").eq("user_id", applicant.id);
    expect((roles ?? []).map((r) => r.role_id)).toContain("instructor");

    const updated = await getMyInstructorApplication(admin.client, applicant.id);
    expect(updated).toMatchObject({ status: "approved", reviewNote: "Welcome aboard" });

    const again = await reviewApplicationAction(mine!.id, "rejected", "too late");
    expect(again.ok).toBe(false);
  });

  it("rejects an application with a required note, without granting the role", async () => {
    currentClient = rejectee.client;
    await applyToTeachAction({ message: "I would like to become an instructor here too." });
    const mine = await getMyInstructorApplication(admin.client, rejectee.id);

    currentClient = admin.client;
    const missingNote = await reviewApplicationAction(mine!.id, "rejected", "");
    expect(missingNote.ok).toBe(false);

    const res = await reviewApplicationAction(mine!.id, "rejected", "Not enough teaching experience yet.");
    expect(res).toEqual({ ok: true });

    const { data: roles } = await svc.from("user_roles").select("role_id").eq("user_id", rejectee.id);
    expect((roles ?? []).map((r) => r.role_id)).not.toContain("instructor");

    const updated = await getMyInstructorApplication(admin.client, rejectee.id);
    expect(updated).toMatchObject({ status: "rejected", reviewNote: "Not enough teaching experience yet." });
  });

  it("lists instructors with real course/learner/rating stats, and rejects a non-admin caller", async () => {
    const { instructors } = await getAdminInstructors(admin.client, { sort: "top" });
    const mine = instructors.find((i) => i.userId === existingInstructor.id);
    expect(mine).toMatchObject({ courseCount: 1, publishedCourseCount: 1, totalLearners: 1 });

    await expect(getAdminInstructors(applicant.client)).rejects.toThrow();
  });
});
