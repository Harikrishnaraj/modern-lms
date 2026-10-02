"use client";

import { useId, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { AttachableLesson } from "@/features/instructor/resources";
import { attachResourceAction, listAttachableLessonsAction } from "@/features/instructor/resource-actions";
import { Button } from "@/components/ui/button";

export interface AttachCourseOption {
  id: string;
  title: string;
}

export function ResourceAttachControl({ resourceId, courses }: { resourceId: string; courses: AttachCourseOption[] }) {
  const [courseId, setCourseId] = useState("");
  const [lessons, setLessons] = useState<AttachableLesson[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attached, setAttached] = useState(false);
  const [isPending, startTransition] = useTransition();
  const courseSelectId = useId();
  const lessonSelectId = useId();

  function onCourseChange(next: string) {
    setCourseId(next);
    setLessonId("");
    setLessons([]);
    setAttached(false);
    setErrorMsg(null);
    if (!next) return;
    startTransition(async () => {
      setLessons(await listAttachableLessonsAction(next));
    });
  }

  function onAttach() {
    if (!courseId || !lessonId) return;
    setErrorMsg(null);
    setAttached(false);
    startTransition(async () => {
      const res = await attachResourceAction(resourceId, courseId, lessonId);
      if (!res.ok) {
        setErrorMsg(res.error);
      } else {
        setAttached(true);
        setLessonId("");
      }
    });
  }

  if (courses.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-text-secondary">Attach to a lesson</p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={courseSelectId} className="sr-only">
          Course
        </label>
        <select
          id={courseSelectId}
          value={courseId}
          onChange={(e) => onCourseChange(e.target.value)}
          className="rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Choose a course…</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>

        <label htmlFor={lessonSelectId} className="sr-only">
          Lesson
        </label>
        <select
          id={lessonSelectId}
          value={lessonId}
          disabled={!courseId || lessons.length === 0}
          onChange={(e) => setLessonId(e.target.value)}
          className="rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">{courseId && lessons.length === 0 ? "No lessons yet" : "Choose a lesson…"}</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.sectionTitle} · {l.title}
            </option>
          ))}
        </select>

        <Button type="button" size="sm" variant="secondary" disabled={!lessonId || isPending} onClick={onAttach}>
          {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Attach
        </Button>
      </div>
      {errorMsg && (
        <p role="alert" className="text-xs text-danger-text">
          {errorMsg}
        </p>
      )}
      {attached && <p className="text-xs text-success-text">Attached to the lesson.</p>}
    </div>
  );
}
