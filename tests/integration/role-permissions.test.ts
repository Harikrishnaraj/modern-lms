import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { setRolePermissionAction } from "@/features/admin/role-actions";
import { getRoleMatrix } from "@/features/admin/roles";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-404: Roles & Permissions matrix editor (T-133), live Supabase.
// Uses a throwaway test-scoped permission (never a real one) so this cannot race or leave
// behind changes to shared roles used by every other test in the suite.
describe.skipIf(!hasLiveProject)("role permissions matrix (T-133, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("rp");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const testPermissionId = `${tag}.test_permission`;

  let superAdmin: { id: string; client: SupabaseClient };
  let plainAdmin: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    superAdmin = await user("super", "super_admin");
    plainAdmin = await user("admin", "admin");
    learner = await user("lrn", "learner");
    const { error } = await svc.from("permissions").insert({ id: testPermissionId, description: "test permission" });
    if (error) throw error;
  }, 200_000);

  afterAll(async () => {
    await svc.from("permissions").delete().eq("id", testPermissionId);
    await cleanup(svc, { learnerIds, courseIds: [], userIds });
  }, 120_000);

  it("lets any authenticated user read the matrix (open reference data)", async () => {
    const matrix = await getRoleMatrix(learner.client);
    expect(matrix.roleIds).toContain("learner");
    expect(matrix.permissions.some((p) => p.id === testPermissionId)).toBe(true);
    expect(matrix.grants.learner.has(testPermissionId)).toBe(false);
  });

  it("lets Super Admin grant and then revoke a permission for a role", async () => {
    currentClient = superAdmin.client;
    const grant = await setRolePermissionAction("content_reviewer", testPermissionId, true);
    expect(grant).toEqual({ ok: true });

    const afterGrant = await getRoleMatrix(superAdmin.client);
    expect(afterGrant.grants.content_reviewer.has(testPermissionId)).toBe(true);

    const revoke = await setRolePermissionAction("content_reviewer", testPermissionId, false);
    expect(revoke).toEqual({ ok: true });

    const afterRevoke = await getRoleMatrix(superAdmin.client);
    expect(afterRevoke.grants.content_reviewer.has(testPermissionId)).toBe(false);
  });

  it("rejects a plain admin (not Super Admin) from editing the matrix", async () => {
    currentClient = plainAdmin.client;
    const res = await setRolePermissionAction("content_reviewer", testPermissionId, true);
    expect(res.ok).toBe(false);

    const matrix = await getRoleMatrix(plainAdmin.client);
    expect(matrix.grants.content_reviewer.has(testPermissionId)).toBe(false);
  });

  it("refuses to remove user.manage, permissions.manage or portal.admin.access from Super Admin", async () => {
    currentClient = superAdmin.client;
    for (const locked of ["user.manage", "permissions.manage", "portal.admin.access"]) {
      const res = await setRolePermissionAction("super_admin", locked, false);
      expect(res.ok, locked).toBe(false);
    }
    const matrix = await getRoleMatrix(superAdmin.client);
    expect(matrix.grants.super_admin.has("user.manage")).toBe(true);
    expect(matrix.grants.super_admin.has("permissions.manage")).toBe(true);
    expect(matrix.grants.super_admin.has("portal.admin.access")).toBe(true);
  });

  it("rejects an unknown role or permission id", async () => {
    currentClient = superAdmin.client;
    expect((await setRolePermissionAction("not_a_role", testPermissionId, true)).ok).toBe(false);
    expect((await setRolePermissionAction("content_reviewer", "not.a.permission", true)).ok).toBe(false);
  });
});
