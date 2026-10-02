import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addOrganizationMemberAction,
  createOrganizationAction,
  removeOrganizationMemberAction,
  renameOrganizationAction,
  setOrganizationMemberRoleAction,
} from "@/features/admin/organization-actions";
import { getAdminOrganizations, getOrganizationDetail, getOrganizationMembers } from "@/features/admin/organizations";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-500: Admin Organizations screen (T-161), live Supabase.
describe.skipIf(!hasLiveProject)("admin organizations (T-161, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("aorg");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const orgIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let learnerId: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role, { fullName: `${tag} ${name}` });
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    learner = await user("lrn", "learner");
    learnerId = learner.id;
  }, 200_000);

  afterAll(async () => {
    if (orgIds.length) await svc.from("organizations").delete().in("id", orgIds);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("lets an admin create an organization, add and manage a member, and see learning hours", async () => {
    currentClient = admin.client;
    const created = await createOrganizationAction({ name: `${tag} Org`, slug: `${tag}-org` });
    expect(created.ok).toBe(true);
    const orgId = (created as { ok: true; id: string }).id;
    orgIds.push(orgId);

    const { organizations } = await getAdminOrganizations(admin.client, { q: tag, page: 1 });
    expect(organizations).toHaveLength(1);
    expect(organizations[0]).toMatchObject({ name: `${tag} Org`, slug: `${tag}-org`, memberCount: 0 });

    const renamed = await renameOrganizationAction(orgId, `${tag} Org Renamed`);
    expect(renamed).toEqual({ ok: true });

    const added = await addOrganizationMemberAction(orgId, learnerId, "member");
    expect(added).toEqual({ ok: true });

    // Give the learner some watch time to sum into "learning hours".
    const course = await createCourse(svc, admin.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);
    const { data: enrollment } = await svc
      .from("enrollments")
      .insert({ user_id: learnerId, course_id: course.courseId, version_id: course.versionId, status: "active" })
      .select("id")
      .single();
    await svc.from("lesson_progress").insert({ enrollment_id: enrollment!.id, lesson_id: course.lessonIds[0], last_position_seconds: 7200 });

    const detail = await getOrganizationDetail(admin.client, orgId);
    expect(detail).toMatchObject({ name: `${tag} Org Renamed`, memberCount: 1, learningHours: 2 });

    const members = await getOrganizationMembers(admin.client, orgId);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId: learnerId, orgRole: "member" });

    const promoted = await setOrganizationMemberRoleAction(members[0].memberId, "org_admin");
    expect(promoted).toEqual({ ok: true });
    expect((await getOrganizationMembers(admin.client, orgId))[0].orgRole).toBe("org_admin");

    const removed = await removeOrganizationMemberAction(members[0].memberId);
    expect(removed).toEqual({ ok: true });
    expect(await getOrganizationMembers(admin.client, orgId)).toHaveLength(0);
  });

  it("rejects a duplicate slug and a user who already belongs to an organization", async () => {
    currentClient = admin.client;
    const first = await createOrganizationAction({ name: `${tag} Dupe`, slug: `${tag}-dupe` });
    expect(first.ok).toBe(true);
    orgIds.push((first as { ok: true; id: string }).id);
    const second = await createOrganizationAction({ name: `${tag} Dupe Again`, slug: `${tag}-dupe` });
    expect(second.ok).toBe(false);

    const orgA = (first as { ok: true; id: string }).id;
    const other = await createOrganizationAction({ name: `${tag} Other`, slug: `${tag}-other` });
    orgIds.push((other as { ok: true; id: string }).id);
    expect(await addOrganizationMemberAction(orgA, learnerId, "member")).toEqual({ ok: true });
    const conflict = await addOrganizationMemberAction((other as { ok: true; id: string }).id, learnerId, "member");
    expect(conflict.ok).toBe(false);
  });

  it("rejects organization management from a non-admin", async () => {
    currentClient = learner.client;
    const res = await createOrganizationAction({ name: `${tag} Blocked`, slug: `${tag}-blocked` });
    expect(res.ok).toBe(false);
  });
});
