import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { getMyRecentActions } from "@/features/admin/my-actions";
import { recordAudit, type AuditAction } from "@/services/audit";

const ACTIONS: AuditAction[] = ["category.created", "category.updated", "category.deleted"];

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-417: the admin profile's "my recent actions" list is scoped to the signed-in admin only.
describe.skipIf(!hasLiveProject)("getMyRecentActions (T-144, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("mya");
  const userIds: string[] = [];
  let me: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };

  beforeAll(async () => {
    const admin = await createUserWithRole(svc, `${tag}-me`, "admin");
    const otherAdmin = await createUserWithRole(svc, `${tag}-oth`, "admin");
    userIds.push(admin.id, otherAdmin.id);
    me = { id: admin.id, client: svc };
    other = { id: otherAdmin.id, client: svc };
  }, 60_000);

  afterAll(async () => {
    await svc.from("audit_logs").delete().eq("resource_type", `t144-${tag}`);
    await cleanup(svc, { learnerIds: [], courseIds: [], userIds });
  }, 60_000);

  it("returns only the caller's own actions, newest first, up to the limit", async () => {
    for (let i = 0; i < 3; i++) {
      await recordAudit({ actorId: me.id, action: ACTIONS[i], resourceType: `t144-${tag}`, resourceId: `r${i}` });
    }
    await recordAudit({ actorId: other.id, action: "audit.exported", resourceType: `t144-${tag}`, resourceId: "r-other" });

    const mine = await getMyRecentActions(svc, me.id);
    expect(mine.map((a) => a.action)).toEqual(["category.deleted", "category.updated", "category.created"]);
    expect(mine.every((a) => a.resourceType === `t144-${tag}`)).toBe(true);

    const limited = await getMyRecentActions(svc, me.id, 2);
    expect(limited).toHaveLength(2);
    expect(limited.map((a) => a.action)).toEqual(["category.deleted", "category.updated"]);

    const theirs = await getMyRecentActions(svc, other.id);
    expect(theirs.map((a) => a.action)).toEqual(["audit.exported"]);
  });
});
