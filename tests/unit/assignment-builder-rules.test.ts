import { describe, expect, it } from "vitest";
import { parseDueAt, toDueInput, validateAssignment, validateGrade, type AssignmentInput } from "@/features/course-authoring/assignment-rules";

const base = (over: Partial<AssignmentInput> = {}): AssignmentInput => ({
  title: "  Final   report ",
  instructions: "Write it.",
  dueAt: "2031-03-18T10:00",
  maxPoints: 100,
  allowLate: false,
  allowText: true,
  allowFile: true,
  maxFileMb: 5,
  allowedFileTypes: ["pdf", "docx"],
  criteria: [],
  ...over,
});

describe("parseDueAt / toDueInput", () => {
  it("reads the datetime-local value as UTC and round-trips", () => {
    expect(parseDueAt("2031-03-18T10:00")).toBe("2031-03-18T10:00:00.000Z");
    expect(toDueInput("2031-03-18T10:00:00.000Z")).toBe("2031-03-18T10:00");
    expect(parseDueAt("")).toBeNull();
    expect(parseDueAt("  ")).toBeNull();
    expect(toDueInput(null)).toBe("");
  });

  it("rejects malformed and impossible dates", () => {
    expect(parseDueAt("2031-03-18")).toBeUndefined();
    expect(parseDueAt("2031-02-30T10:00")).toBeUndefined();
    expect(parseDueAt("2031-03-18T25:00")).toBeUndefined();
    expect(parseDueAt("tomorrow")).toBeUndefined();
  });
});

describe("validateAssignment", () => {
  it("accepts a plain assignment and cleans it", () => {
    const r = validateAssignment(base());
    expect(r).toMatchObject({ ok: true, value: { title: "Final report", dueAt: "2031-03-18T10:00:00.000Z", maxPoints: 100, criteria: [] } });
    expect(validateAssignment(base({ dueAt: "" }))).toMatchObject({ ok: true, value: { dueAt: null } });
  });

  it("reports field errors", () => {
    const r = validateAssignment(base({ title: " ", dueAt: "nope", maxPoints: 0, maxFileMb: 11, allowText: false, allowFile: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["allowText", "dueAt", "maxFileMb", "maxPoints", "title"]);
    expect(validateAssignment(base({ instructions: "x".repeat(20001) }))).toMatchObject({ ok: false, errors: { instructions: expect.any(String) } });
    expect(validateAssignment(base({ maxPoints: 2.5 }))).toMatchObject({ ok: false });
  });

  it("requires the rubric to add up to the assignment points", () => {
    const c = (title: string, maxPoints: number) => ({ title, description: "", maxPoints });
    expect(validateAssignment(base({ criteria: [c("Content", 60), c("Style", 40)] }))).toMatchObject({ ok: true });
    expect(validateAssignment(base({ criteria: [c("Content", 60), c("Style", 30)] }))).toMatchObject({
      ok: false,
      errors: { criteria: "The rubric adds up to 90 points but the assignment is worth 100." },
    });
    expect(validateAssignment(base({ criteria: [c("", 100)] }))).toMatchObject({ ok: false, errors: { "criteria.0.title": expect.any(String) } });
    expect(validateAssignment(base({ criteria: [c("A", 0), c("B", 100)] }))).toMatchObject({ ok: false, errors: { "criteria.0.maxPoints": expect.any(String) } });
    const tooMany = Array.from({ length: 11 }, (_, i) => c(`C${i}`, 1));
    expect(validateAssignment(base({ maxPoints: 11, criteria: tooMany }))).toMatchObject({ ok: false, errors: { criteria: expect.stringContaining("at most 10") } });
  });
});

describe("validateGrade", () => {
  const criteria = [
    { id: "a", title: "Content", maxPoints: 60 },
    { id: "b", title: "Style", maxPoints: 40 },
  ];

  it("sums rubric scores into the grade", () => {
    const r = validateGrade({ maxPoints: 100, criteria, scores: { a: 50, b: 30 }, grade: null, feedback: " Nice " });
    expect(r).toEqual({
      ok: true,
      grade: 80,
      feedback: "Nice",
      scores: [
        { criterion_id: "a", title: "Content", points: 50, max_points: 60 },
        { criterion_id: "b", title: "Style", points: 30, max_points: 40 },
      ],
    });
  });

  it("refuses missing, fractional and out-of-range criterion scores", () => {
    expect(validateGrade({ maxPoints: 100, criteria, scores: { a: 50 }, grade: null, feedback: "" })).toEqual({ ok: false, error: 'Score "Style" from 0 to 40.' });
    expect(validateGrade({ maxPoints: 100, criteria, scores: { a: 61, b: 0 }, grade: null, feedback: "" })).toMatchObject({ ok: false });
    expect(validateGrade({ maxPoints: 100, criteria, scores: { a: 1.5, b: 0 }, grade: null, feedback: "" })).toMatchObject({ ok: false });
    expect(validateGrade({ maxPoints: 100, criteria, scores: { a: -1, b: 0 }, grade: null, feedback: "" })).toMatchObject({ ok: false });
  });

  it("without a rubric takes a whole number within the points", () => {
    expect(validateGrade({ maxPoints: 50, criteria: [], scores: {}, grade: 42, feedback: "" })).toMatchObject({ ok: true, grade: 42, scores: [] });
    expect(validateGrade({ maxPoints: 50, criteria: [], scores: {}, grade: 0, feedback: "" })).toMatchObject({ ok: true, grade: 0 });
    for (const grade of [51, -1, 2.5, null]) {
      expect(validateGrade({ maxPoints: 50, criteria: [], scores: {}, grade, feedback: "" })).toEqual({ ok: false, error: "Enter a whole number of points from 0 to 50." });
    }
    expect(validateGrade({ maxPoints: 50, criteria: [], scores: {}, grade: 1, feedback: "x".repeat(10001) })).toMatchObject({ ok: false });
  });
});
