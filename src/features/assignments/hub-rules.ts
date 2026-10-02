// Pure rules for the instructor Assignments page (T-114, F-206, ADR-030). Unit-tested.

import { parseDueAt } from "@/features/course-authoring/assignment-rules";
import { safeFileName } from "@/features/course-authoring/uploads";
import { FILE_TYPE_KEYS, isFileTypeKey, type FileTypeKey } from "./rules";

// ---- reference files --------------------------------------------------------------------------

/** Reference files an instructor may attach. Mirrors the assignment-resources bucket allow-list. */
export const RESOURCE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
};
export const RESOURCE_ACCEPT = ".pdf,.doc,.docx,.ppt,.pptx,.zip";
export const MAX_RESOURCE_BYTES = 50 * 1024 * 1024;
export const MAX_RESOURCES = 5;

export interface ResourceFile {
  path: string;
  name: string;
  size: number;
  type: string;
}

export type ResourceCheck = { ok: true; ext: string; safeName: string; type: string } | { ok: false; error: string };

export function validateResourceFile(f: { name: unknown; size: unknown; type: unknown }): ResourceCheck {
  if (typeof f.name !== "string" || f.name.trim() === "") return { ok: false, error: "Choose a file." };
  if (typeof f.type !== "string" || !(f.type in RESOURCE_TYPES)) {
    return { ok: false, error: "Reference files must be PDF, DOC, DOCX, PPT, PPTX or ZIP." };
  }
  if (typeof f.size !== "number" || !Number.isFinite(f.size) || f.size <= 0) return { ok: false, error: "The file is empty." };
  if (f.size > MAX_RESOURCE_BYTES) return { ok: false, error: "Reference files must be 50 MB or smaller." };
  return { ok: true, ext: RESOURCE_TYPES[f.type], safeName: safeFileName(f.name), type: f.type };
}

/** A reference-file object key the given user was issued: "<userId>/<name>", no traversal. */
export function isOwnResourcePath(userId: string, path: unknown): path is string {
  return typeof path === "string" && path.startsWith(`${userId}/`) && !path.includes("..") && path.length > userId.length + 1;
}

// ---- instructions (rich text) -----------------------------------------------------------------

const TAG = /<\/?[a-z][^>]*>/i;

/** Rich-text instructions are HTML; older assignments stored plain text. */
export function looksLikeHtml(s: string): boolean {
  return TAG.test(s);
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain-text instructions as editor HTML (paragraphs, line breaks); HTML is returned as-is. */
export function instructionsToHtml(s: string): string {
  if (s.trim() === "" || looksLikeHtml(s)) return s;
  return s
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Sanitized editor output as stored HTML. Text typed into an empty editor has no block element,
 * so it is wrapped in a paragraph (it is already entity-escaped by the sanitizer).
 */
export function normalizeInstructionsHtml(sanitized: string): string {
  const s = sanitized.trim();
  return s === "" || looksLikeHtml(s) ? s : `<p>${s}</p>`;
}

/** Visible text of (sanitized) HTML, for "is it empty" and length checks. */
export function htmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z#0-9]+;/gi, "x")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- the create form --------------------------------------------------------------------------

export interface HubAssignmentInput {
  courseId: string;
  title: string;
  /** Sanitized HTML. */
  instructions: string;
  /** "YYYY-MM-DDTHH:mm" in UTC, or "" for no deadline (the instructor's choice). */
  dueAt: string;
  maxPoints: number;
  fileTypes: string[];
  resources: ResourceFile[];
}

export interface HubAssignmentValue {
  courseId: string;
  title: string;
  instructions: string;
  dueAt: string | null;
  maxPoints: number;
  fileTypes: FileTypeKey[];
  resources: ResourceFile[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateHubAssignment(
  input: HubAssignmentInput,
): { ok: true; value: HubAssignmentValue } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  if (typeof input.courseId !== "string" || !UUID.test(input.courseId)) errors.courseId = "Choose a course.";

  const title = (typeof input.title === "string" ? input.title : "").trim().replace(/\s+/g, " ");
  if (title.length < 1 || title.length > 200) errors.title = "Give the assignment a title of up to 200 characters.";

  const instructions = (typeof input.instructions === "string" ? input.instructions : "").trim();
  if (htmlText(instructions) === "") errors.instructions = "Describe what learners should hand in.";
  else if (instructions.length > 20000) errors.instructions = "Keep the description under 20,000 characters.";

  const dueAt = parseDueAt(typeof input.dueAt === "string" ? input.dueAt : "");
  if (dueAt === undefined) errors.dueAt = "Enter a valid due date, or leave it empty.";

  const points = Number(input.maxPoints);
  if (!Number.isInteger(points) || points < 1 || points > 1000) errors.maxPoints = "Points must be a whole number from 1 to 1000.";

  const types = Array.isArray(input.fileTypes) ? input.fileTypes : [];
  const fileTypes = FILE_TYPE_KEYS.filter((k) => types.includes(k));
  if (fileTypes.length === 0 || !types.every(isFileTypeKey)) errors.fileTypes = "Choose at least one file type learners may submit.";

  const resources = Array.isArray(input.resources) ? input.resources : [];
  if (resources.length > MAX_RESOURCES) errors.resources = `Attach at most ${MAX_RESOURCES} reference files.`;
  else {
    for (const r of resources) {
      const check = validateResourceFile(r);
      if (!check.ok) {
        errors.resources = check.error;
        break;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      courseId: input.courseId,
      title,
      instructions,
      dueAt: dueAt ?? null,
      maxPoints: points,
      fileTypes,
      resources: resources.map((r) => ({ ...r, name: safeFileName(r.name) })),
    },
  };
}

// ---- the all-courses table --------------------------------------------------------------------

export type OverviewStatus = "active" | "closed" | "draft" | "in_review";

export const OVERVIEW_STATUS_LABEL: Record<OverviewStatus, string> = {
  active: "Active",
  closed: "Closed",
  draft: "Draft",
  in_review: "In review",
};

/**
 * Live (published) assignments are Active until their deadline passes without late work, then
 * Closed. Drafts are not visible to learners yet; review states are locked.
 */
export function overviewStatus(r: { versionStatus: string; dueAt: string | null; allowLate: boolean }, now: Date): OverviewStatus {
  if (r.versionStatus === "published") {
    const pastDue = r.dueAt !== null && now.getTime() > new Date(r.dueAt).getTime();
    return pastDue && !r.allowLate ? "closed" : "active";
  }
  if (r.versionStatus === "draft" || r.versionStatus === "changes_requested") return "draft";
  return "in_review";
}

/** Case-insensitive match on title or course. */
export function matchesSearch(r: { title: string; courseTitle: string }, q: string): boolean {
  const needle = q.trim().toLowerCase();
  return needle === "" || r.title.toLowerCase().includes(needle) || r.courseTitle.toLowerCase().includes(needle);
}

/** Share of enrolled learners who submitted, 0–100 (0 when nobody is enrolled). */
export function submissionPercent(submissions: number, enrolled: number): number {
  if (enrolled <= 0) return 0;
  return Math.min(100, Math.round((submissions / enrolled) * 100));
}
