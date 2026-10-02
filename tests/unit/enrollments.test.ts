import { describe, expect, it } from "vitest";
import { parseEnrollmentQuery, validateCohortName } from "@/features/admin/enrollments";

describe("validateCohortName", () => {
  it("accepts a normal name", () => {
    expect(validateCohortName("Spring 2026 interns")).toEqual({ ok: true, value: "Spring 2026 interns" });
  });

  it("rejects an empty name", () => {
    expect(validateCohortName("").ok).toBe(false);
    expect(validateCohortName("   ").ok).toBe(false);
  });

  it("rejects a name over the limit", () => {
    expect(validateCohortName("x".repeat(151)).ok).toBe(false);
  });
});

describe("parseEnrollmentQuery", () => {
  it("defaults to an empty query on page 1", () => {
    expect(parseEnrollmentQuery({})).toEqual({ q: "", status: "", courseId: "", page: 1 });
  });

  it("only accepts known status values", () => {
    expect(parseEnrollmentQuery({ status: "active" }).status).toBe("active");
    expect(parseEnrollmentQuery({ status: "bogus" }).status).toBe("");
  });

  it("only accepts a UUID-shaped courseId", () => {
    expect(parseEnrollmentQuery({ courseId: "not-a-uuid" }).courseId).toBe("");
    expect(parseEnrollmentQuery({ courseId: "11111111-1111-1111-1111-111111111111" }).courseId).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("clamps an invalid page number to 1", () => {
    expect(parseEnrollmentQuery({ page: "0" }).page).toBe(1);
    expect(parseEnrollmentQuery({ page: "abc" }).page).toBe(1);
    expect(parseEnrollmentQuery({ page: "3" }).page).toBe(3);
  });
});
