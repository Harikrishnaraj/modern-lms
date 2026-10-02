import { describe, expect, it } from "vitest";
import { validatePlatformSettingsInput } from "@/features/admin/settings";

const base = { minPasswordLength: 8, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null };

describe("validatePlatformSettingsInput", () => {
  it("accepts the defaults", () => {
    expect(validatePlatformSettingsInput(base)).toEqual({ ok: true });
  });

  it("accepts an idle timeout within range", () => {
    expect(validatePlatformSettingsInput({ ...base, sessionIdleTimeoutMinutes: 30 })).toEqual({ ok: true });
  });

  it("rejects a password length outside 8-128", () => {
    expect(validatePlatformSettingsInput({ ...base, minPasswordLength: 7 }).ok).toBe(false);
    expect(validatePlatformSettingsInput({ ...base, minPasswordLength: 129 }).ok).toBe(false);
    expect(validatePlatformSettingsInput({ ...base, minPasswordLength: 8.5 }).ok).toBe(false);
  });

  it("rejects an unknown portal", () => {
    expect(validatePlatformSettingsInput({ ...base, mfaRequiredPortals: ["superadmin"] }).ok).toBe(false);
  });

  it("rejects an idle timeout outside 5-10080 when set", () => {
    expect(validatePlatformSettingsInput({ ...base, sessionIdleTimeoutMinutes: 4 }).ok).toBe(false);
    expect(validatePlatformSettingsInput({ ...base, sessionIdleTimeoutMinutes: 10081 }).ok).toBe(false);
  });

  it("accepts an empty portal list (MFA required nowhere)", () => {
    expect(validatePlatformSettingsInput({ ...base, mfaRequiredPortals: [] })).toEqual({ ok: true });
  });
});
