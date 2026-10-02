export type ScormLessonStatus =
  | "passed" | "completed" | "failed" | "incomplete" | "browsed" | "not attempted" | "unknown";

export interface SeedOptions {
  version: "1.2" | "2004";
  learnerName: string;
  learnerId: string;
  resume: boolean;
  savedCmi: Record<string, string>;
}

/** Initial CMI key/value seed for a fresh iframe load: resumes from savedCmi when present. */
export function seedCmi({ version, learnerName, learnerId, resume, savedCmi }: SeedOptions): Record<string, string> {
  const entryKey = version === "1.2" ? "cmi.core.entry" : "cmi.entry";
  if (Object.keys(savedCmi).length > 0) {
    return { ...savedCmi, [entryKey]: resume ? "resume" : "ab-initio" };
  }
  if (version === "1.2") {
    return {
      "cmi.core.student_name": learnerName,
      "cmi.core.student_id": learnerId,
      "cmi.core.lesson_status": "not attempted",
      "cmi.core.score.raw": "",
      "cmi.core.score.min": "",
      "cmi.core.score.max": "100",
      "cmi.suspend_data": "",
      [entryKey]: "ab-initio",
    };
  }
  return {
    "cmi.learner_name": learnerName,
    "cmi.learner_id": learnerId,
    "cmi.completion_status": "not attempted",
    "cmi.success_status": "unknown",
    "cmi.score.raw": "",
    "cmi.score.min": "",
    "cmi.score.max": "100",
    "cmi.score.scaled": "",
    "cmi.suspend_data": "",
    [entryKey]: "ab-initio",
  };
}

/** Normalizes a reported lesson/completion status into one comparable value across both versions. */
export function deriveLessonStatus(cmi: Record<string, string>): ScormLessonStatus {
  const status1_2 = cmi["cmi.core.lesson_status"];
  if (status1_2) return status1_2 as ScormLessonStatus;

  const success = cmi["cmi.success_status"];
  if (success === "passed") return "passed";
  if (success === "failed") return "failed";
  const completion = cmi["cmi.completion_status"];
  if (completion === "completed") return "completed";
  if (completion === "incomplete") return "incomplete";
  return "unknown";
}

/** Whether the reported status means the lesson should count as done (F-410's "reports completion"). */
export function isDone(status: ScormLessonStatus): boolean {
  return status === "passed" || status === "completed";
}

export function deriveScoreRaw(cmi: Record<string, string>): number | null {
  const raw = cmi["cmi.core.score.raw"] ?? cmi["cmi.score.raw"];
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function deriveSuspendData(cmi: Record<string, string>): string {
  return cmi["cmi.suspend_data"] ?? "";
}

/** Escapes a JSON payload for safe embedding inside an inline <script> tag. */
export function escapeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003C").replace(/-->/g, "--\\>");
}
