"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Package, Upload } from "lucide-react";
import { processScormUpload, requestScormUpload } from "@/features/course-authoring/lesson-actions";
import type { LessonScormPackage } from "@/features/course-authoring/lessons";
import { createClient } from "@/lib/supabase/client";
import { formatFileSize } from "@/lib/utils/format";

export function ScormUploadForm({
  courseId,
  lessonId,
  current,
  disabled = false,
}: {
  courseId: string;
  lessonId: string;
  current: LessonScormPackage | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const ticket = await requestScormUpload(courseId, lessonId, { name: file.name, size: file.size, type: file.type });
      if (!ticket.ok) {
        setNotice({ tone: "error", text: ticket.error });
        return;
      }
      const { error } = await createClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file);
      if (error) {
        setNotice({ tone: "error", text: "The upload failed. Please try again." });
        return;
      }
      const result = await processScormUpload(courseId, lessonId, ticket.path);
      if (!result.ok) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      setNotice({ tone: "ok", text: "Package uploaded." });
      router.refresh();
    } catch {
      setNotice({ tone: "error", text: "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="space-y-3 rounded-card border border-border p-4" disabled={busy || disabled}>
      <legend className="px-1 text-sm font-medium">SCORM package</legend>

      {current ? (
        <div className="flex items-center gap-2 text-sm">
          <Package className="size-4 text-success" aria-hidden="true" />
          <span>
            SCORM {current.version} package{current.title ? ` — ${current.title}` : ""} &middot; {current.fileCount} files &middot;{" "}
            {formatFileSize(current.totalBytes)}
          </span>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">No package uploaded yet.</p>
      )}

      <div>
        <p className="mb-1 text-sm font-medium">{current ? "Replace the package" : "Upload a package"}</p>
        <input
          type="file"
          aria-label="Upload SCORM package"
          accept=".zip,application/zip"
          onChange={onPick}
          className="block w-full text-sm file:mr-3 file:rounded-control file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm"
        />
        <p className="mt-1 text-xs text-text-secondary">A .zip file containing imsmanifest.xml (SCORM 1.2 or 2004), up to 300MB.</p>
      </div>

      {busy && (
        <p role="status" className="inline-flex items-center gap-2 text-sm text-text-secondary">
          <Upload className="size-4" aria-hidden="true" />
          Uploading and validating…
        </p>
      )}
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`inline-flex items-center gap-2 text-sm ${notice.tone === "error" ? "text-danger-text" : "text-success-text"}`}>
          {notice.tone === "error" ? <AlertCircle className="size-4" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
          {notice.text}
        </p>
      )}
    </fieldset>
  );
}
