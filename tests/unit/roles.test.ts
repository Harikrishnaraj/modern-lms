import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPortalPathForUser } from "@/features/auth/roles";

function fakeSupabase(roleIds: string[]): SupabaseClient {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: roleIds.map((role_id) => ({ role_id })) })),
      })),
    })),
  } as unknown as SupabaseClient;
}

describe("getPortalPathForUser", () => {
  it("sends a learner to /learner", async () => {
    expect(await getPortalPathForUser(fakeSupabase(["learner"]), "u1")).toBe("/learner");
  });

  it("sends an instructor to /instructor", async () => {
    expect(await getPortalPathForUser(fakeSupabase(["instructor"]), "u1")).toBe("/instructor");
  });

  it("sends any back-office role to /admin", async () => {
    for (const role of ["super_admin", "admin", "support_agent", "content_reviewer"]) {
      expect(await getPortalPathForUser(fakeSupabase([role]), "u1")).toBe("/admin");
    }
  });

  it("sends org_admin to its own scoped portal, not the admin console (T-162)", async () => {
    expect(await getPortalPathForUser(fakeSupabase(["org_admin"]), "u1")).toBe("/org_admin");
  });

  it("prefers /admin when a user holds both an admin and instructor role", async () => {
    expect(await getPortalPathForUser(fakeSupabase(["instructor", "admin"]), "u1")).toBe("/admin");
  });

  it("prefers /org_admin even when a user also holds admin (defense in depth against dual-role setup)", async () => {
    expect(await getPortalPathForUser(fakeSupabase(["admin", "org_admin"]), "u1")).toBe("/org_admin");
  });

  it("defaults to /learner when the user has no roles", async () => {
    expect(await getPortalPathForUser(fakeSupabase([]), "u1")).toBe("/learner");
  });
});
