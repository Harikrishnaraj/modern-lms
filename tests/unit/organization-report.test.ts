import { describe, expect, it } from "vitest";
import { organizationReportToCsv, type OrgAssignedLearning } from "@/features/admin/assigned-learning";

const row: OrgAssignedLearning = {
  id: "a1",
  scope: "organization",
  targetLabel: "Whole organization",
  contentType: "course",
  title: "Security Basics",
  dueAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2025-12-01T00:00:00.000Z",
  totalAssigned: 5,
  completedCount: 2,
  overdueCount: 1,
};

describe("organizationReportToCsv", () => {
  it("writes a summary line, a header, and one row per assignment", () => {
    const csv = organizationReportToCsv("Acme Corp", 12.5, [row]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('"organization","Acme Corp","total_learning_hours","12.5"');
    expect(lines[1]).toBe('"content_type","title","assigned_to","due_at","total_assigned","completed","overdue"');
    expect(lines[2]).toBe('"course","Security Basics","Whole organization","2026-01-01T00:00:00.000Z","5","2","1"');
    expect(lines[3]).toBe("");
  });

  it("handles no assignments", () => {
    const csv = organizationReportToCsv("Acme Corp", 0, []);
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("neutralises spreadsheet formulas in the title", () => {
    const csv = organizationReportToCsv("Acme Corp", 0, [{ ...row, title: "=1+1" }]);
    expect(csv).toContain('"\'=1+1"');
  });
});
