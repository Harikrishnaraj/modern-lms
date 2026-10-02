import { describe, expect, it } from "vitest";
import { validateAssignedLearningInput } from "@/features/admin/assigned-learning";

const base = { scope: "organization", userId: null, contentType: "course", courseId: "c1", pathId: null, dueAt: null };

describe("validateAssignedLearningInput", () => {
  it("accepts a whole-organization course assignment with no due date", () => {
    expect(validateAssignedLearningInput(base)).toEqual({
      ok: true,
      value: { scope: "organization", userId: null, contentType: "course", courseId: "c1", pathId: null, dueAt: null },
    });
  });

  it("accepts a user-scoped path assignment with a due date", () => {
    const result = validateAssignedLearningInput({ scope: "user", userId: "u1", contentType: "path", courseId: null, pathId: "p1", dueAt: "2026-06-01" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ scope: "user", userId: "u1", contentType: "path", pathId: "p1" });
      expect(result.value.dueAt).toBe(new Date("2026-06-01").toISOString());
    }
  });

  it("rejects a user scope without a chosen member", () => {
    expect(validateAssignedLearningInput({ ...base, scope: "user", userId: null }).ok).toBe(false);
  });

  it("rejects a course content type without a chosen course", () => {
    expect(validateAssignedLearningInput({ ...base, courseId: null }).ok).toBe(false);
  });

  it("rejects a path content type without a chosen path", () => {
    expect(validateAssignedLearningInput({ ...base, contentType: "path", courseId: null, pathId: null }).ok).toBe(false);
  });

  it("rejects an unparseable due date", () => {
    expect(validateAssignedLearningInput({ ...base, dueAt: "not-a-date" }).ok).toBe(false);
  });

  it("rejects an unknown scope or content type", () => {
    expect(validateAssignedLearningInput({ ...base, scope: "team" }).ok).toBe(false);
    expect(validateAssignedLearningInput({ ...base, contentType: "quiz" }).ok).toBe(false);
  });
});
