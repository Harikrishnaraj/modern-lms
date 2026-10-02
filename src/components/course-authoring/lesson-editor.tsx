"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Paperclip, Trash2, Upload } from "lucide-react";
import { RichTextEditor } from "@/components/course-authoring/rich-text-editor";
import { ScormUploadForm } from "@/components/course-authoring/scorm-upload-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteAsset,
  registerAsset,
  requestUpload,
  saveLesson,
  type LessonResult,
} from "@/features/course-authoring/lesson-actions";
import type { LessonForEditing } from "@/features/course-authoring/lessons";
import { isStorageVideo } from "@/features/course-authoring/uploads";
import { createClient } from "@/lib/supabase/client";
import { formatFileSize } from "@/lib/utils/format";

export function LessonEditor({
  courseId,
  lesson,
  disabled = false,
}: {
  courseId: string;
  lesson: LessonForEditing;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(lesson.title);
  const [minutes, setMinutes] = useState(String(lesson.durationMinutes));
  const [isPreview, setIsPreview] = useState(lesson.isPreview);
  const [videoRef, setVideoRef] = useState(lesson.videoRef ?? "");
  const [videoUrlInput, setVideoUrlInput] = useState(isStorageVideo(lesson.videoRef) ? "" : (lesson.videoRef ?? ""));
  const html = useRef(lesson.content);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const busy = saving || uploading !== null || disabled;

  function report(result: LessonResult, success: string) {
    if (result.ok) {
      setFieldErrors({});
      setNotice({ tone: "ok", text: success });
      router.refresh();
    } else {
      setFieldErrors(result.fieldErrors ?? {});
      setNotice({ tone: "error", text: result.error });
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const ref = lesson.type === "video" ? (isStorageVideo(videoRef) ? videoRef : videoUrlInput.trim()) : "";
      const result = await saveLesson(courseId, lesson.id, {
        title,
        content: html.current,
        videoRef: ref === "" ? null : ref,
        durationMinutes: Number(minutes),
        isPreview,
      });
      report(result, "Saved.");
    } catch {
      setNotice({ tone: "error", text: "Something went wrong. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  // Direct browser -> storage upload with a server-issued one-time token (never through Next).
  async function upload(kind: "video" | "asset", file: File) {
    setNotice(null);
    setUploading(file.name);
    try {
      const ticket = await requestUpload(courseId, lesson.id, kind, { name: file.name, size: file.size, type: file.type });
      if (!ticket.ok) {
        setNotice({ tone: "error", text: ticket.error });
        return;
      }
      const { error } = await createClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, {
        contentType: file.type,
      });
      if (error) {
        setNotice({ tone: "error", text: "The upload failed. Please try again." });
        return;
      }
      if (kind === "video") {
        setVideoRef(ticket.ref);
        setVideoUrlInput("");
        setNotice({ tone: "ok", text: "Video uploaded. Save the lesson to attach it." });
      } else {
        const result = await registerAsset(courseId, lesson.id, { path: ticket.path, name: file.name, size: file.size, type: file.type });
        report(result, "Attachment added.");
      }
    } catch {
      setNotice({ tone: "error", text: "The upload failed. Please try again." });
    } finally {
      setUploading(null);
    }
  }

  function onPick(kind: "video" | "asset") {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) void upload(kind, file);
    };
  }

  return (
    <form onSubmit={onSave} noValidate className="max-w-3xl space-y-6">
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`flex items-start gap-2 rounded-card border p-3 text-sm ${
            notice.tone === "error"
              ? "border-danger bg-danger-light text-danger-text"
              : "border-success bg-success-light text-success-text"
          }`}
        >
          {notice.tone === "error" ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      <Input label="Lesson title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={busy} error={fieldErrors.title} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Duration (minutes)"
          type="number"
          min={0}
          max={1440}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          disabled={busy}
          error={fieldErrors.durationMinutes}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={isPreview} onChange={(e) => setIsPreview(e.target.checked)} disabled={busy} />
          Free preview (anyone can watch this lesson)
        </label>
      </div>

      {lesson.type === "video" && (
        <fieldset className="space-y-3 rounded-card border border-border p-4" disabled={busy}>
          <legend className="px-1 text-sm font-medium">Video</legend>
          {isStorageVideo(videoRef) ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                An uploaded video is attached.
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setVideoRef("")}>
                Remove video
              </Button>
            </div>
          ) : (
            <>
              <Input
                label="Video link"
                type="url"
                placeholder="https://…"
                value={videoUrlInput}
                onChange={(e) => setVideoUrlInput(e.target.value)}
                error={fieldErrors.videoRef}
                hint="A direct https link to an MP4 or WebM file."
              />
              <div>
                <p className="mb-1 text-sm font-medium">Or upload a file</p>
                <input
                  type="file"
                  aria-label="Upload video"
                  accept="video/mp4,video/webm"
                  onChange={onPick("video")}
                  className="block w-full text-sm file:mr-3 file:rounded-control file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm"
                />
                <p className="mt-1 text-xs text-text-secondary">MP4 or WebM, up to 50 MB.</p>
              </div>
            </>
          )}
          {uploading && (
            <p role="status" className="inline-flex items-center gap-2 text-sm text-text-secondary">
              <Upload className="size-4" aria-hidden="true" />
              Uploading {uploading}…
            </p>
          )}
        </fieldset>
      )}

      {lesson.type === "scorm" && (
        <ScormUploadForm courseId={courseId} lessonId={lesson.id} current={lesson.scormPackage} disabled={busy} />
      )}

      <div className="space-y-2">
        <p id="lesson-content-label" className="text-sm font-medium">
          {lesson.type === "quiz" || lesson.type === "assignment" ? "Instructions" : "Lesson text"}
        </p>
        <RichTextEditor initialHtml={lesson.content} onChange={(v) => (html.current = v)} disabled={busy} />
        {fieldErrors.content && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {fieldErrors.content}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving} disabled={disabled || uploading !== null}>
          Save lesson
        </Button>
      </div>

      <section aria-labelledby="attachments-heading" className="space-y-3 border-t border-border pt-6">
        <h2 id="attachments-heading" className="text-base font-semibold">
          Attachments
        </h2>
        {lesson.assets.length === 0 ? (
          <p className="text-sm text-text-secondary">No attachments yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle rounded-card border border-border">
            {lesson.assets.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Paperclip className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                  <span className="truncate">{a.name}</span>
                  {a.sizeBytes !== null && <span className="shrink-0 text-xs text-text-secondary">{formatFileSize(a.sizeBytes)}</span>}
                </span>
                <button
                  type="button"
                  aria-label={`Remove attachment ${a.name}`}
                  disabled={busy}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      report(await deleteAsset(courseId, lesson.id, a.id), "Attachment removed.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="inline-flex size-8 items-center justify-center rounded-control text-text-secondary hover:bg-border-subtle hover:text-text disabled:opacity-40"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div>
          <input
            type="file"
            aria-label="Add attachment"
            accept=".pdf,.zip,.txt,.docx,.xlsx,.pptx,.png,.jpg,.jpeg"
            disabled={busy}
            onChange={onPick("asset")}
            className="block w-full text-sm file:mr-3 file:rounded-control file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm"
          />
          <p className="mt-1 text-xs text-text-secondary">PDF, Word, Excel, PowerPoint, ZIP, TXT, PNG or JPEG, up to 10 MB each.</p>
        </div>
      </section>
    </form>
  );
}
