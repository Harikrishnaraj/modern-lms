"use client";

import { useId, useState, type DragEvent } from "react";
import { FileText, Loader2, UploadCloud, X } from "lucide-react";
import { requestAssignmentResourceUpload } from "@/features/assignments/hub-actions";
import { MAX_RESOURCES, RESOURCE_ACCEPT, validateResourceFile, type ResourceFile } from "@/features/assignments/hub-rules";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { formatFileSize } from "@/lib/utils/format";

export interface ListedFile {
  key: string;
  name: string;
  size: number;
}

/**
 * Drag-and-drop / click-to-browse reference files (PDF, DOC, DOCX, PPT, ZIP up to 50 MB). Files go
 * straight to private storage under the instructor's prefix; the parent decides what an upload
 * means (kept in form state until "Assign", or attached to an existing assignment right away).
 */
export function ReferenceFilesField({
  files,
  onUploaded,
  onRemove,
  disabled = false,
  error,
}: {
  files: ListedFile[];
  /** Returns an error message, or null when the file was accepted. */
  onUploaded: (file: ResourceFile) => Promise<string | null>;
  onRemove: (key: string) => Promise<void> | void;
  disabled?: boolean;
  error?: string;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const full = files.length >= MAX_RESOURCES;
  const blocked = disabled || uploading !== null || full;

  async function upload(file: File) {
    setMessage(null);
    const check = validateResourceFile({ name: file.name, size: file.size, type: file.type });
    if (!check.ok) {
      setMessage(check.error);
      return;
    }
    setUploading(file.name);
    try {
      const ticket = await requestAssignmentResourceUpload({ name: file.name, size: file.size, type: file.type });
      if (!ticket.ok) {
        setMessage(ticket.error);
        return;
      }
      const { error: uploadError } = await createClient()
        .storage.from(ticket.bucket)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (uploadError) {
        setMessage("The upload failed. Please try again.");
        return;
      }
      const problem = await onUploaded({ path: ticket.path, name: file.name, size: file.size, type: file.type });
      if (problem) setMessage(problem);
    } catch {
      setMessage("The upload failed. Please try again.");
    } finally {
      setUploading(null);
    }
  }

  async function uploadAll(list: FileList | null) {
    if (!list) return;
    const room = MAX_RESOURCES - files.length;
    const picked = Array.from(list).slice(0, room);
    for (const f of picked) await upload(f);
    if (list.length > room) setMessage(`Attach at most ${MAX_RESOURCES} reference files.`);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    if (!blocked) void uploadAll(e.dataTransfer.files);
  }

  const shown = message ?? error;

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!blocked) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-border bg-background px-4 py-6 text-center",
          dragging && "border-primary bg-primary-light",
          blocked && "cursor-not-allowed opacity-60",
        )}
      >
        {uploading ? (
          <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
        ) : (
          <UploadCloud className="size-6 text-text-secondary" aria-hidden="true" />
        )}
        <span className="text-sm">
          {uploading ? (
            `Uploading ${uploading}…`
          ) : full ? (
            `${MAX_RESOURCES} files attached (the maximum)`
          ) : (
            <>
              Drag &amp; drop files here, or <span className="font-medium text-primary">click to browse</span>
            </>
          )}
        </span>
        <span className="text-xs text-text-secondary">PDF, DOC, DOCX, PPT, ZIP (Max 50MB)</span>
        <input
          id={inputId}
          type="file"
          multiple
          accept={RESOURCE_ACCEPT}
          disabled={blocked}
          aria-label="Attach reference files"
          className="sr-only"
          onChange={(e) => {
            void uploadAll(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {shown && (
        <p role="alert" className="text-xs text-danger-text">
          {shown}
        </p>
      )}
      {files.length > 0 && (
        <ul aria-label="Attached reference files" className="space-y-1.5">
          {files.map((f) => (
            <li key={f.key} className="flex items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-text-secondary">{formatFileSize(f.size)}</span>
              <button
                type="button"
                onClick={() => void onRemove(f.key)}
                disabled={disabled}
                aria-label={`Remove ${f.name}`}
                className="inline-flex size-6 items-center justify-center rounded-control text-text-secondary hover:bg-border-subtle hover:text-danger-text"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
