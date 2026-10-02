import { describe, expect, it } from "vitest";
import { buildScormShim, injectShim } from "@/services/scorm/shim";

describe("buildScormShim", () => {
  it("defines window.API for SCORM 1.2", () => {
    const shim = buildScormShim({ version: "1.2", seedCmi: { "cmi.core.lesson_status": "incomplete" } });
    expect(shim).toContain("window.API =");
    expect(shim).toContain("LMSInitialize");
    expect(shim).toContain("LMSCommit");
    expect(shim).not.toContain("API_1484_11");
  });

  it("defines window.API_1484_11 for SCORM 2004", () => {
    const shim = buildScormShim({ version: "2004", seedCmi: { "cmi.completion_status": "incomplete" } });
    expect(shim).toContain("window.API_1484_11 =");
    expect(shim).toContain("Initialize");
    expect(shim).toContain("Terminate");
  });

  it("embeds the seed CMI values", () => {
    const shim = buildScormShim({ version: "1.2", seedCmi: { "cmi.core.student_name": "Ada Lovelace" } });
    expect(shim).toContain("Ada Lovelace");
  });
});

describe("injectShim", () => {
  it("inserts right after <head>", () => {
    const html = "<html><head><title>x</title></head><body></body></html>";
    const out = injectShim(html, "<script>SHIM</script>");
    expect(out.indexOf("<script>SHIM</script>")).toBeLessThan(out.indexOf("<title>"));
  });

  it("falls back to right after <html> when there is no head", () => {
    const html = "<html><body>no head here</body></html>";
    const out = injectShim(html, "<script>SHIM</script>");
    expect(out).toBe("<html><script>SHIM</script><body>no head here</body></html>");
  });

  it("prepends when there is no html/head tag at all", () => {
    const html = "<body>bare</body>";
    const out = injectShim(html, "<script>SHIM</script>");
    expect(out.startsWith("<script>SHIM</script>")).toBe(true);
  });
});
