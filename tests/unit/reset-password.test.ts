import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetPassword } from "@/features/auth/reset-password";

const { redirectMock, updateUserMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  updateUserMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { updateUser: updateUserMock } })),
}));
vi.mock("@/services/settings", () => ({
  getPlatformSettings: vi.fn(async () => ({ minPasswordLength: 8, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null })),
}));

const validInput = { password: "password1", confirmPassword: "password1" };

describe("resetPassword server action", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    updateUserMock.mockReset();
  });

  it("rejects invalid input without calling Supabase", async () => {
    const result = await resetPassword({ password: "short1", confirmPassword: "short1" });
    expect(result).toEqual({ error: "Please check your details and try again." });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("returns a safe error when Supabase fails", async () => {
    updateUserMock.mockResolvedValue({ error: { message: "invalid session" } });
    const result = await resetPassword(validInput);
    expect(result).toEqual({
      error: "We couldn't reset your password. Please request a new reset link.",
    });
  });

  it("redirects to /login on success", async () => {
    updateUserMock.mockResolvedValue({ error: null });
    await expect(resetPassword(validInput)).rejects.toThrow("REDIRECT:/login");
    expect(updateUserMock).toHaveBeenCalledWith({ password: "password1" });
  });
});
