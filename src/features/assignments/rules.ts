// Pure assignment rules (F-108): status for the learner, and validation of a submitted file.

import { safeFileName } from "@/features/course-authoring/uploads";

/**
 * Every file type an instructor can allow for a submission (T-114). Mirrors the private
 * submissions bucket allow-list and the database's assignment_file_ext() mapping.
 */
export const FILE_TYPES = {
  pdf: { label: "PDF", mime: "application/pdf", accept: ".pdf" },
  doc: { label: "DOC", mime: "application/msword", accept: ".doc" },
  docx: { label: "DOCX", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", accept: ".docx" },
  ppt: { label: "PPT", mime: "application/vnd.ms-powerpoint", accept: ".ppt" },
  pptx: { label: "PPTX", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", accept: ".pptx" },
  zip: { label: "ZIP", mime: "application/zip", accept: ".zip" },
  txt: { label: "TXT", mime: "text/plain", accept: ".txt" },
  png: { label: "PNG", mime: "image/png", accept: ".png" },
  jpg: { label: "JPEG", mime: "image/jpeg", accept: ".jpg,.jpeg" },
} as const;

export type FileTypeKey = keyof typeof FILE_TYPES;
export const FILE_TYPE_KEYS = Object.keys(FILE_TYPES) as FileTypeKey[];

/** What every assignment accepted before per-assignment types existed (the column default). */
export const LEGACY_FILE_TYPES: FileTypeKey[] = ["pdf", "docx", "zip", "txt", "png", "jpg"];
/** The Assignments page starts new assignments with documents only. */
export const DEFAULT_FILE_TYPES: FileTypeKey[] = ["pdf", "doc", "docx"];

/** MIME type -> file type key, for every type any assignment may accept. */
export const SUBMISSION_TYPES: Record<string, FileTypeKey> = Object.fromEntries(
  FILE_TYPE_KEYS.map((k) => [FILE_TYPES[k].mime, k]),
) as Record<string, FileTypeKey>;

export const isFileTypeKey = (v: unknown): v is FileTypeKey => typeof v === "string" && v in FILE_TYPES;

/** "PDF, DOC or DOCX" */
export function fileTypeList(keys: readonly FileTypeKey[]): string {
  const labels = FILE_TYPE_KEYS.filter((k) => keys.includes(k)).map((k) => FILE_TYPES[k].label);
  return labels.length <= 1 ? (labels[0] ?? "") : `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;
}

/** The `accept` attribute for a file input limited to these types. */
export function acceptFor(keys: readonly FileTypeKey[]): string {
  return FILE_TYPE_KEYS.filter((k) => keys.includes(k)).map((k) => FILE_TYPES[k].accept).join(",");
}

export const MAX_TEXT_LENGTH = 20000;

export interface AssignmentRules {
  dueAt: string | null;
  allowLate: boolean;
  allowText: boolean;
  allowFile: boolean;
  maxFileMb: number;
  allowedFileTypes: FileTypeKey[];
}

export interface SubmissionState {
  status: "submitted" | "graded";
  isLate: boolean;
}

export type AssignmentStatus =
  | "open" // nothing submitted, can submit
  | "submitted" // submitted, can still replace until the deadline
  | "graded" // locked
  | "overdue" // nothing submitted, deadline passed, no late submissions
  | "closed"; // submitted, deadline passed (locked)

/** Where the learner stands. The database enforces the same rules when submitting. */
export function assignmentStatus(a: AssignmentRules, submission: SubmissionState | null, now: Date): AssignmentStatus {
  const pastDue = a.dueAt !== null && now.getTime() > new Date(a.dueAt).getTime();
  if (submission?.status === "graded") return "graded";
  if (submission) return pastDue && !a.allowLate ? "closed" : "submitted";
  return pastDue && !a.allowLate ? "overdue" : "open";
}

/** Can the learner submit or replace right now? */
export const canSubmit = (status: AssignmentStatus) => status === "open" || status === "submitted";

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  open: "To do",
  submitted: "Submitted",
  graded: "Graded",
  overdue: "Overdue",
  closed: "Submitted (closed)",
};

export interface FileCheckInput {
  name: unknown;
  size: unknown;
  type: unknown;
}

export type FileCheck = { ok: true; ext: string; safeName: string; type: string } | { ok: false; error: string };

export function validateSubmissionFile(
  a: Pick<AssignmentRules, "allowFile" | "maxFileMb" | "allowedFileTypes">,
  f: FileCheckInput,
): FileCheck {
  if (!a.allowFile) return { ok: false, error: "This assignment does not accept files." };
  if (typeof f.name !== "string" || f.name.trim() === "") return { ok: false, error: "Choose a file." };
  if (typeof f.type !== "string" || !(f.type in SUBMISSION_TYPES) || !a.allowedFileTypes.includes(SUBMISSION_TYPES[f.type])) {
    return { ok: false, error: `That file type is not allowed. Use ${fileTypeList(a.allowedFileTypes)}.` };
  }
  if (typeof f.size !== "number" || !Number.isFinite(f.size) || f.size <= 0) return { ok: false, error: "The file is empty." };
  if (f.size > a.maxFileMb * 1024 * 1024) return { ok: false, error: `The file must be ${a.maxFileMb} MB or smaller.` };
  return { ok: true, ext: SUBMISSION_TYPES[f.type], safeName: safeFileName(f.name), type: f.type };
}

/** Text answer check against the assignment rules; returns an error or null. */
export function validateTextAnswer(a: Pick<AssignmentRules, "allowText">, text: string): string | null {
  const t = text.trim();
  if (t === "") return null;
  if (!a.allowText) return "This assignment does not accept a written answer.";
  if (t.length > MAX_TEXT_LENGTH) return `Keep the answer under ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters.`;
  return null;
}

/** Maps a submit_assignment result code to a message. */
export function submitErrorMessage(result: string): string {
  switch (result) {
    case "not_found":
      return "This assignment is not available.";
    case "not_enrolled":
      return "You need to be enrolled in this course to submit.";
    case "closed":
      return "The deadline has passed and late submissions are not accepted.";
    case "graded":
      return "This submission has been graded and can no longer be changed.";
    case "empty":
      return "Add a written answer or attach a file.";
    case "text_not_allowed":
      return "This assignment does not accept a written answer.";
    case "file_not_allowed":
      return "This assignment does not accept files.";
    case "file_type_not_allowed":
      return "That file type is not accepted for this assignment.";
    case "file_too_large":
      return "That file is too large for this assignment.";
    default:
      return "We could not submit your work. Please try again.";
  }
}
