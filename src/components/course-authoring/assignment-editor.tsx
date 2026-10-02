"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileTypePicker } from "@/components/assignments/file-type-picker";
import { ReferenceFilesField, type ListedFile } from "@/components/assignments/reference-files-field";
import { discardAssignmentResourceUpload } from "@/features/assignments/hub-actions";
import { instructionsToHtml } from "@/features/assignments/hub-rules";
import {
  addAssignmentResource,
  createAssignment,
  deleteAssignment,
  removeAssignmentResource,
  saveAssignment,
} from "@/features/course-authoring/assignment-actions";
import { MAX_CRITERIA, type AssignmentInput } from "@/features/course-authoring/assignment-rules";
import { RichTextEditor } from "./rich-text-editor";

export function NewAssignmentForm({ courseId, disabled }: { courseId: string; disabled: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createAssignment(courseId, { title });
    setBusy(false);
    if (!r.ok) {
      setError(r.fieldErrors?.title ?? r.error);
      return;
    }
    router.push(`/instructor/courses/${courseId}/assignments/${r.id}`);
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="New assignment" className="flex max-w-xl flex-wrap items-end gap-2">
      <div className="min-w-56 flex-1">
        <Input label="New assignment title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={disabled || busy} error={error ?? undefined} />
      </div>
      <Button type="submit" loading={busy} disabled={disabled}>
        Create assignment
      </Button>
    </form>
  );
}

