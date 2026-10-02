import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updatePlatformSettingsAction } from "@/features/admin/settings-actions";
import { getRecentSecurityEvents } from "@/features/admin/settings";
import { changePassword } from "@/features/profile/actions";
import { createUser } from "@/features/admin/user-actions";
import { getPlatformSettings } from "@/services/settings";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-416: Platform settings & security (T-143), live Supabase.
describe.skipIf(!hasLiveProject)("platform settings (T-143, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("psettings");
  const userIds: string[] = [];

  let admin: { id: string; client: SupabaseClient; email: string; password: string };
  let plainLearner: { id: string; client: SupabaseClient; email: string; password: string };

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    userIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client, email: u.email, password: u.password };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    plainLearner = await user("plain", "learner");
  }, 200_000);

  afterEach(async () => {
    // Reset to the current defaults so later tests (and other suites) aren't affected. MFA covers both
    // back-office portals since T-162 (migration org_admin_portal); resetting to ["admin"] here used to
    // switch the org-admin requirement off in whatever database the suite ran against.
    await svc.from("platform_settings").update({ min_password_length: 8, mfa_required_portals: ["admin", "org_admin"], session_idle_timeout_minutes: null }).eq("id", true);
  });

  afterAll(() => cleanup(svc, { learnerIds: [], courseIds: [], userIds }), 120_000);

  it("reads the seeded defaults", async () => {
    const settings = await getPlatformSettings(admin.client);
    expect(settings).toEqual({ minPasswordLength: 8, mfaRequiredPortals: ["admin", "org_admin"], sessionIdleTimeoutMinutes: null });
  });

  it("rejects updating settings from a non-admin", async () => {
    currentClient = plainLearner.client;
    const res = await updatePlatformSettingsAction({ minPasswordLength: 10, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null });
    expect(res.ok).toBe(false);
    expect(await getPlatformSettings(svc)).toMatchObject({ minPasswordLength: 8 });
  });

  it("rejects an invalid update (out of range) without changing anything", async () => {
    currentClient = admin.client;
    const res = await updatePlatformSettingsAction({ minPasswordLength: 4, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null });
    expect(res.ok).toBe(false);
    expect(await getPlatformSettings(svc)).toMatchObject({ minPasswordLength: 8 });
  });

  it("lets an admin raise the minimum password length, audited, and it is enforced on a profile password change", async () => {
    currentClient = admin.client;
    const updated = await updatePlatformSettingsAction({ minPasswordLength: 16, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null });
    expect(updated).toEqual({ ok: true });
    expect(await getPlatformSettings(svc)).toMatchObject({ minPasswordLength: 16 });

    const { data: auditRow } = await svc.from("audit_logs").select("action, actor_id").eq("action", "settings.changed").eq("actor_id", admin.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    expect(auditRow).toMatchObject({ action: "settings.changed", actor_id: admin.id });

    currentClient = plainLearner.client;
    const tooShort = await changePassword({ current: plainLearner.password, next: "short123", confirm: "short123" });
    expect(tooShort.ok).toBe(false);
    if (!tooShort.ok) expect(tooShort.fieldErrors?.next).toMatch(/at least 16/);
  });

  it("floors an admin-created account's password at 12 even if the configured minimum is lower", async () => {
    currentClient = admin.client;
    await updatePlatformSettingsAction({ minPasswordLength: 8, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null });

    const rejected = await createUser({ email: `${tag}-new@example.com`, password: "short10", fullName: "New User", role: "learner" });
    expect(rejected.ok).toBe(false);

    const accepted = await createUser({ email: `${tag}-new@example.com`, password: "a-long-enough-password-1", fullName: "New User", role: "learner" });
    expect(accepted.ok).toBe(true);

    const { data: users } = await svc.auth.admin.listUsers();
    const created = users.users.find((u) => u.email === `${tag}-new@example.com`);
    if (created) userIds.push(created.id);
  });

  it("shows recent security events, most recent first", async () => {
    const events = await getRecentSecurityEvents(admin.client, 5);
    expect(events.some((e) => e.action === "settings.changed")).toBe(true);
    for (let i = 1; i < events.length; i++) {
      expect(new Date(events[i - 1].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(events[i].createdAt).getTime());
    }
  });
});
