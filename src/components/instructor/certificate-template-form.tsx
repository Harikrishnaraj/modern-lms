"use client";

import { useId, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { CertificateTemplate } from "@/features/instructor/certificates";
import { saveCertificateTemplateAction } from "@/features/instructor/certificate-actions";
import { Button } from "@/components/ui/button";

export function CertificateTemplateForm({
  courseId,
  template,
}: {
  courseId: string;
  template: CertificateTemplate | null;
}) {
  const [signatureTitle, setSignatureTitle] = useState(template?.signatureTitle ?? "");
  const [closingMessage, setClosingMessage] = useState(template?.closingMessage ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const signatureTitleId = useId();
  const closingMessageId = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveCertificateTemplateAction({
        courseId,
        signatureTitle,
        closingMessage,
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? "Failed to save certificate template");
      } else {
        setSaved(true);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor={signatureTitleId} className="text-sm font-medium text-text">
          Signature title
        </label>
        <p className="text-xs text-text-secondary">
          Shown next to your name on future certificates for this course, e.g. &ldquo;Lead Instructor&rdquo;.
        </p>
        <input
          id={signatureTitleId}
          type="text"
          maxLength={200}
          value={signatureTitle}
          onChange={(e) => setSignatureTitle(e.target.value)}
          placeholder="Lead Instructor"
          className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label htmlFor={closingMessageId} className="text-sm font-medium text-text">
          Closing message
        </label>
        <p className="text-xs text-text-secondary">
          An optional line printed on future certificates for this course.
        </p>
        <textarea
          id={closingMessageId}
          rows={2}
          maxLength={500}
          value={closingMessage}
          onChange={(e) => setClosingMessage(e.target.value)}
          placeholder="Keep building — this is just the beginning."
          className="mt-1.5 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <p className="text-xs text-text-secondary">
        Changes apply only to certificates issued from now on — certificates already issued keep what they
        said at the time.
      </p>

      {errorMsg && (
        <p role="alert" className="text-sm text-danger-text">
          {errorMsg}
        </p>
      )}
      {saved && !errorMsg && <p className="text-sm text-success-text">Template saved.</p>}

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
        Save template
      </Button>
    </form>
  );
}
