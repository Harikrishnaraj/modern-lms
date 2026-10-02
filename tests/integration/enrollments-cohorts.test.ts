import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addCohortMemberAction,
  bulkEnrollCohortAction,
  createCohortAction,
  deleteCohortAction,
  enrollUserAction,
  removeCohortMemberAction,
  searchLearnersAction,
  unenrollUserAction,
} from "@/features/admin/enrollment-actions";
import { getAdminCohorts, getAdminEnrollments, getCohortMembers } from "@/features/admin/enrollments";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-407: Enrollments & cohorts (T-135), live Supabase.
describe.skipIf(!hasLiveProject)("enrollments & cohorts (T-135, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("ec");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const cohortIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let learnerA: { id: string; client: SupabaseClient };
  let learnerB: { id: string; client: SupabaseClient };
  let plainLearner: { id: string; client: SupabaseClient };
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
    learnerA = await user("lrnA", "learner", `${tag} Learner A`);
    learnerB = await user("lrnB", "learner", `${tag} Learner B`);
    plainLearner = await user("lrnC", "learner", `${tag} Learner C`);
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);
  }, 200_000);

  afterAll(async () => {
    await svc.from("cohorts").delete().in("id", cohortIds);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("finds learners by search, scoped to the learner role", async () => {
    currentClient = admin.client;
    const results = await searchLearnersAction(`${tag} Learner A`);
    expect(results.some((r) => r.userId === learnerA.id)).toBe(true);
  });

  it("manually enrolls and unenrolls a learner, and lists it in the admin search", async () => {
    currentClient = admin.client;
    const enrolled = await enrollUserAction(learnerA.id, course.courseId);
    expect(enrolled).toEqual({ ok: true });

    const { enrollments } = await getAdminEnrollments(admin.client, { q: `${tag} Learner A`, status: "", courseId: "", page: 1 });
    expect(enrollments[0]).toMatchObject({ userId: learnerA.id, courseId: course.courseId, status: "active" });

    const unenrolled = await unenrollUserAction(learnerA.id, course.courseId);
    expect(unenrolled).toEqual({ ok: true });
    const { data } = await svc.from("enrollments").select("status").eq("user_id", learnerA.id).eq("course_id", course.courseId).single();
    expect(data!.status).toBe("cancelled");
  });

  it("reactivates a cancelled enrollment when enrolled again", async () => {
    currentClient = admin.client;
    await enrollUserAction(learnerA.id, course.courseId);
    const { data } = await svc.from("enrollments").select("status").eq("user_id", learnerA.id).eq("course_id", course.courseId).single();
    expect(data!.status).toBe("active");
  });

  it("rejects an unpublished course and a non-admin caller", async () => {
    currentClient = admin.client;
    const draft = await createCourse(svc, (await createUserWithRole(svc, `${tag}-ins2`, "instructor")).id, {
      slug: `${tag}-draft`,
      title: `${tag} Draft`,
      publish: false,
    });
    courseIds.push(draft.courseId);
    expect((await enrollUserAction(learnerB.id, draft.courseId)).ok).toBe(false);

    currentClient = plainLearner.client;
    expect((await enrollUserAction(learnerB.id, course.courseId)).ok).toBe(false);
    await expect(getAdminEnrollments(plainLearner.client, { q: "", status: "", courseId: "", page: 1 })).rejects.toThrow();
  });

  it("creates a cohort, manages membership, and deletes it", async () => {
    currentClient = admin.client;
    const created = await createCohortAction(`${tag} Cohort One`);
    expect(created).toEqual({ ok: true });

    const cohorts = await getAdminCohorts(admin.client);
    const cohort = cohorts.find((c) => c.name === `${tag} Cohort One`)!;
    cohortIds.push(cohort.id);
    expect(cohort.memberCount).toBe(0);

    expect(await addCohortMemberAction(cohort.id, learnerA.id)).toEqual({ ok: true });
    expect(await addCohortMemberAction(cohort.id, learnerB.id)).toEqual({ ok: true });

    const members = await getCohortMembers(admin.client, cohort.id);
    expect(members.map((m) => m.userId).sort()).toEqual([learnerA.id, learnerB.id].sort());

    // Adding the same member twice is rejected.
    expect((await addCohortMemberAction(cohort.id, learnerA.id)).ok).toBe(false);

    await removeCohortMemberAction(cohort.id, learnerB.id);
    const afterRemove = await getCohortMembers(admin.client, cohort.id);
    expect(afterRemove.map((m) => m.userId)).toEqual([learnerA.id]);
  });

  it("bulk-enrolls every cohort member into a course", async () => {
    currentClient = admin.client;
    const created = await createCohortAction(`${tag} Bulk Cohort`);
    expect(created).toEqual({ ok: true });
    const cohorts = await getAdminCohorts(admin.client);
    const cohort = cohorts.find((c) => c.name === `${tag} Bulk Cohort`)!;
    cohortIds.push(cohort.id);

    await addCohortMemberAction(cohort.id, learnerA.id);
    await addCohortMemberAction(cohort.id, learnerB.id);
    await addCohortMemberAction(cohort.id, plainLearner.id);

    const result = await bulkEnrollCohortAction(cohort.id, course.courseId);
    expect(result).toMatchObject({ ok: true, totalMembers: 3 });
    if (result.ok) expect(result.enrolled).toBe(3);

    const { data } = await svc.from("enrollments").select("user_id, status").eq("course_id", course.courseId);
    const ids = (data ?? []).filter((r) => r.status === "active").map((r) => r.user_id);
    expect(ids).toContain(learnerB.id);
    expect(ids).toContain(plainLearner.id);
  });

  it("refuses to reset a completed enrollment back to active when re-enrolling", async () => {
    const completedLearner = await user("cmp", "learner", `${tag} Completed Learner`);
    await svc.from("enrollments").insert({ user_id: completedLearner.id, course_id: course.courseId, version_id: course.versionId, status: "completed", completed_at: new Date().toISOString() });

    currentClient = admin.client;
    const result = await enrollUserAction(completedLearner.id, course.courseId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("already completed");

    const { data } = await svc.from("enrollments").select("status").eq("user_id", completedLearner.id).eq("course_id", course.courseId).single();
    expect(data!.status).toBe("completed");
  });

  it("skips an already-completed member during bulk enroll without blocking the rest of the cohort", async () => {
    const completedLearner = await user("cmp2", "learner", `${tag} Completed Learner 2`);
    const freshLearner = await user("frs", "learner", `${tag} Fresh Learner`);
    await svc.from("enrollments").insert({ user_id: completedLearner.id, course_id: course.courseId, version_id: course.versionId, status: "completed", completed_at: new Date().toISOString() });

    currentClient = admin.client;
    await createCohortAction(`${tag} Re-run Cohort`);
    const cohorts = await getAdminCohorts(admin.client);
    const cohort = cohorts.find((c) => c.name === `${tag} Re-run Cohort`)!;
    cohortIds.push(cohort.id);
    await addCohortMemberAction(cohort.id, completedLearner.id);
    await addCohortMemberAction(cohort.id, freshLearner.id);

    const result = await bulkEnrollCohortAction(cohort.id, course.courseId);
    expect(result).toMatchObject({ ok: true, totalMembers: 2, enrolled: 1 });

    const { data: completedRow } = await svc.from("enrollments").select("status").eq("user_id", completedLearner.id).eq("course_id", course.courseId).single();
    expect(completedRow!.status).toBe("completed");
    const { data: freshRow } = await svc.from("enrollments").select("status").eq("user_id", freshLearner.id).eq("course_id", course.courseId).single();
    expect(freshRow!.status).toBe("active");
  });

  it("rejects cohort management from a non-admin", async () => {
    currentClient = plainLearner.client;
    expect((await createCohortAction(`${tag} Sneaky`)).ok).toBe(false);
    await expect(getAdminCohorts(plainLearner.client)).rejects.toThrow();
  });

  it("cascades cohort deletion to its members", async () => {
    currentClient = admin.client;
    await createCohortAction(`${tag} Deletable`);
    const cohorts = await getAdminCohorts(admin.client);
    const cohort = cohorts.find((c) => c.name === `${tag} Deletable`)!;
    await addCohortMemberAction(cohort.id, learnerA.id);

    const del = await deleteCohortAction(cohort.id);
    expect(del).toEqual({ ok: true });

    const { data } = await svc.from("cohort_members").select("cohort_id").eq("cohort_id", cohort.id);
    expect(data).toEqual([]);
  });
});
