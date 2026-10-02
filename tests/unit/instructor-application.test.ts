import { describe, expect, it } from "vitest";
import { APPLICATION_MESSAGE_MAX, APPLICATION_MESSAGE_MIN, validateApplicationMessage } from "@/features/instructor/application";

describe("validateApplicationMessage", () => {
  it("accepts a message within the length bounds", () => {
    const msg = "I have five years of industry experience and want to share it.";
    expect(validateApplicationMessage(msg)).toEqual({ ok: true, value: msg });
  });

  it("rejects a message under the minimum length", () => {
    expect(validateApplicationMessage("Too short")).toMatchObject({ ok: false });
  });

  it("rejects a message over the maximum length", () => {
    expect(validateApplicationMessage("x".repeat(APPLICATION_MESSAGE_MAX + 1))).toMatchObject({ ok: false });
  });

  it("accepts messages right at the boundaries", () => {
    expect(validateApplicationMessage("x".repeat(APPLICATION_MESSAGE_MIN)).ok).toBe(true);
    expect(validateApplicationMessage("x".repeat(APPLICATION_MESSAGE_MAX)).ok).toBe(true);
  });

  it("rejects non-string input", () => {
    expect(validateApplicationMessage(undefined).ok).toBe(false);
    expect(validateApplicationMessage(null).ok).toBe(false);
  });
});
