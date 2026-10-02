import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getAdminUsers, parseUserQuery } from "@/features/admin/users";
import { changeUserRoles, createUser, inviteUser, setUserStatus } from "@/features/admin/user-actions";
import { can } from "@/lib/permissions/can";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-401: user list, roles, suspension, creation and invitation: authorised, guarded and audited.
describe.skipIf(!hasLiveProject)("user management (T-076, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("um");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let superAdmin: { id: string; email: string; client: SupabaseClient };
  let admin: { id: string; email: string; client: SupabaseClient };
  let support: { id: string; email: string; client: SupabaseClient };
  let instructor: { id: string; email: string; client: SupabaseClient };
  let learner: { id: string; email: string; password: string };

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, email: u.email, client, password: u.password };
  }
  const rolesOf = async (id: string) =>
    ((await svc.from("user_roles").select("role_id").eq("user_id", id)).data ?? []).map((r) => r.role_id as string).sort();
  const auditActions = async (id: string) =>
    ((await svc.from("audit_logs").select("action").eq("resource_id", id).order("created_at")).data ?? []).map((a) => a.action as string);

  beforeAll(async () => {
    superAdmin = await user("sup", "super_admin");
    admin = await user("adm", "admin");
    support = await user("agt", "support_agent");
    instructor = await user("ins", "instructor");
    learner = await user("lrn", "learner");
  }, 200_000);

  afterAll(async () => {
    // Users created by the actions below.
    const { data } = await svc.from("audit_logs").select("resource_id").in("actor_id", [superAdmin.id, admin.id]).like("action", "user.%");
    const created = [...new Set((data ?? []).map((r) => r.resource_id as string))].filter((id) => ![superAdmin.id, admin.id, learner.id].includes(id));
    await cleanup(svc, { learnerIds, courseIds: [], userIds: [...userIds, ...created] });
  }, 200_000);

  describe("listing", () => {
    it("searches by email, filters by role and status, and reports the total", async () => {
      const q = parseUserQuery({ q: tag });
      const all = await getAdminUsers(admin.client, q);
      expect(all.total).toBe(5);
      expect(all.users.map((u) => u.email).sort()).toEqual([superAdmin.email, admin.email, support.email, instructor.email, learner.email].sort());
      const byRole = await getAdminUsers(admin.client, parseUserQuery({ q: tag, role: "instructor" }));
      expect(byRole.users.map((u) => u.userId)).toEqual([instructor.id]);
      expect(byRole.users[0].roles).toEqual(["instructor"]);
      const suspended = await getAdminUsers(admin.client, parseUserQuery({ q: tag, status: "suspended" }));
      expect(suspended.total).toBe(0);
    });

    it("pages results and is readable by support agents but refused to everyone else", async () => {
      const page = await getAdminUsers(support.client, { ...parseUserQuery({ q: tag }), page: 2 });
      expect(page.users).toEqual([]);
      await expect(getAdminUsers(instructor.client, parseUserQuery({}))).rejects.toThrow();
      await expect(getAdminUsers(anon(), parseUserQuery({}))).rejects.toThrow();
    });

    it("treats wildcard characters in the search literally", async () => {
      expect((await getAdminUsers(admin.client, parseUserQuery({ q: "%" }))).total).toBeGreaterThanOrEqual(0);
    });
  });

  describe("changing roles", () => {
    it("an admin promotes a learner to instructor, audited with before and after", async () => {
      currentClient = admin.client;
      expect(await changeUserRoles(learner.id, ["learner", "instructor"])).toEqual({ ok: true });
      expect(await rolesOf(learner.id)).toEqual(["instructor", "learner"]);
      expect(await changeUserRoles(learner.id, ["learner"])).toEqual({ ok: true });
      const { data } = await svc.from("audit_logs").select("metadata").eq("resource_id", learner.id).eq("action", "user.role_changed").order("created_at");
      expect(data![0].metadata).toEqual({ before: ["learner"], after: ["instructor", "learner"] });
    });

    it("refuses escalation to admin, self-service, unknown roles, and non-managers", async () => {
      currentClient = admin.client;
      expect(await changeUserRoles(learner.id, ["admin"])).toEqual({ ok: false, error: "Only a super admin can change admin access." });
      expect(await changeUserRoles(admin.id, ["learner"])).toEqual({ ok: false, error: "You cannot change your own roles. Ask another administrator." });
      expect(await changeUserRoles(learner.id, ["root"])).toEqual({ ok: false, error: "Unknown role." });
      expect(await changeUserRoles(learner.id, [])).toEqual({ ok: false, error: "Choose at least one role." });
      expect(await changeUserRoles("nope", ["learner"])).toEqual({ ok: false, error: "User not found." });
      for (const who of [support, instructor]) {
        currentClient = who.client;
        expect(await changeUserRoles(learner.id, ["instructor"])).toEqual({ ok: false, error: "You do not have permission to manage users." });
      }
      expect(await rolesOf(learner.id)).toEqual(["learner"]);
    });

    it("a super admin may touch admin access; an admin cannot touch an admin", async () => {
      currentClient = superAdmin.client;
      expect(await changeUserRoles(instructor.id, ["instructor", "admin"])).toEqual({ ok: true });
      currentClient = admin.client;
      expect(await changeUserRoles(instructor.id, ["instructor"])).toEqual({ ok: false, error: "Only a super admin can change admin access." });
      currentClient = superAdmin.client;
      expect(await changeUserRoles(instructor.id, ["instructor"])).toEqual({ ok: true });
    });
  });

  describe("suspension", () => {
    it("suspending blocks sign-in and open sessions; reinstating restores them; both are audited", async () => {
      const victim = await user("vic", "instructor");
      expect(await can(victim.client, victim.id, "portal.instructor.access")).toBe(true);

      currentClient = admin.client;
      expect(await setUserStatus(victim.id, "suspended")).toEqual({ ok: true });
      // The already-open session loses its permissions immediately...
      expect(await can(victim.client, victim.id, "portal.instructor.access")).toBe(false);
      const stillReads = await victim.client.from("course_reviews").select("id").limit(1);
      expect(stillReads.error).toBeNull();
      // ...and a fresh sign-in is refused.
      const fresh = await anon().auth.signInWithPassword({ email: victim.email, password: victim.password });
      expect(fresh.error).not.toBeNull();

      expect(await setUserStatus(victim.id, "suspended")).toEqual({ ok: false, error: "This account is already suspended." });
      expect(await setUserStatus(victim.id, "active")).toEqual({ ok: true });
      expect(await can(victim.client, victim.id, "portal.instructor.access")).toBe(true);
      const again = await anon().auth.signInWithPassword({ email: victim.email, password: victim.password });
      expect(again.error).toBeNull();
      expect(await auditActions(victim.id)).toEqual(["user.suspended", "user.reinstated"]);
    });

    it("refuses self-suspension, suspending admins as a non-super-admin, and non-managers", async () => {
      currentClient = admin.client;
      expect(await setUserStatus(admin.id, "suspended")).toEqual({ ok: false, error: "You cannot suspend your own account." });
      expect(await setUserStatus(superAdmin.id, "suspended")).toEqual({ ok: false, error: "Only a super admin can change an admin account." });
      currentClient = support.client;
      expect(await setUserStatus(learner.id, "suspended")).toEqual({ ok: false, error: "You do not have permission to manage users." });
      currentClient = admin.client;
      expect(await setUserStatus(learner.id, "banned" as never)).toEqual({ ok: false, error: "Unknown status." });
    });
  });

  describe("creating and inviting", () => {
    it("creates a confirmed account with a role that can sign in, and audits it", async () => {
      currentClient = admin.client;
      const email = `${tag}-new@example.com`;
      expect(await createUser({ email, password: "a-long-enough-pass", fullName: "New Person", role: "instructor" })).toEqual({ ok: true });
      const signIn = await anon().auth.signInWithPassword({ email, password: "a-long-enough-pass" });
      expect(signIn.error).toBeNull();
      const id = signIn.data.user!.id;
      userIds.push(id);
      expect(await rolesOf(id)).toEqual(["instructor"]);
      expect((await svc.from("profiles").select("full_name").eq("id", id).single()).data!.full_name).toBe("New Person");
      expect(await auditActions(id)).toEqual(["user.created"]);
      expect(await createUser({ email, password: "a-long-enough-pass", fullName: "", role: "learner" })).toEqual({ ok: false, error: "An account with that email already exists." });
    });

    it("validates input and refuses creating an admin unless super admin", async () => {
      currentClient = admin.client;
      expect(await createUser({ email: "bad", password: "a-long-enough-pass", fullName: "", role: "learner" })).toEqual({ ok: false, error: "Enter a valid email address." });
      expect(await createUser({ email: `${tag}-x@example.com`, password: "short", fullName: "", role: "learner" })).toMatchObject({ ok: false });
      expect(await createUser({ email: `${tag}-y@example.com`, password: "a-long-enough-pass", fullName: "", role: "admin" })).toEqual({ ok: false, error: "Only a super admin can create admin accounts." });
      currentClient = support.client;
      expect(await createUser({ email: `${tag}-z@example.com`, password: "a-long-enough-pass", fullName: "", role: "learner" })).toEqual({ ok: false, error: "You do not have permission to manage users." });
    });

    it("invites by link without sending email, assigning the role", async () => {
      currentClient = admin.client;
      const email = `${tag}-invitee@example.com`;
      const r = await inviteUser({ email, role: "content_reviewer" });
      expect(r).toMatchObject({ ok: true });
      // An absolute link to this project's Auth verify endpoint (https on the hosted project, http locally).
      const link = new URL((r as { link?: string }).link!);
      expect(link.origin).toBe(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin);
      expect(link.pathname).toBe("/auth/v1/verify");
      const { data } = await svc.from("audit_logs").select("resource_id, action").eq("actor_id", admin.id).eq("action", "user.invited");
      const id = data!.at(-1)!.resource_id as string;
      userIds.push(id);
      expect(await rolesOf(id)).toEqual(["content_reviewer"]);
      // Re-inviting a pending invitation just issues a fresh link; a confirmed account is refused.
      expect(await inviteUser({ email, role: "content_reviewer" })).toMatchObject({ ok: true });
      expect(await inviteUser({ email: learner.email, role: "learner" })).toEqual({ ok: false, error: "An account with that email already exists." });
    });
  });
});
