import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-502: Assigned learning -- due dates and overdue tracking (T-163).
describe.skipIf(!hasLiveProject)("assigned learning (T-163, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("asl");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const orgIds: string[] = [];

  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  type U = { id: string; client: SupabaseClient };
  async function signedIn(name: string, role: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  let orgAdmin: U, memberA: U, memberB: U, outsider: U;
  let orgId: string;
  let courseId: string;

  beforeAll(async () => {
    [orgAdmin, memberA, memberB, outsider] = await Promise.all([
      signedIn("oa", "org_admin"),
      signedIn("a", "learner"),
      signedIn("b", "learner"),
      signedIn("out", "learner"),
    ]);

    const { data: org } = await svc.from("organizations").insert({ name: `${tag} Org`, slug: `${tag}-org` }).select("id").single();
    orgId = org!.id;
    orgIds.push(orgId);
    await svc.from("organization_members").insert([
      { organization_id: orgId, user_id: orgAdmin.id, org_role: "org_admin" },
      { organization_id: orgId, user_id: memberA.id, org_role: "member" },
      { organization_id: orgId, user_id: memberB.id, org_role: "member" },
    ]);

    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseId = course.courseId;
    courseIds.push(courseId);
  }, 200_000);

  afterAll(async () => {
    if (orgIds.length) await svc.from("organizations").delete().in("id", orgIds);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("rejects an assignment from a non-org-admin member", async () => {
    const res = await memberA.client.from("assigned_learning").insert({ organization_id: orgId, scope: "organization", content_type: "course", course_id: courseId, due_at: null });
    expect(res.error).not.toBeNull();
  });

  it("an org-wide, overdue course assignment shows up for members with the right status, and rolls up for the org admin", async () => {
    const pastDue = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const created = await orgAdmin.client.from("assigned_learning").insert({ organization_id: orgId, scope: "organization", content_type: "course", course_id: courseId, due_at: pastDue }).select("id").single();
    expect(created.error).toBeNull();

    const mineA = (await memberA.client.rpc("my_assigned_learning")).data as { title: string; is_complete: boolean; is_overdue: boolean }[];
    expect(mineA).toHaveLength(1);
    expect(mineA[0]).toMatchObject({ is_complete: false, is_overdue: true });

    // Outsider (not a member of this org) sees nothing.
    expect((await outsider.client.rpc("my_assigned_learning")).data).toEqual([]);

    // Complete the course for memberA: no longer overdue.
    const { data: version } = await svc.from("courses").select("published_version_id").eq("id", courseId).single();
    await svc.from("enrollments").insert({ user_id: memberA.id, course_id: courseId, version_id: version!.published_version_id, status: "completed", completed_at: new Date().toISOString() });
    const mineAfter = (await memberA.client.rpc("my_assigned_learning")).data as { is_complete: boolean; is_overdue: boolean }[];
    expect(mineAfter[0]).toMatchObject({ is_complete: true, is_overdue: false });

    const rollup = (await orgAdmin.client.rpc("list_org_assigned_learning", { p_org_id: orgId })).data as { total_assigned: number; completed_count: number; overdue_count: number }[];
    expect(rollup).toHaveLength(1);
    // 3 org members (org admin + memberA + memberB); memberA is complete, the other two are overdue.
    expect(rollup[0]).toMatchObject({ total_assigned: 3, completed_count: 1, overdue_count: 2 });
  });

  it("a user-scoped assignment only reaches that one member", async () => {
    const created = await orgAdmin.client.from("assigned_learning").insert({ organization_id: orgId, scope: "user", user_id: memberB.id, content_type: "course", course_id: courseId, due_at: null }).select("id").single();
    expect(created.error).toBeNull();

    const mineB = (await memberB.client.rpc("my_assigned_learning")).data as unknown[];
    expect(mineB).toHaveLength(2); // the org-wide one from the previous test, plus this one.

    const mineA = (await memberA.client.rpc("my_assigned_learning")).data as unknown[];
    expect(mineA).toHaveLength(1); // still just the org-wide assignment.
  });
});
