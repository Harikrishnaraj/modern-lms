import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addSsoDomainAction, removeSsoDomainAction } from "@/features/organizations/sso-actions";
import { getOrganizationSsoDomains } from "@/features/organizations/sso";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

// T-165 / F-504 (ADR-033): organization SSO domains, live Supabase. The Google-identity join path
// (join_organization_via_sso reading auth.identities.custom_claims.hd) cannot be driven from the
// REST API — auth.identities is written only by the Auth server — so the parts reachable here are
// tested end to end and the identity matrix is verified in SQL (see MEMORY.md, T-165).
describe.skipIf(!hasLiveProject)("organization SSO (T-165, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("osso");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const orgIds: string[] = [];
  const domain = `${tag}.example-sso.com`;
  let admin: { id: string; client: SupabaseClient };
  let orgAdmin: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let orgA: string;
  let orgB: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    orgAdmin = await user("oadm", "learner");
    learner = await user("lrn", "learner");
    const a = await svc.from("organizations").insert({ name: `${tag} A`, slug: `${tag}-a` }).select("id").single();
    const b = await svc.from("organizations").insert({ name: `${tag} B`, slug: `${tag}-b` }).select("id").single();
    orgA = a.data!.id as string;
    orgB = b.data!.id as string;
    orgIds.push(orgA, orgB);
    await svc.from("organization_members").insert({ organization_id: orgA, user_id: orgAdmin.id, org_role: "org_admin" });
  }, 200_000);

  afterAll(async () => {
    if (orgIds.length) await svc.from("organizations").delete().in("id", orgIds);
    await cleanup(svc, { learnerIds, userIds });
  }, 120_000);

  it("a platform admin links and unlinks a Workspace domain, with audit entries", async () => {
    currentClient = admin.client;
    expect(await addSsoDomainAction(orgA, `  @${domain.toUpperCase()} `)).toEqual({ ok: true });
    const domains = await getOrganizationSsoDomains(admin.client, orgA);
    expect(domains.map((d) => d.domain)).toEqual([domain]);

    // One organization per domain; consumer domains and junk are refused.
    expect(await addSsoDomainAction(orgB, domain)).toEqual({ ok: false, error: "That domain is already linked to an organization." });
    expect(await addSsoDomainAction(orgB, "gmail.com")).toMatchObject({ ok: false });
    expect(await addSsoDomainAction(orgB, "not a domain")).toMatchObject({ ok: false });

    const { data: audit } = await svc.from("audit_logs").select("action, metadata").eq("resource_id", orgA).eq("action", "organization.sso_domain_added");
    expect(audit?.[0]?.metadata).toMatchObject({ domain, provider: "google" });

    expect(await removeSsoDomainAction(domains[0].id)).toEqual({ ok: true });
    expect(await getOrganizationSsoDomains(admin.client, orgA)).toEqual([]);
    expect(await removeSsoDomainAction(domains[0].id)).toEqual({ ok: false, error: "That domain is not linked." });
  });

  it("only platform admins can change domains; an org admin sees only their own org's", async () => {
    currentClient = admin.client;
    await addSsoDomainAction(orgA, domain);
    await addSsoDomainAction(orgB, `b-${domain}`);

    currentClient = orgAdmin.client;
    expect(await addSsoDomainAction(orgA, `x-${domain}`)).toEqual({ ok: false, error: "You cannot manage organizations." });
    expect((await getOrganizationSsoDomains(orgAdmin.client, orgA)).map((d) => d.domain)).toEqual([domain]);
    expect(await getOrganizationSsoDomains(orgAdmin.client, orgB)).toEqual([]);

    // Direct writes are refused by RLS too.
    const direct = await orgAdmin.client.from("organization_sso_domains").insert({ organization_id: orgA, domain: `y-${domain}`, created_by: orgAdmin.id });
    expect(direct.error).not.toBeNull();
    const del = await orgAdmin.client.from("organization_sso_domains").delete().eq("organization_id", orgA).select("id");
    expect(del.data ?? []).toEqual([]);

    currentClient = learner.client;
    expect(await addSsoDomainAction(orgA, `z-${domain}`)).toMatchObject({ ok: false });
    expect(await getOrganizationSsoDomains(learner.client, orgA)).toEqual([]);
    const anonRead = await anon().from("organization_sso_domains").select("id");
    expect(anonRead.data ?? []).toEqual([]);
  });

  it("join_organization_via_sso does nothing for a password account, and needs a session", async () => {
    const { data, error } = await learner.client.rpc("join_organization_via_sso");
    expect(error).toBeNull();
    expect(data).toEqual({ result: "not_sso" });
    const { data: membership } = await svc.from("organization_members").select("id").eq("user_id", learner.id);
    expect(membership).toEqual([]);
    const anonCall = await anon().rpc("join_organization_via_sso");
    expect(anonCall.error).not.toBeNull();
  });
});
