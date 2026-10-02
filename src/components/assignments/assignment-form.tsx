"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestSubmissionUpload, submitAssignment } from "@/features/assignments/actions";
import { MAX_TEXT_LENGTH } from "@/features/assignments/rules";
import { createClient } from "@/lib/supabase/client";
import { formatFileSize } from "@/lib/utils/format";

export function AssignmentForm({
  assignmentId,
  allowText,
  allowFile,
  maxFileMb,
  accept,
  typeList,
  initialText,
  replacing,
}: {
  assignmentId: string;
  allowText: boolean;
  allowFile: boolean;
  maxFileMb: number;
  /** `accept` attribute for the allowed file types, e.g. ".pdf,.doc". */
  accept: string;
  /** Human list of the allowed types, e.g. "PDF, DOC or DOCX". */
  typeList: string;
  initialText: string;
  replacing: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let uploaded: { path: string; name: string; size: number; type: string } | null = null;
      if (file) {
        const ticket = await requestSubmissionUpload(assignmentId, { name: file.name, size: file.size, type: file.type });
        if (!ticket.ok) {
          setError(ticket.error);
          return;
        }
        const { error: uploadError } = await createClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, {
          contentType: file.type,
        });
        if (uploadError) {
          setError("The upload failed. Please try again.");
          return;
        }
        uploaded = { path: ticket.path, name: file.name, size: file.size, type: file.type };
      }
      const result = await submitAssignment(assignmentId, { text, file: uploaded });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFile(null);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-4" noValidate aria-label="Submit your work">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
      {allowText && (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Your answer
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            maxLength={MAX_TEXT_LENGTH}
            disabled={busy}
            className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal"
          />
        </label>
      )}
      {allowFile && (
        <div className="space-y-1.5">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Attach a file
            <input
              type="file"
              onChange={onPick}
              disabled={busy}
              accept={accept}
              className="text-sm font-normal"
            />
          </label>
          <p className="text-xs text-text-secondary">{typeList}, up to {maxFileMb} MB.</p>
          {file && (
            <p className="inline-flex items-center gap-1 text-sm">
              <Paperclip className="size-4" aria-hidden="true" />
              {file.name} ({formatFileSize(file.size)})
            </p>
          )}
        </div>
      )}
      {replacing && <p className="text-xs text-text-secondary">Submitting again replaces your previous submission.</p>}
      <Button type="submit" loading={busy}>
        {replacing ? "Resubmit" : "Submit"}
      </Button>
    </form>
  );
}
