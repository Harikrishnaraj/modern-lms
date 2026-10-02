import { describe, expect, it } from "vitest";
import {
  htmlText,
  instructionsToHtml,
  isOwnResourcePath,
  looksLikeHtml,
  matchesSearch,
  MAX_RESOURCE_BYTES,
  normalizeInstructionsHtml,
  overviewStatus,
  submissionPercent,
  validateHubAssignment,
  validateResourceFile,
  type HubAssignmentInput,
} from "@/features/assignments/hub-rules";
import { acceptFor, DEFAULT_FILE_TYPES, fileTypeList, validateSubmissionFile } from "@/features/assignments/rules";
import { filterQueue, parseAssignmentFilter, type QueueRow } from "@/features/assignments/grading";

const USER = "11111111-1111-4111-8111-111111111111";
const COURSE = "22222222-2222-4222-8222-222222222222";
const PDF = "application/pdf";

const input = (over: Partial<HubAssignmentInput> = {}): HubAssignmentInput => ({
  courseId: COURSE,
  title: "  Research   Paper ",
  instructions: "<p>Write <strong>2,000</strong> words.</p>",
  dueAt: "",
  maxPoints: 100,
  fileTypes: ["pdf", "doc", "docx"],
  resources: [],
  ...over,
});

describe("validateHubAssignment", () => {
  it("accepts a complete assignment without a due date (the deadline is optional)", () => {
    const r = validateHubAssignment(input());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ title: "Research Paper", dueAt: null, maxPoints: 100, fileTypes: ["pdf", "doc", "docx"] });
  });

  it("reads an optional due date as UTC", () => {
    const r = validateHubAssignment(input({ dueAt: "2031-05-01T17:00" }));
    expect(r.ok && r.value.dueAt).toBe("2031-05-01T17:00:00.000Z");
  });

  it("requires a course, title, description, sane points and at least one file type", () => {
    const r = validateHubAssignment(input({ courseId: "nope", title: " ", instructions: "<p> </p>", maxPoints: 0, fileTypes: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["courseId", "fileTypes", "instructions", "maxPoints", "title"]);
  });

  it("rejects unknown file types and malformed dates", () => {
    const r = validateHubAssignment(input({ fileTypes: ["pdf", "exe"], dueAt: "2031-02-30T10:00" }));
    expect(!r.ok && r.errors).toMatchObject({ fileTypes: expect.any(String), dueAt: expect.any(String) });
  });

  it("limits reference files to 5 valid ones", () => {
    const f = { path: `${USER}/a.pdf`, name: "a.pdf", size: 10, type: PDF };
    expect(validateHubAssignment(input({ resources: Array(6).fill(f) })).ok).toBe(false);
    expect(validateHubAssignment(input({ resources: [{ ...f, type: "text/html" }] })).ok).toBe(false);
    expect(validateHubAssignment(input({ resources: [f] })).ok).toBe(true);
  });
});

describe("reference files", () => {
  it("allows PDF, DOC, DOCX, PPT, PPTX and ZIP up to 50 MB", () => {
    expect(validateResourceFile({ name: "a.pdf", size: MAX_RESOURCE_BYTES, type: PDF }).ok).toBe(true);
    expect(validateResourceFile({ name: "s.ppt", size: 1, type: "application/vnd.ms-powerpoint" }).ok).toBe(true);
    expect(validateResourceFile({ name: "a.pdf", size: MAX_RESOURCE_BYTES + 1, type: PDF }).ok).toBe(false);
    expect(validateResourceFile({ name: "x.exe", size: 1, type: "application/x-msdownload" }).ok).toBe(false);
    expect(validateResourceFile({ name: "a.pdf", size: 0, type: PDF }).ok).toBe(false);
  });

  it("only accepts object keys under the instructor's own prefix", () => {
    expect(isOwnResourcePath(USER, `${USER}/f.pdf`)).toBe(true);
    expect(isOwnResourcePath(USER, `33333333-3333-4333-8333-333333333333/f.pdf`)).toBe(false);
    expect(isOwnResourcePath(USER, `${USER}/../other/f.pdf`)).toBe(false);
    expect(isOwnResourcePath(USER, `${USER}/`)).toBe(false);
    expect(isOwnResourcePath(USER, 42)).toBe(false);
  });
});

