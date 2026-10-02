// Upload rules for lesson media (pure, unit-tested). The buckets enforce the same limits and MIME
// types server-side; this gives a clear error before a signed URL is ever issued.

export type MediaKind = "video" | "asset";

export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm" };
export const ASSET_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

export interface UploadRequest {
  name: unknown;
  size: unknown;
  type: unknown;
}

export type UploadCheck = { ok: true; ext: string; safeName: string; type: string } | { ok: false; error: string };

/** A display/file name with no path parts or control characters, capped in length. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 120) || "file";
}

export function validateUpload(kind: MediaKind, req: UploadRequest): UploadCheck {
  const types = kind === "video" ? VIDEO_TYPES : ASSET_TYPES;
  const max = kind === "video" ? MAX_VIDEO_BYTES : MAX_ASSET_BYTES;
  if (typeof req.name !== "string" || req.name.trim() === "") return { ok: false, error: "Choose a file." };
  if (typeof req.type !== "string" || !(req.type in types)) {
    return {
      ok: false,
      error: kind === "video" ? "Videos must be MP4 or WebM." : "That file type is not allowed. Use PDF, Office, ZIP, TXT, PNG or JPEG.",
    };
  }
  if (typeof req.size !== "number" || !Number.isFinite(req.size) || req.size <= 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (req.size > max) {
    return { ok: false, error: `The file must be ${Math.round(max / (1024 * 1024))} MB or smaller.` };
  }
  return { ok: true, ext: types[req.type], safeName: safeFileName(req.name), type: req.type };
}

/**
 * Sniffs the first bytes of an uploaded file against the container magic bytes for its claimed
 * extension. The browser-reported `type`/extension (checked in `validateUpload`) is trivially
 * spoofable — renaming a text file to `.mp4` makes the browser report `video/mp4` — so this is
 * the only check that the object we are about to attach is actually a playable container.
 */
export function looksLikeVideo(head: Uint8Array, ext: string): boolean {
  if (ext === "webm") {
    // WebM/Matroska EBML header.
    return head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  }
  // MP4/ISO-BMFF: a 4-byte box size followed by an ASCII "ftyp" box type at offset 4.
  return (
    head.length >= 8 &&
    head[4] === 0x66 && // f
    head[5] === 0x74 && // t
    head[6] === 0x79 && // y
    head[7] === 0x70 // p
  );
}

// ---- video reference stored in lessons.video_url ------------------------------------------------
// Either an external https URL, or "storage://course-videos/<path>" for an uploaded file.

export const STORAGE_VIDEO_PREFIX = "storage://course-videos/";

export function isStorageVideo(ref: string | null | undefined): boolean {
  return typeof ref === "string" && ref.startsWith(STORAGE_VIDEO_PREFIX);
}

export function storageVideoPath(ref: string): string | null {
  return isStorageVideo(ref) ? ref.slice(STORAGE_VIDEO_PREFIX.length) : null;
}

/** Accepts "" (no video), an https URL, or an uploaded-file reference belonging to this course. */
export function normalizeVideoRef(input: unknown, courseId: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (input === null || input === undefined || input === "") return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, error: "Enter a valid video link." };
  const v = input.trim();
  if (v === "") return { ok: true, value: null };
  if (isStorageVideo(v)) {
    const path = storageVideoPath(v)!;
    // Only files uploaded for THIS course may be attached (no pointing at someone else's video).
    return path.startsWith(`${courseId}/`) && !path.includes("..")
      ? { ok: true, value: v }
      : { ok: false, error: "That uploaded video does not belong to this course." };
  }
  try {
    const url = new URL(v);
    if (url.protocol !== "https:") return { ok: false, error: "Video links must start with https://" };
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, error: "Enter a valid video link." };
  }
}
