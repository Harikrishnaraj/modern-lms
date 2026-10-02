import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { MAX_FILE_BYTES, ScormValidationError, validateAndExtractPackage } from "@/services/scorm/parse";

const MANIFEST_1_2 = `<?xml version="1.0"?>
<manifest identifier="com.test.course" version="1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG1">
    <organization identifier="ORG1">
      <title>Test Course</title>
      <item identifier="ITEM1" identifierref="RES1"><title>Lesson 1</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES1" type="webcontent" href="index.html" adlcp:scormtype="sco" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
      <file href="index.html" />
    </resource>
  </resources>
</manifest>`;

const MANIFEST_2004 = MANIFEST_1_2.replace("1.2", "2004 3rd Edition");

async function buildZip(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: "uint8array" });
}

describe("validateAndExtractPackage", () => {
  it("extracts a valid SCORM 1.2 package and finds the launch file", async () => {
    const zip = await buildZip({ "imsmanifest.xml": MANIFEST_1_2, "index.html": "<html><body>Hi</body></html>" });
    const result = await validateAndExtractPackage(zip);
    expect(result.version).toBe("1.2");
    expect(result.launchPath).toBe("index.html");
    expect(result.title).toBe("Test Course");
    expect(result.files.map((f) => f.path).sort()).toEqual(["imsmanifest.xml", "index.html"]);
  });

  it("detects SCORM 2004 from the schemaversion", async () => {
    const zip = await buildZip({ "imsmanifest.xml": MANIFEST_2004, "index.html": "<html></html>" });
    const result = await validateAndExtractPackage(zip);
    expect(result.version).toBe("2004");
  });

  it("rejects a package with no imsmanifest.xml", async () => {
    const zip = await buildZip({ "index.html": "<html></html>" });
    await expect(validateAndExtractPackage(zip)).rejects.toThrow(ScormValidationError);
  });

  it("rejects an empty package", async () => {
    const zip = await new JSZip().generateAsync({ type: "uint8array" });
    await expect(validateAndExtractPackage(zip)).rejects.toThrow(ScormValidationError);
  });

  it("rejects a zip-slip path traversal entry", async () => {
    const zip = new JSZip();
    zip.file("imsmanifest.xml", MANIFEST_1_2);
    zip.file("index.html", "<html></html>");
    zip.file("../../etc/passwd", "pwned");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    await expect(validateAndExtractPackage(bytes)).rejects.toThrow(ScormValidationError);
  });

  it("rejects a disallowed file extension", async () => {
    const zip = await buildZip({
      "imsmanifest.xml": MANIFEST_1_2,
      "index.html": "<html></html>",
      "payload.exe": "MZ",
    });
    await expect(validateAndExtractPackage(zip)).rejects.toThrow(ScormValidationError);
  });

  it("rejects a file over the per-file size cap", async () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    const zip = await buildZip({ "imsmanifest.xml": MANIFEST_1_2, "index.html": "<html></html>", "big.png": big });
    await expect(validateAndExtractPackage(zip)).rejects.toThrow(ScormValidationError);
  });

  it("rejects an invalid zip file", async () => {
    await expect(validateAndExtractPackage(new TextEncoder().encode("not a zip"))).rejects.toThrow(ScormValidationError);
  });

  it("rejects a manifest whose launch file is missing from the package", async () => {
    const zip = await buildZip({ "imsmanifest.xml": MANIFEST_1_2 });
    await expect(validateAndExtractPackage(zip)).rejects.toThrow(/launch file/);
  });
});
