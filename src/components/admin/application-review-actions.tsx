"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reviewApplicationAction } from "@/features/admin/instructor-actions";

export function ApplicationReviewActions({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    setError(null);
    const res = await reviewApplicationAction(applicationId, decision, note);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setRejecting(false);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => decide("approved")} disabled={busy}>
          Approve
        </Button>
        {rejecting ? (
          <Button size="sm" variant="secondary" onClick={() => decide("rejected")} loading={busy}>
            Confirm reject
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setRejecting(true)} disabled={busy}>
            Reject
          </Button>
        )}
      </div>
      {rejecting && (
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason for rejection (shown to the applicant)"
          className="w-full rounded-control border border-border bg-surface px-2.5 py-1.5 text-xs text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      )}
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
