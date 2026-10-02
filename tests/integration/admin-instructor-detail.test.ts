import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { getAdminInstructorDetail } from "@/features/admin/instructor-detail";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updatePayoutDetailsAction } from "@/features/instructor/settings-actions";
import { getPayoutDetails } from "@/features/instructor/settings";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-403: Admin instructor detail (T-132), live Supabase.
describe.skipIf(!hasLiveProject)("admin instructor detail (T-132, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("aid");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let instructor: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let courseA: Awaited<ReturnType<typeof createCourse>>;

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
    instructor = await user("ins", "instructor", `${tag} Instructor`);
    learner = await user("lrn", "learner", `${tag} Learner`);

    courseA = await createCourse(svc, instructor.id, { slug: `${tag}-a`, title: `${tag} Course A`, publish: true });
    const courseB = await createCourse(svc, instructor.id, { slug: `${tag}-b`, title: `${tag} Course B` });
    courseIds.push(courseA.courseId, courseB.courseId);

    const student = await createUserWithRole(svc, `${tag}-stu`, "learner");
    learnerIds.push(student.id);
    await svc.from("enrollments").insert({ user_id: student.id, course_id: courseA.courseId, version_id: courseA.versionId });
    await svc.from("course_ratings").insert([
      { course_id: courseA.courseId, user_id: student.id, rating: 5, body: `${tag} great course` },
    ]);
    await svc.from("courses").update({ rating_avg: 5, rating_count: 1 }).eq("id", courseA.courseId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("shows real courses and rating distribution to an admin", async () => {
    const detail = await getAdminInstructorDetail(admin.client, instructor.id);
    expect(detail).toMatchObject({ userId: instructor.id, fullName: `${tag} Instructor` });
    expect(detail!.courses).toHaveLength(2);
    const a = detail!.courses.find((c) => c.courseId === courseA.courseId);
    expect(a).toMatchObject({ isLive: true, learners: 1 });
    expect(detail!.ratingDistribution[5]).toBe(1);
  });

  it("returns null for a user who is not an instructor, and rejects a non-admin caller", async () => {
    expect(await getAdminInstructorDetail(admin.client, learner.id)).toBeNull();
    await expect(getAdminInstructorDetail(learner.client, instructor.id)).rejects.toThrow();
  });

  it("lets staff read an instructor's saved payout details, but not other regular users", async () => {
    currentClient = instructor.client;
    await updatePayoutDetailsAction({ method: "paypal", reference: "instructor@example.com" });

    const asAdmin = await getPayoutDetails(admin.client, instructor.id);
    expect(asAdmin).toMatchObject({ payoutMethod: "paypal", payoutReference: "instructor@example.com" });

    const asLearner = await getPayoutDetails(learner.client, instructor.id);
    expect(asLearner).toBeNull();
  });
});
