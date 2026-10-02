import { describe, expect, it } from "vitest";
import { parseAttemptQuery } from "@/features/admin/assessments";

describe("parseAttemptQuery", () => {
  it("defaults to an empty query on page 1", () => {
    expect(parseAttemptQuery({})).toEqual({ q: "", courseId: "", status: "", page: 1 });
  });

  it("only accepts known status values", () => {
    expect(parseAttemptQuery({ status: "graded" }).status).toBe("graded");
    expect(parseAttemptQuery({ status: "in_progress" }).status).toBe("in_progress");
    expect(parseAttemptQuery({ status: "bogus" }).status).toBe("");
  });

  it("only accepts a UUID-shaped courseId", () => {
    expect(parseAttemptQuery({ courseId: "not-a-uuid" }).courseId).toBe("");
    expect(parseAttemptQuery({ courseId: "11111111-1111-1111-1111-111111111111" }).courseId).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("clamps an invalid page number to 1", () => {
    expect(parseAttemptQuery({ page: "0" }).page).toBe(1);
    expect(parseAttemptQuery({ page: "abc" }).page).toBe(1);
    expect(parseAttemptQuery({ page: "3" }).page).toBe(3);
  });

  it("trims and caps the search query length", () => {
    expect(parseAttemptQuery({ q: "  hi  " }).q).toBe("hi");
    expect(parseAttemptQuery({ q: "x".repeat(150) }).q).toHaveLength(100);
  });
});
