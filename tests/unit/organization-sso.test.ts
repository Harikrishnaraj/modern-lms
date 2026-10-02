import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { normalizeSsoDomain, parseSsoJoinResult, safeNextPath } from "@/features/organizations/sso-rules";

const { redirectMock, oauthMock, exchangeMock, rpcMock, rolesMock, headerStore } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  oauthMock: vi.fn(),
  exchangeMock: vi.fn(),
  rpcMock: vi.fn(),
  rolesMock: vi.fn(async () => ({ data: [{ role_id: "learner" }] })),
  headerStore: { host: "preview-123.modern-lms.workers.dev" } as Record<string, string>,
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(headerStore) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithOAuth: oauthMock, exchangeCodeForSession: exchangeMock },
    rpc: rpcMock,
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: rolesMock })) })),
  })),
}));

import { signInWithGoogle } from "@/features/auth/sso";
import { GET as callback } from "@/app/auth/callback/route";

describe("normalizeSsoDomain", () => {
  it("normalizes and accepts company domains", () => {
    expect(normalizeSsoDomain("  @Acme.COM. ")).toEqual({ ok: true, value: "acme.com" });
    expect(normalizeSsoDomain("eng.example.co.uk")).toEqual({ ok: true, value: "eng.example.co.uk" });
  });
  it("rejects consumer domains, emails, links and junk", () => {
    for (const bad of ["gmail.com", "GoogleMail.com", "outlook.com", "bob@acme.com", "https://acme.com", "acme", "-acme.com", "", 42]) {
      expect(normalizeSsoDomain(bad).ok).toBe(false);
    }
    expect(normalizeSsoDomain("gmail.com")).toEqual({ ok: false, error: expect.stringContaining("Personal email domains") });
  });
});

describe("parseSsoJoinResult / safeNextPath", () => {
  it("accepts only known results", () => {
    expect(parseSsoJoinResult({ result: "joined", organization_id: "x" })).toBe("joined");
    expect(parseSsoJoinResult({ result: "nope" })).toBeNull();
    expect(parseSsoJoinResult(null)).toBeNull();
  });
  it("allows only same-origin relative paths", () => {
    expect(safeNextPath("/learner/courses")).toBe("/learner/courses");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "", null, undefined]) expect(safeNextPath(bad)).toBeNull();
  });
});

describe("signInWithGoogle", () => {
  beforeEach(() => {
    oauthMock.mockReset();
    redirectMock.mockClear();
  });

  it("starts Google OAuth returning to this deployment's callback, carrying only a safe next", async () => {
    oauthMock.mockResolvedValue({ data: { url: "https://x.supabase.co/auth/v1/authorize?provider=google" }, error: null });
    await expect(signInWithGoogle("/learner/paths")).rejects.toThrow("REDIRECT:https://x.supabase.co/auth/v1/authorize?provider=google");
    const opts = oauthMock.mock.calls[0][0];
    expect(opts.provider).toBe("google");
    const back = new URL(opts.options.redirectTo);
    expect(back.origin).toBe("https://preview-123.modern-lms.workers.dev");
    expect(back.pathname).toBe("/auth/callback");
    expect(back.searchParams.get("sso")).toBe("google");
    expect(back.searchParams.get("next")).toBe("/learner/paths");

    oauthMock.mockClear();
    await expect(signInWithGoogle("//evil.com")).rejects.toThrow("REDIRECT:");
    expect(new URL(oauthMock.mock.calls[0][0].options.redirectTo).searchParams.get("next")).toBeNull();
  });

  it("falls back to the login page when the provider cannot start", async () => {
    oauthMock.mockResolvedValue({ data: { url: null }, error: { message: "provider disabled" } });
    await expect(signInWithGoogle(null)).rejects.toThrow("REDIRECT:/login?error=sso_unavailable");
  });
});

describe("auth callback", () => {
  const req = (qs: string) => new NextRequest(new URL(`/auth/callback?${qs}`, "https://app.example.com"));

  beforeEach(() => {
    exchangeMock.mockReset();
    rpcMock.mockReset();
  });

  it("joins a Google user to their organization, then sends them to their portal", async () => {
    exchangeMock.mockResolvedValue({ data: { user: { id: "u1", identities: [{ provider: "google" }] } }, error: null });
    rpcMock.mockResolvedValue({ data: { result: "joined", organization_id: "o1" }, error: null });
    const res = await callback(req("code=abc&sso=google"));
    expect(rpcMock).toHaveBeenCalledWith("join_organization_via_sso");
    expect(res.headers.get("location")).toBe("https://app.example.com/learner");
  });

  it("does not try to join for email sign-ins, and honours a safe next only", async () => {
    exchangeMock.mockResolvedValue({ data: { user: { id: "u1", identities: [{ provider: "email" }] } }, error: null });
    const ok = await callback(req("code=abc&next=/reset-password"));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(ok.headers.get("location")).toBe("https://app.example.com/reset-password");
    const unsafe = await callback(req("code=abc&next=//evil.com"));
    expect(unsafe.headers.get("location")).toBe("https://app.example.com/learner");
  });

  it("a failed join never blocks sign-in", async () => {
    exchangeMock.mockResolvedValue({ data: { user: { id: "u1", identities: [{ provider: "google" }] } }, error: null });
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await callback(req("code=abc&sso=google"));
    expect(res.headers.get("location")).toBe("https://app.example.com/learner");
  });

  it("failed Google sign-ins go back to login; failed email links keep their own pages", async () => {
    exchangeMock.mockResolvedValue({ data: { user: null }, error: { message: "bad code" } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await callback(req("code=bad&sso=google"))).headers.get("location")).toBe("https://app.example.com/login?error=sso_failed");
    expect((await callback(req("sso=google&error=access_denied"))).headers.get("location")).toBe("https://app.example.com/login?error=sso_failed");
    expect((await callback(req("code=bad&next=/reset-password"))).headers.get("location")).toBe("https://app.example.com/forgot-password?error=link_invalid");
    expect((await callback(req("code=bad"))).headers.get("location")).toBe("https://app.example.com/verify-email?error=link_invalid");
  });
});
