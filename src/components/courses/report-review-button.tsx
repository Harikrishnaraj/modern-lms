"use client";

import { useState, type FormEvent } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportReviewAction } from "@/features/reviews/actions";

export function ReportReviewButton({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) return <span className="text-xs text-text-secondary">Reported</span>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await reportReviewAction(reviewId, reason);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSent(true);
  }

  return (
    <span className="inline-block">
      {open ? (
        <form onSubmit={submit} className="mt-1 flex flex-wrap items-center gap-2" aria-label="Report this review">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What is wrong?"
            aria-label="Reason for the report"
            className="h-8 rounded-input border border-border bg-surface px-2 text-xs"
          />
          <Button type="submit" size="sm" loading={busy}>
            Send report
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text">
          <Flag className="size-3.5" aria-hidden="true" />
          Report<span className="sr-only"> this review</span>
        </button>
      )}
      {error && (
        <span role="alert" className="block text-xs text-danger-text">
          {error}
        </span>
      )}
    </span>
  );
}
