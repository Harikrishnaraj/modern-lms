import { describe, expect, it } from "vitest";
import {
  deriveLessonStatus,
  deriveScoreRaw,
  deriveSuspendData,
  escapeForInlineScript,
  isDone,
  seedCmi,
} from "@/services/scorm/cmi";

describe("seedCmi", () => {
  it("seeds fresh SCORM 1.2 defaults with ab-initio entry when there is no saved state", () => {
    const cmi = seedCmi({ version: "1.2", learnerName: "Ada", learnerId: "u1", resume: false, savedCmi: {} });
    expect(cmi["cmi.core.student_name"]).toBe("Ada");
    expect(cmi["cmi.core.lesson_status"]).toBe("not attempted");
    expect(cmi["cmi.core.entry"]).toBe("ab-initio");
  });

  it("seeds fresh SCORM 2004 defaults", () => {
    const cmi = seedCmi({ version: "2004", learnerName: "Ada", learnerId: "u1", resume: false, savedCmi: {} });
    expect(cmi["cmi.learner_name"]).toBe("Ada");
    expect(cmi["cmi.completion_status"]).toBe("not attempted");
    expect(cmi["cmi.entry"]).toBe("ab-initio");
  });

  it("resumes from saved CMI and marks entry as resume", () => {
    const saved = { "cmi.core.lesson_status": "incomplete", "cmi.suspend_data": "page=3" };
    const cmi = seedCmi({ version: "1.2", learnerName: "Ada", learnerId: "u1", resume: true, savedCmi: saved });
    expect(cmi["cmi.core.lesson_status"]).toBe("incomplete");
    expect(cmi["cmi.suspend_data"]).toBe("page=3");
    expect(cmi["cmi.core.entry"]).toBe("resume");
  });
});

describe("deriveLessonStatus", () => {
  it("reads the 1.2 lesson_status directly", () => {
    expect(deriveLessonStatus({ "cmi.core.lesson_status": "passed" })).toBe("passed");
  });

  it("derives from 2004 success_status when present", () => {
    expect(deriveLessonStatus({ "cmi.success_status": "passed" })).toBe("passed");
    expect(deriveLessonStatus({ "cmi.success_status": "failed" })).toBe("failed");
  });

  it("falls back to 2004 completion_status", () => {
    expect(deriveLessonStatus({ "cmi.completion_status": "completed" })).toBe("completed");
    expect(deriveLessonStatus({ "cmi.completion_status": "incomplete" })).toBe("incomplete");
  });

  it("defaults to unknown with no recognizable fields", () => {
    expect(deriveLessonStatus({})).toBe("unknown");
  });
});

describe("isDone", () => {
  it("treats passed and completed as done", () => {
    expect(isDone("passed")).toBe(true);
    expect(isDone("completed")).toBe(true);
  });
  it("treats everything else as not done", () => {
    expect(isDone("incomplete")).toBe(false);
    expect(isDone("failed")).toBe(false);
    expect(isDone("unknown")).toBe(false);
  });
});

describe("deriveScoreRaw / deriveSuspendData", () => {
  it("reads either version's score key", () => {
    expect(deriveScoreRaw({ "cmi.core.score.raw": "85" })).toBe(85);
    expect(deriveScoreRaw({ "cmi.score.raw": "42.5" })).toBe(42.5);
    expect(deriveScoreRaw({})).toBeNull();
    expect(deriveScoreRaw({ "cmi.score.raw": "" })).toBeNull();
  });

  it("reads suspend_data or defaults to empty", () => {
    expect(deriveSuspendData({ "cmi.suspend_data": "abc" })).toBe("abc");
    expect(deriveSuspendData({})).toBe("");
  });
});

describe("escapeForInlineScript", () => {
  it("neutralizes a closing script tag inside the payload", () => {
    const escaped = escapeForInlineScript({ x: "</script><script>alert(1)</script>" });
    expect(escaped).not.toContain("</script>");
  });

  it("neutralizes an HTML comment close sequence", () => {
    const escaped = escapeForInlineScript({ x: "-->" });
    expect(escaped).not.toContain("-->");
  });
});