export function AssignmentEditor({
  courseId,
  assignmentId,
  initial,
  resources,
  submissions,
  disabled,
}: {
  courseId: string;
  assignmentId: string;
  initial: AssignmentInput;
  resources: ListedFile[];
  submissions: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<AssignmentInput>(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof AssignmentInput>(k: K, value: AssignmentInput[K]) => setV((prev) => ({ ...prev, [k]: value }));
  const setCriterion = (i: number, patch: Partial<AssignmentInput["criteria"][number]>) =>
    setV((prev) => ({ ...prev, criteria: prev.criteria.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));
  const rubricTotal = v.criteria.reduce((n, c) => n + (Number(c.maxPoints) || 0), 0);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    setErrors({});
    const r = await saveAssignment(courseId, assignmentId, {
      ...v,
      maxPoints: Number(v.maxPoints),
      maxFileMb: Number(v.maxFileMb),
      criteria: v.criteria.map((c) => ({ ...c, maxPoints: Number(c.maxPoints) })),
    });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      setNotice({ tone: "error", text: r.error });
      return;
    }
    setNotice({ tone: "ok", text: "Saved." });
    router.refresh();
  }

  async function onDelete() {
    setBusy(true);
    const r = await deleteAssignment(courseId, assignmentId);
    setBusy(false);
    if (!r.ok) {
      setNotice({ tone: "error", text: r.error });
      return;
    }
    router.push(`/instructor/courses/${courseId}/assignments`);
  }

  const err = (k: string) => (errors[k] ? <p role="alert" className="text-xs text-danger-text">{errors[k]}</p> : null);

  return (
    <form onSubmit={onSave} noValidate aria-label="Assignment settings" className="max-w-2xl space-y-6">
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={notice.tone === "error" ? "flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text" : "flex items-start gap-2 rounded-card border border-success bg-success-light p-3 text-sm text-success-text"}
        >
          {notice.tone === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {notice.text}
        </div>
      )}
      <fieldset disabled={disabled || busy} className="space-y-5">
        <Input label="Title" value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={200} error={errors.title} />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Instructions</span>
          <RichTextEditor
            initialHtml={instructionsToHtml(initial.instructions)}
            onChange={(html) => set("instructions", html)}
            disabled={disabled || busy}
            label="Instructions"
            tools={["bold", "italic", "underline", "ul", "ol", "link"]}
            minHeight="min-h-32"
          />
          {err("instructions")}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Input label="Deadline (UTC)" type="datetime-local" value={v.dueAt} onChange={(e) => set("dueAt", e.target.value)} error={errors.dueAt} hint="Leave empty for no deadline." />
          </div>
          <Input label="Points" type="number" min={1} max={1000} value={String(v.maxPoints)} onChange={(e) => set("maxPoints", Number(e.target.value))} error={errors.maxPoints} />
          <Input label="File size limit (MB)" type="number" min={1} max={10} value={String(v.maxFileMb)} onChange={(e) => set("maxFileMb", Number(e.target.value))} error={errors.maxFileMb} />
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={v.allowText} onChange={(e) => set("allowText", e.target.checked)} />
            Accept a written answer
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={v.allowFile} onChange={(e) => set("allowFile", e.target.checked)} />
            Accept a file upload
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={v.allowLate} onChange={(e) => set("allowLate", e.target.checked)} />
            Accept late submissions (they are flagged as late)
          </label>
          {err("allowText")}
        </div>
        {v.allowFile && (
          <div className="max-w-xs">
            <FileTypePicker label="Allowed file types" value={v.allowedFileTypes} onChange={(next) => set("allowedFileTypes", next)} disabled={disabled || busy} error={errors.allowedFileTypes} />
          </div>
        )}

        <section aria-labelledby="resources-heading" className="space-y-2">
          <h2 id="resources-heading" className="text-base font-semibold">
            Reference files
          </h2>
          <p className="text-sm text-text-secondary">Optional files learners can download with the instructions.</p>
          <ReferenceFilesField
            files={resources}
            disabled={disabled || busy}
            onUploaded={async (file) => {
              const r = await addAssignmentResource(courseId, assignmentId, file);
              if (!r.ok) {
                await discardAssignmentResourceUpload(file.path);
                return r.error;
              }
              router.refresh();
              return null;
            }}
            onRemove={async (key) => {
              const r = await removeAssignmentResource(courseId, assignmentId, key);
              if (!r.ok) setNotice({ tone: "error", text: r.error });
              else router.refresh();
            }}
          />
        </section>

        <section aria-labelledby="rubric-heading" className="space-y-3">
          <h2 id="rubric-heading" className="text-base font-semibold">
            Rubric
          </h2>
          <p className="text-sm text-text-secondary">
            Optional. With a rubric you score each criterion and the grade is their sum, which must equal the assignment points
            ({v.maxPoints}). Now: {rubricTotal}.
          </p>
          {v.criteria.map((c, i) => (
            <fieldset key={i} className="space-y-2 rounded-card border border-border p-3" aria-label={`Criterion ${i + 1}`}>
              <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
                <Input label={`Criterion ${i + 1} title`} value={c.title} onChange={(e) => setCriterion(i, { title: e.target.value })} maxLength={120} error={errors[`criteria.${i}.title`]} />
                <Input label={`Criterion ${i + 1} points`} type="number" min={1} value={String(c.maxPoints)} onChange={(e) => setCriterion(i, { maxPoints: Number(e.target.value) })} error={errors[`criteria.${i}.maxPoints`]} />
              </div>
              <Input label={`Criterion ${i + 1} description`} value={c.description} onChange={(e) => setCriterion(i, { description: e.target.value })} maxLength={500} />
              <button type="button" onClick={() => setV((prev) => ({ ...prev, criteria: prev.criteria.filter((_, idx) => idx !== i) }))} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-danger-text">
                <Trash2 className="size-3.5" aria-hidden="true" />
                Remove criterion {i + 1}
              </button>
            </fieldset>
          ))}
          {err("criteria")}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={v.criteria.length >= MAX_CRITERIA}
            onClick={() => setV((prev) => ({ ...prev, criteria: [...prev.criteria, { title: "", description: "", maxPoints: 10 }] }))}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add criterion
          </Button>
        </section>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} disabled={disabled}>
          Save assignment
        </Button>
        {submissions === 0 ? (
          <Button type="button" variant="secondary" onClick={onDelete} disabled={disabled || busy}>
            Delete assignment
          </Button>
        ) : (
          <span className="text-sm text-text-secondary">{submissions} {submissions === 1 ? "submission" : "submissions"} so far, so it cannot be deleted.</span>
        )}
      </div>
    </form>
  );
}
