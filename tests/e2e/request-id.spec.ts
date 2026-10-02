import { expect, test } from "@playwright/test";

// T-242 (F-942): every response carries a correlation ID that server logs share.
test.use({ storageState: { cookies: [], origins: [] } });

test("public pages and auth redirects return an x-request-id", async ({ request }) => {
  const home = await request.get("/");
  expect(home.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

  const guarded = await request.get("/learner", { maxRedirects: 0 });
  expect(guarded.status()).toBe(307);
  expect(guarded.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
});

test("a safe upstream request ID is kept; an unsafe one is replaced", async ({ request }) => {
  const kept = await request.get("/", { headers: { "x-request-id": "support-ticket-12345" } });
  expect(kept.headers()["x-request-id"]).toBe("support-ticket-12345");

  const replaced = await request.get("/", { headers: { "x-request-id": "<script>" } });
  expect(replaced.headers()["x-request-id"]).not.toContain("<");
});
