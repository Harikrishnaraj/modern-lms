import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { getAdminUserDetail, getLoginHistory } from "@/features/admin/user-detail";
import { getUserProgress } from "@/features/progress/progress";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-402: admin user detail — account, roles, progress, skills, login history (T-130), live Supabase.
describe.skipIf(!hasLiveProject)("admin user detail (T-130, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("audet");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
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
    learner = await user("lrn", "learner", `${tag} Learner`);
    other = await user("oth", "learner", `${tag} Other`);
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const { data: cat } = await svc.from("categories").select("id").limit(1).single();
    course = await createCourse(svc, instructor.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      publish: true,
      categoryId: cat!.id as string,
      sections: [{ title: "S", lessons: [{ title: "L1", minutes: 20 }] }],
    });
    courseIds.push(course.courseId);

    const { data: enr } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId })
      .select("id")
      .single();
    await svc.from("lesson_progress").insert({
      enrollment_id: enr!.id,
      lesson_id: course.lessonIds[0],
      completed_at: new Date().toISOString(),
    });
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("lets an admin read a user's account/role summary", async () => {
    const detail = await getAdminUserDetail(admin.client, learner.id);
    expect(detail).toMatchObject({ userId: learner.id, fullName: `${tag} Learner`, status: "active", roles: ["learner"] });
  });

  it("returns null for a non-existent user, and rejects a non-admin caller", async () => {
    expect(await getAdminUserDetail(admin.client, "00000000-0000-0000-0000-000000000000")).toBeNull();
    await expect(getAdminUserDetail(learner.client, admin.id)).rejects.toThrow();
  });

  it("shows the user's real course progress to an admin, and rejects a non-admin caller", async () => {
    const progress = await getUserProgress(admin.client, learner.id);
    expect(progress.lessonsCompleted).toBe(1);
    expect(progress.minutes).toBe(20);
    expect(progress.courses[0]).toMatchObject({ courseId: course.courseId, completedLessons: 1, totalLessons: 1 });

    await expect(getUserProgress(other.client, learner.id)).rejects.toThrow();
  });

  it("records a login under the caller's own identity and lets them read their own history", async () => {
    const { error } = await learner.client.rpc("record_login", { p_ip: "203.0.113.5", p_user_agent: "vitest-agent/1.0" });
    expect(error).toBeNull();

    const own = await getLoginHistory(learner.client, learner.id);
    expect(own.length).toBeGreaterThan(0);
    expect(own[0]).toMatchObject({ ipAddress: "203.0.113.5", userAgent: "vitest-agent/1.0" });
  });

  it("lets an admin read anyone's login history, but another regular user cannot", async () => {
    const asAdmin = await getLoginHistory(admin.client, learner.id);
    expect(asAdmin.length).toBeGreaterThan(0);

    const asOther = await getLoginHistory(other.client, learner.id);
    expect(asOther).toEqual([]);
  });

  it("does nothing when an anonymous caller tries to record a login", async () => {
    const before = (await svc.from("login_history").select("id", { count: "exact", head: true })).count ?? 0;
    const { error } = await anon().rpc("record_login", { p_ip: "1.1.1.1", p_user_agent: "anon" });
    expect(error).not.toBeNull(); // anon has no execute grant
    const after = (await svc.from("login_history").select("id", { count: "exact", head: true })).count ?? 0;
    expect(after).toBe(before);
  });
});
