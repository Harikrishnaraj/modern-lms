import { afterEach, describe, expect, it, vi } from "vitest";
import { isSecretKey, redact, REDACTED } from "@/lib/log/redact";
import { isSafeRequestId, pickRequestId } from "@/lib/log/request-id";
import { formatLog } from "@/lib/log/format";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-request-id": "req-from-headers-1" }) }));

import { captureError, setErrorReporter } from "@/services/error-tracking";
import { onRequestError } from "@/instrumentation";

const h = (init: Record<string, string>) => new Headers(init);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("redact (SECURITY §20: no secrets in logs)", () => {
  it("masks secret keys in any spelling, at any depth", () => {
    const out = redact({
      email: "a@b.co",
      password: "hunter2",
      user: { accessToken: "x", refresh_token: "y", nested: { "X-Api-Key": "k", serviceRoleKey: "s" } },
      headers: { authorization: "Bearer abc", cookie: "sb=1" },
      card: { cardNumber: "4242", cvc: "123" },
      otp: "000000",
    }) as Record<string, Record<string, Record<string, unknown>>>;
    expect(out.email).toBe("a@b.co");
    expect(out.password).toBe(REDACTED);
    expect(out.user.accessToken).toBe(REDACTED);
    expect(out.user.refresh_token).toBe(REDACTED);
    expect(out.user.nested["X-Api-Key"]).toBe(REDACTED);
    expect(out.user.nested.serviceRoleKey).toBe(REDACTED);
    expect(out.headers).toEqual({ authorization: REDACTED, cookie: REDACTED });
    expect(out.card).toEqual({ cardNumber: REDACTED, cvc: REDACTED });
    expect(out.otp).toBe(REDACTED);
  });

  it("does not over-match harmless keys", () => {
    for (const k of ["footprint", "sessionIdleTimeoutMinutes", "pinned", "category", "action", "description"]) {
      expect(isSecretKey(k)).toBe(false);
    }
  });

  it("masks token-looking values wherever they appear", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJlLXZhbHVl";
    const out = redact({ message: `failed with ${jwt}`, note: "Bearer abc.def-123", key: "sk_test_abcdefghijklmnop", sb: "sb_secret_abcdefghijkl" }) as Record<string, string>;
    expect(out.message).toBe(`failed with ${REDACTED}`);
    expect(out.note).toBe(REDACTED);
    expect(out.key).toBe(REDACTED);
    expect(out.sb).toBe(REDACTED);
  });

  it("flattens errors (keeping digest and cause), handles cycles and caps size", () => {
    const err = Object.assign(new Error("boom token=eyJaaaaaaa.bbbbbbbbb.ccccccccc"), { digest: "123", code: "PGRST" });
    (err as Error & { cause?: unknown }).cause = new Error("inner");
    const out = redact(err) as Record<string, unknown>;
    expect(out).toMatchObject({ name: "Error", digest: "123", code: "PGRST", cause: { message: "inner" } });
    expect(out.message).toBe(`boom token=${REDACTED}`);
    const a: Record<string, unknown> = { n: 1 };
    a.self = a;
    expect(redact(a)).toEqual({ n: 1, self: "[Circular]" });
    expect((redact("x".repeat(5000)) as string).length).toBeLessThan(2100);
    expect(redact({ f: () => 1, s: Symbol("x") })).toEqual({ f: undefined, s: undefined });
  });
});

describe("request IDs", () => {
  it("reuses a safe upstream id, then cf-ray, else generates one", () => {
    expect(pickRequestId(h({ "x-request-id": "abc-12345678" }), () => "gen")).toBe("abc-12345678");
    expect(pickRequestId(h({ "cf-ray": "8f1a2b3c4d5e6f70-SIN" }), () => "gen")).toBe("8f1a2b3c4d5e6f70-SIN");
    expect(pickRequestId(h({ "x-request-id": "<script>alert(1)</script>" }), () => "gen")).toBe("gen");
    expect(pickRequestId(h({}), () => "gen")).toBe("gen");
    expect(isSafeRequestId("short")).toBe(false);
    expect(isSafeRequestId("a".repeat(129))).toBe(false);
    expect(pickRequestId(h({}))).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("formatLog", () => {
  it("builds one redacted JSON record whose envelope fields cannot be overwritten", () => {
    const rec = formatLog("error", "audit.write_failed", { action: "x", password: "p", level: "info", requestId: "spoof" }, "req-1", new Date("2026-10-01T00:00:00Z"));
    expect(rec).toEqual({ ts: "2026-10-01T00:00:00.000Z", level: "error", event: "audit.write_failed", requestId: "req-1", action: "x", password: REDACTED });
    expect(formatLog("info", "e", undefined, undefined, new Date(0))).toEqual({ ts: "1970-01-01T00:00:00.000Z", level: "info", event: "e" });
  });
});

describe("captureError / onRequestError (errors traced with request IDs)", () => {
  afterEach(() => {
    setErrorReporter(null);
    vi.restoreAllMocks();
  });

  it("logs a structured, redacted error line with the current request ID", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await captureError("notification.send_failed", new Error("db down"), { category: "grades", apiKey: "nope" });
    await flush();
    const rec = JSON.parse(spy.mock.calls[0][0] as string);
    expect(rec).toMatchObject({ level: "error", event: "notification.send_failed", requestId: "req-from-headers-1", category: "grades", apiKey: REDACTED, err: { message: "db down" } });
  });

  it("forwards to a registered tracker, and a failing tracker never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const capture = vi.fn();
    setErrorReporter({ capture });
    const err = new Error("x");
    await captureError("e", err, { requestId: "r-12345678" });
    expect(capture).toHaveBeenCalledWith(err, { requestId: "r-12345678" });
    setErrorReporter({ capture: () => { throw new Error("tracker down"); } });
    await expect(captureError("e", err)).resolves.toBeUndefined();
  });

  it("onRequestError logs the proxy's request ID, digest, route and path without the query", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("render failed"), { digest: "4242" });
    await onRequestError(
      err,
      { path: "/learner/courses/x?token=secret", method: "GET", headers: { "x-request-id": "req-proxy-1234" } },
      { routerKind: "App Router", routePath: "/learner/courses/[slug]", routeType: "render", renderSource: "server-rendering", revalidateReason: undefined },
    );
    await flush();
    const rec = JSON.parse(spy.mock.calls[0][0] as string);
    expect(rec).toMatchObject({ event: "request.error", requestId: "req-proxy-1234", digest: "4242", method: "GET", path: "/learner/courses/x", routePath: "/learner/courses/[slug]", routeType: "render" });
    expect(JSON.stringify(rec)).not.toContain("secret");
  });
});
