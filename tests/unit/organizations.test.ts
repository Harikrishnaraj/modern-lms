import { describe, expect, it } from "vitest";
import { ORG_NAME_MAX, validateOrganizationName, validateOrganizationSlug } from "@/features/admin/organizations";

describe("validateOrganizationSlug", () => {
  it("lowercases and trims a valid slug", () => {
    expect(validateOrganizationSlug("  Acme-Corp  ".toLowerCase())).toEqual({ ok: true, value: "acme-corp" });
  });

  it("rejects an empty slug", () => {
    expect(validateOrganizationSlug("").ok).toBe(false);
    expect(validateOrganizationSlug("   ").ok).toBe(false);
  });

  it("rejects a slug with invalid characters", () => {
    expect(validateOrganizationSlug("Acme!").ok).toBe(false);
    expect(validateOrganizationSlug("acme_corp").ok).toBe(false);
    expect(validateOrganizationSlug("-acme").ok).toBe(false);
  });

  it("accepts hyphenated slugs", () => {
    expect(validateOrganizationSlug("acme-corp-2")).toEqual({ ok: true, value: "acme-corp-2" });
  });
});

describe("validateOrganizationName", () => {
  it("accepts a normal name", () => {
    expect(validateOrganizationName("Acme Corp")).toEqual({ ok: true, value: "Acme Corp" });
  });

  it("rejects an empty name", () => {
    expect(validateOrganizationName("").ok).toBe(false);
    expect(validateOrganizationName("   ").ok).toBe(false);
  });

  it("rejects a name over the limit", () => {
    expect(validateOrganizationName("x".repeat(ORG_NAME_MAX + 1)).ok).toBe(false);
  });
});
