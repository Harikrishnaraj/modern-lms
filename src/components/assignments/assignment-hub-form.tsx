"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { RichTextEditor } from "@/components/course-authoring/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { AssignableCourse } from "@/features/assignments/hub";
import { createCourseAssignment, discardAssignmentResourceUpload } from "@/features/assignments/hub-actions";
import type { ResourceFile } from "@/features/assignments/hub-rules";
import { DEFAULT_FILE_TYPES, type FileTypeKey } from "@/features/assignments/rules";
import { FileTypePicker } from "./file-type-picker";
import { ReferenceFilesField } from "./reference-files-field";

interface FormState {
  courseId: string;
  title: string;
  instructions: string;
  dueAt: string;
  maxPoints: string;
  fileTypes: FileTypeKey[];
  resources: ResourceFile[];
}

const EMPTY: FormState = { courseId: "", title: "", instructions: "", dueAt: "", maxPoints: "100", fileTypes: DEFAULT_FILE_TYPES, resources: [] };

const STATE_NOTE: Record<AssignableCourse["state"], string> = {
  live: "This course is live: enrolled learners see the assignment as soon as you assign it.",
  draft: "This course is not published yet: learners see the assignment once it is published.",
  locked: "This course is in review, so new assignments can be added once the review is finished.",
};

/** "Assign New Assignment" (T-114). Due date is optional — whether to set one is the instructor's call. */
export function AssignmentHubForm({ courses }: { courses: AssignableCourse[] }) {
  const router = useRouter();
  const [v, setV] = useState<FormState>(EMPTY);
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const set = <K extends keyof FormState>(k: K, value: FormState[K]) => {
    setV((prev) => ({ ...prev, [k]: value }));
    // Changing a field clears its stale error (e.g. "Choose a course." after a course is chosen).
    setErrors((prev) => {
      if (!(k in prev)) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };
  const course = courses.find((c) => c.id === v.courseId);

  function reset() {
    setV(EMPTY);
    setErrors({});
    setEditorKey((k) => k + 1);
  }

  async function onCancel() {
    const uploads = v.resources;
    reset();
    setNotice(null);
    await Promise.all(uploads.map((r) => discardAssignmentResourceUpload(r.path)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setNotice(null);
    const r = await createCourseAssignment({ ...v, maxPoints: Number(v.maxPoints) });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      setNotice({ tone: "error", text: r.error });
      return;
    }
    const title = v.title.trim();
    reset();
    setNotice({
      tone: "ok",
      text: r.live ? `"${title}" was assigned. Enrolled learners can see it now.` : `"${title}" was added. Learners see it once the course is published.`,
    });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby="new-assignment-heading" className="space-y-5 rounded-card border border-border bg-surface p-5">
      <h2 id="new-assignment-heading" className="text-lg font-semibold">
        Assign New Assignment
      </h2>
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={
            notice.tone === "error"
              ? "flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text"
              : "flex items-start gap-2 rounded-card border border-success bg-success-light p-3 text-sm text-success-text"
          }
        >
          {notice.tone === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {notice.text}
        </div>
      )}
      <fieldset disabled={busy} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Select
              label="Course *"
              placeholder="Select course"
              options={courses.map((c) => ({ value: c.id, label: c.state === "locked" ? `${c.title} (in review)` : c.title }))}
              value={v.courseId}
              onChange={(e) => set("courseId", e.target.value)}
              aria-invalid={errors.courseId ? true : undefined}
              required
            />
            {errors.courseId ? (
              <p role="alert" className="text-xs text-danger-text">
                {errors.courseId}
              </p>
            ) : (
              course && (
                <p className="flex items-start gap-1 text-xs text-text-secondary">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {STATE_NOTE[course.state]}
                </p>
              )
            )}
          </div>
          <Input
            label="Assignment Title *"
            placeholder="Enter assignment title"
            value={v.title}
            onChange={(e) => set("title", e.target.value)}
            maxLength={200}
            error={errors.title}
            required
          />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-text">Description *</span>
          <RichTextEditor
            key={editorKey}
            initialHtml=""
            onChange={(html) => set("instructions", html)}
            disabled={busy}
            label="Description"
            tools={["bold", "italic", "underline", "ul", "ol", "link"]}
            minHeight="min-h-32"
          />
          {errors.instructions && (
            <p role="alert" className="text-xs text-danger-text">
              {errors.instructions}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Due date (optional)"
            type="datetime-local"
            value={v.dueAt}
            onChange={(e) => set("dueAt", e.target.value)}
            error={errors.dueAt}
            hint="UTC. Leave empty for no deadline."
          />
          <Input
            label="Points"
            type="number"
            min={1}
            max={1000}
            value={v.maxPoints}
            onChange={(e) => set("maxPoints", e.target.value)}
            error={errors.maxPoints}
          />
          <FileTypePicker value={v.fileTypes} onChange={(next) => set("fileTypes", next)} disabled={busy} error={errors.fileTypes} />
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-text">Attach Reference Files (Optional)</span>
          <ReferenceFilesField
            files={v.resources.map((r) => ({ key: r.path, name: r.name, size: r.size }))}
            onUploaded={async (file) => {
              setV((prev) => ({ ...prev, resources: [...prev.resources, file] }));
              return null;
            }}
            onRemove={async (path) => {
              setV((prev) => ({ ...prev, resources: prev.resources.filter((r) => r.path !== path) }));
              await discardAssignmentResourceUpload(path);
            }}
            disabled={busy}
            error={errors.resources}
          />
        </div>
      </fieldset>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => void onCancel()} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy}>
          Assign Assignment
        </Button>
      </div>
    </form>
  );
}
