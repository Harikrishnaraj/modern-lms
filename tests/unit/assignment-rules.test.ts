import { describe, expect, it } from "vitest";
import {
  assignmentStatus,
  canSubmit,
  submitErrorMessage,
  validateSubmissionFile,
  validateTextAnswer,
  type AssignmentRules,
} from "@/features/assignments/rules";

const now = new Date("2026-06-15T12:00:00Z");
const rules = (over: Partial<AssignmentRules> = {}): AssignmentRules => ({
  dueAt: "2026-06-20T00:00:00Z",
  allowLate: false,
  allowText: true,
  allowFile: true,
  maxFileMb: 5,
  allowedFileTypes: ["pdf", "docx", "zip", "txt", "png", "jpg"],
  ...over,
});

describe("assignmentStatus", () => {
  it("is open before the deadline and after it when late work is allowed", () => {
    expect(assignmentStatus(rules(), null, now)).toBe("open");
    expect(assignmentStatus(rules({ dueAt: null }), null, now)).toBe("open");
    expect(assignmentStatus(rules({ dueAt: "2026-06-01T00:00:00Z", allowLate: true }), null, now)).toBe("open");
  });

  it("is overdue when nothing was submitted and the deadline passed without late work", () => {
    expect(assignmentStatus(rules({ dueAt: "2026-06-01T00:00:00Z" }), null, now)).toBe("overdue");
  });

  it("is submitted before the deadline, and closed (locked) after it", () => {
    const sub = { status: "submitted" as const, isLate: false };
    expect(assignmentStatus(rules(), sub, now)).toBe("submitted");
    expect(assignmentStatus(rules({ dueAt: "2026-06-01T00:00:00Z" }), sub, now)).toBe("closed");
    expect(assignmentStatus(rules({ dueAt: "2026-06-01T00:00:00Z", allowLate: true }), sub, now)).toBe("submitted");
  });

  it("graded always wins and locks", () => {
    expect(assignmentStatus(rules(), { status: "graded", isLate: false }, now)).toBe("graded");
    expect(canSubmit("graded")).toBe(false);
    expect(canSubmit("open")).toBe(true);
    expect(canSubmit("submitted")).toBe(true);
    expect(canSubmit("overdue")).toBe(false);
    expect(canSubmit("closed")).toBe(false);
  });

  it("treats the exact deadline instant as still open", () => {
    expect(assignmentStatus(rules({ dueAt: "2026-06-15T12:00:00Z" }), null, now)).toBe("open");
  });
});

describe("validateSubmissionFile", () => {
  const ok = { name: "essay.pdf", size: 1024, type: "application/pdf" };

  it("accepts an allowed file and cleans the name", () => {
    expect(validateSubmissionFile(rules(), { ...ok, name: "C:\\fakepath\\my essay.pdf" })).toEqual({
      ok: true,
      ext: "pdf",
      safeName: "my essay.pdf",
      type: "application/pdf",
    });
  });

  it("rejects wrong types, empty and oversized files, missing names and disabled uploads", () => {
    expect(validateSubmissionFile(rules(), { ...ok, type: "application/x-msdownload" })).toMatchObject({ ok: false });
    expect(validateSubmissionFile(rules(), { ...ok, type: "text/html" })).toMatchObject({ ok: false });
    expect(validateSubmissionFile(rules(), { ...ok, size: 0 })).toEqual({ ok: false, error: "The file is empty." });
    expect(validateSubmissionFile(rules(), { ...ok, size: 5 * 1024 * 1024 + 1 })).toEqual({ ok: false, error: "The file must be 5 MB or smaller." });
    expect(validateSubmissionFile(rules(), { ...ok, size: 5 * 1024 * 1024 })).toMatchObject({ ok: true });
    expect(validateSubmissionFile(rules(), { ...ok, name: " " })).toEqual({ ok: false, error: "Choose a file." });
    expect(validateSubmissionFile(rules({ allowFile: false }), ok)).toEqual({ ok: false, error: "This assignment does not accept files." });
    expect(validateSubmissionFile(rules(), { name: 1, size: "x", type: null })).toMatchObject({ ok: false });
  });
});

describe("validateTextAnswer / submitErrorMessage", () => {
  it("checks text against the rules", () => {
    expect(validateTextAnswer({ allowText: true }, "hello")).toBeNull();
    expect(validateTextAnswer({ allowText: true }, "   ")).toBeNull();
    expect(validateTextAnswer({ allowText: false }, "hello")).toMatch(/does not accept/);
    expect(validateTextAnswer({ allowText: false }, "")).toBeNull();
    expect(validateTextAnswer({ allowText: true }, "x".repeat(20001))).toMatch(/under 20,000/);
  });

  it("has a message for every database result", () => {
    for (const code of ["not_found", "not_enrolled", "closed", "graded", "empty", "text_not_allowed", "file_not_allowed", "file_too_large", "weird"]) {
      expect(submitErrorMessage(code).length).toBeGreaterThan(10);
    }
    expect(submitErrorMessage("closed")).toMatch(/deadline/);
  });
});
