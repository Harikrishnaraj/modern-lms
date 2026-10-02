import { describe, expect, it } from "vitest";
import { CATEGORY_NAME_MAX, validateCategoryName, validateCategorySlug } from "@/features/admin/categories";

describe("validateCategorySlug", () => {
  it("lowercases and trims a valid slug", () => {
    expect(validateCategorySlug("  Photography  ".toLowerCase())).toEqual({ ok: true, value: "photography" });
  });

  it("rejects an empty slug", () => {
    expect(validateCategorySlug("").ok).toBe(false);
    expect(validateCategorySlug("   ").ok).toBe(false);
  });

  it("rejects a slug with invalid characters", () => {
    expect(validateCategorySlug("Photography!").ok).toBe(false);
    expect(validateCategorySlug("photo_graphy").ok).toBe(false);
    expect(validateCategorySlug("-photography").ok).toBe(false);
  });

  it("accepts hyphenated slugs", () => {
    expect(validateCategorySlug("data-science")).toEqual({ ok: true, value: "data-science" });
  });
});

describe("validateCategoryName", () => {
  it("accepts a normal name", () => {
    expect(validateCategoryName("Photography")).toEqual({ ok: true, value: "Photography" });
  });

  it("rejects an empty name", () => {
    expect(validateCategoryName("").ok).toBe(false);
    expect(validateCategoryName("   ").ok).toBe(false);
  });

  it("rejects a name over the limit", () => {
    expect(validateCategoryName("x".repeat(CATEGORY_NAME_MAX + 1)).ok).toBe(false);
  });
});
