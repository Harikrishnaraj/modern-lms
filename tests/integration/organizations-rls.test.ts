import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// T-160 (F-500, F-501): organizations/departments/teams/organization_members RLS isolation.
// An Org Admin (or plain member) of one organization must never read or write another's data;
// a platform admin (organizations.manage) can read/write across all of them.
describe.skipIf(!hasLiveProject)("organizations schema RLS (T-160, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("org");
  const userIds: string[] = [];
  const orgIds: string[] = [];

  type U = { id: string; client: SupabaseClient };
  async function signedIn(name: string, role: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    userIds.push(u.id);
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  let orgA: string, orgB: string, deptA: string, teamA: string, deptB: string;
  let platformAdmin: U, orgAdminA: U, memberA: U, orgAdminB: U, outsider: U, newHireA: U;

  beforeAll(async () => {
    const { data: a } = await svc.from("organizations").insert({ name: `${tag} Org A`, slug: `${tag}-org-a` }).select("id").single();
    const { data: b } = await svc.from("organizations").insert({ name: `${tag} Org B`, slug: `${tag}-org-b` }).select("id").single();
    orgA = a!.id;
    orgB = b!.id;
    orgIds.push(orgA, orgB);
    const { data: da } = await svc.from("departments").insert({ organization_id: orgA, name: "Engineering" }).select("id").single();
    const { data: db } = await svc.from("departments").insert({ organization_id: orgB, name: "Sales" }).select("id").single();
    deptA = da!.id;
    deptB = db!.id;
    const { data: ta } = await svc.from("teams").insert({ department_id: deptA, name: "Backend" }).select("id").single();
    teamA = ta!.id;

    [platformAdmin, orgAdminA, memberA, orgAdminB, outsider, newHireA] = await Promise.all([
      signedIn("pa", "admin"),
      signedIn("oaa", "org_admin"),
      signedIn("ma", "learner"),
      signedIn("oab", "org_admin"),
      signedIn("out", "learner"),
      signedIn("nh", "learner"),
    ]);
    await svc.from("organization_members").insert([
      { organization_id: orgA, user_id: orgAdminA.id, org_role: "org_admin" },
      { organization_id: orgA, user_id: memberA.id, org_role: "member", team_id: teamA },
      { organization_id: orgB, user_id: orgAdminB.id, org_role: "org_admin" },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (orgIds.length) await svc.from("organizations").delete().in("id", orgIds);
    await cleanup(svc, { learnerIds: [], courseIds: [], userIds });
  }, 60_000);

  it("a user outside any organization sees none of them", async () => {
    expect((await outsider.client.from("organizations").select("id")).data).toEqual([]);
    expect((await outsider.client.from("departments").select("id")).data).toEqual([]);
    expect((await outsider.client.from("teams").select("id")).data).toEqual([]);
    expect((await outsider.client.from("organization_members").select("id")).data).toEqual([]);
  });

  it("a plain member sees only their own organization's rows", async () => {
    const orgs = (await memberA.client.from("organizations").select("id")).data!.map((r) => r.id);
    expect(orgs).toEqual([orgA]);
    const depts = (await memberA.client.from("departments").select("id")).data!.map((r) => r.id);
    expect(depts).toEqual([deptA]);
    const teams = (await memberA.client.from("teams").select("id")).data!.map((r) => r.id);
    expect(teams).toEqual([teamA]);
    const members = (await memberA.client.from("organization_members").select("user_id")).data!.map((r) => r.user_id);
    expect(members.sort()).toEqual([memberA.id, orgAdminA.id].sort());
  });

  it("a plain member cannot write to their own organization's structure", async () => {
    const res = await memberA.client.from("departments").insert({ organization_id: orgA, name: "Hacked" }).select("id");
    expect((res.data ?? []).length).toBe(0);
  });

  it("an org admin can manage their own org's departments/teams/members but not another org's", async () => {
    // Own org: can rename a department and add a new member.
    const rename = await orgAdminA.client.from("departments").update({ name: "Platform Engineering" }).eq("id", deptA).select("id");
    expect(rename.data).toHaveLength(1);
    const addMember = await orgAdminA.client.from("organization_members").insert({ organization_id: orgA, user_id: newHireA.id, team_id: teamA }).select("id");
    expect(addMember.data).toHaveLength(1);
    expect((await svc.from("organization_members").select("org_role").eq("user_id", newHireA.id).single()).data!.org_role).toBe("member");

    // Someone else's org: reads nothing, and every write is silently a no-op (RLS filters rows,
    // it does not surface a separate "forbidden" row count).
    expect((await orgAdminA.client.from("organizations").select("id").eq("id", orgB)).data).toEqual([]);
    const renameOther = await orgAdminA.client.from("departments").update({ name: "Hacked" }).eq("id", deptB).select("id");
    expect((renameOther.data ?? []).length).toBe(0);
    expect((await svc.from("departments").select("name").eq("id", deptB).single()).data!.name).toBe("Sales");
    const addToOther = await orgAdminA.client.from("organization_members").insert({ organization_id: orgB, user_id: outsider.id }).select("id");
    expect((addToOther.data ?? []).length).toBe(0);
  });

  it("the platform admin (organizations.manage) reads and writes across every organization", async () => {
    const orgs = (await platformAdmin.client.from("organizations").select("id")).data!.map((r) => r.id);
    expect(orgs).toEqual(expect.arrayContaining([orgA, orgB]));
    const renamed = await platformAdmin.client.from("organizations").update({ name: `${tag} Org B renamed` }).eq("id", orgB).select("id");
    expect(renamed.data).toHaveLength(1);
  });

  it("a user can belong to at most one organization", async () => {
    const dup = await svc.from("organization_members").insert({ organization_id: orgB, user_id: memberA.id });
    expect(dup.error).not.toBeNull();
  });

  it("a team must belong to the same organization as the membership row referencing it", async () => {
    const cross = await svc.from("organization_members").insert({ organization_id: orgB, user_id: outsider.id, team_id: teamA });
    expect(cross.error).not.toBeNull();
  });

  it("a team's organization_id is always derived from its department, never client-supplied", async () => {
    expect((await svc.from("teams").select("organization_id").eq("id", teamA).single()).data!.organization_id).toBe(orgA);
  });
});
