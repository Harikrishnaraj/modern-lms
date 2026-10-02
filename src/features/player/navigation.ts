// Pure course-player navigation logic (no I/O), unit-tested in tests/unit/player-navigation.test.ts.

export interface PlayerLesson {
  id: string;
  title: string;
  type: "video" | "text" | "quiz" | "assignment" | "scorm";
  durationMinutes: number;
  isPreview: boolean;
}

export interface PlayerSection {
  id: string;
  title: string;
  lessons: PlayerLesson[];
}

export function flattenLessons(sections: PlayerSection[]): PlayerLesson[] {
  return sections.flatMap((s) => s.lessons);
}

export function adjacentLessons(
  sections: PlayerSection[],
  lessonId: string,
): { previous: PlayerLesson | null; next: PlayerLesson | null; index: number; total: number } {
  const all = flattenLessons(sections);
  const index = all.findIndex((l) => l.id === lessonId);
  if (index === -1) return { previous: null, next: null, index: -1, total: all.length };
  return {
    previous: all[index - 1] ?? null,
    next: all[index + 1] ?? null,
    index,
    total: all.length,
  };
}

/** Where "Continue" should land: the first lesson not yet completed, else the first lesson. */
export function resumeLessonId(
  sections: PlayerSection[],
  completedIds: ReadonlySet<string>,
): string | null {
  const all = flattenLessons(sections);
  return (all.find((l) => !completedIds.has(l.id)) ?? all[0])?.id ?? null;
}

/**
 * A lesson is locked for a viewer who is not enrolled unless it is a free preview.
 * Enrolled learners have no locks.
 */
export function isLessonLocked(lesson: PlayerLesson, enrolled: boolean): boolean {
  return !enrolled && !lesson.isPreview;
}
