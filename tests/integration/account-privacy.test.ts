import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { cancelAccountDeletionAction, requestAccountDeletionAction } from "@/features/privacy/actions";
import { getMyDataExport, getMyDeletionStatus } from "@/features/privacy/account";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-943 (T-243, SECURITY.md §21): data export, account deletion request/cancel, and the retention
// jobs (purge_expired_accounts / purge_old_audit_logs) that carry deletion out. Live Supabase.
describe.skipIf(!hasLiveProject)("account privacy (T-243, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("priv");
  const userIds: string[] = [];

  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });

  async function user(name: string, fullName?: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, "learner", { fullName });
    userIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  let learner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };

  beforeAll(async () => {
    learner = await user("l", `${tag} Learner`);
    other = await user("o", `${tag} Other`);
  }, 120_000);

  afterAll(() => cleanup(svc, { userIds }), 120_000);

  it("requests, then cancels, a deletion; only the caller's own row is affected", async () => {
    currentClient = learner.client;
    expect(await getMyDeletionStatus(learner.client, learner.id)).toBeNull();

    expect(await requestAccountDeletionAction()).toEqual({ ok: true });
    const requested = await getMyDeletionStatus(learner.client, learner.id);
    expect(requested).not.toBeNull();

    expect(await getMyDeletionStatus(other.client, other.id)).toBeNull();

    expect(await cancelAccountDeletionAction()).toEqual({ ok: true });
    expect(await getMyDeletionStatus(learner.client, learner.id)).toBeNull();
  });

  it("refuses to set another user's deletion flag directly (RLS)", async () => {
    const { error } = await other.client.from("profiles").update({ deletion_requested_at: new Date().toISOString() }).eq("id", learner.id);
    expect(error).toBeNull(); // RLS silently drops the row, no error
    expect(await getMyDeletionStatus(svc, learner.id)).toBeNull();
  });

  it("exports the caller's own profile, roles and activity", async () => {
    const data = await getMyDataExport(learner.client, learner.id);
    expect(data.profile).toMatchObject({ full_name: `${tag} Learner` });
    expect(data.roles.some((r: { role_id: string }) => r.role_id === "learner")).toBe(true);
    expect(Array.isArray(data.enrollments)).toBe(true);
    expect(Array.isArray(data.certificates)).toBe(true);
  });

  it("purge_expired_accounts only removes accounts past the 30-day grace period, and only cron/service-role may call it", async () => {
    const target = await createUserWithRole(svc, `${tag}-expired`, "learner");
    userIds.push(target.id);
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await svc.from("profiles").update({ deletion_requested_at: old }).eq("id", target.id);

    const recent = await createUserWithRole(svc, `${tag}-recent`, "learner");
    userIds.push(recent.id);
    await svc.from("profiles").update({ deletion_requested_at: new Date().toISOString() }).eq("id", recent.id);

    const { error: deniedErr } = await learner.client.rpc("purge_expired_accounts");
    expect(deniedErr).not.toBeNull();

    const { data: purgedCount, error } = await svc.rpc("purge_expired_accounts");
    expect(error).toBeNull();
    expect(purgedCount).toBeGreaterThanOrEqual(1);

    const { data: stillThere } = await svc.from("profiles").select("id").eq("id", target.id).maybeSingle();
    expect(stillThere).toBeNull();
    const { data: recentProfile } = await svc.from("profiles").select("id").eq("id", recent.id).maybeSingle();
    expect(recentProfile).not.toBeNull();
  });

  it("purge_old_audit_logs only removes rows older than the 2-year retention window, and only cron/service-role may call it", async () => {
    // audit_logs is append-only (T-070): even the service role cannot UPDATE created_at after
    // the insert (the immutable trigger silently refuses it), so the backdated row must be
    // inserted with its old created_at already set, not inserted-then-updated.
    const { data: oldRow } = await svc
      .from("audit_logs")
      .insert({
        action: `${tag}.old`,
        resource_type: "test",
        metadata: {},
        created_at: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();
    const { data: recentRow } = await svc.from("audit_logs").insert({ action: `${tag}.recent`, resource_type: "test", metadata: {} }).select("id").single();

    const { error: deniedErr } = await learner.client.rpc("purge_old_audit_logs");
    expect(deniedErr).not.toBeNull();

    const { error } = await svc.rpc("purge_old_audit_logs");
    expect(error).toBeNull();

    expect((await svc.from("audit_logs").select("id").eq("id", oldRow!.id).maybeSingle()).data).toBeNull();
    expect((await svc.from("audit_logs").select("id").eq("id", recentRow!.id).maybeSingle()).data).not.toBeNull();
    // recentRow is left in place: audit_logs is append-only, so even test cleanup cannot delete
    // it outside the purge job (see "is append-only even for the service role" in audit-logs.test.ts).
  });
});
