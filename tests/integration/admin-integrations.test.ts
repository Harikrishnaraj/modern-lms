import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createApiKeyAction,
  createWebhookAction,
  deleteWebhookAction,
  revokeApiKeyAction,
} from "@/features/admin/integration-actions";
import { getApiKeys, getWebhookEndpoints } from "@/features/admin/integrations";
import { GET as getCourses } from "@/app/api/v1/courses/route";
import { GET as getEnrollments } from "@/app/api/v1/enrollments/route";
import { hashApiKey } from "@/services/apikeys";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

function apiRequest(url: string, bearer?: string) {
  return new NextRequest(url, { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
}

// F-415: Integrations & API (T-142), live Supabase.
describe.skipIf(!hasLiveProject)("admin integrations (T-142, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("intg");
  const courseIds: string[] = [];
  const userIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let plainLearner: { id: string; client: SupabaseClient };

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    userIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    plainLearner = await user("plain", "learner");
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }), 120_000);

  it("rejects creating an api key or webhook from a non-admin", async () => {
    currentClient = plainLearner.client;
    expect((await createApiKeyAction({ name: "x", scopes: ["courses:read"] })).ok).toBe(false);
    expect((await createWebhookAction({ url: "https://example.com/hook", events: ["enrollment.created"] })).ok).toBe(false);
  });

  it("creates an api key, exposes the plaintext once, and the hash matches", async () => {
    currentClient = admin.client;
    const created = await createApiKeyAction({ name: `${tag} Key`, scopes: ["courses:read", "enrollments:read"] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const keys = await getApiKeys(admin.client);
    const found = keys.find((k) => k.name === `${tag} Key`)!;
    expect(found.scopes.sort()).toEqual(["courses:read", "enrollments:read"]);
    expect(found.revokedAt).toBeNull();

    const { data: row } = await svc.from("api_keys").select("key_hash").eq("id", found.id).single();
    expect(row!.key_hash).toBe(hashApiKey(created.plaintext));

    const revoked = await revokeApiKeyAction(found.id);
    expect(revoked).toEqual({ ok: true });
    expect((await getApiKeys(admin.client)).find((k) => k.id === found.id)!.revokedAt).not.toBeNull();
  });

  it("rejects an unsafe webhook URL and creates a safe one with a secret", async () => {
    currentClient = admin.client;
    const unsafe = await createWebhookAction({ url: "http://example.com/hook", events: ["enrollment.created"] });
    expect(unsafe.ok).toBe(false);

    const created = await createWebhookAction({ url: `https://example.com/${tag}`, events: ["enrollment.created", "course.completed"] });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const endpoints = await getWebhookEndpoints(admin.client);
    const found = endpoints.find((e) => e.url === `https://example.com/${tag}`)!;
    expect(found.events.sort()).toEqual(["course.completed", "enrollment.created"]);

    const deleted = await deleteWebhookAction(found.id);
    expect(deleted).toEqual({ ok: true });
    expect((await getWebhookEndpoints(admin.client)).some((e) => e.id === found.id)).toBe(false);
  });

  it("the public API rejects a missing or wrong key, and accepts a scoped key", async () => {
    const noKey = await getCourses(apiRequest("http://localhost/api/v1/courses"));
    expect(noKey.status).toBe(401);

    const wrongKey = await getCourses(apiRequest("http://localhost/api/v1/courses", "not-a-real-key"));
    expect(wrongKey.status).toBe(401);

    currentClient = admin.client;
    const created = await createApiKeyAction({ name: `${tag} Public`, scopes: ["courses:read"] });
    if (!created.ok) throw new Error(created.error);

    const ok = await getCourses(apiRequest("http://localhost/api/v1/courses", created.plaintext));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(Array.isArray(body.data)).toBe(true);

    // The same key lacks enrollments:read.
    const forbidden = await getEnrollments(apiRequest("http://localhost/api/v1/enrollments", created.plaintext));
    expect(forbidden.status).toBe(403);

    const { data: logRows } = await svc.from("api_request_log").select("status_code, path").order("created_at", { ascending: false }).limit(3);
    expect(logRows!.some((r) => r.status_code === 200)).toBe(true);
    expect(logRows!.some((r) => r.status_code === 403)).toBe(true);
  });
});
