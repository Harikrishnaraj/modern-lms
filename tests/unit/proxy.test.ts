import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { proxy } from "@/proxy";

const { updateSessionMock, canMock, getPlatformSettingsMock } = vi.hoisted(() => ({
  updateSessionMock: vi.fn(),
  canMock: vi.fn(),
  getPlatformSettingsMock: vi.fn(),
}));
vi.mock("@/lib/supabase/middleware", () => ({ updateSession: updateSessionMock }));
vi.mock("@/lib/permissions/can", () => ({ can: canMock }));
vi.mock("@/services/settings", () => ({ getPlatformSettings: getPlatformSettingsMock }));

function makeRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("proxy", () => {
  beforeEach(() => {
    updateSessionMock.mockReset();
    canMock.mockReset();
    // Matches the app's original hardcoded behavior: admin-only MFA, no idle timeout.
    getPlatformSettingsMock.mockReset();
    getPlatformSettingsMock.mockResolvedValue({ minPasswordLength: 8, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null });
  });

  it("passes through a protected route when the user has portal access", async () => {
    const passThrough = NextResponse.next();
    updateSessionMock.mockResolvedValue({
      response: passThrough,
      user: { id: "u1" },
      supabase: {},
    });
    canMock.mockResolvedValue(true);
    const result = await proxy(makeRequest("/learner"));
    expect(result).toBe(passThrough);
    expect(canMock).toHaveBeenCalledWith({}, "u1", "portal.learner.access");
  });

  it("redirects to /login?next=... when there is no user on a protected route", async () => {
    updateSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      user: null,
      supabase: {},
    });
    const result = await proxy(makeRequest("/instructor/courses"));
    expect(result.status).toBe(307);
    const location = new URL(result.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/instructor/courses");
    expect(canMock).not.toHaveBeenCalled();
  });

  it("redirects to /permission-denied when the user lacks the portal's permission", async () => {
    updateSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "u1" },
      supabase: {},
    });
    canMock.mockResolvedValue(false);
    const result = await proxy(makeRequest("/admin"));
    expect(result.status).toBe(307);
    expect(new URL(result.headers.get("location")!).pathname).toBe("/permission-denied");
  });

  it("redirects /admin to /mfa when the session is not AAL2", async () => {
    const supabase = {
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi
            .fn()
            .mockResolvedValue({ data: { currentLevel: "aal1" }, error: null }),
        },
      },
    };
    updateSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "u1" },
      supabase,
    });
    canMock.mockResolvedValue(true);
    const result = await proxy(makeRequest("/admin/users"));
    const location = new URL(result.headers.get("location")!);
    expect(location.pathname).toBe("/mfa");
    expect(location.searchParams.get("next")).toBe("/admin/users");
  });

  it("lets an AAL2 admin through", async () => {
    const passThrough = NextResponse.next();
    updateSessionMock.mockResolvedValue({
      response: passThrough,
      user: { id: "u1" },
      supabase: {
        auth: {
          mfa: {
            getAuthenticatorAssuranceLevel: vi
              .fn()
              .mockResolvedValue({ data: { currentLevel: "aal2" }, error: null }),
          },
        },
      },
    });
    canMock.mockResolvedValue(true);
    expect(await proxy(makeRequest("/admin"))).toBe(passThrough);
  });

  it("does not gate an unprotected route (and does no session work for it)", async () => {
    const result = await proxy(makeRequest("/signup"));
    expect(result.status).toBe(200);
    expect(result.headers.get("location")).toBeNull();
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it("serves nothing but SCORM files on the SCORM content origin", async () => {
    const saved = { content: process.env.NEXT_PUBLIC_SCORM_CONTENT_ORIGIN, app: process.env.NEXT_PUBLIC_APP_URL };
    process.env.NEXT_PUBLIC_SCORM_CONTENT_ORIGIN = "http://127.0.0.1:3000";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    try {
      for (const path of ["/login", "/learner", "/api/cron/scheduled-reports"]) {
        const req = new NextRequest(`http://127.0.0.1:3000${path}`, { headers: { host: "127.0.0.1:3000" } });
        expect((await proxy(req)).status, path).toBe(404);
      }
      expect(updateSessionMock).not.toHaveBeenCalled();
    } finally {
      process.env.NEXT_PUBLIC_SCORM_CONTENT_ORIGIN = saved.content;
      process.env.NEXT_PUBLIC_APP_URL = saved.app;
    }
  });

  it("requires MFA for a non-admin portal when configured to", async () => {
    getPlatformSettingsMock.mockResolvedValue({ minPasswordLength: 8, mfaRequiredPortals: ["admin", "instructor"], sessionIdleTimeoutMinutes: null });
    const supabase = {
      auth: { mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: "aal1" }, error: null }) } },
    };
    updateSessionMock.mockResolvedValue({ response: NextResponse.next(), user: { id: "u1" }, supabase });
    canMock.mockResolvedValue(true);
    const result = await proxy(makeRequest("/instructor"));
    expect(new URL(result.headers.get("location")!).pathname).toBe("/mfa");
  });

  it("does not require MFA for a portal not in the configured list", async () => {
    getPlatformSettingsMock.mockResolvedValue({ minPasswordLength: 8, mfaRequiredPortals: [], sessionIdleTimeoutMinutes: null });
    const supabase = {
      auth: { mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: "aal1" }, error: null }) } },
    };
    const passThrough = NextResponse.next();
    updateSessionMock.mockResolvedValue({ response: passThrough, user: { id: "u1" }, supabase });
    canMock.mockResolvedValue(true);
    expect(await proxy(makeRequest("/admin"))).toBe(passThrough);
  });

  it("signs out and redirects to /login when the idle session has expired", async () => {
    getPlatformSettingsMock.mockResolvedValue({ minPasswordLength: 8, mfaRequiredPortals: [], sessionIdleTimeoutMinutes: 15 });
    const signOut = vi.fn();
    updateSessionMock.mockResolvedValue({ response: NextResponse.next(), user: { id: "u1" }, supabase: { auth: { signOut } } });
    canMock.mockResolvedValue(true);
    const request = makeRequest("/learner");
    request.cookies.set("lms_last_active", new Date(Date.now() - 20 * 60_000).toISOString());
    const result = await proxy(request);
    expect(signOut).toHaveBeenCalled();
    const location = new URL(result.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("reason")).toBe("session-expired");
  });

  it("treats a missing activity cookie as expired once an idle timeout is configured", async () => {
    getPlatformSettingsMock.mockResolvedValue({ minPasswordLength: 8, mfaRequiredPortals: [], sessionIdleTimeoutMinutes: 15 });
    const signOut = vi.fn();
    updateSessionMock.mockResolvedValue({ response: NextResponse.next(), user: { id: "u1" }, supabase: { auth: { signOut } } });
    canMock.mockResolvedValue(true);
    const result = await proxy(makeRequest("/learner"));
    expect(signOut).toHaveBeenCalled();
    expect(new URL(result.headers.get("location")!).pathname).toBe("/login");
  });

  it("refreshes the activity cookie and passes through when the session is still fresh", async () => {
    getPlatformSettingsMock.mockResolvedValue({ minPasswordLength: 8, mfaRequiredPortals: [], sessionIdleTimeoutMinutes: 15 });
    const passThrough = NextResponse.next();
    updateSessionMock.mockResolvedValue({ response: passThrough, user: { id: "u1" }, supabase: {} });
    canMock.mockResolvedValue(true);
    const request = makeRequest("/learner");
    request.cookies.set("lms_last_active", new Date(Date.now() - 2 * 60_000).toISOString());
    const result = await proxy(request);
    expect(result).toBe(passThrough);
    expect(result.cookies.get("lms_last_active")).toBeDefined();
  });

  it("gives every response an x-request-id and forwards it to the app (T-242)", async () => {
    // Public path: no session work, still tagged.
    const pub = await proxy(makeRequest("/"));
    expect(pub.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(pub.headers.get("x-middleware-request-x-request-id")).toBe(pub.headers.get("x-request-id"));

    // A safe upstream id is kept; protected routes forward it to updateSession too.
    updateSessionMock.mockResolvedValue({ response: NextResponse.next(), user: null, supabase: {} });
    const req = new NextRequest(new URL("/learner", "http://localhost:3000"), { headers: { "x-request-id": "edge-req-12345678" } });
    const redirect = await proxy(req);
    expect(redirect.headers.get("x-request-id")).toBe("edge-req-12345678");
    expect((updateSessionMock.mock.calls.at(-1)![1] as Headers).get("x-request-id")).toBe("edge-req-12345678");

    // An unsafe upstream id is replaced, never echoed.
    const bad = await proxy(new NextRequest(new URL("/", "http://localhost:3000"), { headers: { "x-request-id": "<x>" } }));
    expect(bad.headers.get("x-request-id")).not.toBe("<x>");
  });
});
