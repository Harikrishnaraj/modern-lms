import { describe, expect, it } from "vitest";
import { announcementToEmailHtml, isTargetType } from "@/features/admin/communication";

describe("announcementToEmailHtml (T-141)", () => {
  it("wraps the subject and body in a minimal HTML shell", () => {
    const html = announcementToEmailHtml("Hello", "First paragraph.\n\nSecond paragraph.");
    expect(html).toContain("<h2>Hello</h2>");
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second paragraph.</p>");
  });

  it("escapes HTML in both subject and body so an announcement cannot inject markup", () => {
    const html = announcementToEmailHtml("<script>alert(1)</script>", "Click <a>here</a>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;a&gt;");
  });

  it("keeps single line breaks within a paragraph as <br>", () => {
    const html = announcementToEmailHtml("Subject", "Line one\nLine two");
    expect(html).toContain("Line one<br>Line two");
  });
});

describe("isTargetType (T-141)", () => {
  it("accepts the three known target types and rejects anything else", () => {
    expect(isTargetType("all_learners")).toBe(true);
    expect(isTargetType("role")).toBe(true);
    expect(isTargetType("course")).toBe(true);
    expect(isTargetType("everyone")).toBe(false);
    expect(isTargetType(undefined)).toBe(false);
  });
});
