import { beforeEach, describe, expect, it, vi } from "vitest";
import { signUp } from "@/features/auth/sign-up";

const { redirectMock, signUpMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  signUpMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signUp: signUpMock } })),
}));
vi.mock("@/services/settings", () => ({
  getPlatformSettings: vi.fn(async () => ({ minPasswordLength: 8, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null })),
}));

const validInput = {
  email: "test@example.com",
  password: "password1",
  confirmPassword: "password1",
};

describe("signUp server action", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    signUpMock.mockReset();
  });

  it("rejects invalid input server-side without calling Supabase", async () => {
    const result = await signUp({ email: "not-an-email", password: "x", confirmPassword: "y" });
    expect(result).toEqual({ error: "Please check your details and try again." });
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it("returns a safe error message when Supabase rejects the sign-up", async () => {
    signUpMock.mockResolvedValue({ error: { message: "some internal detail" } });
    const result = await signUp(validInput);
    expect(result).toEqual({ error: "We couldn't create your account. Please try again." });
  });

  it("redirects to /verify-email with the email on success", async () => {
    signUpMock.mockResolvedValue({ error: null });
    await expect(signUp(validInput)).rejects.toThrow(
      "REDIRECT:/verify-email?email=test%40example.com",
    );
    expect(signUpMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: validInput.email, password: validInput.password }),
    );
  });

  it("does not reveal an already-registered email even when Supabase reports it", async () => {
    signUpMock.mockResolvedValue({ error: { code: "user_already_exists", message: "User already registered" } });
    await expect(signUp(validInput)).rejects.toThrow("REDIRECT:/verify-email?email=test%40example.com");
  });
});
