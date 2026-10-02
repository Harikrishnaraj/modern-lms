import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { dispatchWebhookEvent } from "@/services/webhooks/dispatch";
import { signWebhookPayload } from "@/services/webhooks";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const realFetch = globalThis.fetch;

// F-415: webhook dispatch (T-142), live Supabase. fetch is mocked -- no real HTTP call leaves
// the test, but the endpoint row, signature and delivery log are all real.
describe.skipIf(!hasLiveProject)("webhook dispatch (T-142, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("whdisp");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let endpointId: string;
  let secret: string;
  let fetchMock: ReturnType<typeof vi.fn<(input: unknown, init: { body: string; headers: Record<string, string> }) => Promise<Response>>>;

  beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-course`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);

    secret = "whsec_test_secret";
    const { data } = await svc
      .from("webhook_endpoints")
      .insert({ url: "https://example.com/hook", secret, events: ["enrollment.created"], created_by: instructor.id })
      .select("id")
      .single();
    endpointId = data!.id;
  }, 200_000);

  afterAll(async () => {
    await svc.from("webhook_endpoints").delete().eq("id", endpointId);
    await cleanup(svc, { learnerIds: [], courseIds, userIds });
  }, 120_000);

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    // Only the outbound hook call is mocked; Supabase requests still use the real fetch.
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input instanceof Request ? input.url : input).startsWith("https://example.com/")
        ? fetchMock(input, init as never)
        : realFetch(input, init),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts a correctly signed payload to every active endpoint subscribed to the event, and records success", async () => {
    await dispatchWebhookEvent("enrollment.created", { userId: "u1", courseId: "c1" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.com/hook");
    const body = init.body as string;
    const expectedSig = signWebhookPayload(secret, body);
    expect(init.headers["x-webhook-signature"]).toBe(`sha256=${expectedSig}`);
    expect(JSON.parse(body)).toMatchObject({ event: "enrollment.created", data: { userId: "u1", courseId: "c1" } });

    const { data: deliveries } = await svc.from("webhook_deliveries").select("status, response_status, event_type").eq("webhook_endpoint_id", endpointId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries![0]).toMatchObject({ status: "success", response_status: 200, event_type: "enrollment.created" });
  });

  it("does not call an endpoint for an event it is not subscribed to", async () => {
    await dispatchWebhookEvent("course.completed", { userId: "u1", courseId: "c1", enrollmentId: "e1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a failed delivery when the endpoint responds with an error status", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 500 }));
    await dispatchWebhookEvent("enrollment.created", { userId: "u2", courseId: "c1" });
    const { data: deliveries } = await svc
      .from("webhook_deliveries")
      .select("status, response_status")
      .eq("webhook_endpoint_id", endpointId)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(deliveries![0]).toMatchObject({ status: "failed", response_status: 500 });
  });
});
