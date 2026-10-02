import { beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "@/features/auth/login";
import { rateLimit } from "@/services/rate-limit";

const { redirectMock, signInMock, signOutMock, singleMock, userRolesMock, aalMock, rpcMock } = vi.hoisted(
  () => ({
    aalMock: vi.fn(async () => ({ data: { currentLevel: "aal1" }, error: null })),
    redirectMock: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    }),
    signInMock: vi.fn(),
    signOutMock: vi.fn(),
    singleMock: vi.fn(),
    userRolesMock: vi.fn(async () => ({ data: [{ role_id: "learner" }] })),
    rpcMock: vi.fn(async () => ({ data: null, error: null })),
  }),
);
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/services/settings", () => ({
  getPlatformSettings: vi.fn(async () => ({ minPasswordLength: 8, mfaRequiredPortals: ["admin", "org_admin"], sessionIdleTimeoutMinutes: null })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: signInMock,
      signOut: signOutMock,
      mfa: { getAuthenticatorAssuranceLevel: aalMock },
    },
    rpc: rpcMock,
    from: vi.fn((table: string) =>
      table === "user_roles"
        ? { select: vi.fn(() => ({ eq: userRolesMock })) }
        : { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: singleMock })) })) },
    ),
  })),
}));

const validInput = { email: "test@example.com", password: "password1" };

describe("login server action", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    signInMock.mockReset();
    signOutMock.mockReset();
    singleMock.mockReset();
    userRolesMock.mockClear();
    rpcMock.mockClear();
  });

  it("rejects invalid input server-side without calling Supabase", async () => {
    const result = await login(null, { email: "not-an-email", password: "" });
    expect(result).toEqual({ error: "Please check your details and try again." });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("returns one generic error for wrong credentials, not revealing the cause", async () => {
    signInMock.mockResolvedValue({ data: {}, error: { message: "Invalid login credentials" } });
    const result = await login(null, validInput);
    expect(result).toEqual({ error: "Invalid email or password." });
  });

  it("signs a suspended user back out and reports suspension", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    singleMock.mockResolvedValue({ data: { status: "suspended" } });
    const result = await login(null, validInput);
    expect(result).toEqual({ error: "Your account has been suspended. Contact support." });
    expect(signOutMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to the user's portal for an active user", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    singleMock.mockResolvedValue({ data: { status: "active" } });
    await expect(login(null, validInput)).rejects.toThrow("REDIRECT:/learner");
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("honors a safe ?next= path instead of the role default", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    singleMock.mockResolvedValue({ data: { status: "active" } });
    await expect(login("/instructor/courses", validInput)).rejects.toThrow(
      "REDIRECT:/instructor/courses",
    );
  });

  it("ignores an unsafe ?next= (open-redirect) and falls back to the role default", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    singleMock.mockResolvedValue({ data: { status: "active" } });
    await expect(login("//evil.example.com", validInput)).rejects.toThrow("REDIRECT:/learner");
  });

  it("sends an admin without a second factor to /mfa", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    singleMock.mockResolvedValue({ data: { status: "active" } });
    userRolesMock.mockResolvedValueOnce({ data: [{ role_id: "admin" }] });
    await expect(login(null, validInput)).rejects.toThrow("REDIRECT:/mfa?next=%2Fadmin");
  });

  it("sends an org_admin without a second factor to /mfa too (T-162)", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    singleMock.mockResolvedValue({ data: { status: "active" } });
    userRolesMock.mockResolvedValueOnce({ data: [{ role_id: "org_admin" }] });
    await expect(login(null, validInput)).rejects.toThrow("REDIRECT:/mfa?next=%2Forg_admin");
  });

  it("returns a rate-limit error without touching Supabase when limited", async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce(false);
    const result = await login(null, validInput);
    expect(result).toEqual({ error: "Too many attempts. Please wait a while and try again." });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("records the login (T-130) on a successful sign-in", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    singleMock.mockResolvedValue({ data: { status: "active" } });
    await expect(login(null, validInput)).rejects.toThrow("REDIRECT:/learner");
    expect(rpcMock).toHaveBeenCalledWith("record_login", expect.objectContaining({ p_ip: expect.any(String) }));
  });

  it("never blocks a successful login when recording it fails", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    singleMock.mockResolvedValue({ data: { status: "active" } });
    rpcMock.mockRejectedValueOnce(new Error("db down"));
    await expect(login(null, validInput)).rejects.toThrow("REDIRECT:/learner");
  });

  it("does not record a login for a wrong password", async () => {
    signInMock.mockResolvedValue({ data: {}, error: { message: "Invalid login credentials" } });
    await login(null, validInput);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
