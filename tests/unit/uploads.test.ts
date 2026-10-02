import { describe, expect, it } from "vitest";
import {
  MAX_ASSET_BYTES,
  MAX_VIDEO_BYTES,
  isStorageVideo,
  looksLikeVideo,
  normalizeVideoRef,
  safeFileName,
  storageVideoPath,
  validateUpload,
} from "@/features/course-authoring/uploads";
import { formatFileSize } from "@/lib/utils/format";

describe("validateUpload", () => {
  it("accepts allowed videos and assets and reports the extension", () => {
    expect(validateUpload("video", { name: "lecture.mp4", size: 1000, type: "video/mp4" })).toMatchObject({ ok: true, ext: "mp4" });
    expect(validateUpload("video", { name: "a.webm", size: 1, type: "video/webm" })).toMatchObject({ ok: true, ext: "webm" });
    expect(validateUpload("asset", { name: "notes.pdf", size: 5000, type: "application/pdf" })).toMatchObject({ ok: true, ext: "pdf" });
  });

  it("rejects disallowed types (executables, SVG, HTML, video as an asset and vice versa)", () => {
    for (const type of ["application/x-msdownload", "image/svg+xml", "text/html", "application/javascript", ""]) {
      expect(validateUpload("asset", { name: "x", size: 10, type }), type).toMatchObject({ ok: false });
    }
    expect(validateUpload("asset", { name: "x.mp4", size: 10, type: "video/mp4" })).toMatchObject({ ok: false });
    expect(validateUpload("video", { name: "x.pdf", size: 10, type: "application/pdf" })).toMatchObject({ ok: false });
  });

  it("enforces size limits and rejects empty or non-numeric sizes", () => {
    expect(validateUpload("video", { name: "x.mp4", size: MAX_VIDEO_BYTES + 1, type: "video/mp4" })).toMatchObject({ ok: false });
    expect(validateUpload("video", { name: "x.mp4", size: MAX_VIDEO_BYTES, type: "video/mp4" })).toMatchObject({ ok: true });
    expect(validateUpload("asset", { name: "x.pdf", size: MAX_ASSET_BYTES + 1, type: "application/pdf" })).toMatchObject({ ok: false });
    for (const size of [0, -1, NaN, Infinity, "10", null]) {
      expect(validateUpload("asset", { name: "x.pdf", size, type: "application/pdf" }), String(size)).toMatchObject({ ok: false });
    }
  });

  it("rejects a missing name", () => {
    expect(validateUpload("asset", { name: "  ", size: 1, type: "application/pdf" })).toMatchObject({ ok: false });
    expect(validateUpload("asset", { name: 5, size: 1, type: "application/pdf" })).toMatchObject({ ok: false });
  });
});

describe("looksLikeVideo", () => {
  it("accepts a real MP4 ftyp box", () => {
    const head = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(looksLikeVideo(head, "mp4")).toBe(true);
  });

  it("accepts a real WebM/EBML header", () => {
    const head = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
    expect(looksLikeVideo(head, "webm")).toBe(true);
  });

  it("rejects a text file renamed to .mp4 (the exact spoof a browser-reported MIME lets through)", () => {
    const head = new TextEncoder().encode("this is just text, not a video");
    expect(looksLikeVideo(head, "mp4")).toBe(false);
  });

  it("rejects a truncated/too-short buffer and an mp4 header claimed as webm", () => {
    expect(looksLikeVideo(new Uint8Array([1, 2, 3]), "mp4")).toBe(false);
    const mp4Head = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);
    expect(looksLikeVideo(mp4Head, "webm")).toBe(false);
  });
});

describe("safeFileName", () => {
  it("drops path parts and control characters and caps the length", () => {
    expect(safeFileName("C:\\evil\\..\\report.pdf")).toBe("report.pdf");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("a\u0000b\nc.txt")).toBe("abc.txt");
    expect(safeFileName("x".repeat(500)).length).toBe(120);
    expect(safeFileName("///")).toBe("file");
  });
});

describe("video references", () => {
  const course = "11111111-1111-4111-8111-111111111111";
  it("recognises uploaded-file references", () => {
    expect(isStorageVideo(`storage://course-videos/${course}/l/v.mp4`)).toBe(true);
    expect(isStorageVideo("https://x.com/v.mp4")).toBe(false);
    expect(storageVideoPath(`storage://course-videos/${course}/l/v.mp4`)).toBe(`${course}/l/v.mp4`);
    expect(storageVideoPath("https://x")).toBeNull();
  });

  it("accepts empty, https URLs and this course own uploads", () => {
    expect(normalizeVideoRef("", course)).toEqual({ ok: true, value: null });
    expect(normalizeVideoRef(null, course)).toEqual({ ok: true, value: null });
    expect(normalizeVideoRef("  https://cdn.example.com/v.mp4  ", course)).toEqual({ ok: true, value: "https://cdn.example.com/v.mp4" });
    const own = `storage://course-videos/${course}/lesson/v.mp4`;
    expect(normalizeVideoRef(own, course)).toEqual({ ok: true, value: own });
  });

  it("rejects http, javascript:, garbage, non-strings and other courses uploads or traversal", () => {
    for (const bad of ["http://x.com/v.mp4", "javascript:alert(1)", "data:video/mp4;base64,AAAA", "not a url", 42]) {
      expect(normalizeVideoRef(bad, course), String(bad)).toMatchObject({ ok: false });
    }
    expect(normalizeVideoRef("storage://course-videos/22222222-2222-4222-8222-222222222222/l/v.mp4", course)).toMatchObject({ ok: false });
    expect(normalizeVideoRef(`storage://course-videos/${course}/../other/v.mp4`, course)).toMatchObject({ ok: false });
  });
});

describe("formatFileSize", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
  });
});
