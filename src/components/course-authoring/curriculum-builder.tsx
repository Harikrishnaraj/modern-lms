"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  FileText,
  GripVertical,
  HelpCircle,
  Package,
  Pencil,
  PlayCircle,
  Plus,
  SquarePen,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addLesson,
  addSection,
  deleteLesson,
  deleteSection,
  moveLessonToSection,
  renameLesson,
  renameSection,
  reorderLessons,
  reorderSections,
  type CurriculumResult,
} from "@/features/course-authoring/curriculum-actions";
import { LESSON_TYPES, type CurriculumSection, type LessonType } from "@/features/course-authoring/curriculum";
import { moveBy, moveItem } from "@/features/course-authoring/ordering";
import { cn } from "@/lib/utils/cn";

const TYPE_ICON: Record<LessonType, LucideIcon> = {
  video: PlayCircle,
  text: FileText,
  quiz: HelpCircle,
  assignment: ClipboardList,
  scorm: Package,
};

type Drag = { kind: "section"; id: string } | { kind: "lesson"; id: string; sectionId: string } | null;

const iconBtn =
  "inline-flex size-8 items-center justify-center rounded-control text-text-secondary hover:bg-border-subtle hover:text-text disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary";

export function CurriculumBuilder({
  courseId,
  sections,
  disabled = false,
}: {
  courseId: string;
  sections: CurriculumSection[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // section or lesson id being renamed
  const [confirming, setConfirming] = useState<string | null>(null); // id awaiting delete confirmation
  const drag = useRef<Drag>(null);
  const locked = busy || disabled;

  async function run(action: () => Promise<CurriculumResult>, success?: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) setMessage({ tone: "error", text: result.error });
      else {
        if (success) setMessage({ tone: "info", text: success });
        setEditing(null);
        setConfirming(null);
        router.refresh();
      }
    } catch {
      setMessage({ tone: "error", text: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const sectionIds = sections.map((s) => s.id);

  function onAddSection(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const title = String(new FormData(form).get("title") ?? "");
    void run(() => addSection(courseId, title), "Section added.").then(() => form.reset());
  }

  function onAddLesson(e: FormEvent<HTMLFormElement>, sectionId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    void run(
      () => addLesson(courseId, sectionId, { title: String(data.get("title") ?? ""), type: String(data.get("type") ?? "") }),
      "Lesson added.",
    ).then(() => form.reset());
  }

  function onRename(e: FormEvent<HTMLFormElement>, kind: "section" | "lesson", id: string) {
    e.preventDefault();
    const title = String(new FormData(e.currentTarget).get("title") ?? "");
    void run(() => (kind === "section" ? renameSection(courseId, id, title) : renameLesson(courseId, id, title)));
  }

  // ------------------------------------------------ drag & drop (mouse); buttons cover the keyboard
  function dropSection(targetId: string) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind !== "section" || d.id === targetId) return;
    const next = moveItem(sectionIds, sectionIds.indexOf(d.id), sectionIds.indexOf(targetId));
    void run(() => reorderSections(courseId, next));
  }

  function dropLesson(section: CurriculumSection, targetId: string) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.kind !== "lesson" || d.sectionId !== section.id || d.id === targetId) return;
    const ids = section.lessons.map((l) => l.id);
    void run(() => reorderLessons(courseId, section.id, moveItem(ids, ids.indexOf(d.id), ids.indexOf(targetId))));
  }

  return (
    <div className="space-y-6">
      <div aria-live="polite" className="min-h-6">
        {message && (
          <p
            role={message.tone === "error" ? "alert" : "status"}
            className={cn("text-sm font-medium", message.tone === "error" ? "text-danger-text" : "text-success-text")}
          >
            {message.text}
          </p>
        )}
      </div>

      {sections.length === 0 && (
        <p className="rounded-card border border-dashed border-border bg-surface p-6 text-sm text-text-secondary">
          Your curriculum is empty. Add a first section, then add lessons, quizzes and assignments to it.
        </p>
      )}

      <ol className="space-y-4">
        {sections.map((section, si) => {
          const lessonIds = section.lessons.map((l) => l.id);
          return (
            <li
              key={section.id}
              draggable={!locked && editing !== section.id}
              onDragStart={(e) => {
                if (e.target !== e.currentTarget) return; // lesson drags are handled by the lesson row
                drag.current = { kind: "section", id: section.id };
              }}
              onDragOver={(e) => drag.current?.kind === "section" && e.preventDefault()}
              onDrop={() => dropSection(section.id)}
              className="rounded-card border border-border bg-surface"
            >
              <section aria-labelledby={`sec-${section.id}`}>
                <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle p-3">
                  <GripVertical className="size-4 shrink-0 cursor-grab text-text-muted" aria-hidden="true" />
                  {editing === section.id ? (
                    <form onSubmit={(e) => onRename(e, "section", section.id)} className="flex min-w-0 flex-1 basis-56 flex-wrap gap-2">
                      <input
                        name="title"
                        aria-label="Section title"
                        defaultValue={section.title}
                        maxLength={200}
                        autoFocus
                        className="h-9 flex-1 rounded-input border border-border bg-surface px-3 text-sm"
                      />
                      <Button type="submit" size="sm" disabled={locked}>Save</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </form>
                  ) : (
                    <h2 id={`sec-${section.id}`} className="min-w-0 flex-1 basis-40 font-semibold">
                      {section.title}
                    </h2>
                  )}
                  <div className={cn("flex flex-wrap items-center", editing === section.id && "hidden")}>
                    <button type="button" className={iconBtn} aria-label={`Rename section ${section.title}`} disabled={locked} onClick={() => setEditing(section.id)}>
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button type="button" className={iconBtn} aria-label={`Move section ${section.title} up`} disabled={locked || si === 0} onClick={() => void run(() => reorderSections(courseId, moveBy(sectionIds, section.id, -1)))}>
                      <ArrowUp className="size-4" aria-hidden="true" />
                    </button>
                    <button type="button" className={iconBtn} aria-label={`Move section ${section.title} down`} disabled={locked || si === sections.length - 1} onClick={() => void run(() => reorderSections(courseId, moveBy(sectionIds, section.id, 1)))}>
                      <ArrowDown className="size-4" aria-hidden="true" />
                    </button>
                    {confirming === section.id ? (
                      <span role="alertdialog" aria-label={`Confirm deleting section ${section.title}`} className="ml-1 inline-flex items-center gap-1">
                        <Button type="button" size="sm" variant="destructive" disabled={locked} onClick={() => void run(() => deleteSection(courseId, section.id), "Section deleted.")}>
                          Delete section and its {section.lessons.length} {section.lessons.length === 1 ? "lesson" : "lessons"}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep</Button>
                      </span>
                    ) : (
                      <button type="button" className={iconBtn} aria-label={`Delete section ${section.title}`} disabled={locked} onClick={() => setConfirming(section.id)}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                <ul className="divide-y divide-border-subtle">
                  {section.lessons.length === 0 && (
                    <li className="p-3 text-sm text-text-secondary">No lessons in this section yet.</li>
                  )}
                  {section.lessons.map((lesson, li) => {
                    const Icon = TYPE_ICON[lesson.type];
                    return (
                      <li
                        key={lesson.id}
                        draggable={!locked && editing !== lesson.id}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          drag.current = { kind: "lesson", id: lesson.id, sectionId: section.id };
                        }}
                        onDragOver={(e) => {
                          const d = drag.current;
                          if (d?.kind === "lesson" && d.sectionId === section.id) e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.stopPropagation();
                          dropLesson(section, lesson.id);
                        }}
                        className="flex flex-wrap items-center gap-2 p-3 sm:pl-6"
                      >
                        <GripVertical className="size-4 shrink-0 cursor-grab text-text-muted" aria-hidden="true" />
                        <Icon className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                        {editing === lesson.id ? (
                          <form onSubmit={(e) => onRename(e, "lesson", lesson.id)} className="flex min-w-0 flex-1 basis-56 flex-wrap gap-2">
                            <input
                              name="title"
                              aria-label="Lesson title"
                              defaultValue={lesson.title}
                              maxLength={200}
                              autoFocus
                              className="h-9 flex-1 rounded-input border border-border bg-surface px-3 text-sm"
                            />
                            <Button type="submit" size="sm" disabled={locked}>Save</Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                          </form>
                        ) : (
                          <span className="min-w-0 flex-1 basis-40 text-sm">
                            <span data-lesson-title>{lesson.title}</span>
                            <span className="ml-2 text-xs text-text-secondary">
                              {LESSON_TYPES.find((t) => t.value === lesson.type)?.label}
                            </span>
                          </span>
                        )}
                        <div className={cn("flex flex-wrap items-center", editing === lesson.id && "hidden")}>
                          {sections.length > 1 && (
                            <select
                              aria-label={`Move lesson ${lesson.title} to another section`}
                              disabled={locked}
                              value=""
                              onChange={(e) => e.target.value && void run(() => moveLessonToSection(courseId, lesson.id, e.target.value), "Lesson moved.")}
                              className="mr-1 h-8 max-w-32 rounded-input border border-border bg-surface px-1 text-xs"
                            >
                              <option value="">Move to…</option>
                              {sections.filter((s) => s.id !== section.id).map((s) => (
                                <option key={s.id} value={s.id}>{s.title}</option>
                              ))}
                            </select>
                          )}
                          <Link
                            href={`/instructor/courses/${courseId}/lessons/${lesson.id}`}
                            className={iconBtn}
                            aria-label={`Edit content of lesson ${lesson.title}`}
                          >
                            <SquarePen className="size-4" aria-hidden="true" />
                          </Link>
                          <button type="button" className={iconBtn} aria-label={`Rename lesson ${lesson.title}`} disabled={locked} onClick={() => setEditing(lesson.id)}>
                            <Pencil className="size-4" aria-hidden="true" />
                          </button>
                          <button type="button" className={iconBtn} aria-label={`Move lesson ${lesson.title} up`} disabled={locked || li === 0} onClick={() => void run(() => reorderLessons(courseId, section.id, moveBy(lessonIds, lesson.id, -1)))}>
                            <ArrowUp className="size-4" aria-hidden="true" />
                          </button>
                          <button type="button" className={iconBtn} aria-label={`Move lesson ${lesson.title} down`} disabled={locked || li === section.lessons.length - 1} onClick={() => void run(() => reorderLessons(courseId, section.id, moveBy(lessonIds, lesson.id, 1)))}>
                            <ArrowDown className="size-4" aria-hidden="true" />
                          </button>
                          {confirming === lesson.id ? (
                            <span role="alertdialog" aria-label={`Confirm deleting lesson ${lesson.title}`} className="ml-1 inline-flex items-center gap-1">
                              <Button type="button" size="sm" variant="destructive" disabled={locked} onClick={() => void run(() => deleteLesson(courseId, lesson.id), "Lesson deleted.")}>
                                Delete lesson
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep</Button>
                            </span>
                          ) : (
                            <button type="button" className={iconBtn} aria-label={`Delete lesson ${lesson.title}`} disabled={locked} onClick={() => setConfirming(lesson.id)}>
                              <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <form onSubmit={(e) => onAddLesson(e, section.id)} className="flex flex-wrap items-end gap-2 border-t border-border-subtle p-3">
                  <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium">
                    New lesson title
                    <input name="title" required maxLength={200} disabled={locked} className="h-9 rounded-input border border-border bg-surface px-3 text-sm font-normal" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium">
                    Type
                    <select name="type" defaultValue="video" disabled={locked} className="h-9 rounded-input border border-border bg-surface px-2 text-sm font-normal">
                      {LESSON_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                  <Button type="submit" size="sm" variant="secondary" disabled={locked}>
                    <Plus className="size-4" aria-hidden="true" />
                    Add lesson<span className="sr-only"> to {section.title}</span>
                  </Button>
                </form>
              </section>
            </li>
          );
        })}
      </ol>

      <form onSubmit={onAddSection} className="flex max-w-xl flex-wrap items-end gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-medium">
          New section title
          <input name="title" required maxLength={200} disabled={locked} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal" />
        </label>
        <Button type="submit" disabled={locked}>
          <Plus className="size-4" aria-hidden="true" />
          Add section
        </Button>
      </form>
    </div>
  );
}
