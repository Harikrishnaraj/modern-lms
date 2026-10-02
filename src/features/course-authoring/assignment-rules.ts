// Pure rules for the assignment builder and grading (F-206).

import { FILE_TYPE_KEYS, isFileTypeKey, type FileTypeKey } from "@/features/assignments/rules";

export const MAX_CRITERIA = 10;

export interface CriterionInput {
  title: string;
  description: string;
  maxPoints: number;
}

export interface AssignmentInput {
  title: string;
  instructions: string;
  /** "YYYY-MM-DDTHH:mm" in UTC, or "" for no deadline. */
  dueAt: string;
  maxPoints: number;
  allowLate: boolean;
  allowText: boolean;
  allowFile: boolean;
  maxFileMb: number;
  /** File types learners may upload (keys of FILE_TYPES). */
  allowedFileTypes: string[];
  criteria: CriterionInput[];
}

export interface AssignmentValue {
  title: string;
  instructions: string;
  dueAt: string | null; // ISO
  maxPoints: number;
  allowLate: boolean;
  allowText: boolean;
  allowFile: boolean;
  maxFileMb: number;
  allowedFileTypes: FileTypeKey[];
  criteria: CriterionInput[];
}

const DUE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

/** ISO string for a datetime-local value read as UTC; null when empty; undefined when invalid. */
export function parseDueAt(input: string): string | null | undefined {
  const v = input.trim();
  if (v === "") return null;
  const m = DUE.exec(v);
  if (!m) return undefined;
  const d = new Date(`${v}:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 16) !== v) return undefined;
  return d.toISOString();
}

/** ISO timestamp back to the datetime-local value (UTC). */
export function toDueInput(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 16) : "";
}

export function validateAssignment(
  input: AssignmentInput,
): { ok: true; value: AssignmentValue } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 1 || title.length > 200) errors.title = "Give the assignment a title of up to 200 characters.";
  const instructions = input.instructions.trim();
  if (instructions.length > 20000) errors.instructions = "Keep the instructions under 20,000 characters.";

  const dueAt = parseDueAt(input.dueAt);
  if (dueAt === undefined) errors.dueAt = "Enter a valid deadline.";

  const points = Number(input.maxPoints);
  if (!Number.isInteger(points) || points < 1 || points > 1000) errors.maxPoints = "Points must be a whole number from 1 to 1000.";
  const fileMb = Number(input.maxFileMb);
  if (!Number.isInteger(fileMb) || fileMb < 1 || fileMb > 10) errors.maxFileMb = "The file limit is a whole number of MB from 1 to 10.";
  if (!input.allowText && !input.allowFile) errors.allowText = "Learners must be able to submit text, a file, or both.";
  const types = Array.isArray(input.allowedFileTypes) ? input.allowedFileTypes : [];
  const allowedFileTypes = FILE_TYPE_KEYS.filter((k) => types.includes(k));
  if (allowedFileTypes.length === 0 || !types.every(isFileTypeKey)) errors.allowedFileTypes = "Choose at least one file type learners may submit.";

  const criteria: CriterionInput[] = [];
  if (input.criteria.length > MAX_CRITERIA) errors.criteria = `Use at most ${MAX_CRITERIA} rubric criteria.`;
  input.criteria.forEach((c, i) => {
    const ct = c.title.trim();
    const cp = Number(c.maxPoints);
    if (ct === "" || ct.length > 120) errors[`criteria.${i}.title`] = "Each criterion needs a title of up to 120 characters.";
    else if (c.description.trim().length > 500) errors[`criteria.${i}.description`] = "Keep the description under 500 characters.";
    else if (!Number.isInteger(cp) || cp < 1 || cp > 1000) errors[`criteria.${i}.maxPoints`] = "Points must be a whole number from 1 to 1000.";
    else criteria.push({ title: ct, description: c.description.trim(), maxPoints: cp });
  });
  if (!errors.criteria && criteria.length === input.criteria.length && criteria.length > 0 && !errors.maxPoints) {
    const sum = criteria.reduce((n, c) => n + c.maxPoints, 0);
    if (sum !== points) errors.criteria = `The rubric adds up to ${sum} points but the assignment is worth ${points}.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      instructions,
      dueAt: dueAt ?? null,
      maxPoints: points,
      allowLate: input.allowLate,
      allowText: input.allowText,
      allowFile: input.allowFile,
      maxFileMb: fileMb,
      allowedFileTypes,
      criteria,
    },
  };
}

export interface GradeInput {
  maxPoints: number;
  criteria: { id: string; title: string; maxPoints: number }[];
  /** Points per criterion id (used when the assignment has a rubric). */
  scores: Record<string, number>;
  /** Overall points (used when there is no rubric). */
  grade: number | null;
  feedback: string;
}

export type GradeCheck =
  | { ok: true; grade: number; feedback: string; scores: { criterion_id: string; title: string; points: number; max_points: number }[] }
  | { ok: false; error: string };

/** With a rubric the grade is the sum of the criterion scores; without one it is the entered number. */
export function validateGrade(input: GradeInput): GradeCheck {
  const feedback = input.feedback.trim();
  if (feedback.length > 10000) return { ok: false, error: "Keep the feedback under 10,000 characters." };

  if (input.criteria.length > 0) {
    const scores = [];
    let total = 0;
    for (const c of input.criteria) {
      const raw = input.scores[c.id];
      if (raw === undefined || !Number.isInteger(raw) || raw < 0 || raw > c.maxPoints) {
        return { ok: false, error: `Score "${c.title}" from 0 to ${c.maxPoints}.` };
      }
      total += raw;
      scores.push({ criterion_id: c.id, title: c.title, points: raw, max_points: c.maxPoints });
    }
    return { ok: true, grade: total, feedback, scores };
  }
  const g = input.grade;
  if (g === null || !Number.isInteger(g) || g < 0 || g > input.maxPoints) {
    return { ok: false, error: `Enter a whole number of points from 0 to ${input.maxPoints}.` };
  }
  return { ok: true, grade: g, feedback, scores: [] };
}