describe("rich-text instructions", () => {
  it("tells HTML from legacy plain text and converts plain text safely", () => {
    expect(looksLikeHtml("<p>x</p>")).toBe(true);
    expect(looksLikeHtml("5 < 6 and 7 > 3")).toBe(false);
    expect(instructionsToHtml("Line one\nline two\n\nIf a < b & \"c\" > d")).toBe(
      "<p>Line one<br>line two</p><p>If a &lt; b &amp; &quot;c&quot; &gt; d</p>",
    );
    expect(instructionsToHtml("<p>kept</p>")).toBe("<p>kept</p>");
  });

  it("wraps bare editor text in a paragraph and measures visible text", () => {
    expect(normalizeInstructionsHtml("a &amp; b")).toBe("<p>a &amp; b</p>");
    expect(normalizeInstructionsHtml("<p>ok</p>")).toBe("<p>ok</p>");
    expect(normalizeInstructionsHtml("  ")).toBe("");
    expect(htmlText("<p>&nbsp;</p><ul><li></li></ul>")).toBe("");
    expect(htmlText("<p>Hi <u>there</u></p>")).toBe("Hi there");
  });
});

describe("the all-courses table", () => {
  const now = new Date("2026-06-15T12:00:00Z");
  it("derives Active / Closed / Draft / In review", () => {
    expect(overviewStatus({ versionStatus: "published", dueAt: null, allowLate: false }, now)).toBe("active");
    expect(overviewStatus({ versionStatus: "published", dueAt: "2026-06-20T00:00:00Z", allowLate: false }, now)).toBe("active");
    expect(overviewStatus({ versionStatus: "published", dueAt: "2026-06-01T00:00:00Z", allowLate: false }, now)).toBe("closed");
    expect(overviewStatus({ versionStatus: "published", dueAt: "2026-06-01T00:00:00Z", allowLate: true }, now)).toBe("active");
    expect(overviewStatus({ versionStatus: "draft", dueAt: null, allowLate: false }, now)).toBe("draft");
    expect(overviewStatus({ versionStatus: "changes_requested", dueAt: null, allowLate: false }, now)).toBe("draft");
    expect(overviewStatus({ versionStatus: "in_review", dueAt: null, allowLate: false }, now)).toBe("in_review");
  });

  it("searches title and course, case-insensitively", () => {
    const r = { title: "Research Paper", courseTitle: "Data Science" };
    expect(matchesSearch(r, "")).toBe(true);
    expect(matchesSearch(r, "paper")).toBe(true);
    expect(matchesSearch(r, " DATA ")).toBe(true);
    expect(matchesSearch(r, "biology")).toBe(false);
  });

  it("computes the submitted share of enrolled learners", () => {
    expect(submissionPercent(18, 30)).toBe(60);
    expect(submissionPercent(0, 0)).toBe(0);
    expect(submissionPercent(5, 3)).toBe(100);
  });
});

describe("per-assignment file types", () => {
  it("lists and builds the accept attribute in catalog order", () => {
    expect(fileTypeList(DEFAULT_FILE_TYPES)).toBe("PDF, DOC or DOCX");
    expect(fileTypeList(["pdf"])).toBe("PDF");
    expect(acceptFor(["jpg", "pdf"])).toBe(".pdf,.jpg,.jpeg");
  });

  it("rejects a submission whose type the instructor did not allow", () => {
    const a = { allowFile: true, maxFileMb: 5, allowedFileTypes: DEFAULT_FILE_TYPES };
    expect(validateSubmissionFile(a, { name: "a.pdf", size: 10, type: PDF }).ok).toBe(true);
    expect(validateSubmissionFile(a, { name: "a.doc", size: 10, type: "application/msword" }).ok).toBe(true);
    const zip = validateSubmissionFile(a, { name: "a.zip", size: 10, type: "application/zip" });
    expect(zip).toEqual({ ok: false, error: "That file type is not allowed. Use PDF, DOC or DOCX." });
  });
});

describe("grading queue scoped to one assignment", () => {
  const A = "44444444-4444-4444-8444-444444444444";
  const row = (assignmentId: string, status: "submitted" | "graded"): QueueRow => ({
    submissionId: `${assignmentId}-${status}`, assignmentId, assignmentTitle: "T", courseId: COURSE, courseTitle: "C",
    learnerName: "L", submittedAt: "2026-06-01T00:00:00Z", isLate: false, status, grade: null, maxPoints: 10,
  });
  it("parses only UUIDs and filters by assignment", () => {
    expect(parseAssignmentFilter(A)).toBe(A);
    expect(parseAssignmentFilter("x' or 1=1")).toBeNull();
    expect(parseAssignmentFilter(undefined)).toBeNull();
    const rows = [row(A, "submitted"), row(A, "graded"), row(COURSE, "submitted")];
    expect(filterQueue(rows, "all", A)).toHaveLength(2);
    expect(filterQueue(rows, "pending", A)).toHaveLength(1);
    expect(filterQueue(rows, "pending")).toHaveLength(2);
  });
});
