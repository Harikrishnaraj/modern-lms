import { describe, expect, it } from "vitest";
import { HEADLINE_MAX, BIO_MAX, PAYOUT_REFERENCE_MAX, validateBio, validateHeadline, validatePayoutDetails } from "@/features/instructor/settings";

describe("validateHeadline", () => {
  it("trims and allows a normal headline", () => {
    expect(validateHeadline("  Senior Cloud Architect  ")).toEqual({ ok: true, value: "Senior Cloud Architect" });
  });

  it("treats an empty or missing headline as null (optional field)", () => {
    expect(validateHeadline("")).toEqual({ ok: true, value: null });
    expect(validateHeadline("   ")).toEqual({ ok: true, value: null });
    expect(validateHeadline(undefined)).toEqual({ ok: true, value: null });
  });

  it("rejects a headline over the limit", () => {
    const result = validateHeadline("x".repeat(HEADLINE_MAX + 1));
    expect(result.ok).toBe(false);
  });
});

describe("validateBio", () => {
  it("allows a normal bio and rejects one over the limit", () => {
    expect(validateBio("Hello learners.")).toEqual({ ok: true, value: "Hello learners." });
    expect(validateBio("x".repeat(BIO_MAX + 1)).ok).toBe(false);
  });

  it("treats blank input as null", () => {
    expect(validateBio("  ")).toEqual({ ok: true, value: null });
  });
});

describe("validatePayoutDetails", () => {
  it("accepts a valid method and reference", () => {
    expect(validatePayoutDetails({ method: "paypal", reference: " you@example.com " })).toEqual({
      ok: true,
      value: { method: "paypal", reference: "you@example.com" },
    });
  });

  it("rejects an invalid method", () => {
    expect(validatePayoutDetails({ method: "crypto", reference: "abc" }).ok).toBe(false);
  });

  it("rejects a blank reference", () => {
    expect(validatePayoutDetails({ method: "paypal", reference: "  " }).ok).toBe(false);
  });

  it("rejects a reference over the limit", () => {
    expect(validatePayoutDetails({ method: "other", reference: "x".repeat(PAYOUT_REFERENCE_MAX + 1) }).ok).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(validatePayoutDetails(null).ok).toBe(false);
    expect(validatePayoutDetails("nope").ok).toBe(false);
  });
});
